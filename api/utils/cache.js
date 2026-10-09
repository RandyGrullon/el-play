// Caché en memoria por instancia con tres reglas:
// 1. Peticiones iguales simultáneas comparten una sola llamada a MLB (in-flight dedupe).
// 2. Si MLB falla, se sirve el último valor bueno mientras no pase `staleSec`.
// 3. El TTL puede depender del valor (p. ej. más corto si hay juegos en vivo).
const store = new Map();
const inflight = new Map();
const MAX_ENTRIES = 300;

const prune = () => {
    if (store.size <= MAX_ENTRIES) return;
    const now = Date.now();
    for (const [key, entry] of store) {
        if (entry.staleUntil < now) store.delete(key);
    }
};

/**
 * @param {string} key
 * @param {number | ((value: any) => number)} ttlSec
 * @param {() => Promise<any>} fetchFn
 * @param {{ staleSec?: number }} [options]
 */
const cached = (key, ttlSec, fetchFn, { staleSec = 600 } = {}) => {
    const hit = store.get(key);
    if (hit && hit.expires > Date.now()) return Promise.resolve(hit.value);
    if (inflight.has(key)) return inflight.get(key);

    const promise = (async () => {
        try {
            const value = await fetchFn();
            const ttl = typeof ttlSec === 'function' ? ttlSec(value) : ttlSec;
            const now = Date.now();
            store.set(key, { value, expires: now + ttl * 1000, staleUntil: now + (ttl + staleSec) * 1000 });
            prune();
            return value;
        } catch (error) {
            if (hit && hit.staleUntil > Date.now()) {
                console.warn(`[cache] ${key}: MLB falló (${error.message}), sirviendo el último valor`);
                return hit.value;
            }
            throw error;
        } finally {
            inflight.delete(key);
        }
    })();

    inflight.set(key, promise);
    return promise;
};

const clearCache = () => {
    store.clear();
    inflight.clear();
};

// Compatibilidad con la firma anterior
const fetchWithCache = (key, fetchFn, ttl) => cached(key, ttl, fetchFn);

module.exports = { cached, clearCache, fetchWithCache };
