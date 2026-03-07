const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const routes = require('./routes');

// Initialize App
const app = express();

// Configuration
const PORT = process.env.PORT || 5001;

// Security headers (X-Content-Type-Options, X-Frame-Options, etc.)
app.use(helmet());

// Middleware
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

// Rate limit: 100 requests per 15 min per IP para /api (evita abuso)
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: 'rate_limit_exceeded' },
    standardHeaders: true,
    legacyHeaders: false
});
app.use('/api', apiLimiter);

// Routes
app.use('/api', routes);

const errorHandler = require('./middleware/errorHandler');

// ... (existing code)

// Global Error Handler
app.use(errorHandler);

// Start Server (Local Development)
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`\n🚀 Server running on http://localhost:${PORT}`);
        console.log(`   - Live Game: http://localhost:${PORT}/api/game/:gamePk`);
        console.log(`   - Schedule:  http://localhost:${PORT}/api/schedule`);
        console.log(`   - Standings: http://localhost:${PORT}/api/standings`);
        console.log(`   - Leaders:   http://localhost:${PORT}/api/leaders\n`);
    });
}

module.exports = app;
