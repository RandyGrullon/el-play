// Cuenta con Supabase (sin librería: Auth y REST por fetch, así no se agrega nada al build).
// La app se usa sin cuenta; solo el Fantasy la pide: el equipo vive en la cuenta (sirve en cualquier teléfono),
// aparece en la tabla y se juega en ligas privadas con código.
// Se activa con EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_ANON_KEY (.env.local o variables de EAS); las tablas están en supabase/fantasy.sql.
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import type { LeagueId } from '../types';
import { getStore, replaceStore, setStoreOwner, takeLegacyStore, type DayEntry, type EntryHistory } from './fantasy';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { SUPABASE_ANON, SUPABASE_URL } from './config';
import { getItem, onHydrated, removeItem, setItem } from './storage';

const URL_BASE = SUPABASE_URL;
const ANON = SUPABASE_ANON;

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
        session = JSON.parse(getItem(KEY) || 'null') as Session | null;
    } catch {
        session = null;
    }
    return session;
};

const writeSession = (next: Session | null) => {
    session = next;
    setStoreOwner(next?.user.id ?? null);
    try {
        if (next) setItem(KEY, JSON.stringify(next));
        else removeItem(KEY);
    } catch {
        /* sin almacenamiento: la sesión dura mientras la app esté abierta */
    }
    emit();
};

// El fantasy del teléfono es el de la cuenta abierta; la sesión se lee cuando el teléfono terminó de cargar
onHydrated(() => {
    session = undefined;
    setStoreOwner(readSession()?.user.id ?? null);
    emit();
});

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
        public code: 'disabled' | 'network' | 'invalid_code' | 'rate_limit' | 'unknown' | 'linking_disabled' | 'identity_taken' | 'last_identity' | 'session_expired' | 'link_other_account',
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
 * con la de fábrica trae un enlace que vuelve a esta misma pantalla con la sesión (ver consumeAuthUrl).
 */
export const sendCode = (email: string) => authFetch(`otp?redirect_to=${encodeURIComponent(authRedirectUrl())}`, { email, create_user: true });

/** A dónde vuelve el enlace del correo o Google: elplay://auth en la app (exp://… en Expo Go, la página en la web) */
export const authRedirectUrl = () => Linking.createURL('auth');

// ---------------------------------------------------------------- Google (y otros proveedores)

/**
 * Regla 4.8 de Apple: si la app ofrece entrar con Google también tiene que ofrecer «Iniciar sesión con Apple».
 * Hasta que exista, en iOS no se ofrece Google (ni entrar ni vincular); en Android y en la web, sí.
 */
export const googleAllowed = () => Platform.OS !== 'ios';

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
type OAuthTrip = 'google' | 'link';
let trip: { kind: OAuthTrip; at: number } | null = null;

const takeOAuthTrip = (): OAuthTrip | null => {
    const current = trip;
    trip = null;
    // Solo vale si la vuelta llega en los 15 minutos siguientes
    return current && Date.now() - current.at < 15 * 60 * 1000 ? current.kind : null;
};

/** Abre Google en el navegador del sistema y espera la vuelta a elplay://auth (null si se cerró sin terminar) */
const oauthTrip = async (kind: OAuthTrip, url: string) => {
    const back = authRedirectUrl();
    trip = { kind, at: Date.now() };
    try {
        const result = await WebBrowser.openAuthSessionAsync(url, back);
        if (result.type === 'success') return consumeAuthUrl(result.url);
    } catch {
        /* en la web el navegador pudo bloquear la ventana */
    }
    trip = null;
    return null;
};

/** Entrar con Google: Supabase abre la pantalla de Google y vuelve aquí con la sesión (consumeAuthUrl) */
export const signInWithGoogle = async (): Promise<'signed-in' | 'cancel' | 'error'> => {
    if (!accountEnabled()) return 'error';
    const done = await oauthTrip('google', `${URL_BASE}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(authRedirectUrl())}`);
    if (!done) return 'cancel';
    return done.result === 'signed-in' ? 'signed-in' : 'error';
};

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const base64Decode = (input: string) => {
    let output = '';
    let buffer = 0;
    let bits = 0;
    for (const char of input.replace(/=+$/, '')) {
        const value = B64.indexOf(char);
        if (value < 0) continue;
        buffer = (buffer << 6) | value;
        bits += 6;
        if (bits >= 8) {
            bits -= 8;
            output += String.fromCharCode((buffer >> bits) & 0xff);
        }
    }
    return output;
};

