// Dónde está la API de El Play y el proyecto de Supabase. Se cambian con variables EXPO_PUBLIC_* (.env.local o EAS).

// Solo en desarrollo y en la versión web: localStorage 'el-play-api-dev' apunta la app a otra API sin rearrancar
// (p. ej. http://localhost:5096 con datos reales o http://localhost:5095 con el juego simulado). En el teléfono y en
// producción no existe.
const devApi = (): string | null => {
    if (!__DEV__ || typeof window === 'undefined') return null;
    try {
        return window.localStorage?.getItem('el-play-api-dev') || null;
    } catch {
        return null;
    }
};

export const API_BASE = (devApi() || process.env.EXPO_PUBLIC_API_URL || 'https://elplay.grullonb.com').replace(/\/$/, '');
export const SUPABASE_URL: string | undefined = process.env.EXPO_PUBLIC_SUPABASE_URL || undefined;
export const SUPABASE_ANON: string | undefined = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || undefined;
export const WEB_URL = 'https://elplay.grullonb.com';
