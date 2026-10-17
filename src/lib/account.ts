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
        public code: 'disabled' | 'network' | 'invalid_code' | 'rate_limit' | 'unknown' | 'linking_disabled' | 'identity_taken' | 'last_identity' | 'session_expired',
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

/**
 * Paso 1: Supabase manda el correo para entrar. Con la plantilla propia (SMTP configurado) trae un código de 6 dígitos;
 * con la de fábrica trae un enlace que vuelve a esta misma pantalla con la sesión (ver consumeAuthRedirect).
 */
export const sendCode = (email: string) => {
    const back = typeof window !== 'undefined' ? `?redirect_to=${encodeURIComponent(window.location.origin + window.location.pathname)}` : '';
    return authFetch(`otp${back}`, { email, create_user: true });
};

// ---------------------------------------------------------------- Google (y otros proveedores)

let settingsPromise: Promise<{ google: boolean }> | null = null;

/** Qué proveedores tiene activos el proyecto de Supabase (se pregunta una vez por sesión) */
export const authProviders = () =>
    (settingsPromise ||= (async () => {
        if (!accountEnabled()) return { google: false };
        try {
            const response = await fetch(`${URL_BASE}/auth/v1/settings`, { headers: { apikey: ANON! } });
            const data = await response.json();
            return { google: !!data?.external?.google };
        } catch {
            settingsPromise = null;
            return { google: false };
        }
    })());

// Antes de ir a Google se apunta a qué se fue (entrar o vincular) para saber qué decir a la vuelta
const OAUTH_KEY = 'el-play-oauth';
type OAuthTrip = 'google' | 'link';

const markOAuthTrip = (trip: OAuthTrip) => {
    try {
        sessionStorage.setItem(OAUTH_KEY, `${trip}:${Date.now()}`);
    } catch {
        /* sin almacenamiento: a la vuelta se dice lo genérico */
    }
};

const takeOAuthTrip = (): OAuthTrip | null => {
    try {
        const [trip, at] = (sessionStorage.getItem(OAUTH_KEY) || '').split(':');
        sessionStorage.removeItem(OAUTH_KEY);
        // Solo vale si la vuelta llega en los 15 minutos siguientes
        return (trip === 'google' || trip === 'link') && Date.now() - Number(at) < 15 * 60 * 1000 ? trip : null;
    } catch {
        return null;
    }
};

/** Entrar con Google: Supabase abre la pantalla de Google y vuelve aquí con la sesión (consumeAuthRedirect) */
export const signInWithGoogle = () => {
    if (!accountEnabled()) return;
    const back = window.location.origin + window.location.pathname;
    markOAuthTrip('google');
    window.location.assign(`${URL_BASE}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(back)}`);
};

