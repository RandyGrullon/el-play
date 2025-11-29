const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const routes = require('./routes');

// Initialize App
const app = express();

// Configuration
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(morgan('dev')); // Logging
app.use(express.json());

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
