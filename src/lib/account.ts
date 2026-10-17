// Cuenta con Supabase (sin librería: Auth y REST por fetch, así no se agrega nada al build).
// La app se usa sin cuenta; solo el Fantasy la pide: el equipo vive en la cuenta (sirve en cualquier teléfono),
// aparece en la tabla y se juega en ligas privadas con código.
// Se activa con VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en Vercel; las tablas están en supabase/fantasy.sql.
import { useSyncExternalStore } from 'react';
import type { LeagueId } from '../types';
import { getStore, replaceStore, setStoreOwner, takeLegacyStore, type DayEntry } from './fantasy';

const URL_BASE: string | undefined = import.meta.env.VITE_SUPABASE_URL || undefined;
const ANON: string | undefined = import.meta.env.VITE_SUPABASE_ANON_KEY || undefined;

export const accountEnabled = () => !!URL_BASE && !!ANON;

export interface Session {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    user: { id: string; email: string };
    name: string | null;
}

const KEY = 'el-play-session';
let session: Session | null | undefined;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

const readSession = (): Session | null => {
    if (session !== undefined) return session;
    try {
        session = JSON.parse(localStorage.getItem(KEY) || 'null') as Session | null;
    } catch {
        session = null;
    }
    return session;
};

const writeSession = (next: Session | null) => {
    session = next;
    setStoreOwner(next?.user.id ?? null);
    try {
        if (next) localStorage.setItem(KEY, JSON.stringify(next));
        else localStorage.removeItem(KEY);
    } catch {
        /* sin almacenamiento: la sesión dura mientras la app esté abierta */
    }
    emit();
};

// El fantasy del teléfono es el de la cuenta abierta (antes de que nadie lo lea)
setStoreOwner(readSession()?.user.id ?? null);

export const useSession = () =>
    useSyncExternalStore(
        (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        readSession,
        () => null
    );

export class AccountError extends Error {
    constructor(
        public code: 'disabled' | 'network' | 'invalid_code' | 'rate_limit' | 'unknown',
        message: string = code
    ) {
        super(message);
    }
}

const authFetch = async (path: string, body: unknown) => {
    if (!accountEnabled()) throw new AccountError('disabled');
    let response: Response;
    try {
        response = await fetch(`${URL_BASE}/auth/v1/${path}`, {
            method: 'POST',
            headers: { apikey: ANON!, 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
    } catch {
        throw new AccountError('network');
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        if (response.status === 429) throw new AccountError('rate_limit');
        if (response.status === 400 || response.status === 403 || response.status === 401) throw new AccountError('invalid_code', data?.msg || data?.error_description);
        throw new AccountError('unknown', data?.msg);
    }
    return data;
};

const toSession = (data: { access_token: string; refresh_token: string; expires_in: number; user: { id: string; email: string } }, name: string | null = null): Session => ({
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
    user: { id: data.user.id, email: data.user.email },
    name
});

/** Paso 1: Supabase manda un código de 6 dígitos al correo (sirve igual en la app instalada que en el navegador) */
export const sendCode = (email: string) => authFetch('otp', { email, create_user: true });

/** Paso 2: con el código queda la sesión abierta; luego se sube lo que había en el teléfono */
export const verifyCode = async (email: string, token: string) => {
    const data = await authFetch('verify', { type: 'email', email, token });
    writeSession(toSession(data));
    await loadProfile().catch(() => undefined);
    await syncFantasy().catch(() => undefined);
    return readSession();
};

export const signOut = async () => {
    const current = readSession();
    writeSession(null);
    if (current && accountEnabled()) {
        await fetch(`${URL_BASE}/auth/v1/logout`, { method: 'POST', headers: { apikey: ANON!, Authorization: `Bearer ${current.accessToken}` } }).catch(() => undefined);
    }
};

const freshToken = async () => {
    const current = readSession();
    if (!current) return null;
    if (current.expiresAt > Date.now()) return current.accessToken;
    try {
        const data = await authFetch('token?grant_type=refresh_token', { refresh_token: current.refreshToken });
        const next = toSession(data, current.name);
        writeSession(next);
        return next.accessToken;
    } catch {
        writeSession(null);
        return null;
    }
};

/** PostgREST de Supabase con la sesión (o como anónimo) */
const rest = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
    if (!accountEnabled()) throw new AccountError('disabled');
    const token = await freshToken();
    const response = await fetch(`${URL_BASE}/rest/v1/${path}`, {
        ...init,
        headers: { apikey: ANON!, Authorization: `Bearer ${token ?? ANON}`, 'Content-Type': 'application/json', ...(init.headers || {}) }
    }).catch(() => {
        throw new AccountError('network');
    });
    if (!response.ok) throw new AccountError('unknown', `${response.status}`);
    const text = await response.text();
    return (text ? JSON.parse(text) : null) as T;
};

// ---------------------------------------------------------------- perfil

const loadProfile = async () => {
    const current = readSession();
    if (!current) return;
    const rows = await rest<{ display_name: string | null }[]>(`profiles?id=eq.${current.user.id}&select=display_name`);
    writeSession({ ...current, name: rows?.[0]?.display_name ?? null });
};

/** El nombre que ven los demás en la tabla (sin él se muestra el inicio del correo) */
export const saveName = async (name: string) => {
    const current = readSession();
    if (!current) return;
    const clean = name.trim().slice(0, 30);
    await rest('profiles', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ id: current.user.id, display_name: clean }) });
    writeSession({ ...current, name: clean });
};

