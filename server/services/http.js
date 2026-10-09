const axios = require('axios');
const http = require('http');
const https = require('https');

// Un solo cliente con keep-alive: en una instancia caliente reutiliza la conexión TLS con statsapi
// (ahorra ~100-200 ms por petición) y corta a los 8 s para no colgar la función de Vercel.
const client = axios.create({
    timeout: 8000,
    httpAgent: new http.Agent({ keepAlive: true, maxSockets: 32 }),
    httpsAgent: new https.Agent({ keepAlive: true, maxSockets: 32 }),
    headers: { 'Accept-Encoding': 'gzip, deflate', 'User-Agent': 'el-play/2.0' }
});

let mock = null;

/**
 * GET a MLB StatsAPI. Con MLB_MOCK=1 responde con datos simulados (desarrollo sin red o con la API bloqueada).
 * @returns {Promise<any>} el cuerpo JSON
 */
const mlbGet = async (url, params) => {
    if (process.env.MLB_MOCK === '1') {
        mock = mock || require('../mock');
        return mock.get(url, params);
    }
    const response = await client.get(url, { params });
    return response.data;
};

module.exports = { mlbGet };
