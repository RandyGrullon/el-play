/* Se carga dentro del service worker (workbox.importScripts en vite.config.js).
 *
 * La primera versión de El Play revisaba /version.json cada 30 s, pero tomaba como referencia lo que el servidor
 * devolvía al abrir: si alguien abría la app después de un despliegue, nunca veía el aviso y se quedaba con la
 * versión vieja (y su logo) hasta cerrarla del todo. Esa versión pide /version.json?t=… sin el parámetro `app`;
 * la actual lo pide con `app=2`. Cuando una pantalla vieja pregunta, este service worker (que ya la controla):
 *   1. la recarga, y la recarga ya sale de la caché nueva (versión y logo nuevos);
 *   2. por si el navegador no deja recargarla, responde una versión distinta cada vez para que la versión vieja
 *      muestre su propio aviso de «Actualizar».
 */
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    if (url.origin !== self.location.origin || url.pathname !== '/version.json' || url.searchParams.has('app')) return;

    event.respondWith(
        (async () => {
            const client = event.clientId ? await self.clients.get(event.clientId) : null;
            if (client && 'navigate' in client) {
                client.navigate(client.url).catch(() => {});
            }
            return new Response(JSON.stringify({ version: `update-${Date.now()}`, timestamp: Date.now() }), {
                headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
            });
        })()
    );
});
