// Respuestas de error con una clave que la app traduce
const errorHandler = (err, req, res, next) => {
    const upstreamStatus = err.response?.status;
    let statusCode = 500;
    let errorKey = 'internal_error';

    if (upstreamStatus === 404) {
        statusCode = 404;
        errorKey = /\/player\//.test(req.originalUrl || '') ? 'player_not_found' : 'game_not_found';
    } else if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
        statusCode = 504;
        errorKey = 'upstream_timeout';
    } else if (upstreamStatus || err.isAxiosError || err.message?.startsWith('Invalid Game Data')) {
        statusCode = 502;
        errorKey = 'invalid_mlb_data';
    }

    console.error(`[api] ${req.method} ${req.originalUrl} → ${statusCode} ${errorKey}: ${err.message}`);

    res.set('Cache-Control', 'no-store');
    res.status(statusCode).json({
        error: errorKey,
        details: process.env.NODE_ENV === 'development' ? err.message : null
    });
};

module.exports = errorHandler;
