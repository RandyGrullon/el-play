const { MLB_API_BASE_V1_1 } = require('../config/constants');
const http = require('./http'); // se usa http.mlbGet para poder sustituirlo en pruebas
const { applyPatch } = require('../utils/jsonPatch');

// Juego en vivo de forma incremental, como hace Gameday:
// - la primera vez se baja el feed completo (1-3 MB) y se guarda con su timecode (metaData.timeStamp);
// - después se pide feed/live/diffPatch?startTimecode=… que devuelve solo los cambios (unos KB)
//   o [] si nada cambió; si MLB devuelve el feed completo, se reemplaza.
// Cualquier error al aplicar los cambios descarta el documento y se baja completo otra vez.
// En Vercel esto vive mientras la instancia esté caliente; en frío simplemente se baja completo.

const games = new Map(); // gamePk -> { doc, timecode, version }
const inflight = new Map();
const IDLE_EVICT_MS = 15 * 60 * 1000;

const diffEnabled = () => process.env.MLB_DIFFPATCH !== '0';

const evictIdle = () => {
    const now = Date.now();
    for (const [gamePk, entry] of games) {
        if (now - entry.lastAccess > IDLE_EVICT_MS) games.delete(gamePk);
    }
};

const isFinal = (doc) => doc?.gameData?.status?.abstractGameState === 'Final';

const fetchFull = async (gamePk) => {
    const doc = await http.mlbGet(`${MLB_API_BASE_V1_1}/game/${gamePk}/feed/live`);
    if (!doc || !doc.gameData || !doc.liveData) throw new Error('Invalid Game Data received from MLB API');
    return doc;
};

const store = (gamePk, doc, previous) => {
    const entry = {
        doc,
        timecode: doc.metaData?.timeStamp || null,
        version: (previous?.version || 0) + 1,
        lastAccess: Date.now()
    };
    games.set(gamePk, entry);
    return entry;
};

const refresh = async (gamePk) => {
    const previous = games.get(gamePk);

    if (previous && previous.timecode && diffEnabled() && !isFinal(previous.doc)) {
        try {
            const data = await http.mlbGet(`${MLB_API_BASE_V1_1}/game/${gamePk}/feed/live/diffPatch`, {
                startTimecode: previous.timecode
            });
            if (Array.isArray(data)) {
                if (data.length === 0) {
                    previous.lastAccess = Date.now();
                    return { entry: previous, mode: 'unchanged' };
                }
                // [{ diff: [ops] }, …]; también se aceptan operaciones sueltas
                const operations = data.flatMap((block) => (Array.isArray(block?.diff) ? block.diff : block?.op ? [block] : []));
                if (operations.length === 0) throw new Error('formato de diffPatch desconocido');
                applyPatch(previous.doc, operations);
                const timecode = previous.doc.metaData?.timeStamp;
                // Si el timecode no avanzó, los cambios no se aplicaron bien: mejor bajar todo que quedarse viejo
                if (!timecode || timecode === previous.timecode) throw new Error('diffPatch no avanzó el timecode');
                previous.timecode = timecode;
                previous.version += 1;
                previous.lastAccess = Date.now();
                return { entry: previous, mode: 'patch' };
            }
            if (data && data.gameData && data.liveData) {
                return { entry: store(gamePk, data, previous), mode: 'full' };
            }
        } catch (error) {
            console.warn(`[liveFeed] diffPatch ${gamePk} falló (${error.message}); se baja completo`);
            games.delete(gamePk);
        }
    }

    const doc = await fetchFull(gamePk);
    return { entry: store(gamePk, doc, previous), mode: 'full' };
};

/**
 * Devuelve { doc, version, mode } del juego. `version` cambia solo cuando el documento cambió,
 * así quien llama puede reutilizar su transformación.
 */
const getLiveFeed = async (gamePk) => {
    const key = String(gamePk);
    if (inflight.has(key)) return inflight.get(key);
    const promise = refresh(key)
        .then(({ entry, mode }) => ({ doc: entry.doc, version: entry.version, mode }))
        .finally(() => {
            inflight.delete(key);
            evictIdle();
        });
    inflight.set(key, promise);
    return promise;
};

const resetLiveFeeds = () => {
    games.clear();
    inflight.clear();
};

module.exports = { getLiveFeed, resetLiveFeeds };
