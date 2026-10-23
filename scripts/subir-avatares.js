// Sube a Supabase los retratos que genera la PC (docs/GENERADOR-DE-IMAGEN.md). Se corre en la PC, no en Vercel:
//   node scripts/subir-avatares.js --dry      revisa la carpeta sin subir nada
//   node scripts/subir-avatares.js            sube los nuevos o los que cambiaron (se puede repetir)
//   --dir=<carpeta>                           otra carpeta en vez de avatares/salida
// Lee la URL y la llave publishable de Supabase y AVATARS_SECRET del entorno o de .env.local (nunca la service_role).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { env, supabaseConfig } = require('../server/utils/env');

const DRY = process.argv.includes('--dry');
const DIR = path.resolve(process.argv.find((arg) => arg.startsWith('--dir='))?.slice(6) || path.join(__dirname, '..', 'avatares', 'salida'));
const MAX_BYTES = 200 * 1024;
const MIN_SIDE = 256;
const TEAMS = new Set([667, 668, 669, 670, 671, 672]);
const STATUSES = new Set(['ok', 'sin-foto', 'rechazada']);

/** Tipo y medidas leyendo la cabecera (WebP, PNG o JPEG), sin dependencias; null si no es una imagen de esas */
const inspect = (buffer) => {
    if (buffer.length > 30 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
        const chunk = buffer.toString('ascii', 12, 16);
        if (chunk === 'VP8X') return { mime: 'image/webp', width: 1 + buffer.readUIntLE(24, 3), height: 1 + buffer.readUIntLE(27, 3) };
        if (chunk === 'VP8 ') return { mime: 'image/webp', width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
        if (chunk === 'VP8L') {
            const bits = buffer.readUInt32LE(21);
            return { mime: 'image/webp', width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
        }
        return null;
    }
    if (buffer.length > 24 && buffer.readUInt32BE(0) === 0x89504e47) return { mime: 'image/png', width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
    if (buffer.length > 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
        // Se recorren los segmentos hasta el SOF (C0–CF menos C4, C8 y CC), que trae alto y ancho
        let offset = 2;
        while (offset + 9 < buffer.length && buffer[offset] === 0xff) {
            const marker = buffer[offset + 1];
            if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { mime: 'image/jpeg', width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5) };
            offset += 2 + buffer.readUInt16BE(offset + 2);
        }
    }
    return null;
};

/** Revisa el manifiesto y los archivos; devuelve los listos para subir y los problemas */
const check = () => {
    const file = path.join(DIR, 'manifest.json');
    if (!fs.existsSync(file)) throw new Error(`No está ${file}`);
    const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Array.isArray(manifest)) throw new Error('manifest.json tiene que ser una lista');
    const ready = [];
    const problems = [];
    const counts = { ok: 0, 'sin-foto': 0, rechazada: 0 };
    const seen = new Set();
    for (const entry of manifest) {
        const label = `${entry?.personId ?? '?'} ${entry?.name ?? ''}`.trim();
        if (!Number.isInteger(entry?.personId) || entry.personId <= 0) {
            problems.push(`${label}: personId no es válido`);
            continue;
        }
        if (seen.has(entry.personId)) {
            problems.push(`${label}: está repetido`);
            continue;
        }
        seen.add(entry.personId);
        if (!STATUSES.has(entry.status)) {
            problems.push(`${label}: status «${entry.status}» no es ok, sin-foto ni rechazada`);
            continue;
        }
        counts[entry.status]++;
        if (entry.status !== 'ok') continue;
        if (!TEAMS.has(entry.teamId)) problems.push(`${label}: teamId ${entry.teamId} no es de la LIDOM`);
        else if (!Number.isInteger(entry.season) || entry.season < 2000 || entry.season > 2100) problems.push(`${label}: season no es válida`);
        else if (typeof entry.file !== 'string' || !/^\d+\.(webp|jpe?g|png)$/.test(entry.file)) problems.push(`${label}: file tiene que ser como 815908.webp`);
        else if (!fs.existsSync(path.join(DIR, entry.file))) problems.push(`${label}: falta ${entry.file}`);
        else {
            const buffer = fs.readFileSync(path.join(DIR, entry.file));
            const image = inspect(buffer);
            if (!image) problems.push(`${label}: ${entry.file} no es WebP, PNG ni JPEG`);
            else if (image.width !== image.height) problems.push(`${label}: ${entry.file} no es cuadrada (${image.width} × ${image.height})`);
            else if (image.width < MIN_SIDE) problems.push(`${label}: ${entry.file} es muy pequeña (${image.width} px)`);
            else if (buffer.length > MAX_BYTES) problems.push(`${label}: ${entry.file} pesa ${Math.round(buffer.length / 1024)} KB (máximo ${MAX_BYTES / 1024})`);
            else ready.push({ ...entry, buffer, mime: image.mime, sha256: crypto.createHash('sha256').update(buffer).digest('hex') });
        }
    }
    return { ready, problems, counts };
};

const supabase = async (route, options = {}) => {
    const config = supabaseConfig();
    const response = await fetch(`${config.url}/rest/v1/${route}`, {
        ...options,
        headers: { apikey: config.key, Accept: 'application/json', 'Content-Type': 'application/json', ...options.headers },
        signal: AbortSignal.timeout(30000)
    });
    const text = await response.text();
    if (!response.ok) throw Object.assign(new Error(`Supabase ${route.split('?')[0]}: ${response.status} ${text.slice(0, 200)}`), { status: response.status });
    return text ? JSON.parse(text) : null;
};

/** Los que ya están arriba: { personId: sha256 } */
const uploaded = async () => {
    const remote = {};
    for (let from = 0; ; from += 1000) {
        const rows = await supabase(`player_avatars?select=person_id,sha256&order=person_id&offset=${from}&limit=1000`);
        for (const row of rows) remote[row.person_id] = row.sha256;
        if (rows.length < 1000) return remote;
    }
};

const save = async (entry, secret) => {
    const args = { run_secret: secret, p_person_id: entry.personId, p_team_id: entry.teamId, p_season: entry.season, p_mime: entry.mime, p_image: entry.buffer.toString('base64'), p_sha256: entry.sha256 };
    for (let attempt = 1; ; attempt++) {
        try {
            return await supabase('rpc/avatar_save', { method: 'POST', body: JSON.stringify(args) });
        } catch (error) {
            // Secreto malo o datos rechazados: no se arregla reintentando
            if (attempt === 3 || (error.status >= 400 && error.status < 500)) throw error;
            await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
        }
    }
};

const main = async () => {
    const { ready, problems, counts } = check();
    console.log(`Carpeta: ${DIR}`);
    console.log(`Manifiesto: ${counts.ok} ok, ${counts['sin-foto']} sin foto, ${counts.rechazada} rechazados; ${ready.length} listos para subir`);
    for (const problem of problems) console.log(`  ✗ ${problem}`);
    if (DRY) {
        console.log(problems.length ? 'Revisión con problemas: arréglalos antes de subir.' : 'Revisión sin problemas.');
        process.exitCode = problems.length ? 1 : 0;
        return;
    }
    if (!supabaseConfig()) throw new Error('Faltan VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en .env.local');
    const secret = env('AVATARS_SECRET');
    if (!secret) throw new Error('Falta AVATARS_SECRET en .env.local (el mismo secreto del SQL de avatares)');

    let remote;
    try {
        remote = await uploaded();
    } catch (error) {
        if (error.status === 404) throw new Error('No existe la tabla player_avatars: corre supabase/2026-10-23-avatares.sql en Supabase');
        throw error;
    }
    const pending = ready.filter((entry) => remote[entry.personId] !== entry.sha256);
    console.log(`Ya arriba sin cambios: ${ready.length - pending.length}; por subir: ${pending.length}`);

    let done = 0;
    const failed = [];
    const queue = [...pending];
    const worker = async () => {
        for (let entry = queue.shift(); entry; entry = queue.shift()) {
            try {
                await save(entry, secret);
                done++;
                if (done % 20 === 0) console.log(`  … ${done}/${pending.length}`);
            } catch (error) {
                failed.push(`${entry.personId} ${entry.name}: ${error.message}`);
                if (/unauthorized/.test(error.message) && queue.length) {
                    queue.length = 0;
                    failed.push('Se paró: el secreto no coincide con el del SQL (o sigue el de ejemplo); revisa AVATARS_SECRET');
                }
            }
        }
    };
    await Promise.all(Array.from({ length: 4 }, worker));
    console.log(`Subidos: ${done}; fallaron: ${failed.length}`);
    for (const line of failed) console.log(`  ✗ ${line}`);
    process.exitCode = failed.length ? 1 : 0;
};

main().catch((error) => {
    // «fetch failed» solo no dice nada: la causa (certificado, DNS, red) viene aparte
    console.error(error.cause ? `${error.message}: ${error.cause.code || error.cause.message}` : error.message);
    process.exitCode = 1;
});
