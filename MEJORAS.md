# Análisis y Mejoras Propuestas para "El Play"

Tras analizar la estructura del proyecto, el código fuente y la configuración actual, he compilado una lista de mejoras recomendadas para elevar la calidad, escalabilidad y experiencia de usuario de la aplicación.

## 1. Arquitectura y Calidad de Código

### 🔹 Migración a TypeScript
**Prioridad: Alta**
El proyecto está actualmente en JavaScript. Migrar a **TypeScript** proporcionaría:
- **Seguridad de Tipos**: Evita errores comunes como acceder a propiedades nulas (crítico con la API de MLB que tiene muchas estructuras anidadas).
- **Mejor Autocompletado**: Facilita el desarrollo al conocer la estructura exacta de los objetos `gameData`, `schedule`, etc.
- **Mantenibilidad**: Hace que el código sea más fácil de entender y refactorizar en el futuro.

### 🔹 Gestión de Estado y Data Fetching (TanStack Query)
**Prioridad: Alta**
Actualmente usas `useEffect` y `useState` con lógica manual de polling en `useGameData.js`. Recomiendo implementar **TanStack Query (React Query)**:
- **Manejo automático de caché**: Evita peticiones innecesarias.
- **Polling integrado**: `refetchInterval` reemplaza la lógica manual de `setTimeout`.
- **Estados de carga y error**: Simplifica la lógica en los componentes.
- **Revalidación en foco**: Actualiza los datos cuando el usuario vuelve a la pestaña.

### 🔹 Testing (Pruebas)
**Prioridad: Media**
No se observan pruebas automatizadas.
- **Unit Testing (Vitest)**: Para probar utilidades como `transformers.js` y componentes aislados.
- **E2E Testing (Playwright/Cypress)**: Para asegurar que el flujo principal (ver calendario -> entrar a juego -> ver detalles) funciona correctamente.

## 2. Backend y API

### 🔹 Validación de Datos (Zod)
**Prioridad: Media**
El backend confía en que los parámetros (como `gamePk`) son correctos.
- Implementar **Zod** para validar las entradas de la API y asegurar que los datos que vienen de la API de MLB cumplen con la estructura esperada antes de procesarlos.

### 🔹 Manejo Global de Errores
**Prioridad: Media**
Implementar un middleware de Express para capturar errores de forma centralizada y devolver respuestas JSON consistentes al frontend, en lugar de `console.error` dispersos.

### 🔹 Documentación de API (Swagger)
**Prioridad: Baja**
Si el proyecto crece o colaboran más personas, documentar los endpoints (`/api/game/:id`, `/api/schedule`) con Swagger/OpenAPI sería muy útil.

## 3. Experiencia de Usuario (UX/UI)

### 🔹 Skeleton Loaders
**Prioridad: Media**
Actualmente se muestra un spinner (`RefreshCw`) y texto "Cargando...".
- Reemplazar con **Skeleton Screens** (versiones "fantasma" de las tarjetas y tablas) hace que la carga se sienta más rápida y fluida, evitando saltos de contenido (layout shift).

### 🔹 Accesibilidad (a11y)
**Prioridad: Media**
- Asegurar que todos los botones e imágenes tengan etiquetas `aria-label` y `alt` descriptivas.
- Verificar el contraste de colores, especialmente en los modos oscuros con colores de equipos (algunos textos sobre fondos de color podrían ser difíciles de leer).
- Navegación por teclado completa.

### 🔹 Internacionalización (i18n)
**Prioridad: Baja**
El código mezcla inglés (nombres de variables, comentarios) con español (UI).
- Usar una librería como `react-i18next` para separar los textos de la lógica, permitiendo añadir más idiomas fácilmente en el futuro.

## 4. Funcionalidades Nuevas

### 🔹 Notificaciones Push
Implementar Service Workers para enviar notificaciones cuando:
- Comienza un juego de tu equipo favorito.
- El marcador cambia (opcional).
- El juego termina.

### 🔹 Modo "Spoiler Free"
Una opción para ocultar los resultados en el calendario si el usuario quiere ver el juego en diferido sin saber quién ganó.

### 🔹 Comparativa de Equipos (Head-to-Head)
En la vista de juego, añadir una sección que muestre el historial de enfrentamientos entre esos dos equipos en la temporada actual.

---

## Resumen de Acciones Inmediatas Recomendadas

1.  **Refactorizar `useGameData` y `useSchedule`** para usar **TanStack Query** (elimina mucha complejidad manual).
2.  **Crear componentes Skeleton** para la carga de `Game.jsx` y `Home.jsx`.
3.  **Revisar contrastes de color** en `BaseballDiamond` y `Scoreboard` para asegurar legibilidad.