const decodeJwt = (token: string): { sub?: string; email?: string } | null => {
    try {
        const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        const text = decodeURIComponent(
            Array.from(atob(part))
                .map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`)
                .join('')
        );
        return JSON.parse(text);
    } catch {
        return null;
    }
};

export type AuthRedirect =
    | { result: 'signed-in'; email: string }
    | { result: 'linked'; email: string }
    // Había otra cuenta abierta y la persona prefirió seguir con ella
    | { result: 'kept'; email: string }
    // `code` es el error_code de Supabase (otp_expired, identity_already_exists…) o link_other_account; `via` dice de dónde se venía
    | { result: 'error'; code: string | null; via: 'email' | OAuthTrip };

/**
 * Al tocar el enlace del correo (o al volver de Google), Supabase vuelve a la app con la sesión en la dirección
 * (#access_token=…&refresh_token=…) o con el error (#error=…&error_code=…). Se guarda la sesión y se limpia la dirección.
 * Una sesión que nadie pidió desde aquí no reemplaza en silencio otra cuenta abierta: `confirmSwitch` pregunta
 * (sin él se queda la que estaba). Al vincular, la vuelta tiene que ser la misma cuenta.
 */
export const consumeAuthRedirect = (confirmSwitch?: (current: string, next: string) => boolean): AuthRedirect | null => {
    if (typeof window === 'undefined' || !accountEnabled()) return null;
    const hash = window.location.hash.slice(1);
    const query = new URLSearchParams(window.location.search);
    if (!/(^|&)(access_token|error)=/.test(hash) && !(query.get('error') && query.has('error_description'))) return null;
    const params = new URLSearchParams(/(^|&)(access_token|error)=/.test(hash) ? hash : window.location.search);
    // Supabase repite el error en la búsqueda (?error=…): también se quita
    ['error', 'error_code', 'error_description'].forEach((key) => query.delete(key));
    const search = query.toString();
    window.history.replaceState(null, '', window.location.pathname + (search ? `?${search}` : ''));
    const trip = takeOAuthTrip();
    if (params.get('error')) {
        let code = params.get('error_code');
        // Mismo código si Google ya era de esta cuenta (p. ej. vinculada en otra pestaña): eso no es un error
        if (code === 'identity_already_exists' && !/another/i.test(params.get('error_description') || '')) code = 'identity_already_linked';
        if (code === 'manual_linking_disabled') markLinkingOff();
        return { result: 'error', code, via: trip || 'email' };
    }
    const access = params.get('access_token');
    const refresh = params.get('refresh_token');
    const claims = access ? decodeJwt(access) : null;
    if (!access || !refresh || !claims?.sub) return null;
    const expiresIn = Number(params.get('expires_in')) || 3600;
    const previous = readSession();
    // Al vincular vuelve la misma cuenta con una sesión nueva: se queda el nombre
    const sameUser = previous?.user.id === claims.sub;
    // Vincular nunca cambia de cuenta: si vuelve otra, no se toca nada
    if (trip === 'link' && !sameUser) return { result: 'error', code: 'link_other_account', via: 'link' };
    // Otra cuenta abierta y esta vuelta no la pidió «Continuar con Google» aquí: se pregunta antes de cambiar
    if (previous && !sameUser && trip !== 'google' && !confirmSwitch?.(previous.user.email, claims.email || '')) return { result: 'kept', email: previous.user.email };
    writeSession({ accessToken: access, refreshToken: refresh, expiresAt: Date.now() + (expiresIn - 60) * 1000, user: { id: claims.sub, email: claims.email || '' }, name: sameUser ? previous!.name : null });
    loadProfile()
        .then(() => syncFantasy())
        .catch(() => undefined);
    return { result: trip === 'link' && sameUser ? 'linked' : 'signed-in', email: claims.email || '' };
};

/** Paso 2: con el código queda la sesión abierta; luego se sube lo que había en el teléfono */
export const verifyCode = async (email: string, token: string) => {
    const data = await authFetch('verify', { type: 'email', email, token });
    writeSession(toSession(data));
    await loadProfile().catch(() => undefined);
    await syncFantasy().catch(() => undefined);
    return readSession();
};

/** Borra la cuenta y todo lo suyo en Supabase (perfil, equipos, ligas creadas) y la copia del teléfono */
export const deleteAccount = async () => {
    const current = readSession();
    if (!current) return;
    await rest('rpc/delete_my_account', { method: 'POST', body: '{}' });
    try {
        localStorage.removeItem(`el-play-fantasy-v1:${current.user.id}`);
    } catch {
        /* sin almacenamiento */
    }
    writeSession(null);
};

export const signOut = async () => {
    const current = readSession();
    writeSession(null);
    if (current && accountEnabled()) {
        await fetch(`${URL_BASE}/auth/v1/logout`, { method: 'POST', headers: { apikey: ANON!, Authorization: `Bearer ${current.accessToken}` } }).catch(() => undefined);
    }
};

export const freshToken = async () => {
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
export const rest = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
    if (!accountEnabled()) throw new AccountError('disabled');
    const token = await freshToken();
    const response = await fetch(`${URL_BASE}/rest/v1/${path}`, {
        ...init,
        // Sin sesión basta `apikey` (la llave nueva sb_publishable_ no es un JWT y no se acepta como Bearer)
        headers: { apikey: ANON!, ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json', ...(init.headers || {}) }
    }).catch(() => {
        throw new AccountError('network');
    });
    if (!response.ok) throw new AccountError('unknown', `${response.status}`);
    const text = await response.text();
    return (text ? JSON.parse(text) : null) as T;
};

// ---------------------------------------------------------------- formas de entrar (correo, Google)
// Lo único automático es entrar con Google usando el mismo correo: Supabase une esa identidad sola.
// Vincular y desvincular desde aquí (/user/identities, también con el mismo correo) piden «Manual linking» activo en
// Auth → Providers; si está apagado responden 404 manual_linking_disabled y la app esconde esos botones un día.

const LINKING_KEY = 'el-play-linking-off';

/** Supabase dijo hace menos de un día que vincular está apagado */
export const linkingOff = () => {
    try {
        return Date.now() - Number(localStorage.getItem(LINKING_KEY) || 0) < 86400000;
    } catch {
        return false;
    }
};

const markLinkingOff = () => {
    try {
        localStorage.setItem(LINKING_KEY, String(Date.now()));
    } catch {
        /* sin almacenamiento: se vuelve a intentar la próxima vez */
    }
};

/** Auth de Supabase a nombre de la cuenta abierta */
const userFetch = async <T>(path: string, method = 'GET'): Promise<T> => {
    if (!accountEnabled()) throw new AccountError('disabled');
    const token = await freshToken();
    if (!token) throw new AccountError('session_expired');
    let response: Response;
    try {
        response = await fetch(`${URL_BASE}/auth/v1/${path}`, { method, headers: { apikey: ANON!, Authorization: `Bearer ${token}` } });
    } catch {
        throw new AccountError('network');
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        const code = data?.error_code || data?.code;
        if (code === 'manual_linking_disabled') {
            markLinkingOff();
            throw new AccountError('linking_disabled');
        }
        if (code === 'identity_already_exists') throw new AccountError('identity_taken');
        if (code === 'single_identity_not_deletable') throw new AccountError('last_identity');
        if (response.status === 429) throw new AccountError('rate_limit');
        if (response.status === 401 || code === 'session_not_found' || code === 'bad_jwt' || code === 'user_not_found') throw new AccountError('session_expired');
        throw new AccountError('unknown', data?.msg || data?.message);
    }
    return data as T;
};

export interface Identity {
    /** identity_id de Supabase (con él se desvincula) */
    id: string;
    provider: 'email' | 'google' | string;
    email: string | null;
}

interface IdentityRow {
    identity_id?: string;
    id: string;
    provider: string;
    email?: string;
    identity_data?: { email?: string };
}

/** Con qué se puede entrar a la cuenta abierta */
export const getIdentities = async (): Promise<Identity[]> => {
    const user = await userFetch<{ email?: string; identities?: IdentityRow[] }>('user');
    // Si el correo principal cambió (p. ej. al desvincular) se pone al día aquí
    const current = readSession();
    if (current && user?.email && user.email !== current.user.email) writeSession({ ...current, user: { ...current.user, email: user.email } });
    return (user?.identities || []).map((row) => ({ id: row.identity_id || row.id, provider: row.provider, email: row.email || row.identity_data?.email || null }));
};

/** Vincular Google: Supabase da la dirección de Google y a la vuelta llega la misma cuenta (consumeAuthRedirect → «linked») */
export const linkGoogle = async () => {
    const back = window.location.origin + window.location.pathname;
    const data = await userFetch<{ url?: string }>(`user/identities/authorize?provider=google&redirect_to=${encodeURIComponent(back)}&skip_http_redirect=true`);
    if (!data?.url) throw new AccountError('unknown');
    markOAuthTrip('link');
    window.location.assign(data.url);
};

/** Quita una forma de entrar (Supabase exige que quede al menos una) */
export const unlinkIdentity = async (id: string) => {
    await userFetch(`user/identities/${encodeURIComponent(id)}`, 'DELETE');
};

// ---------------------------------------------------------------- perfil

const loadProfile = async () => {
    const current = readSession();
    if (!current) return;
    const rows = await rest<{ display_name: string | null }[]>(`profiles?id=eq.${current.user.id}&select=display_name`);
    writeSession({ ...current, name: rows?.[0]?.display_name ?? null });
};

/** El nombre que ven los demás en la tabla y en el buscador (sin él los demás ven «Fanático»; nunca sale del correo) */
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
    /** null si no ha elegido nombre (la fila dice «Fanático» en el idioma de la app) */
    name: string | null;
    entry: DayEntry;
}

/** Todos los equipos de un día (de una liga privada si se pasa `members`) */
export const dayEntries = async (league: LeagueId, day: string, members?: string[]): Promise<Rival[]> => {
    const filter = members?.length ? `&user_id=in.(${members.join(',')})` : '';
    const rows = await rest<EntryRow[]>(`fantasy_entries?league=eq.${league}&day=eq.${day}${filter}&select=user_id,lineup,captain,picks,saved_at,profiles(display_name)&limit=500`);
    return (rows || []).map((row) => ({
        userId: row.user_id,
        name: row.profiles?.display_name || null,
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
