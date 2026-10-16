const axios = require('axios');
const { cached } = require('../utils/cache');

// Fotos con el uniforme del equipo LIDOM. MLB solo tiene fotos con uniforme de MLB/MiLB; de los seis equipos,
// hoy solo los Toros publican su roster con fotos (torosdeleste.com/roster.html, temporada 2026-27).
// Si otro equipo las publica, basta con agregarlo aquí con su página y el patrón de sus imágenes.
const SOURCES = {
    668: {
        page: 'https://torosdeleste.com/roster.html',
        base: 'https://torosdeleste.com/',
        // <img src="imgs/jugadores/jhon-nunez.jpg">: el nombre del archivo es el del pelotero sin acentos
        image: /src="(imgs\/jugadores\/([a-z0-9-]+)\.(?:jpe?g|png|webp))"/gi
    }
};

const client = axios.create({
    timeout: 8000,
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; el-play/2.0; +https://el-play.vercel.app)' }
});

/** Misma clave en el servidor y en la app (src/lib/photos.ts): sin acentos, sin Jr./Sr., solo letras */
const nameKey = (name) =>
    String(name)
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, '')
        .replace(/[^a-z]/g, '');

const parseTeam = (html, source) => {
    const files = {};
    for (const [, path, slug] of html.matchAll(source.image)) {
        const key = nameKey(slug);
        if (key && !files[key]) files[key] = path.split('/').pop();
    }
    return files;
};

/** { [teamId]: { [nameKey]: archivo } } — si una web falla, ese equipo queda sin fotos propias (la app usa las de MLB) */
const loadIndex = async () => {
    const entries = await Promise.all(
        Object.entries(SOURCES).map(async ([teamId, source]) => {
            try {
                const { data } = await client.get(source.page, { responseType: 'text' });
                return [teamId, parseTeam(data, source)];
            } catch (error) {
                console.warn(`[fotos] ${source.page}: ${error.message}`);
                return [teamId, {}];
            }
        })
    );
    return Object.fromEntries(entries);
};

const getIndex = () => cached('team_photos', (index) => (Object.values(index).some((files) => Object.keys(files).length) ? 12 * 3600 : 300), loadIndex, { staleSec: 7 * 24 * 3600 });

/** Lo que recibe la app: rutas propias (mismo origen) para que también sirvan en el canvas de compartir */
const getPhotoIndex = async () => {
    const index = await getIndex();
    const teams = {};
    for (const [teamId, files] of Object.entries(index)) {
        teams[teamId] = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, `/api/v2/photos/${teamId}/${file}`]));
    }
    return { teams };
};

/** Baja una foto ya listada (no es un proxy abierto: solo archivos que aparecen en el roster del equipo) */
const getPhotoFile = async (teamId, file) => {
    const source = SOURCES[teamId];
    if (!source) return null;
    const index = await getIndex();
    if (!Object.values(index[teamId] || {}).includes(file)) return null;
    const response = await client.get(`${source.base}imgs/jugadores/${file}`, { responseType: 'arraybuffer' });
    return { body: Buffer.from(response.data), type: response.headers['content-type'] || 'image/jpeg' };
};

module.exports = { getPhotoIndex, getPhotoFile, nameKey, parseTeam, SOURCES };
