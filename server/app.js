const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const routes = require('./routes');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// En Vercel la petición llega por un proxy: sin esto todos los usuarios comparten la IP del proxy
// y el límite de peticiones se agotaba entre todos (respuestas 429 a los pocos minutos de un juego).
app.set('trust proxy', 1);
app.set('etag', 'weak');

app.use(helmet());
app.use(cors());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'tiny' : 'dev'));

// El juego en vivo se consulta cada ~5 s: 600 peticiones cada 10 min por IP deja margen para
// varias pestañas sin permitir abuso. Lo servido desde el CDN ni siquiera llega aquí.
app.use(
    '/api',
    rateLimit({
        windowMs: 10 * 60 * 1000,
        max: 600,
        message: { error: 'rate_limit_exceeded' },
        standardHeaders: true,
        legacyHeaders: false
    })
);

app.get('/api', (req, res) => res.json({ status: 'ok', service: 'el-play-api', mock: process.env.MLB_MOCK === '1' }));
app.use('/api', routes);
// Ruta de la API que no existe: JSON como el resto (antes salía la página HTML de Express)
app.use('/api', (req, res) => res.status(404).json({ error: 'not_found' }));
app.use(errorHandler);

module.exports = app;
