// `node api/index.js --mock` usa datos simulados (sin red, o con statsapi.mlb.com bloqueado)
if (process.argv.includes('--mock')) process.env.MLB_MOCK = '1';

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const routes = require('./routes');
const errorHandler = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 5001;

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
app.use(errorHandler);

if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL && require.main === module) {
    app.listen(PORT, () => {
        console.log(`\n🚀 API en http://localhost:${PORT}${process.env.MLB_MOCK === '1' ? '  (datos simulados)' : ''}`);
        console.log(`   - Calendario: /api/v2/schedule?league=lidom`);
        console.log(`   - Juego:      /api/v2/game/:gamePk`);
        console.log(`   - Posiciones: /api/v2/standings?league=lidom`);
        console.log(`   - Líderes:    /api/v2/leaders?league=lidom\n`);
    });
}

module.exports = app;
