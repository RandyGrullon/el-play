// Cache-Control para el CDN de Vercel: s-maxage hace que todos los usuarios compartan una respuesta
// y stale-while-revalidate la sigue sirviendo mientras se renueva. El navegador siempre revalida
// (max-age=0) y Express responde 304 si el ETag no cambió.
const setCdnCache = (res, [, sMaxAge, staleWhileRevalidate]) => {
    if (!sMaxAge) return;
    res.set('Cache-Control', `public, max-age=0, s-maxage=${sMaxAge}, stale-while-revalidate=${staleWhileRevalidate}`);
};

module.exports = { setCdnCache };
