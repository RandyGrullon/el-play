const NodeCache = require('node-cache');

// Initialize Cache
const cache = new NodeCache();

/**
 * Generic fetch with caching wrapper
 * @param {string} key - Unique cache key
 * @param {Function} fetchFn - Async function to fetch data if cache miss
 * @param {number} ttl - Time to live in seconds
 */
const fetchWithCache = async (key, fetchFn, ttl) => {
    const cachedData = cache.get(key);
    if (cachedData) {
        return cachedData;
    }

    try {
        const data = await fetchFn();
        cache.set(key, data, ttl);
        return data;
    } catch (error) {
        console.error(`Error fetching ${key}:`, error.message);
        throw error;
    }
};

module.exports = {
    cache,
    fetchWithCache
};
