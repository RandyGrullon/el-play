const errorHandler = (err, req, res, next) => {
    console.error('Error:', err.stack);

    // Default Error
    let statusCode = 500;
    let message = 'Internal Server Error';
    let details = null;

    // Handle specific error types
    if (err.message === 'Invalid Game Data received from MLB API') {
        statusCode = 502; // Bad Gateway (upstream data issue)
        message = 'Received invalid data from MLB API';
    }

    // Development details
    if (process.env.NODE_ENV === 'development') {
        details = err.message;
    }

    res.status(statusCode).json({
        error: message,
        details: details
    });
};

module.exports = errorHandler;