const decodeJwt = (token: string): { sub?: string; email?: string } | null => {
    try {
        const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        const text = decodeURIComponent(
            Array.from(base64Decode(part))
                .map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`)
                .join('')
        );
        return JSON.parse(text);
    } catch {
        return null;
    }
};

export type AuthRedirect = (
    | { result: 'signed-in'; email: string }
    | { result: 'linked'; email: string }
    // `code` es el error_code de Supabase (otp_expired, identity_already_exists…) o link_other_account; `via` dice de dónde se venía
    | { result: 'error'; code: string | null; via: 'email' | OAuthTrip }
) & {
    /** Esa vuelta ya se había leído (llegó dos veces o la sesión ya era esa): no hay nada que avisar */
    repeated?: boolean;
};

// La última vuelta leída: en Android la misma dirección llega al router (/auth) y a openAuthSessionAsync
let lastReturn: { url: string; auth: AuthRedirect } | null = null;

/**
 * Al volver del enlace del correo o de Google, Supabase manda la sesión en el fragmento de la dirección
 * (elplay://auth#access_token=…&refresh_token=…) o el error (#error=…&error_code=…). Al vincular, la vuelta tiene
 * que ser la misma cuenta.
 */
export const consumeAuthUrl = (url: string | null | undefined): AuthRedirect | null => {
    if (!url || !accountEnabled()) return null;
    if (lastReturn?.url === url) return { ...lastReturn.auth, repeated: true };
    const hash = url.includes('#') ? url.slice(url.indexOf('#') + 1) : url.includes('?') ? url.slice(url.indexOf('?') + 1) : '';
    if (!/(^|&)(access_token|error)=/.test(hash)) return null;
    const auth = readAuthReturn(new URLSearchParams(hash));
    if (auth) lastReturn = { url, auth };
    return auth;
};

const readAuthReturn = (params: URLSearchParams): AuthRedirect | null => {
    const via = takeOAuthTrip();
    if (params.get('error')) {
        let code = params.get('error_code');
        // Mismo código si Google ya era de esta cuenta (p. ej. vinculada en otro teléfono): eso no es un error
        if (code === 'identity_already_exists' && !/another/i.test(params.get('error_description') || '')) code = 'identity_already_linked';
        if (code === 'manual_linking_disabled') markLinkingOff();
        return { result: 'error', code, via: via || 'email' };
    }
    const access = params.get('access_token');
    const refresh = params.get('refresh_token');
    const claims = access ? decodeJwt(access) : null;
    if (!access || !refresh || !claims?.sub) return null;
    const previous = readSession();
    // La sesión ya es esa (la dirección se había leído antes): no se toca nada
    if (previous?.accessToken === access) return { result: via === 'link' ? 'linked' : 'signed-in', email: previous.user.email, repeated: true };
    // Al vincular vuelve la misma cuenta con una sesión nueva: se queda el nombre
    const sameUser = previous?.user.id === claims.sub;
    // Vincular nunca cambia de cuenta: si vuelve otra, no se toca nada
    if (via === 'link' && !sameUser) return { result: 'error', code: 'link_other_account', via };
    const expiresIn = Number(params.get('expires_in')) || 3600;
    writeSession({ accessToken: access, refreshToken: refresh, expiresAt: Date.now() + (expiresIn - 60) * 1000, user: { id: claims.sub, email: claims.email || '' }, name: sameUser ? previous!.name : null });
    loadProfile()
        .then(() => syncFantasy())
        .catch(() => undefined);
    return { result: via === 'link' ? 'linked' : 'signed-in', email: claims.email || '' };
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
        removeItem(`el-play-fantasy-v1:${current.user.id}`);
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

// Una sola renovación a la vez: Supabase cambia el refresh token en cada uso
let renewing: Promise<string | null> | null = null;

/**
 * Token vigente de la cuenta abierta (null sin cuenta). La sesión solo se cierra si Supabase dice que el refresh
 * token ya no sirve (400/401: vencido, ya usado, cuenta borrada); sin red o con Supabase caído se queda abierta,
 * se lanza AccountError('network') y se renueva en el próximo pedido.
 */
export const freshToken = async (): Promise<string | null> => {
    const current = readSession();
    if (!current) return null;
    if (current.expiresAt > Date.now()) return current.accessToken;
    renewing ||= renewSession(current).finally(() => {
        renewing = null;
    });
    return renewing;
};

const renewSession = async (current: Session): Promise<string | null> => {
    let response: Response;
    try {
        response = await fetch(`${URL_BASE}/auth/v1/token?grant_type=refresh_token`, {
            method: 'POST',
            headers: { apikey: ANON!, 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: current.refreshToken })
        });
    } catch {
        throw new AccountError('network');
    }
    const data = await response.json().catch(() => ({}));
    // Si mientras tanto cambió la sesión (se salió, entró otra cuenta o llegó una nueva al vincular o con el código),
    // la respuesta ya no le toca: se compara el refresh token, no solo la cuenta
    const latest = readSession();
    if (latest?.refreshToken !== current.refreshToken) return latest && latest.expiresAt > Date.now() ? latest.accessToken : null;
    if (response.ok && data?.access_token) {
        const next = toSession(data, latest.name);
        writeSession(next);
        return next.accessToken;
    }
    if (response.status === 400 || response.status === 401) {
        writeSession(null);
        return null;
    }
    throw new AccountError(response.status === 429 ? 'rate_limit' : 'network');
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
        return Date.now() - Number(getItem(LINKING_KEY) || 0) < 86400000;
    } catch {
        return false;
    }
};

const markLinkingOff = () => {
    try {
        setItem(LINKING_KEY, String(Date.now()));
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

/**
 * Vincular Google: Supabase da la dirección de Google, se abre en el navegador del sistema y vuelve a
 * elplay://auth con la misma cuenta (sesión nueva) o con el error. 'cancel' si se cerró sin terminar.
 */
export const linkGoogle = async (): Promise<'linked' | 'cancel'> => {
    const back = authRedirectUrl();
    const data = await userFetch<{ url?: string }>(`user/identities/authorize?provider=google&redirect_to=${encodeURIComponent(back)}&skip_http_redirect=true`);
    if (!data?.url) throw new AccountError('unknown');
    const done = await oauthTrip('link', data.url);
    if (!done) return 'cancel';
    if (done.result === 'linked' || (done.result === 'error' && done.code === 'identity_already_linked')) return 'linked';
    const code = done.result === 'error' ? done.code : null;
    if (code === 'identity_already_exists') throw new AccountError('identity_taken');
    if (code === 'manual_linking_disabled') throw new AccountError('linking_disabled');
    if (code === 'link_other_account') throw new AccountError('link_other_account');
    throw new AccountError('unknown', code || undefined);
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
    /** Lo escribe la base (antitrampa); no viene si todavía no se corrió el SQL */
    history?: EntryHistory | null;
    profiles?: { display_name: string | null } | null;
}

/** Mismos peloteros, capitán y pronósticos (el resultado calculado con uno vale para el otro) */
const sameTeam = (a: DayEntry, b: DayEntry) => JSON.stringify([a.lineup, a.captain, a.picks]) === JSON.stringify([b.lineup, b.captain, b.picks]);

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
        const mine = merged[key];
        if (!mine || mine.savedAt < row.saved_at) {
            const entry: DayEntry = { lineup: row.lineup || [], captain: row.captain, picks: row.picks || {}, savedAt: row.saved_at };
            // El resultado guardado se sacó con el equipo de este teléfono: si el de la cuenta es otro, se vuelve a calcular
            merged[key] = mine?.result && sameTeam(mine, entry) ? { ...entry, result: mine.result } : entry;
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

/**
 * Todos los equipos de un día (de una liga privada si se pasa `members`), con su historial para puntuar solo lo que
 * había al empezar cada juego (effectiveEntry). select=* trae history si la base ya lo tiene y no falla si todavía no.
 */
export const dayEntries = async (league: LeagueId, day: string, members?: string[]): Promise<Rival[]> => {
    const filter = members?.length ? `&user_id=in.(${members.join(',')})` : '';
    const rows = await rest<EntryRow[]>(`fantasy_entries?league=eq.${league}&day=eq.${day}${filter}&select=*,profiles(display_name)&limit=500`);
    return (rows || []).map((row) => ({
        userId: row.user_id,
        name: row.profiles?.display_name || 'Fanático',
        entry: { lineup: row.lineup || [], captain: row.captain, picks: row.picks || {}, savedAt: row.saved_at, history: row.history ?? null }
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
