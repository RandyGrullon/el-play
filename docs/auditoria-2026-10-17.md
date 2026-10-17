# Auditoría de El Play: qué merece estar y qué no

**Fecha:** sábado 17 de octubre de 2026. **Versión revisada:** `main` en `bf4c7cd`, más la app móvil `el-play-app` (Expo SDK 58) tal como está hoy.
**Para qué:** saber qué merece estar en cada espacio de la app, qué sobra, qué está roto, qué datos tenemos sin usar y qué hace falta para el PRO rediseñado y para seguir el juego en segundo plano.

## Cómo se revisó

- Se leyó el código de 8 zonas: portada, pantalla del juego, posiciones/líderes/estadísticas/ficha, Fantasy y cuenta, Más y plataforma, servidor, inventario de datos de MLB y la base de la app móvil.
- Se usó la app con Playwright a 390x844 (también 320 px), en claro y oscuro:
  - `http://localhost:5186` con datos reales de MLB (finales del 16-oct: 851435, 851491, 851509; previas del 17).
  - `http://localhost:5185` con datos simulados y un juego en vivo (1007430).
- Para ver PRO se puso una sesión falsa en el navegador de prueba y se respondieron las llamadas a Supabase desde Playwright: no salió ninguna petición real.
- Se consultó MLB StatsAPI directo para comprobar qué datos existen para LIDOM (los resultados están citados en cada punto).
- Se corrieron las pruebas del servidor (`vitest run server`: 42 de 42 bien), `tsc` de la app móvil (0 errores) y `expo lint` (11 errores, 3 avisos).
- Capturas: `C:\Users\rgrullon\AppData\Local\Temp\claude\C--Users-rgrullon-code\b4e1107f-5527-4f47-ab94-6519aa7979bc\scratchpad\auditoria\` (carpetas `juego`, `zona-stats`, `fantasy`, `plataforma`, `datos`, `base-movil` y las `juegos-*.png` de la portada).

**Lo que no se pudo ver o probar:**
- Un teléfono de verdad, con avisos permitidos.
- `winProbability` en un juego en vivo: solo se probó en juegos terminados (no había juegos en vivo a esa hora).
- Logs de Vercel, así que no se sabe si alguien llama todavía a las rutas v1.
- PRO con una cuenta real: se vio con sesión falsa.

**Archivos que otras personas están cambiando ahora mismo** (`FantasyPage.tsx`, `account.ts`, `AccountCard.tsx`, `main.tsx`, `server/` de fanáticos y vincular Google, `supabase/fantasy.sql`): no se juzgan los cambios a medias. Donde se citan, las líneas son de `bf4c7cd` (HEAD).

No se editó nada ni se hizo commit en el código.

---

## Resumen ejecutivo

1. **El Lite está bien y debe quedarse como está**, con arreglos pequeños. Lo mejor de la app:
   - la tarjeta en vivo con las dos mitades de color;
   - la cabecera del juego;
   - la zona de strike con el bateador uniformado;
   - el resumen tipo historia;
   - las animaciones por jugada.
2. **El PRO de hoy casi no existe como experiencia.**
   - En la portada, en Líderes y en la previa del juego solo aparece la insignia.
   - En Posiciones y Estadísticas cambia a tablas de 14 a 22 columnas, de las que en el teléfono se ven 5.
   - En el juego es un bloque de tablas puesto a unos 2000 px del tope, cortado a 390 px y con solo 4 lanzadores de 11-12.
3. **Tenemos muchos más datos de los que mostramos.** Hay tres grupos:
   - Datos que ya llegan al teléfono y no se pintan: récord de cada equipo, lanzador en vivo, R-H-E, nombres de los corredores, serie, `updatedAt`.
   - Datos que el servidor pide a MLB y tira: marcador por entradas, fechas de temporada, splits y récord esperado de posiciones, quiebre y extensión de cada pitcheo, corredores con créditos de fildeo, bullpen, árbitros, viento, retos ABS.
   - Datos que MLB da para LIDOM con una llamada nueva, verificados: probabilidad de ganar por jugada, splits, zonas calientes, repertorio y estadísticas por equipo.
4. **Hay que corregir dos ideas que dábamos por ciertas:**
   - «Este estadio no mide» es falso. Los 3 juegos del 16-oct traen rastreo completo al terminar: Quisqueya 350/352, Julián Javier 260/260 y Micheli 317/317. En vivo llega tarde: 851491 tenía 0/21 en la 1.ª entrada.
   - La probabilidad de ganar sí existe para LIDOM, también en parques que creíamos sin rastreo.
5. **Errores serios encontrados:**
   - El botón «Avisarme» no avisa en Chrome de Android (`new Notification`).
   - En el Fantasy se puede hacer trampa: la base acepta cambiar el equipo después de empezar los juegos, y el cierre solo existe en el teléfono.
   - En PRO, abrir un pelotero desde la tabla mete dos entradas en el historial.
   - Sin red, la cuenta se cierra sola al renovar el token, en la web y en la app móvil.
6. **Todas las imágenes compartidas y el tutorial de instalación dicen `el-play.vercel.app`.** Ese dominio responde 200 sin redirigir, así que quien instala desde ahí queda en otro origen, sin favorito, PRO ni sesión.
7. **Seguir el juego con la app cerrada no se puede hacer solo desde el teléfono.** Hacen falta:
   - Live Activity (iPhone) y notificación fija (Android) con `expo-widgets`;
   - notificaciones remotas (APNs y FCM);
   - un proceso en el servidor que vigile los juegos y empuje los cambios. La función de Vercel no sirve para eso.
8. **Limpieza fácil:** 5 dependencias sin uso, CSS muerto, imágenes y documentos viejos, scripts rotos en la raíz, configuración de equipos con IDs que no existen y dos archivos de bloqueo.

## Lo primero que yo arreglaría

| # | Qué | Dónde | Esfuerzo |
|---|---|---|---|
| 1 | Validar el Fantasy en el servidor (cierre, roles, máximo por equipo, día) y no solo en el teléfono | `supabase/fantasy.sql:93-95` (HEAD), `src/lib/fantasy.ts:62,143` | L |
| 2 | Avisos con `registration.showNotification` y montados en `AppShell`, no solo en la portada | `src/hooks/useGameAlerts.ts:42`, `src/pages/GamesPage.tsx:108` | M |
| 3 | No cerrar la sesión por un fallo de red al renovar (solo con 400/401) y un solo refresh a la vez | `src/lib/account.ts:210` (HEAD), `el-play-app/src/lib/account.ts:239` | S |
| 4 | Cambiar `el-play.vercel.app` por `elplay.grullonb.com` y redirigir el dominio viejo | `src/share/ShareSheet.tsx:77`, `src/components/install/TutorialArt.tsx:104`, `es.json`/`en.json:93` | S |
| 5 | Doble historial y orden arrastrado de la tabla PRO de estadísticas | `src/components/pro/StatsTable.tsx:85,121,123`, `src/pages/StatsPage.tsx:173` | S |
| 6 | Líderes y Estadísticas del Clásico (gameType F) y líderes con valor 0 | `server/services/mlbService.js:326,338`, `server/services/players.js:107` | S |
| 7 | Validar `?league=` con `Object.hasOwn` (hoy `?league=hasOwnProperty` devuelve líderes de MLB y se guarda en caché pública) | `server/routes/index.js:13` (HEAD) y los `leagueFrom` | S |
| 8 | Apellidos «Jr.» / «II» en la tarjeta de situación, el podio, la zona y el ponche | `src/pages/GamePage.tsx:95`, `src/pages/StatsPage.tsx:229`, `StrikeZonePanel.tsx:108`, `PlayAnimation.tsx:35,269` | S |
| 9 | Texto falso de «sin rastreo» y la temperatura en °F fija | `src/locales/es.json:954`, `LiveProPanel.tsx:25`, `GamePage.tsx:202-203` | S |
| 10 | Pasar al cliente el R-H-E y el marcador por entradas que el servidor ya pide | `server/utils/transformers.js:390-451` | M |

---

## Pantalla por pantalla

Veredictos: **Mantener** (se queda como está o con un detalle), **Mejorar** (se queda pero hay que arreglarlo o enriquecerlo), **Unir** (hay dos cosas que hacen lo mismo), **Quitar**. Esfuerzo: S (horas), M (1-2 días), L (más).

### 1. Portada de Juegos

| Elemento | Veredicto | Por qué | Esfuerzo |
|---|---|---|---|
| Encabezado fecha + «Hoy en LIDOM» (`GamesPage.tsx:151-167`) | Mejorar | El título no se puede tocar. La liga se cambia con el logo, que no dice qué liga está activa. Mejor un título selector «LIDOM ▾». | S |
| Botón de liga con el logo (`GamesPage.tsx:163-165`) | Unir | Juntarlo con el título. Ese espacio queda libre para «actualizado hace X s» en PRO. | S |
| Hoja «Elegir liga» (`GamesPage.tsx:66-94`) | Mejorar | No dice qué liga tiene juegos: hoy el Clásico y la Serie del Caribe devuelven 0 y el usuario cae en una pantalla vacía. La Serie del Caribe repite nombre y subtítulo (`es.json:28`). | S |
| Insignia PRO (`GamesPage.tsx:155`) | Mejorar | Es lo único que cambia PRO en la portada: ningún bloque consulta `useIsPro`. | L |
| Tarjeta «Lleva El Play a tu teléfono» (`InstallCard.tsx:10-35`) | Mejorar | Sale solo en la primera visita, y eso está bien. Pero empuja el primer juego de 258 a 374 px (medido). Ponerla después de la primera tarjeta. | S |
| Ícono de instalar con punto rojo (`InstallCard.tsx:38-56`) | Mejorar | Ese rojo significa «en vivo» en toda la app. Mejor un punto neutro o ninguno. | S |
| Guía de instalación (`InstallSheet.tsx`, `TutorialArt.tsx`) | Mantener | Detecta sistema y navegador (Samsung, Firefox, Safari 26, apps de redes) y respeta «menos movimiento». Solo falta corregir el dominio. | S |
| Historias de equipos (`TeamStories.tsx:27-73`) | Mejorar | Sirven de filtro, pero tienen fallos. Los anillos no se explican. El azul de «más tarde» se confunde con el del Licey. En doble cartelera marcan mal (ver errores). Debajo de la sigla cabe el récord. | M |
| Chips de días (`GamesPage.tsx:25-64`) | Mantener | Funcionan. Se les puede sumar el conteo con `games.count_*` y `games.liveCount_*`, que ya existen sin uso (`es.json:150-153`). | S |
| Tarjeta en vivo (`GameFeedCard.tsx:25-56`) | Mantener | Es lo mejor de la portada. Falta el lanzador: `live.pitcher` llega y `card.pitching` (`es.json:164`) no se usa. «B: Kelvin Ventura» es críptico. | S |
| Tarjeta por empezar (`GameFeedCard.tsx:104-151`) | Mejorar | Con datos reales solo muestra hora, nombres y «Avisarme». El récord llega y `TeamRow` no lo pinta (`:58-71`). La cuenta regresiva no tiene temporizador (`:83`). | S |
| Tarjeta terminada (`GameFeedCard.tsx:104-151`) | Mejorar | Falta el R-H-E: el servidor lo pide y lo descarta. | M |
| Botón «Avisarme» (`GameFeedCard.tsx:124-137`) | Mejorar | Es una promesa visible que no se cumple en Android y solo funciona con la portada abierta. | M |
| Compartir en la tarjeta final (`GameFeedCard.tsx:94-123`) | Mantener | Sirve para WhatsApp. Ocultarlo en juegos pospuestos (`:119`). | S |
| Estado vacío y «Próximos juegos» (`GamesPage.tsx:187-210`) | Mejorar | Ignora el filtro de equipo (`:145`). Fuera de temporada podría decir cuándo empieza (`/league/{id}` lo da). | S |
| Flappy Ball (`MiniGame.tsx`; `GamesPage.tsx:19-20,197-208`) | Mantener | Carga diferida y solo sale en días vacíos. Si se queda, hay que arreglar su bucle (`MiniGame.tsx:160`), el `localStorage` sin try/catch (`:42,50`) y su estilo ajeno (zinc, ámbar, emojis). | S |
| Jalar para recargar (`PullToRefresh.tsx:50-87`) | Mejorar | Funciona, pero bloquea el deslizamiento horizontal de las historias y los chips (ver errores). | S |
| Aviso sin conexión (`OfflineBanner.tsx`) | Mantener | Le falta decir de qué hora son los datos (`dataUpdatedAt`). | S |
| Esqueleto de carga (`GameFeedCard.tsx:155-166`) | Mantener | Imita bien la tarjeta. | — |
| Orden del feed (`GamesPage.tsx:139-143`) | Mantener | El orden es correcto: en vivo, por empezar, terminados, y el favorito primero. Sigue pendiente «solo mi equipo» (informe del 16-oct). | S |
| `LeagueContext.tsx` | Mantener | Es simple. Se pueden quitar dos exports muertos: `LeagueType` (`:6`) y `LEAGUE_COLORS`. | S |

### 2. Pantalla del juego (en vivo, final y previa)

| Elemento | Veredicto | Por qué | Esfuerzo |
|---|---|---|---|
| Cabecera con las dos mitades de color (`GameHero.tsx:30-90`) | Mantener | Es la identidad de El Play. Los nombres largos se cortan a 390 px (`:56`). No muestra la serie, el motivo de suspensión ni la fase. | S |
| Compartir en la cabecera + botón «Compartir» abajo (`GameHero.tsx:78-82`; `GamePage.tsx:126,143,216`) | Unir | Es la misma acción dos veces en la misma pantalla. | S |
| Tarjeta de situación (`GamePage.tsx:86-99`) | Mejorar | El apellido sale «Jr.» o «II» (`:95-96`). Los corredores no tienen nombre aunque llegan. Tampoco muestra los pitcheos del lanzador. | S |
| Mini zona flotante (`GamePage.tsx:100-106`) | Mantener | Es el gancho visual del juego en vivo. | S |
| Botón «Zona» (`GamePage.tsx:125`) | Quitar | Hace lo mismo que tocar la mini zona. | S |
| Cronología tipo chat (`Timeline.tsx:51-95`) y hoja de jugadas (`PlayByPlay.tsx:27-132`) | Unir | Son dos diseños de lo mismo y ninguno muestra robos, wild pitches ni cambios de lanzador (9-10 por juego real). `compact` y `limit` de PlayByPlay no se usan (`:24,99`). Propuesta: un solo componente con dos densidades. | M |
| Mapa de batazos (`SprayChart.tsx:31-124`) | Mantener | Funciona en todos los parques. En PRO: color por velocidad, filtros y medidas reales del parque (hoy la cerca es genérica de 330/400 pies). | M |
| Panel PRO (`LiveProPanel.tsx:18-173`; `GamePage.tsx:117-121`) | Mejorar | Son solo tablas al fondo de la página, cortadas a 390 px (`:71,116`). Muestra «Zona 12» como número crudo (`:62`) y solo 4 lanzadores (`:34`). Es la base del rediseño. | L |
| Fila de acciones (`GamePage.tsx:123-127,140-144`) | Mejorar | 2 de 3 botones están duplicados. En PRO conviene una barra de pestañas fija. | S |
| Hoja de zona (`StrikeZonePanel.tsx:18-190`) | Mantener | Es la herramienta más profunda de la pantalla. Detalles: título duplicado (`:72`), prop `atBat` sin uso (`:15`) y «Abanicados» con otra regla que `arsenal()` (`:48` contra `baseball.ts:369`). | M |
| Zona en pies reales + bateador uniformado (`StrikeZone.tsx`, `BatterFigure.tsx`) | Mantener | Es lo más distintivo de la app. | S |
| Lista de pitcheos (`PitchList.tsx`) | Mantener | Compacta y clara. | S |
| Duelo bateador-lanzador (`Matchup.tsx`; `GamePage.tsx:330`) | Mejorar | Tiene datos buenos (pitcheos, IP, K, H-AB, en espera), pero escondidos al fondo de la hoja de zona. | S |
| Box score (`BoxScore.tsx:7-118`) | Mejorar | `min-w` de 460 y 500 px (`:37,85`) obliga a deslizar de lado y K y AVG quedan fuera. No hay pizarra por entradas en ninguna parte del juego en vivo. | M |
| Resumen tipo historia (`StoryRecap.tsx:17-150`) | Mantener | Gran pieza para compartir. El comentario promete avanzar tocando los lados (`:15-16`), pero no se puede: solo hay flechas de 44 px. Las barras no avanzan solas. | M |
| Vista del juego final (`GamePage.tsx:132-147`) | Mejorar | En PRO reutiliza el panel en vivo. Falta un informe del juego y la pizarra visible fuera de la historia. | L |
| Previa: abridores probables (`GamePage.tsx:160-190`) | Mantener | Dice con honestidad que LIDOM casi nunca los publica (0 de 185 juegos en 2025-26, comentario en `:188`). | S |
| Previa: detalles (`GamePage.tsx:192-206`) | Unir | Fecha, hora y cuenta regresiva repiten la píldora de la cabecera. Clima en °F fijo (`:203`) y condición en inglés (`:202`). | S |
| Previa en PRO (`GamePage.tsx:149-220`) | Mejorar | PRO no agrega nada, y es la pantalla con más espacio vacío. | M |
| «Avisarme cuando empiece» (`GamePage.tsx:209-215`) | Mantener | A 390 px se parte en dos renglones: acortar el texto. | S |
| Animaciones de jugada (`PlayAnimation.tsx:41-435`) | Mejorar | Buena calidad, pero las trayectorias son fijas (`:16-25,244`) aunque el lugar real del batazo viene en el 100 % de los batazos (57/57, 53/53, 45/45). No hay animación para base por bolas, error, robo, WP, cambio de lanzador ni carrera. | L |
| Detección de jugadas nuevas (`playEvents.ts:78-180`) | Mejorar | Al volver del segundo plano repite jugadas viejas. Agrupa por tipo y no por orden del juego. Faltan tipos. | M |
| Bases y outs (`Bases.tsx`) | Mantener | `aria-label` «outs» fijo en inglés (`:36`). | S |
| Hojas inferiores (`GamePage.tsx:327-339`) | Mejorar | Cada una repite su título dentro. | S |
| Estados de carga, error y juego inexistente (`GamePage.tsx:256-321`) | Mantener | Probados el 16-oct. | S |
| CSS `fly-ball`, `bounce-in`, `spin-slow` (`styles.css:173-189`) | Quitar | Ninguna de esas clases se usa. | S |

### 3. Posiciones, Líderes, Estadísticas y ficha del pelotero

| Elemento | Veredicto | Por qué | Esfuerzo |
|---|---|---|---|
| Pestañas (`StatsTabs.tsx:8-21`) | Mantener | Usan `replace`, así que no llenan el historial. En PRO cabe una 4.ª pestaña «Equipos». | S |
| Cabecera y aviso de temporada pasada (`StandingsPage.tsx:133-152`) | Mantener | El post de la tabla para WhatsApp es de lo más compartible. | S |
| Píldoras de fase (`StandingsPage.tsx:116-127,164-166`) | Mejorar | Las fases vacías se muestran siempre. Las notas `standings.regularNote`, `roundRobinNote` y `finalNote` existen y no se usan. | S |
| Tarjeta grande del líder en Lite (`StandingsPage.tsx:54-64`) | Mejorar | A 390 px sale «Estrellas Orie…». `team.shortName` ya llega (`mlbService.js:121`) y no se usa. | S |
| Filas con favorito y línea de corte (`StandingsPage.tsx:65-88`) | Mantener | Es el Lite que funciona. | S |
| Tabla PRO de posiciones (`StandingsTable.tsx:13-70`) | Mejorar | Tiene varios problemas. Se ven 5 de 14 columnas. Los nombres se cortan. La línea de corte no se ve. Las leyendas solo están en `title`, que no existe en el teléfono. No tiene favorito ni orden. En el Clásico, 9 de 14 columnas salen «—». | L |
| Grupos del Clásico (`StandingsPage.tsx:177-193`) | Mantener | Están bien en Lite. | S |
| Insignia PRO en Líderes (`LeadersPage.tsx:124-126`) | Mantener | Hoy PRO es igual a Lite en esta pantalla. Se resuelve dando contenido PRO a Líderes, no quitando la insignia. | S |
| Carrusel de líderes (`LeadersPage.tsx:26-107`) | Mantener | Es lo más «El Play» de la zona. Hay que arreglar los ceros y los empates: 5 comparten el N.º 1 en HR y solo uno se pinta como líder (`:67-74`). | S |
| Detalle bajo el nombre (`LeadersPage.tsx:18-23`) | Unir | Es una copia de `share/subjects.ts:83-86`. En Victorias muestra IP·K cuando ya llega el G-P (`extra.w/l`). | S |
| Compartir en cada tarjeta de líder (`LeadersPage.tsx:90-98`) | Mejorar | Son 10 botones grandes. En PRO, un ícono pequeño. | S |
| Notas de «calificados» (`LeadersPage.tsx:148`; `StatsPage.tsx:197-199`) | Unir | Hay dos reglas distintas y la app se contradice entre pestañas vecinas (ver errores). | M |
| Texto «…compáralos…» (`StatsPage.tsx:83`) | Mejorar | Promete un comparador que no existe. | S |
| Buscador, Bateadores/Lanzadores y chips de equipo (`StatsPage.tsx:94-142`) | Mantener | Buscar sin tildes (`stats.ts:226`) es un acierto. | S |
| Selector de temporada (`StatsPage.tsx:118-126`) | Mejorar | En el Clásico ofrece temporadas que no existieron y no deja volver a la actual (`:123`). | S |
| Píldoras de orden en Lite (`StatsPage.tsx:144-159`) | Mantener | Suficientes para Lite. | S |
| Podio de los tres primeros (`StatsPage.tsx:221-250`) | Mejorar | Sale «Jr.» como apellido (`:229`). | S |
| Lista con «Ver N más» (`StatsPage.tsx:184-196,252-275`) | Mantener | Clara. | S |
| Tabla PRO de estadísticas (`StatsTable.tsx:74-151`) | Mejorar | Tiene doble historial y orden arrastrado (ver errores). La cabecera no queda fija. AVG, OPS, ISO y K% quedan en las columnas 15-22, fuera de pantalla. | L |
| Catálogo de columnas (`stats.ts:177-205` y `StatsTable.tsx:19-72`) | Unir | Dos listas definen lo mismo y `num()` está duplicada. | S |
| Cabecera de la ficha (`PlayerSheet.tsx:48-60,106-125`) | Mantener | Muy buena identidad visual. Falta el debut en MLB (`mlbDebut` llega). | S |
| Tarjeta Fantasy de la ficha (`PlayerSheet.tsx:32,127-155`) | Mejorar | Usa el mismo degradado que PRO (`ProBadge.tsx:4`), así que en Lite parece PRO. | S |
| Rejilla «Temporada» (`PlayerSheet.tsx:164-217`) | Mejorar | OBP está en la básica y SLG en la avanzada: AVG, OBP, SLG y OPS van juntos. Faltan los holds de los lanzadores. | S |
| Métricas avanzadas PRO de la ficha (`PlayerSheet.tsx:220-264`) | Mejorar | Son números sueltos sin contexto: un ISO de .667 no dice si es bueno. Pasarlas a percentiles. | M |
| Juego a juego (`PlayerSheet.tsx:266-305`) | Mejorar | La línea se corta y no dice si el equipo ganó (`isWin` llega). | S |
| Carrera en la liga (`PlayerSheet.tsx:307-355`) | Mejorar | OPS queda fuera de pantalla y no hay fila de totales. | S |
| «Ver la temporada X» (`PlayerSheet.tsx:88-94`) | Mantener | Resuelve bien el primer día de temporada. | S |
| Estadísticas solo de gameType R (`players.js:107`; `mlbService.js:326`) | Mejorar | El Clásico sale vacío, y el Round Robin y la Final nunca entran. | M |
| Fila de posiciones del servidor (`mlbService.js:115-141`) | Mejorar | Tira `clinched`, `eliminationNumber`, `runDifferential`, `expectedRecords` y 12 splits que ya vienen en la misma respuesta. | S |
| Líderes del servidor (`mlbService.js:319-352`) | Mejorar | Devuelve ceros como líderes. Para el PRO: top 10 con `value > 0`. | S |
| Constante de FIP fija en 3.1 (`advanced.ts:5,33`) | Mejorar | Con `/teams/stats` de LIDOM 2025 (EFE 4.09) sale 3.41: todo FIP queda unos 0.31 bajo. | S |
| Condición redundante (`players.js:182`) | Mejorar | Es limpieza, sin cambio de comportamiento. | S |
| Claves i18n huérfanas (`standings.team/w/l/…`, `leaders.*Short`, `statsPage.info`) | Mantener | No se usan, pero las notas de fase se van a reutilizar. | S |

### 4. Fantasy y cuenta (líneas de `bf4c7cd`; estos archivos están en edición)

| Elemento | Veredicto | Por qué | Esfuerzo |
|---|---|---|---|
| Cabecera con título, PRO, Estadísticas y Compartir (`FantasyPage.tsx:137-151`) | Mantener | Orienta y lleva a `/estadisticas`. | S |
| Selector Ayer / Hoy / Mañana (`FantasyPage.tsx:132-133,157-168`) | Mejorar | Un día pasado sin equipo muestra 6 huecos vacíos. Debería decir «No jugaste este día» y mostrar el equipo ideal. | S |
| Tarjeta «Tus puntos del día» (`FantasyPage.tsx:171-181`, degradado copiado en `:238`) | Mejorar | Usa el degradado de PRO, así que el Lite parece PRO. Con 0 puntos solo muestra ceros. Mejor «Te faltan 3 peloteros · cierra a las 5:00 p. m.». | S |
| Línea «Temporada: X en N días» (`FantasyPage.tsx:128-129,178`; `fantasy.ts:220-233`) | Unir | Sale de lo guardado en este teléfono: en un teléfono nuevo recupera como mucho 10 días. Debe venir de la tabla del servidor (en curso). | S |
| Barras de los últimos 7 días (`FantasyPage.tsx:719-728`) | Mejorar | No tienen fecha ni valor, y un día negativo se pinta igual que uno de 0. | S |
| Pestañas Mi equipo / Pronósticos / Tabla (`FantasyPage.tsx:183-192`) | Mantener | Separan bien las tareas. | S |
| Reglas fijas arriba de Mi equipo (`FantasyPage.tsx:338`) | Mejorar | Tres líneas que salen siempre. Que salgan solo mientras falten peloteros, o en «¿Cómo se juega?». | S |
| Huecos vacíos (`FantasyPage.tsx:329-347`) | Mejorar | Son 6 tarjetas de 84 px. No tienen estado «cerrado» cuando ya no quedan juegos por empezar. | S |
| Tarjeta de cada pelotero (`FantasyPage.tsx:363-403`) | Mejorar | Falta el desglose de puntos y avisar cuando está al bate (`game.live` llega). Corona y X de 28 px, menos de los 44 px mínimos (`:391,394`). | M |
| Capitán x1,5 (`fantasy.ts:173-179,189`) | Mantener | Es una regla simple. Falta validarla en el servidor. | S |
| Tabla «Cómo se cuentan los puntos» (`FantasyPage.tsx:405-428`; `server/services/fantasy.js:10-13`) | Mantener | Una sola regla en el servidor. Ojo con el balance: el 16-oct los 3 que más sumaron fueron abridores (34,5, 28 y 27,5) y un bateador que jugó sumó 5,5 de promedio. Es un solo día: no es concluyente. | S |
| Selector de peloteros (`FantasyPage.tsx:432-550`; `fantasy.js:99,151-160`) | Mejorar | Tiene tres problemas. Ordena por puntos de hoy y deja arriba a los cerrados. No dice quién abre. El roster de un juego por empezar sale del último juego del equipo. | M |
| PRO del selector: «Ordenados por promedio…» y «Prom. X pts» (`FantasyPage.tsx:439-442,465-469,514-518`) | Mejorar | Es todo el PRO del Fantasy. El aviso no es cierto con juegos empezados, y 64 de 168 muestran «Prom. 0 pts en 0 J». | S |
| Agregar/Quitar dentro de la ficha (`FantasyPage.tsx:539-571`) | Mantener | Se decide viendo la ficha completa. | S |
| Pronósticos (`FantasyPage.tsx:575-620`) | Mejorar | El récord llega y no se muestra. El elegido se pinta con fondo de su color y letra blanca: AGU da 1,7 a 1 de contraste y EST 2,5 a 1 (captura 20). | S |
| Tabla del día (`FantasyPage.tsx:624-678`; `account.ts:310-318`) | Mejorar | Baja hasta 500 equipos sin orden y suma en el teléfono: con más jugadores queda incompleta. El ranking va en el servidor. | M |
| «Ponte un nombre» con la tarjeta de cuenta completa (`FantasyPage.tsx:653-658`) | Quitar | Mete correo, Salir y «Borrar mi cuenta» dentro de la tabla. Basta un campo de nombre. | S |
| Crear liga / Unirme (`FantasyPage.tsx:678-712`) | Mejorar | Ocupa media pantalla para algo que se hace una vez. Mejor una hoja «Ligas» con copiar código, miembros y salir (el permiso existe en `fantasy.sql:106-107`). | M |
| Portada sin cuenta (`FantasyPage.tsx:224-314`) | Mantener | Explica el juego en 3 pasos y engancha. Las tarjetas «Hoy juegan» deberían abrir el juego. | S |
| Entrar con Google o código (`AccountCard.tsx:123-218`) | Mantener | Sin contraseñas. En edición. | S |
| Compartir equipo (`FantasyPage.tsx:730-752`) | Mejorar | Solo comparte texto. En WhatsApp funciona mejor una imagen con fotos y puntos. | M |
| Reglas copiadas en 3 sitios (`fantasy.ts:38`; `el-play-app/src/lib/fantasy.ts:40`; `fantasyScore.js` en curso) | Unir | Que las mande `/api/v2/fantasy`, como ya se hace con la puntuación. | S |
| Cierre del pelotero (`fantasy.ts:62,143`) | Mejorar | Solo mira el estado guardado. Debe cerrarse también por la hora programada y validarse en el servidor. | M |
| Seguridad por filas de `fantasy_entries` (`fantasy.sql:13-21,90-95`) | Mejorar | Solo revisa dueño y día. No revisa cierre, roles, máximo por equipo ni que los peloteros jueguen ese día. | L |
| Copia local y sincronización (`account.ts:264-301`; `FantasyPage.tsx:98-106`) | Mejorar | Los errores al subir se tragan: la persona no sabe si su equipo quedó en la cuenta. | S |

### 5. Más, Privacidad y plataforma

| Elemento | Veredicto | Por qué | Esfuerzo |
|---|---|---|---|
| Encabezado «Más» (`MorePage.tsx:24-26`) | Mantener | Igual que el resto. | S |
| Fila de instalar / «Ya está instalada» (`MorePage.tsx:28`; `InstallCard.tsx:59-95`) | Mejorar | Ya instalada ocupa una tarjeta sin acción. Basta una insignia en «Acerca de». | S |
| Tarjeta de cuenta arriba de todo (`MorePage.tsx:30-33`) | Mejorar | Sin sesión ocupa unos 400 px, y solo hace falta para Fantasy y PRO. Mejor una fila «Entrar» que abra una hoja. | M |
| Tarjeta Lite/PRO (`ModeCard.tsx:10-56`) | Mejorar | Es la única puerta al PRO y no lo vende. Tocar PRO sin cuenta no responde (`:34`). Con PRO activo repite la misma lista. | M |
| Lista de ligas (`MorePage.tsx:40-59`) | Unir | Es la misma de la hoja de la portada (`GamesPage.tsx:66-94`). | S |
| Tema (`MorePage.tsx:63-76`) | Mantener | Se aplica antes de pintar (`index.html:40-46`). | S |
| Idioma (`MorePage.tsx:77-89`) | Mantener | Funciona y cambia `html lang`. | S |
| Animaciones Grandes/Todas/Apagadas (`MorePage.tsx:90-106`) | Mantener | Respeta «menos movimiento». En PRO se puede sumar un nivel «Cine». | S |
| Tarjeta El Play + Privacidad (`MorePage.tsx:109-118`) | Mejorar | Faltan la versión (`APP_VERSION`, `appUpdate.ts:4`), «Buscar actualización», un correo de contacto y los créditos de datos. | S |
| «Mi equipo» y «Mis avisos» (no existen) | Mejorar | El favorito no se elige desde Más. Los juegos con aviso (`subscribedGames`, hasta 30) no se ven ni se quitan desde ningún sitio. | M |
| Página de Privacidad (`PrivacyPage.tsx`) | Mejorar | Falta un correo de contacto y decir que el modo PRO se guarda en el teléfono. La sección «Publicidad» (`:37`) choca con la rama de anuncios (ver más abajo). | S |
| Insignia PRO y `PRO_GRADIENT` (`ProBadge.tsx:4-15`) | Mantener | Pasar el degradado a variables CSS (`--pro-1/2/3`) con versión clara y oscura para reutilizarlo. Hoy está copiado en `FantasyPage.tsx`, `PlayerSheet.tsx:32` y el `FAN_GRADIENT` nuevo. | S |
| `lib/pro.ts` | Mantener | Es seguro: sin sesión siempre es Lite. El modo no viaja entre dispositivos; podría ir en el perfil. | S |
| `lib/install.ts` | Mantener | Buena detección. `isIPad` (`:56`) no se usa. | S |
| `lib/appUpdate.ts` + aviso de logo nuevo (`UpdateToast.tsx`) | Mantener | Funciona. El aviso del ícono v2 (`:42-74`) se puede quitar en unas semanas. | S |
| `lib/noZoom.ts` | Mantener | Evita el zoom por doble toque. | S |
| Toast + UpdateToast (`Toast.tsx:12`; `UpdateToast.tsx:60`) | Mejorar | Misma posición y misma capa: si salen juntos, uno tapa al otro. | S |
| `useAlertToggle.ts` | Mantener | Siempre explica qué pasó. | S |
| `useGameAlerts.ts` | Mejorar | Tres fallos: no avisa en Android, solo corre en la portada y repite el «¡Playball!». | M |
| `useAnalytics.js` | Quitar | De 9 funciones solo se usa `trackGameView` (`GamePage.tsx:232`). Mejor llamar a `track()` directo. | S |
| `preferences.tsx` | Mantener | Sobran `cycleTheme` (`:68`) y `playAnimations` (`:52`). | S |
| `storage.ts` | Mantener | Envuelve todo con try/catch. | S |
| Hoja Compartir (`ShareSheet.tsx`) | Mejorar | El dominio está mal (`:77`). La muestra del estilo «Color» es siempre amarillo/azul (`:42`). «Toca WhatsApp» se queda aunque se cancele (`:221`). | S |
| Estudio de imágenes (`render.ts`) | Mejorar | El resultado no trae R-H-E, decisiones ni figuras. La tabla solo trae G-P y JD (`:586-588`). Corta a 12 entradas (`:409`). | M |
| `subjects.ts` | Mantener | Corregir el plural «1 JONRONES» (`:97`). | S |
| `main.tsx` / `App.tsx` | Mantener | Carga diferida y precarga. Las devtools no llegan a producción. | S |
| `public/lidom.png` y `public/wbsc.jpg` | Quitar | No se usan. `lidom.png` (109.800 bytes) entra en la caché del service worker. | S |
| `public/pwa-192x192.png`, `pwa-512x512.png`, `apple-touch-icon.png`, `logo.svg` | Unir | Son copias exactas de `icons/*-v2` y se guardan en caché dos veces. | S |
| `public/sw-legacy.js` | Mantener | Todavía rescata pantallas de la primera versión. | S |
| Manifest, capturas, og-image, robots, sitemap | Mantener | Apuntan al dominio nuevo. Renovar las capturas cuando salga el PRO. | S |
| Workbox en modo desarrollo (`vite.config.js:37`) | Mejorar | Producción sirve 187 KB de runtime de desarrollo con 65 llamadas de log. | S |
| Selectores de Más (`Segmented.tsx:14,25`) | Mejorar | Miden 24 px de alto y usan `tablist` cuando deberían ser `radiogroup`. | S |
| `docs/ANALYTICS.md` | Quitar | Documenta 9 eventos y solo se envía `game_view` (más `share` y `share_download`, que no figuran). | S |
| `MEJORAS.md` y restos en la raíz | Quitar | Ver «Quitar o unir». | S |
| Dependencias sin uso (`package.json:21-23,36,42`) | Quitar | `@fortawesome/*` (3), `node-cache` y `zod` no se importan en ningún sitio. | S |
| `yarn.lock` + `package-lock.json` | Unir | Dos registros de versiones que pueden divergir (Vercel usa yarn y en local se usa npm). | S |

### 6. Servidor y datos

| Elemento | Veredicto | Por qué | Esfuerzo |
|---|---|---|---|
| Una sola función de Vercel (`api/index.js`, `vercel.json`) | Mantener | Lejos del límite de 12. | S |
| Middleware: helmet, cors, límite 600/10 min (`server/app.js:13-31`) | Mejorar | `helmet()` pone `Cross-Origin-Resource-Policy: same-origin` en todo `/api`, también en las fotos: Expo web u otro origen no puede mostrarlas. | S |
| Validación de `league` (`routes/index.js:13` HEAD y los `leagueFrom`) | Mejorar | Acepta nombres del prototipo de Object (ver errores). | S |
| Rutas v1 y `utils/legacy.js` (`routes/index.js:28-32`) | Quitar | Ni la web ni la app móvil las llaman. Antes de borrarlas: una semana registrando las llamadas en Vercel. | S |
| Detalle del juego v2 (`gameController.js:7-31`) | Mantener | El TTL va según el estado del juego y está bien. | S |
| Respuesta del juego en vivo (`transformers.js:195,376`) | Mejorar | Pesa 105.859 B, y 99.348 son el historial de turnos (94 %). Se relee cada 5 s. Para el PRO y el segundo plano: `?since=` o separar «ahora» del historial. | M |
| Calendario v2 (`mlbService.js:82-106`) | Mejorar | En la misma llamada se pueden pedir `weather,gameInfo,flags,seriesStatus` sin costo extra. | S |
| Posiciones (`mlbService.js:110-222`) | Mejorar | Datos correctos, pero con juegos en vivo pueden quedar 15-25 min viejos. Tira los splits. | S |
| Líderes (`mlbService.js:300-369`) | Mejorar | Ceros, el Clásico vacío, solo temporada regular y caché de 30 min. | M |
| Estadísticas y ficha (`players.js:102-279`) | Mejorar | Clásico vacío. `seasons` ofrece 3 temporadas y el filtro acepta 5. | M |
| Día del Fantasy (`fantasy.js:110-160`) | Unir | Para cada juego por empezar baja el feed completo (~0,85 MB) del último juego del equipo, en serie (`:153-159`). Con `rosters()` de `players.js` son 7 KB. | M |
| Lectura incremental (`liveFeed.js:12-107`) | Mejorar | Es la mejor pieza del servidor. Le falta tratar el juego final como inmutable (`:56`) y ponerle tope al `Map` (`:12`). | S |
| JSON Patch (`jsonPatch.js`) | Mantener | Pequeño y con pruebas. | S |
| Transformadores (`transformers.js:146-451`) | Mejorar | `description` siempre null (`:350`). La temperatura va sin unidad (`:349`). `topPerformers` usa una fórmula propia (`:327-339`) cuando MLB ya trae `boxscore.topPerformers` con gameScore. | M |
| Caché (`cache.js:7-59`) | Mejorar | `MAX_ENTRIES=300` no es un tope real. `fetchWithCache` (`:57`) no se usa. | S |
| Cliente HTTP (`http.js:7-27`) | Mejorar | No hay tiempo máximo por petición: el Fantasy puede encadenar 4 × 8 s, más que los 30 s de Vercel. | S |
| Temporada vigente (`season.js`) | Mantener | Funciona. Pero tira `seasonDateInfo`, que el PRO necesita. | S |
| Estado de serie (`mlbService.js:20-67`) | Mejorar | En LIDOM, el tipo `L` es el Round Robin, no una serie: hace un `/schedule` extra cada 30 s sin beneficio. | S |
| Equipos de SDC 4935-4954 y WBC 4960-4977 (`constants.js:58-174`) | Quitar | Esos IDs no existen en MLB (se probaron 4935, 4941, 4950, 4960 y 4970). Los reales sí funcionan. | S |
| Fotos con uniforme (`teamPhotos.js`) | Mantener | Lista blanca sin proxy abierto. El User-Agent todavía dice el dominio viejo (`:18`). | S |
| Manejo de errores (`errorHandler.js:2-24`) | Mejorar | Cualquier 404 sale como `game_not_found`, también el de un pelotero. | S |
| Datos simulados (`mock/index.js:572-598`) | Mejorar | Sin `officialDate` el Fantasy sale vacío en :5185. Faltan quiebres, árbitros, bullpen y retos para diseñar el PRO. | S |
| Pruebas del servidor (`server/tests/api.test.js`) | Mejorar | Son 42 y pasan, pero faltan casos: liga del prototipo, mapeo de errores, Cache-Control por ruta, Fantasy de punta a punta, Clásico y feed final. | M |

### 7. Datos del juego (lo que el transformador guarda y lo que tira)

| Elemento | Veredicto | Por qué | Esfuerzo |
|---|---|---|---|
| Pitcheo compacto (`transformers.js:52-91`) | Mejorar | Guarda tipo, mph, rpm, zona y ubicación. Tira quiebre (IVB/HB), extensión, velocidad final, eje de giro, punto de salida y física. Mandarlo en un payload PRO aparte. | M |
| Batazo (`transformers.js:76-89`) | Mejorar | Falta `hitData.location` (quién fildeó), que viene en el 100 % de los batazos, también sin rastreo. | S |
| Acciones del turno (`transformers.js:114-128`) | Mantener | Filtra bien. Se pueden contar visitas al montículo, cambios y pickoffs. | S |
| Corredores y créditos (`play.runners`, no se lee) | Mejorar | Con `movement`, `credits`, `responsiblePitcher` y `earned` salen animaciones reales de corrido y defensa. | M |
| Clima (`transformers.js:349`) | Mejorar | Se tira el viento. La temperatura a veces viene en °C. | S |
| Duelo en vivo (`transformers.js:202-227`) | Mejorar | Solo AVG y EFE. El feed ya trae OBP/SLG/OPS, WHIP, K/9, el bateador en el hoyo y la bio. | M |
| Marcador por entradas (`transformers.js:371-375`) | Mejorar | Solo guarda carreras. MLB manda H, E y LOB por entrada. | S |
| Box de bateo y pitcheo (`transformers.js:234-276`) | Mejorar | Faltan 2B, 3B, SB, HBP y SF; temporada OBP/SLG/OPS; notas de emergentes; BF, GO-AO, heredados, holds. | M |
| Bullpen, banca, árbitros, notas del box (no se leen) | Mejorar | Vienen en todos los feeds sin pedir nada más. | M |
| Mejores actuaciones propias (`transformers.js:327-339`) | Unir | MLB ya las manda con gameScore (851491: Medina 70, Made 66, Rojas Jr. 65). | S |
| Jugada del juego (`baseball.ts:409-422`) | Mejorar | Elige por impulsadas. En 851491 eligió un jonrón de 1 CI en la Alta 1; según la probabilidad de ganar, la jugada clave fue el sencillo del turno 12 (−12,4 %). | M |
| Aviso «sin rastreo» (`LiveProPanel.tsx:25,53`; `es.json:954`) | Mejorar | Es falso: el rastreo llega tarde, no falta por estadio. | S |
| Mosaico «Zona» (`LiveProPanel.tsx:62`) | Mejorar | Muestra el código crudo. Mejor una mini rejilla 3x3. | S |
| Batazos más duros (`LiveProPanel.tsx:37-44,147-170`) | Mantener | Útil. Va dentro de un panel «Contacto». | S |
| Récord pitagórico propio (`advanced.ts:39`) | Mantener | Transparente. Se puede mostrar al lado del `xWinLoss` de MLB. | S |
| Jardín del mapa de batazos (`SprayChart.tsx:12-14`) | Mejorar | Hay medidas reales en 3 de 5 parques: Quisqueya 335/411/335, Cibao 335/385/335, Tetelo Vargas 330/385/330. | S |
| Últimos 7/15 días | Mejorar | Se calculan del `log` que ya llega, sin pedir nada. | S |
| Asistencia (`gameInfo.attendance`) | Mantener (no mostrar) | Vale 0 en todos los juegos de LIDOM revisados. | — |
| `contextMetrics`, `sabermetrics`, `expectedStatistics` | Mantener (no usar) | Vacíos o sin sentido para LIDOM. | — |
| Comentarios sobre «estadios sin rastreo» (`SprayChart.tsx:7-9`; `transformers.js:82-83`) | Mejorar | La suposición ya no es cierta: Micheli y Julián Javier traen 317/317 y 260/260. Se queda el respaldo y se corrige el texto. | S |

### 8. Base de la app móvil (`el-play-app`)

| Elemento | Veredicto | Por qué | Esfuerzo |
|---|---|---|---|
| Raíz y orden de proveedores (`src/app/_layout.tsx:47-79`) | Mantener | El orden es correcto y el polling se pausa en segundo plano. | S |
| Errores de render y rutas rotas (no hay `ErrorBoundary` ni `+not-found.tsx`) | Mejorar | Si una pantalla PRO explota, la app se cae o queda en blanco. | S |
| Caché sin persistir (`_layout.tsx:27`) | Mejorar | Abierta sin señal (en el estadio), sale vacía. `offline.banner` existe y no se usa. | M |
| Fuentes al arrancar (`_layout.tsx:49`) | Mejorar | 7 fuentes bloquean el splash. Para las tablas PRO conviene sumar Barlow Condensed 600/700. | S |
| Barra de pestañas flotante (`components/layout.tsx:50-119`) | Mejorar | No emite `tabPress` (`:73`). En oscuro casi no se distingue del fondo. | S |
| Botón rojo «En vivo» (`layout.tsx:91-112`) | Mantener | Funciona. | S |
| Toast global (`layout.tsx:123-153`) | Mejorar | Queda debajo de las hojas y modales: los avisos de Compartir no se ven. | M |
| `Screen` con ScrollView (`layout.tsx:17-43`) | Mejorar | Hay 47 ScrollView y 2 FlatList. Las tablas PRO de toda la liga necesitan virtualizar. | M |
| Primitivas `Txt`, `Card`, `Button`… (`ui.tsx:18-145`) | Mantener | Equivalen a Tailwind. `Button` no declara `disabled` para el lector de pantalla. | S |
| `Segmented` (`ui.tsx:114-136`) | Mejorar | Cambia de golpe. En PRO, indicador que se desliza. | S |
| `Skeleton` y `PulseDot` (`ui.tsx:149-163`) | Mejorar | `useRef(...).current` hace que React Compiler se los salte, y no respetan «Reducir movimiento». | S |
| `PlayerPhoto` (`ui.tsx:255-291`) | Mantener | Buena cadena de respaldos. Reiniciar con `key` en vez de `setStep(0)` (`:261`). | S |
| `Sheet` (`ui.tsx:295-316`) | Mejorar | En Android ocupa la pantalla completa y la agarradera no se arrastra. Tapa el Toast. | M |
| Piezas PRO sueltas (`ui.tsx:320-326`; `pro/*`) | Mantener | Conviene un set común: StatTile, DataTable, Sparkline, Meter, Delta. | M |
| Tokens (`theme/tokens.ts:50-156`) | Mejorar | Faltan escalas para percentiles y probabilidad. `alpha()` falla con colores `rgba(` (`:151-156`). | S |
| `ThemeProvider` (`theme/theme.tsx:20-38`) | Mejorar | Si se elige un tema distinto al del sistema, el teclado y las alertas siguen el del sistema. | S |
| `LeagueProvider` (`state/league.tsx`) | Mantener | Correcto. | S |
| Avisos de juegos (`state/preferences.tsx:59-83`) | Mejorar | Avisa a los 15 min con un texto que dice 10. No abre el juego. Duplica avisos. No limpia ni reprograma. | M |
| Favorito y modo de animaciones (`preferences.tsx:42-55,89-93`) | Mantener | Unir con «Reducir movimiento» del sistema. | S |
| `storage.ts` | Mantener | Es lo que permite copiar las libs de la web. Ojo: la sesión completa en SecureStore puede pasar de ~2048 B y fallar en silencio (`:51`). | S |
| Cuenta sin SDK (`lib/account.ts:229-258`) | Mejorar | Cierra la sesión sin red (`:239`) y hace refrescos en paralelo. | S |
| Modo PRO por teléfono (`lib/pro.ts:17-41`) | Mejorar | No se sincroniza con la web. Si PRO pasa a ser de pago, en iOS tiene que ser compra dentro de la app. | M |
| Libs copiadas de la web (8 idénticas + 4 adaptadas) | Unir | Se van a separar con cada arreglo, y la app no tiene ni una prueba. Mejor un paquete compartido. | M |
| `api.ts` / `getJson` (`api.ts:17,38`; `stats.ts:131-141`) | Mejorar | `navigator.onLine` no existe en RN, así que nunca dice «sin conexión». | S |
| `RESULT_COLORS` con `var(--…)` (`baseball.ts:78-83`) | Mantener | Hoy no se usa. Si el PRO lo usa, no pinta: cambiarlo antes. | S |
| Detección de jugadas nuevas (`playEvents.ts:78-170`) | Mejorar | Repite hasta 4 animaciones viejas al volver (`[gamePk].tsx:271-275`). | S |
| Polling y consultas (`polling.ts`, `queries.ts`) | Mantener | Bien ajustados. | S |
| Textos de la web sin uso (install, update, pull, minigame, splash, a11y) | Quitar | 0 usos en la app. | S |
| `app.json`: actualizaciones, enlaces, segundo plano | Mejorar | Faltan `expo-updates`, enlaces universales, `expo-widgets`, push remoto y FCM. | M |
| Dependencias (`package.json`) | Mejorar | `expo-device`, `expo-glass-effect` y `expo-symbols` sin usar. El script `reset-project` apunta a un archivo borrado. `developmentClient` sin `expo-dev-client`. | S |
| Versión de Node | Mejorar | La CLI de Expo pide `>=22.13.0` y la PC tiene 20.19.6. Faltan `engines`, `.nvmrc` y `node` en `eas.json`. | S |
| React Compiler | Mantener | Mantener `expo lint` limpio. Pasar las animaciones a Reanimated. | S |
| Archivo suelto `el-play-app/expo-sharing` | Quitar | Es una copia vieja de `app.json` que se colaría en el primer commit. | S |
| Arquitectura de segundo plano | Mejorar | Ver «Riesgos» y el diseño de `segundo-plano`. | L |

---

## Lo que conviene quitar o unir (solo lo verificado)

**Quitar:**
- Botón «Zona» de la pantalla del juego (`GamePage.tsx:125`): lo mismo que tocar la mini zona.
- CSS muerto `fly-ball`, `bounce-in` y `spin-slow` (`styles.css:173-189`).
- «Ponte un nombre» con la tarjeta de cuenta completa dentro de la Tabla del Fantasy (`FantasyPage.tsx:653-658` en HEAD): dejar solo el campo de nombre.
- `src/hooks/useAnalytics.js`: llamar a `track()` directo.
- `public/lidom.png` y `public/wbsc.jpg`.
- `docs/ANALYTICS.md` (o reescribirlo en 10 líneas) y `MEJORAS.md`.
- Restos en la raíz que están en git: `bash.exe.stackdump`, `error.json`, `test_output.json`, `tsc_*.txt`, `verification_output.*`, y además `test_summary.js` y `verify-data.js`, que están rotos porque importan `./api/...`, que ya no existe.
- Dependencias sin uso: `@fortawesome/fontawesome-svg-core`, `@fortawesome/free-solid-svg-icons`, `@fortawesome/react-fontawesome`, `node-cache`, `zod` (`package.json:21-23,36,42`).
- Rutas v1 y `server/utils/legacy.js`, después de una semana de logs sin tráfico.
- IDs de equipos de SDC y WBC que no existen (`server/config/constants.js:58-174`).
- En la app móvil: `el-play-app/expo-sharing` y los textos de la PWA que no se usan.

**Unir:**
- Compartir de la cabecera con el botón «Compartir» de abajo en el juego.
- Cronología (`Timeline`) y hoja de jugadas (`PlayByPlay`) en un solo componente con dos densidades.
- Tarjeta de detalles de la previa con la píldora de la cabecera (dejar estadio y clima en °C).
- Logo de liga con el título de la portada; lista de ligas de Más con la hoja de la portada (un solo componente).
- `detailOf` de Líderes con `playerFromLeader` de `share/subjects.ts`.
- Las dos reglas de «calificado» (Líderes y Estadísticas) en una sola, con una sola nota.
- El catálogo de columnas de `stats.ts` con el de `StatsTable.tsx`.
- La suma de temporada del Fantasy: una sola fuente, la del servidor.
- Las reglas del Fantasy (web, app móvil y servidor): que las mande la API.
- Los íconos duplicados de `public/` con `icons/*-v2`.
- `yarn.lock` con `package-lock.json`: quedarse con uno.
- `topPerformers` propio con el `boxscore.topPerformers` de MLB (el propio queda de respaldo).
- El roster del Fantasy con `rosters()` de `players.js`.
- Las libs de la web y de la app móvil, en un paquete compartido con las mismas pruebas.
- Los tres degradados copiados (`PRO_GRADIENT`, el del Fantasy, `FAN_GRADIENT`) en variables CSS. Además, el Fantasy en Lite no debería usar el degradado de PRO.

---

## Errores encontrados

Ordenados por gravedad. «Verificado» quiere decir que se reprodujo en el navegador, con la API o con datos reales. «Por código» quiere decir que se dedujo leyendo el código y no se reprodujo.

### Alta

| Archivo:línea | Qué pasa | Cómo se sabe |
|---|---|---|
| `src/hooks/useGameAlerts.ts:42` | `new Notification()` lanza error en Chrome de Android. El `catch` se lo traga y `markNotified` (`:46`) lo da por enviado: «Avisarme» nunca avisa en Android. Arreglo: `navigator.serviceWorker.ready.then(r => r.showNotification(...))`. | Por código (no se probó en un teléfono) |
| `supabase/fantasy.sql:93-95` (HEAD) | Se puede hacer trampa. Las reglas solo revisan que el equipo sea tuyo y que el día sea hoy o después. Con la sesión, una llamada directa a Supabase cambia alineación, capitán y pronósticos con los juegos ya empezados o terminados. No se revisan roles, máximo por equipo ni que los peloteros jueguen ese día. Con lo del 16-oct, el equipo ideal elegido al final daba 185,8 puntos. | Por código y con los datos del 16-oct |
| `src/lib/fantasy.ts:62,143` | El cierre se salta desde la propia app. Solo se vuelve a pedir el día si hay un juego en vivo, e `isLocked` mira el estado guardado y no la hora. Con la página abierta antes del primer lanzamiento, los peloteros siguen abiertos y se suben. A eso se suma la caché de 120 s en el servidor y en el CDN (`fantasyController.js:13-16`). | Por código |
| `src/components/pro/StatsTable.tsx:121,123` | Abrir un pelotero desde la tabla PRO llama dos veces a `onOpen` (la fila y el botón). `history.length` pasó de 3 a 5, y al cerrar la ficha y dar Atrás se vuelve a abrir. | Verificado |
| `src/lib/account.ts:210` (HEAD) y `el-play-app/src/lib/account.ts:239` | `freshToken` cierra la sesión ante cualquier error al renovar, también sin red. En el estadio sin señal, más de una hora después de entrar, se pierde la sesión, el PRO vuelve a Lite y el Fantasy vuelve a la portada. Además, varias llamadas en paralelo renuevan a la vez. | Por código |

### Media

| Archivo:línea | Qué pasa | Cómo se sabe |
|---|---|---|
| `src/pages/GamesPage.tsx:108` | `useGameAlerts` solo está montado en la portada y en la liga activa. Con `refetchIntervalInBackground: false` (`main.tsx:36`), en segundo plano no detecta el inicio. | Por código |
| `src/components/common/PullToRefresh.tsx:74` | Arriba de la página, cualquier gesto con algo de componente hacia abajo hace `preventDefault`. Un deslizamiento de 270 px a la izquierda con 12 px de deriva deja `scrollLeft = 0`; sin deriva llega a 98. | Verificado (toques por CDP) |
| `src/share/ShareSheet.tsx:77`, `src/components/install/TutorialArt.tsx:104`, `src/locales/es.json:93` y `en.json:93` | Las imágenes compartidas y el tutorial dicen `el-play.vercel.app`, que responde 200 sin redirigir: se instala en otro origen sin datos ni sesión. | Verificado (curl e imágenes generadas) |
| `src/components/pro/LiveProPanel.tsx:34` | `.slice(0, 4)` esconde lanzadores sin avisar: en los juegos reales tiraron 12, 11 y 12, y falta el cerrador. | Verificado |
| `src/pages/GamePage.tsx:95` (y `StatsPage.tsx:229`, `StrikeZonePanel.tsx:108`, `PlayAnimation.tsx:35,269`) | El apellido se saca con `split(' ').slice(-1)` y sale «Jr.» o «II» (Mel Rojas Jr., Victor Scott II, Maxwell Romero Jr.). | Verificado |
| `src/pages/GamePage.tsx:240-246` y `el-play-app/src/lib/playEvents.ts:80` | Al volver de segundo plano compara contra la lectura vieja y repite hasta 4 animaciones de jugadas pasadas. Además, `slice(-4)` puede sacar de la cola la que se está mostrando. | Por código |
| `src/components/pro/StatsTable.tsx:85` | El orden se arrastra al cambiar de Bateadores a Lanzadores (falta `key={role}` en `StatsPage.tsx:173`): quedan ordenados por menos ponches. | Verificado |
| `src/components/pro/StandingsTable.tsx:39` | La línea de corte de la tabla PRO no se ve: `divide-y` del `tbody` (`:33`) le gana a `border-t-2`. | Verificado (estilo calculado) |
| `server/services/mlbService.js:338` | Líderes con 0: en Salvados, 4 de 5 «líderes» tienen 0 (Adames, Adon, Alcala, Arias); en Victorias, 2 de 5. | Verificado |
| `server/services/mlbService.js:326` y `server/services/players.js:107` | Se piden con gameType `R` y el Clásico es F/D/L/W: Líderes del Clásico sale sin datos en las 11 categorías y Estadísticas con 0 peloteros, más un aviso falso. | Verificado contra MLB |
| `src/lib/stats.ts:211` | Hay dos reglas de «calificado». Emil Morales (3 AP, 1.000) es N.º 1 de promedio en Líderes y queda fuera del orden en Estadísticas. | Verificado |
| `src/lib/fantasy.ts:153` | Con un solo juego en el día (Serie Final, eliminatorias del Clásico, final de la Serie del Caribe), «máximo 2 por equipo» deja 4 peloteros posibles y la pantalla pide 6. Igual en la app móvil (`fantasy.ts:40,158`). | Por código |
| `server/services/fantasy.js:146` | En doble cartelera, el pelotero suma un solo juego, el que responda primero, y puede cambiar entre lecturas. | Por código |
| `server/routes/index.js:13` (HEAD) y `leagueFrom` en `statsController.js:7`, `playersController.js:5`, `scheduleController.js:19` | `LEAGUES[key]` acepta `hasOwnProperty`, `valueOf` y `toString`. Con eso, Líderes devuelve datos de MLB (Pete Crow-Armstrong, Cubs) y Estadísticas devuelve MiLB. Esas respuestas quedan en caché pública. | Verificado |
| `server/services/liveFeed.js:56` | Un juego final se vuelve a bajar completo (~0,85 MB) en cada llamada. El Fantasy, que no tiene caché, lo hace cada 20 s con juegos en vivo. | Verificado (con un stub) |
| `src/locales/es.json:954` y `LiveProPanel.tsx:25` | «Este estadio no mide…» es falso. Sin rastreo tampoco llega el tipo de pitcheo (826244: 0/321). En 2026-27 el rastreo llega tarde (0/21 en vivo contra 350/352 al final). | Verificado con datos reales |
| `src/lib/advanced.ts:5,33` | La constante de FIP está fija en 3.1. Con LIDOM 2025 es 3.41, así que todo FIP sale unos 0.31 bajo. | Verificado con `/teams/stats` |
| `el-play-app/src/state/preferences.tsx:76` | Los avisos llevan `data.gamePk`, pero nadie lo lee: al tocar el aviso la app abre en Juegos y no en el partido. | Por código |
| `el-play-app/src/components/layout.tsx:129` | El Toast está debajo de las hojas y modales: «copiado» y «falló» de Compartir no se ven. | Por código |

### Baja

| Archivo:línea | Qué pasa |
|---|---|
| `src/hooks/useGameAlerts.ts:51` | Repite «¡Playball!» al volver a abrir la app con el juego en la 7.ª. |
| `src/pages/GamesPage.tsx:145` | «Próximos juegos» ignora el filtro de equipo. |
| `src/components/feed/GameFeedCard.tsx:119` | Compartir sale en juegos pospuestos o cancelados con «0 - 0». |
| `src/components/feed/GameFeedCard.tsx:83` | La cuenta regresiva no tiene temporizador: puede ir minutos atrasada. |
| `src/components/feed/TeamStories.tsx:35` | En doble cartelera, el anillo puede decir «ya jugó» con el equipo en vivo. |
| `src/pages/GamesPage.tsx:101` | Clásico: los días se agrupan en hora de Nueva York y la hora se pinta en hora de RD. |
| `src/locales/es.json:28` | La Serie del Caribe repite nombre y subtítulo. |
| `src/components/pro/LiveProPanel.tsx:71` y `BoxScore.tsx:37,85` | Tablas que no caben en 390 px. |
| `src/lib/baseball.ts:355` | Los pitcheos sin tipo salen como una fila «— 3% — —». |
| `src/components/game/StrikeZonePanel.tsx:48` / `baseball.ts:369` | «Abanicados» cuenta S/W/M/Q en un sitio y S/W en el otro. |
| `src/components/gamecast/PlayAnimation.tsx:477` | El confeti cae según los cuadros por segundo, no según el tiempo. |
| `src/pages/GamePage.tsx:202-203` | Clima en inglés y «29°F» cuando el anotador escribió °C. |
| `src/components/gamecast/StoryRecap.tsx:16` | Promete avanzar tocando los lados y no se puede. |
| `src/components/game/MiniGame.tsx:160` | El bucle se recrea en cada cuadro y `localStorage` va sin try/catch. |
| `src/lib/pro.ts:24-28` | Si `localStorage` falla, PRO no se puede activar (el comentario dice otra cosa). |
| `server/services/mlbService.js:237` | `runDiff` del Clásico se calcula y no se muestra: 9 de 14 columnas PRO salen «—». |
| `server/services/players.js:194` | Ofrece temporadas que no existieron en el Clásico, y no se puede volver a la actual (`StatsPage.tsx:123`). |
| `src/components/pro/StandingsTable.tsx:54` | Las leyendas y la «suerte» solo están en `title`, que no existe en el teléfono. |
| `src/pages/FantasyPage.tsx:602` (HEAD) | En Pronósticos, AGU y EST elegidos casi no se leen (contraste 1,7 y 2,5 a 1). |
| `src/pages/FantasyPage.tsx:451,514` (HEAD) | El orden del selector y el promedio PRO no dicen la verdad. |
| `server/controllers/fantasyController.js:14` (HEAD) | La caché de «hoy» no lleva la fecha: después de medianoche puede mostrar el día anterior. El cambio en curso ya la pone. |
| `src/lib/account.ts:312` (HEAD) | La tabla del día baja 500 equipos sin orden. |
| `src/pages/FantasyPage.tsx:102` (HEAD) | Al abrir «Ayer» intenta subir un equipo que la base rechaza, y el error no se muestra. |
| `src/lib/fantasy.ts:150` | Un pelotero que desaparece de la lista se queda en la alineación. Si eso pasa, ese día no sube ningún cambio. |
| `src/lib/account.ts:274` | `syncFantasy` guarda el resultado calculado con la alineación vieja. |
| `server/mock/index.js:587` | El simulador no trae `officialDate`, así que el Fantasy sale vacío en :5185. |
| `server/config/constants.js:42` | Clásico en hora de Nueva York contra el día de RD en la base: entre 00:00 y 01:00 se rechaza lo guardado. |
| `vite.config.js:37,38` | Workbox de desarrollo en producción, e imágenes sin uso en la caché. |
| `index.html:9` | `theme-color` oscuro con el tema claro, hasta que monta React. |
| `src/components/layout/Toast.tsx:12` | Toast y UpdateToast se tapan. |
| `src/components/ui/Segmented.tsx:25` | Botones de 24 px y rol equivocado. |
| `src/share/subjects.ts:97` | «1 JONRONES». |
| `src/share/render.ts:409` | La línea por entradas corta en 12 entradas. |
| `test_summary.js:2`, `verify-data.js:2` | Importan archivos que no existen. |
| `server/middleware/errorHandler.js:9` | Un pelotero inexistente responde «juego no encontrado». |
| `server/services/fantasy.js:110` | `date=2026-13-45` da 500 en vez de 400. |
| `server/services/http.js:8` | No hay tope por petición: se puede pasar de los 30 s de Vercel si MLB está lento. |
| `server/utils/cache.js:9` | `MAX_ENTRIES` no limita nada, y el `Map` de `liveFeed.js:12` no tiene tope (~0,9 MB por feed). |
| `server/utils/transformers.js:350` | `description` siempre es null. |
| `server/services/mlbService.js:20` | El Round Robin (`L`) pide estado de serie cada 30 s sin beneficio. |
| `el-play-app/src/state/preferences.tsx:73` | Avisa a los 15 min y el texto dice 10. |
| `el-play-app/src/state/preferences.tsx:59` | Doble toque: avisos duplicados. No limpia los juegos pasados ni reprograma. |
| `el-play-app/src/state/preferences.tsx:71` | «Dominican Republic» en español. |
| `el-play-app/src/app/_layout.tsx:62` | Si una fuente falla, el splash no se va nunca. |
| `el-play-app/src/i18n.ts:28` | Guarda el idioma del sistema como si el usuario lo hubiera elegido. |
| `el-play-app/src/lib/storage.ts:12` | `useSecure` rompe el lint (`rules-of-hooks`). |
| `el-play-app/package.json:55` | `reset-project` apunta a un archivo borrado. `developmentClient` sin `expo-dev-client`. |

---

## Datos que tenemos y no usamos

### Ya llegan al teléfono y no se pintan (costo cero)

- **Récord de cada equipo** (`ScheduleTeam.record`): portada, Pronósticos del Fantasy.
- **Lanzador en vivo** (`live.pitcher`, `transformers.js:444`), con la traducción `card.pitching` ya escrita (`es.json:164`).
- **Pizarra y R-H-E/LOB del detalle** (`GameDetail.linescore`, `away/home.hits/errors/lob`): en vivo no salen en ningún lado.
- **Nombres de los corredores** (`runners.first/second/third`).
- **Duelo completo** (`matchup`: pitcheos, IP, K, EFE, H-AB, en espera), escondido al fondo de la hoja de zona.
- **`series`, `reason`, `updatedAt`** del juego: serie, motivo de demora, frescura del dato.
- **Pitcheo por pitcheo**: `zone` (en 317/317, 350/352 y 260/260), `mph` y `type` a lo largo del juego (fatiga), `b/s` (primer pitcheo strike), `hit.ev/la/x/y` (100 % de los batazos).
- **Acciones** (`AtBat.actions`): 4 robos, 3 wild pitches, 9-10 cambios de lanzador y 7-9 visitas por juego real.
- **Marcador después de cada anotadora** (`AtBat.away/home`): gráfica del marcador.
- **Posiciones en la portada y la previa**: racha, últimos 10, casa y visita, carreras a favor y en contra (`useStandings`).
- **Líderes**: `extra.g/w/l/hr/rbi` y `color2`.
- **Pelotero**: `mlbDebut`, `birthDate` y `isWin` por juego; `cs/hbp/sf/tb/gidp`, `hld/bf/np`; `bbPct/h9/hr9` ya calculados y sin columna.
- **Toda la liga en `/api/v2/players`**: promedios de liga, percentiles, FIP con la constante de LIDOM y OPS+/ERA+.
- **Fantasy**:
  - `game.live` (quién batea o lanza);
  - la línea completa del pelotero, para desglosar los puntos;
  - `dayEntries` de todos, para sacar el % de fanáticos por pelotero, el capitán más elegido y tu percentil;
  - `savedAt`;
  - los miembros de las ligas.
- **Más**: `subscribedGames`, `favoriteTeamId`, `APP_VERSION`, `Notification.permission`.
- **Textos ya traducidos sin uso**: `games.count_*`, `games.liveCount_*`, `standings.*Note`, `offline.banner` (móvil).
- **Posiciones**: `team.shortName`, `runDiff` del Clásico, `roundRobinInfo.games`.

### El servidor los pide a MLB y los tira

- **Calendario** (`transformers.js:390-451`):
  - `linescore.innings` (carreras, hits, errores y LOB por entrada) y `linescore.teams` (R-H-E-LOB totales);
  - `offense.onDeck/inHole/battingOrder` y `defense`;
  - `doubleHeader`, `gameNumber`, `dayNight`, `ifNecessary`, `seriesGameNumber`, `gamesInSeries`.
- **Temporada**: `seasonDateInfo` de `/league/{id}`. `season.js:22` lo pide y solo guarda temporada y número de juegos. Con eso se sabe que la regular de LIDOM va hasta el 2026-12-16, la postemporada empieza el 2026-12-18 y la Serie del Caribe el 2027-02-01.
- **Posiciones** (`mlbService.js:115-141`):
  - `splitRecords` (contra zurdo o derecho, día o noche, contra ganadores…; ejemplo: AGU 10-2 contra zurdos en 2025);
  - `expectedRecords` (xWinLoss), `runDifferential`, `clinched`, `eliminationNumber`.
- **Feed del juego**:
  - Pitcheo: `pitchData.breaks` (IVB, HB, eje de giro), `extension`, `endSpeed`, `plateTime`, `x0/z0` y la física, en 349 de 352 pitcheos de 851491.
  - Defensa y corrido: `hitData.location` (quién fildeó) y `play.runners` (recorrido y créditos de fildeo; 90 créditos en 851491).
  - Box: `bullpen` y `bench` con `seasonStats`, `officials`, y `boxscore.info` (RISP, duración, pitch timer) con las notas de emergentes.
  - Juego: `weather.wind`; `gameInfo` (duración, demora, primer lanzamiento); `absChallenges` + `reviewDetails` (retos ABS de 2026-27); `review`, `moundVisits`, `flags.noHitter`; `boxscore.topPerformers` con gameScore; `venue.fieldInfo` (3 de 5 parques); `captivatingIndex`; hora de cada pitcheo (ritmo: Rhoades 15,8 s y Neris 19,2 s en 851491).

### Llamadas nuevas a MLB, verificadas con LIDOM

- **`/game/{pk}/winProbability`**: probabilidad de ganar, WPA y leverage por jugada.
  - Verificado en finales: 851509 (71 jugadas), 851491 (87), 851435 (85) y 826279 (77). No se probó en vivo.
  - Peso: unos 2 KB con pocos campos y 15,6 KB con más.
- **En el mismo `/schedule`**:
  - `hydrate=seriesStatus,weather,gameInfo,flags`, sin llamadas extra;
  - `hydrate=venue(fieldInfo)`;
  - `hydrate=lineups`: en los finales del 16-oct venían; antes del juego estaban vacías, así que falta confirmar si llegan en la previa.
- **`/people/{id}/stats` con `sportId=17` y `leagueId=131`**:
  - `statSplits` (vl, vr, h, a, risp). Devuelve filas dobles: hay que filtrar `league.id = 131`.
  - `sprayChart`, `hotColdZones`, `pitchArsenal`, `career`, `seasonAdvanced`.
  - `vsPlayer`: solo responde con `sportId=17`. Las muestras son chicas y pueden incluir otras ligas.
- **Equipos**: `/teams/stats?group=hitting|pitching&leagueIds=131` (los 6 equipos; de ahí sale la constante de FIP 3.41).
- **Temporada completa**: `/schedule?gameTypes=R&season`, para la carrera por la clasificación y los enfrentamientos directos.
- **Postemporada**: `/stats` con gameType `L` y `W` (LIDOM) y `F` (Clásico). Ejemplo: Siri, 3 HR en el Round Robin 2025.
- **Movimientos**: `/transactions?sportId=17` (159 movimientos de equipos de LIDOM del 1 al 17 de octubre).

### No vale la pena

- `contextMetrics` (llega `{}`), `sabermetrics` (vacío), `expectedStatistics` (valores sin sentido), `attendance` (0 en todos los juegos de LIDOM), `broadcasts` (solo MLB.TV) y `hotColdZones` dentro del feed (vacío: hay que pedirlo a `/people`).

### Límites honestos

- **Abridores probables**: MLB no los recibe para LIDOM (0 de 185 juegos en 2025-26). Solo sirven en el Clásico y la Serie del Caribe.
- **Rastreo**: en vivo llega tarde. Hay que decir «aún no llegan» y no «este estadio no mide».
- **Medidas del parque**: Micheli y Julián Javier no traen `fieldInfo`.
- **Temperatura**: el anotador a veces la escribe en °C (851491: «29»).

---

## Qué NO llevar a la app móvil

- **Instalación de la PWA**: `InstallCard`, `InstallSheet`, `TutorialArt`, `lib/install.ts` y sus 33 textos.
- **Service worker y actualizaciones de la web**: `sw-legacy.js`, workbox, `appUpdate.ts` y `UpdateToast`. En nativo eso lo hace `expo-updates`.
- **Gestos y splash de la web**: `noZoom.ts`, `PullToRefresh` propio (en nativo ya está `RefreshControl`) y el splash web (ya está `expo-splash-screen`).
- **Analítica**: `useAnalytics.js` y Vercel Analytics, porque la ficha de la tienda dice «sin análisis ni rastreo».
- **Banners de la rama `feat/banners-publicidad`**: AdSense no funciona en nativo. Llevarlos obligaría a usar AdMob, mostrar el aviso de rastreo de iOS, cambiar la ficha «sin anuncios» y quitar el bloqueo de `AD_ID` en `app.json`.
- **MiniGame**: es opcional; no ahora.
- **Fallos de la web que no hay que copiar**:
  - `new Notification()`;
  - el texto «Este estadio no mide»;
  - el cierre del Fantasy solo en el cliente;
  - `freshToken` tal como está;
  - las tablas anchas con `whitespace-nowrap`;
  - `RESULT_COLORS` con `var(--…)`.
- **Sí conviene llevar**:
  - el aviso sin conexión, con la caché persistida;
  - las libs, mejor en un paquete compartido y con pruebas.

---

## Rama de anuncios (`feat/banners-publicidad`)

- **Dónde está:** en el worktree `C:\Users\rgrullon\code\el-play-anuncios`, con 1 commit (`23b7a2b`) encima de `bf4c7cd`, que sigue siendo el HEAD de `main`.
  - Frente a los commits de `main`, **está al día**: `main` no tiene commits nuevos.
  - Lo que sí hay en `main` son cambios sin commit de otras personas.
- **Qué toca la rama:**
  - `GamesPage` (un banner después del 2.º juego), `StandingsPage` («tabla»), `LeadersPage` («lideres»), `MorePage` (enlace de Privacidad como tarjeta) y `PrivacyPage` (sección Publicidad);
  - además `PlayerPhoto`, `styles.css`, `vite.config.js`, los locales y `lib.test.ts`.
- **Conflicto esperado:** `src/pages/PrivacyPage.tsx`, que hoy está modificado sin commit en `main`. Cuando eso se suba, hay que rebasar la rama y unir a mano la sección «Publicidad».
  - Mientras no se una, la privacidad de `main` dice que El Play no muestra anuncios.
- **No se actualizó en esta pasada**, porque la tarea era solo de lectura.
- **Choque con el PRO rediseñado:** el rediseño toca las mismas tres pantallas donde van los banners (portada, posiciones y líderes). El diseño PRO deja el banner en el mismo lugar que en Lite. Hay una decisión pendiente: **¿el PRO lleva anuncios o no?**

---

## Riesgos

1. **Trampa en el Fantasy.** Con la tabla de temporada en el servidor (en curso), cambiar el equipo después de los juegos ya mueve posiciones. Mientras la validación no pase al servidor, cualquier PRO del Fantasy (proyecciones, % de fanáticos) se apoya en datos que se pueden falsear.
2. **Segundo plano = infraestructura nueva.**
   - Live Activity (iPhone) y la notificación fija (Android) necesitan:
     - `expo-widgets`, que no funciona en Expo Go;
     - APNs con push de tipo Live Activity y FCM (cambia lo de «no hace falta Firebase» del README);
     - una tabla de suscripciones;
     - **un proceso que corra fuera de Vercel Hobby**: su cron corre como mucho una vez al día y la función no puede quedarse en bucle.
   - Con la app cerrada no se puede sondear: `BackgroundTask` tiene un mínimo de 15 min y no garantiza nada.
   - Hay costos y cuentas nuevas (Apple Developer, Firebase) que el dueño tiene que crear.
   - La PC tiene Node 20.19.6 y Expo pide 22.13 o más.
3. **Peso del juego en vivo.** Hoy son unos 106 KB cada 5 s. Si los datos PRO se meten en la misma respuesta, el Lite también paga. El PRO necesita un endpoint aparte (`/api/v2/game/:pk/pro` o incremental `?since=`) y el segundo plano uno ligero (`/api/v2/live`, 1-2 KB).
4. **Datos de LIDOM que pueden faltar.**
   - `winProbability` no se probó en vivo.
   - El rastreo llega tarde.
   - Los abridores casi nunca están.
   - Las zonas calientes, los splits y `vsPlayer` pueden venir vacíos o con muestras chicas.
   - Cada bloque PRO debe ocultarse o decirlo con honestidad cuando no hay dato, nunca inventarlo.
5. **Trabajo en paralelo.** El Fantasy, la cuenta, `main.tsx` y el servidor se están cambiando ahora. El rediseño PRO del Fantasy y de Fanáticos tiene que esperar a que eso se suba, o va a chocar.
6. **Web y móvil se separan.** Las libs están copiadas y la app no tiene pruebas: cada arreglo de la web (avisos, `freshToken`, `playEvents`) hay que repetirlo a mano.
7. **Animaciones en teléfonos lentos.** Más movimiento en PRO puede trabar teléfonos baratos. Todo tiene que respetar «menos movimiento» y el ajuste «Apagadas», ir por tiempo y no por cuadros, y en móvil correr en Reanimated.
8. **PRO de pago a futuro.** Si PRO se cobra, en iOS tiene que ser compra dentro de la app, y el modo debería vivir en la cuenta (`profiles`) y no en el teléfono.
9. **Anuncios contra la promesa de la tienda.** La web con AdSense y la app «sin anuncios ni rastreo» deben quedar claras en Privacidad y en las fichas.
10. **Dominio viejo.** Mientras `el-play.vercel.app` responda sin redirigir, la gente instala en el origen equivocado y pierde su favorito, su PRO y su sesión.

---

## Correcciones entre informes

- Uno de los informes decía «no hay rastreo de velocidad en los estadios de LIDOM». **No se sostiene**: los 3 juegos del 16-oct traen rastreo completo al terminar. Lo que pasa es que en vivo llega tarde.
- Las líneas citadas se comprobaron contra el código:
  - FIP: `advanced.ts:5` y `:33`;
  - récord pitagórico: `advanced.ts:39`;
  - dependencias sin uso: `package.json:21-23,36,42`;
  - `refetchIntervalInBackground`: `main.tsx:36` (archivo en edición).
- `freshToken` se clasifica como gravedad alta: afecta la sesión, el PRO y el Fantasy en el estadio sin señal.

---

## El PRO rediseñado en una tabla

El diseño detallado, pantalla por pantalla, va aparte. Esto es el resumen. **Regla común:** el mismo estilo de El Play (tarjetas redondeadas, colores de cada equipo, el degradado PRO azul-violeta-rojo de `ProBadge.tsx:4`, Outfit + Barlow Condensed y modo oscuro), pero con más densidad, más gráficos y datos de verdad.

| Pantalla | Qué agrega PRO | Qué hay que pedir nuevo |
|---|---|---|
| Portada | Pizarra de la jornada, termómetro de la liga, tarjeta de transmisión con probabilidad y pizarra, cara a cara antes del juego, final con vaivén y «Jugada del juego», «Lo mejor de la jornada» | `winProbability`; `seriesStatus`, `flags` y `gameInfo` en el calendario; pasar `linescore` y `seasonDateInfo` al cliente |
| Juego en vivo | Barra de mando pegajosa, pizarra, gráfica de probabilidad, situación con nombres, último pitcheo completo, duelo, pestañas Jugadas/Lanzadores/Contacto/Box/En el terreno | Endpoint PRO del juego con quiebres, corredores, bullpen, árbitros y ABS; `winProbability`; splits y `vsPlayer` |
| Juego final | Informe del juego, historia interactiva, figuras con gameScore, bullpen, récords del juego | `winProbability`; `topPerformers` de MLB |
| Previa | Antesala con cara a cara, serie particular, forma, líderes de cada equipo, clima en °C | Calendario de la temporada; `lineups` (por confirmar) |
| Zona / Jugadas y box | Mapa de calor, movimiento, vuelo del pitcheo, box de dos niveles con notas | `hotColdZones`; campos del feed que hoy se tiran |
| Posiciones | Carrera por la clasificación, tabla por vistas, mapa de récords, enfrentamientos directos | Splits de `/standings` (ya vienen); calendario de la temporada |
| Líderes | Tablero top 10 con barras, fases, categorías avanzadas | `limit=10`, `value>0`, gameType L/W/F |
| Estadísticas | Vistas que caben en 390 px con percentiles, dispersión, comparador, pestaña Equipos | `/teams/stats`; gameType L/W/F |
| Ficha | Percentiles, splits, mapa de batazos, zonas, repertorio, carrera con totales | `/people/{id}/stats` (un endpoint PRO con caché de 6 h) |
| Fantasy / Fanáticos | Panel en vivo con desglose, scouting, % de fanáticos, equipo ideal, temporada, ligas | `probablePitcher` en el Fantasy; ranking en el servidor; `last5` |
| Más | Centro PRO, Mi equipo, Mis avisos, glosario, movimientos, versión | `/transactions`; `profiles.ui_mode` |
| Segundo plano | Live Activity / isla dinámica y notificación fija con marcador, bases, conteo y probabilidad | `expo-widgets`, APNs, FCM, `/api/v2/live` y un proceso de empuje fuera de Vercel |
