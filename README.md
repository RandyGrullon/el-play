# El Play

Béisbol en vivo de LIDOM, Serie del Caribe y Clásico Mundial: marcador, zona de strike pitcheo a pitcheo,
jugada a jugada, box score, posiciones y líderes. PWA en React + Vite con un backend Express (`server/`) que
se despliega como una sola función de Vercel (`api/index.js`) y lee MLB StatsAPI.

> En `api/` va solo `index.js`: Vercel convierte cada archivo de esa carpeta en una función y el plan Hobby
> admite 12 por despliegue. Todo lo demás del backend va en `server/`.

## Correr en local

```bash
npm install
npm run dev        # API (5001) + Vite (5173) contra MLB StatsAPI
npm run dev:mock   # igual, pero con datos simulados (sin red o con statsapi.mlb.com bloqueado)
npm test           # pruebas de la API (con datos reales guardados en server/tests/fixtures) y de la app
npm run build
```

`WEB_PORT`, `API_PORT`/`PORT` cambian los puertos. En modo simulado hay siempre un juego en vivo que avanza
un pitcheo cada 6 s (`MLB_MOCK_PITCH_MS`), uno terminado y uno por empezar; los nombres son inventados.

## Cómo se obtienen los datos

| Capa | Qué hace |
|---|---|
| CDN de Vercel | Cada respuesta lleva `s-maxage` + `stale-while-revalidate`: todos los usuarios comparten una sola respuesta (juego en vivo 3 s, calendario 5–30 s, posiciones 5 min, líderes 15 min). |
| Juego en vivo (`server/services/liveFeed.js`) | Baja el `feed/live` completo una vez y después pide solo los cambios con `feed/live/diffPatch?startTimecode=…` (JSON Patch). Si algo no cuadra, vuelve a bajarlo completo. `MLB_DIFFPATCH=0` lo desactiva. |
| Caché del servidor (`server/utils/cache.js`) | Peticiones iguales simultáneas comparten una llamada a MLB y, si MLB falla, se sirve el último dato bueno. |
| Respuesta | Solo lo que usa la app (~90 KB de un feed de ~1 MB), con todos los pitcheos de cada turno: ubicación, velocidad, tipo y resultado. |
| App (`src/lib/polling.ts`) | Consulta según el estado real del juego (`abstractGameState`): en vivo cada ~5 s, antes del juego cada vez más seguido según se acerca la hora, terminado nunca. |
| Temporada | Se pide a `/league/{id}`; si la nueva aún no empieza, posiciones y líderes muestran la anterior marcada. |

Las rutas `/api/v2/*` son las de la app actual; `/api/*` mantiene el formato anterior para la PWA vieja.

## Íconos

`python scripts/make-icons.py` regenera los PNG de la PWA a partir de la marca (home plate + pelota), que
también está en `public/logo.svg` y `src/components/brand/Logo.tsx`.
