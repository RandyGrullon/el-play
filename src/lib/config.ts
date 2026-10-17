// Dónde está la API de El Play y el proyecto de Supabase. Se cambian con variables EXPO_PUBLIC_* (.env.local o EAS).
export const API_BASE = (process.env.EXPO_PUBLIC_API_URL || 'https://elplay.grullonb.com').replace(/\/$/, '');
export const SUPABASE_URL: string | undefined = process.env.EXPO_PUBLIC_SUPABASE_URL || undefined;
export const SUPABASE_ANON: string | undefined = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || undefined;
export const WEB_URL = 'https://elplay.grullonb.com';