// ---------------------------------------------------------------- fantasy en la nube

interface EntryRow {
    user_id: string;
    league: string;
    day: string;
    lineup: number[];
    captain: number | null;
    picks: Record<string, number>;
    saved_at: number;
    profiles?: { display_name: string | null } | null;
}

/** Junta lo del teléfono con lo de la cuenta: en cada día gana lo último que se guardó (y lo armado sin cuenta pasa a ella) */
export const syncFantasy = async () => {
    const current = readSession();
    if (!current) return;
    const remote = await rest<EntryRow[]>(`fantasy_entries?user_id=eq.${current.user.id}&select=league,day,lineup,captain,picks,saved_at`);
    const legacy = takeLegacyStore();
    const local = getStore();
    const merged = { ...legacy, ...local };
    for (const row of remote || []) {
        const key = `${row.league}:${row.day}`;
        if (!merged[key] || merged[key].savedAt < row.saved_at) {
            merged[key] = { lineup: row.lineup || [], captain: row.captain, picks: row.picks || {}, savedAt: row.saved_at, result: merged[key]?.result };
        }
    }
    replaceStore(merged);
    // Supabase solo acepta días de hoy en adelante (hora de RD): los pasados quedan como están
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo' }).format(new Date());
    const uploads = Object.entries(merged)
        .filter(([key, entry]) => {
            const row = (remote || []).find((r) => `${r.league}:${r.day}` === key);
            return key.slice(key.indexOf(':') + 1) >= today && (!row || row.saved_at < entry.savedAt);
        })
        .map(([key, entry]) => {
            const [league, day] = key.split(':');
            return { user_id: current.user.id, league, day, lineup: entry.lineup, captain: entry.captain, picks: entry.picks, saved_at: entry.savedAt };
        });
    if (uploads.length) await rest('fantasy_entries', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify(uploads) });
};

/** Sube un día en cuanto cambia (si hay sesión); si falla, la próxima sincronización lo sube */
export const pushEntry = async (league: LeagueId, day: string, entry: DayEntry) => {
    const current = readSession();
    if (!current) return;
    await rest('fantasy_entries', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({ user_id: current.user.id, league, day, lineup: entry.lineup, captain: entry.captain, picks: entry.picks, saved_at: entry.savedAt })
    }).catch(() => undefined);
};

export interface Rival {
    userId: string;
    name: string;
    entry: DayEntry;
}

/** Todos los equipos de un día (de una liga privada si se pasa `members`) */
export const dayEntries = async (league: LeagueId, day: string, members?: string[]): Promise<Rival[]> => {
    const filter = members?.length ? `&user_id=in.(${members.join(',')})` : '';
    const rows = await rest<EntryRow[]>(`fantasy_entries?league=eq.${league}&day=eq.${day}${filter}&select=user_id,lineup,captain,picks,saved_at,profiles(display_name)&limit=500`);
    return (rows || []).map((row) => ({
        userId: row.user_id,
        name: row.profiles?.display_name || 'Fanático',
        entry: { lineup: row.lineup || [], captain: row.captain, picks: row.picks || {}, savedAt: row.saved_at }
    }));
};

// ---------------------------------------------------------------- ligas privadas

export interface PrivateLeague {
    id: string;
    name: string;
    code: string;
    members: string[];
}

export const myLeagues = async (): Promise<PrivateLeague[]> => {
    const current = readSession();
    if (!current) return [];
    const rows = await rest<{ league: { id: string; name: string; code: string; league_members: { user_id: string }[] } }[]>(
        `league_members?user_id=eq.${current.user.id}&select=league:leagues(id,name,code,league_members(user_id))`
    );
    return (rows || []).map(({ league }) => ({ id: league.id, name: league.name, code: league.code, members: league.league_members.map((m) => m.user_id) }));
};

/** Crea una liga con un código para compartir (lo genera la base de datos) */
export const createLeague = (name: string) => rest<{ code: string }[]>('rpc/create_league', { method: 'POST', body: JSON.stringify({ league_name: name.trim().slice(0, 40) }) });

export const joinLeague = (code: string) => rest('rpc/join_league', { method: 'POST', body: JSON.stringify({ league_code: code.trim().toUpperCase() }) });
