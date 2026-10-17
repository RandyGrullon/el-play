const fs = require('fs');
const path = require('path');

// Variables de Supabase para el servidor: en Vercel son las mismas VITE_* de la app (también llegan a la función);
// en desarrollo, si no están en el entorno, se leen de .env.local a mano (sin dotenv).
let local = null;

const readLocal = () => {
    if (local) return local;
    local = {};
    try {
        const text = fs.readFileSync(path.join(__dirname, '..', '..', '.env.local'), 'utf8');
        for (const line of text.split(/\r?\n/)) {
            const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
            if (match) local[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
        }
    } catch {
        /* sin .env.local */
    }
    return local;
};

const isProduction = () => process.env.NODE_ENV === 'production' || !!process.env.VERCEL;

const env = (name) => process.env[name] || (isProduction() ? undefined : readLocal()[name]) || undefined;

/** URL y llave publishable de Supabase, o null si las cuentas no están configuradas */
const supabaseConfig = () => {
    const url = env('SUPABASE_URL') || env('VITE_SUPABASE_URL');
    const key = env('SUPABASE_ANON_KEY') || env('VITE_SUPABASE_ANON_KEY');
    return url && key ? { url: url.replace(/\/+$/, ''), key } : null;
};

module.exports = { env, supabaseConfig };
