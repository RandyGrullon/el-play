const errorHandler = (err, req, res, next) => {
    console.error('Error:', err.stack);

    // Default Error - frontend translates by key
    let statusCode = 500;
    let errorKey = 'internal_error';
    let details = null;

    // Handle specific error types
    if (err.message === 'Invalid Game Data received from MLB API') {
        statusCode = 502; // Bad Gateway (upstream data issue)
        errorKey = 'invalid_mlb_data';
    }

    // Development details
    if (process.env.NODE_ENV === 'development') {
        details = err.message;
    }

    res.status(statusCode).json({
        error: errorKey,
        details: details
    });
};

module.exports = errorHandler;
