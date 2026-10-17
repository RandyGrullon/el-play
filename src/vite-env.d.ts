/// <reference types="vite/client" />

/** Versión del build (commit); la misma de public/version.json */
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
    /** Supabase: cuentas opcionales (sin ellas la app guarda todo en el teléfono) */
    readonly VITE_SUPABASE_URL?: string;
    readonly VITE_SUPABASE_ANON_KEY?: string;
}
