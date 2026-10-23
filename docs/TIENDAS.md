# Publicar El Play en App Store y Google Play

Guía paso a paso para subir la app a las dos tiendas sin Mac, Xcode ni Android Studio: todo se compila en la nube con **EAS** (los servidores de Expo). Los comandos se escriben en la terminal (PowerShell) dentro de la carpeta `el-play-app`.

Datos de la app que vas a usar varias veces:

| Dato | Valor |
| --- | --- |
| Nombre | El Play |
| Bundle ID de iOS / paquete de Android | `com.grullonb.elplay` |
| Esquema de enlaces | `elplay://` |
| Política de privacidad | https://elplay.grullonb.com/privacidad |
| Sitio web | https://elplay.grullonb.com |
| Categoría | Deportes |

## Resumen del camino

1. Actualizar Node y crear las cuentas (Expo gratis, Apple US$99/año, Google US$25 una vez).
2. Conectar el proyecto con EAS y guardar la llave de Supabase como variable de EAS.
3. Agregar los enlaces de la app en Supabase.
4. Hacer un APK de prueba e instalarlo en tu Android.
5. Hacer los builds de producción (AAB para Google, IPA para Apple).
6. Google Play: crear la app, llenar la ficha y los formularios, subir el AAB a prueba interna → prueba cerrada → producción.
7. App Store: crear la app, subir el IPA a TestFlight, probar, llenar la ficha y enviarla a revisión.
8. Antes de enviar: leer «Los datos del béisbol» (sección 13) y activar Apple en Supabase (sección 13, regla 4.8).

---

## 1. Lo que necesitas antes de empezar

- **Node.js 22.13 o más nuevo.** Esta PC tiene Node 20.19.6 y las herramientas de Expo avisan que ya no lo soportan. Instala la versión **LTS** desde [nodejs.org](https://nodejs.org/en/download) (22 o 24) y cierra y abre la terminal. Comprueba con:

  ```bash
  node -v
  ```

- **Las dependencias instaladas:**

  ```bash
  npm install
  ```

- **Un correo de soporte** que vas a mostrar en las tiendas (Google lo publica en la ficha y Apple lo pide para la revisión). Puede ser uno nuevo solo para El Play.
- **Un teléfono Android** para probar el APK, y un **iPhone** (tuyo o prestado) para probar con TestFlight y sacar las capturas de iOS.

## 2. Crear las cuentas

### Expo (gratis)

Crea la cuenta en [expo.dev/signup](https://expo.dev/signup). Es donde se hacen los builds. El plan gratis alcanza para empezar (tiene un límite de builds al mes y una cola más lenta).

### Apple Developer Program (US$99 al año)

1. Necesitas un Apple ID con verificación en dos pasos.
2. Entra en [developer.apple.com/programs/enroll](https://developer.apple.com/programs/enroll) y elige:
   - **Persona (Individual):** lo más rápido. En la tienda aparece tu nombre como vendedor.
   - **Organización:** aparece el nombre de la empresa, pero necesitas un número **D-U-N-S** y una entidad legal; tarda más.
3. Paga los US$99. La aprobación tarda de unas horas a un par de días.
4. En [App Store Connect](https://appstoreconnect.apple.com) → **Business** (Acuerdos), acepta el acuerdo de licencia. Para una app gratis no hace falta llenar datos bancarios ni de impuestos.

### Google Play Console (US$25 una sola vez)

1. Entra en [play.google.com/console/signup](https://play.google.com/console/signup) con una cuenta de Google.
2. Elige el tipo de cuenta:
   - **Personal:** Google verifica tu identidad (documento) y, en las cuentas personales nuevas, **exige una prueba cerrada con al menos 12 personas durante 14 días seguidos** antes de dejarte publicar en producción (sección 8). Ve buscando a esas 12 personas desde ya.
   - **Organización:** no tiene la regla de los 12 probadores, pero pide un número D-U-N-S y la verificación de la empresa.
3. Paga los US$25 y completa la verificación de identidad y de tu teléfono.

## 3. Conectar el proyecto con EAS

En esta guía se usa `npx eas-cli@latest …`, que siempre baja la versión más nueva. Si prefieres instalarlo una vez y escribir solo `eas …`, corre `npm install --global eas-cli`.

1. Inicia sesión con tu cuenta de Expo:

   ```bash
   npx eas-cli@latest login
   ```

2. Crea el proyecto en expo.dev y conéctalo:

   ```bash
   npx eas-cli@latest init
   ```

   Esto agrega a `app.json` el `owner` (tu usuario de Expo) y `extra.eas.projectId`. Guarda ese cambio en git.

3. `eas.json` ya está listo con tres perfiles:

   | Perfil | Qué hace |
   | --- | --- |
   | `development` | App de desarrollo para programar (necesita `npx expo install expo-dev-client` antes del primer build) |
   | `preview` | APK de Android para instalar directo en tu teléfono (y build interno de iOS) |
   | `production` | AAB para Google Play e IPA para App Store; sube el número de build solo en cada build |

   Los números de build (`versionCode` en Android, `buildNumber` en iOS) los guarda EAS (`"appVersionSource": "remote"`). Tú solo cambias `version` en `app.json` cuando sacas una versión nueva.

## 4. Variables de entorno en EAS

La app lee tres variables públicas. EAS **no** sube tu `.env.local` (está en `.gitignore`), así que hay que dárselas a EAS de otra forma:

| Variable | Dónde está |
| --- | --- |
| `EXPO_PUBLIC_API_URL` = `https://elplay.grullonb.com` | Ya está en `eas.json` |
| `EXPO_PUBLIC_SUPABASE_URL` = `https://dopiehplwzfzgvaonynm.supabase.co` | Ya está en `eas.json` |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | **Falta: hay que agregarla (abajo)** |

La llave anónima (*publishable*) de Supabase es pública: va dentro de la app y cualquiera la puede sacar; lo que protege los datos son las reglas RLS de Supabase. Por eso cualquiera de estas dos formas sirve. La que **no** se puede usar nunca es la llave `service_role`.

### Opción A (recomendada): variable de entorno de EAS

La llave queda en expo.dev y no en el código. Cópiala de tu `.env.local` (o de Supabase → Project Settings → API Keys) y corre, cambiando `TU_LLAVE`:

```bash
npx eas-cli@latest env:set --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value TU_LLAVE --environment production --environment preview --environment development --visibility plaintext
```

Atajo: subir todas las variables de `.env.local` de una vez (te pregunta antes de sobrescribir):

```bash
npx eas-cli@latest env:push --environment production --environment preview --environment development --path .env.local
```

Revisa que quedó:

```bash
npx eas-cli@latest env:list --environment production
```

Usa visibilidad `plaintext` o `sensitive`, **no** `secret`: las `EXPO_PUBLIC_*` terminan dentro de la app de todas formas. Cada perfil de `eas.json` toma las variables de su ambiente (`development`, `preview`, `production`).

### Opción B: escribirla en eas.json

Agrega la línea dentro de `build.base.env` de `eas.json`, junto a las otras dos:

```json
"EXPO_PUBLIC_SUPABASE_ANON_KEY": "sb_publishable_…"
```

Es más simple, pero la llave queda en git. No uses las dos opciones a la vez con valores distintos.

> Si una variable falta, la app compila igual pero el Fantasy queda sin cuentas. Prueba el login en el APK de prueba antes de subir a las tiendas.

## 5. Supabase: dejar que la app vuelva del login

El enlace del correo y «Continuar con Google» devuelven al usuario a la app con `elplay://auth` (y en Expo Go con `exp://…`). Supabase solo acepta direcciones que estén en su lista:

1. Entra en [supabase.com/dashboard](https://supabase.com/dashboard) → proyecto de El Play → **Authentication** → **URL Configuration**.
2. Deja **Site URL** como está (`https://elplay.grullonb.com`).
3. En **Redirect URLs** agrega estas dos y guarda:
   - `elplay://**`
   - `exp://**`

## 6. Probar la app en tu teléfono

### Android: APK de prueba

```bash
npx eas-cli@latest build --profile preview --platform android
```

- La primera vez pregunta **«Generate a new Android Keystore?»** → responde **Yes**. EAS guarda esa llave de firma; no la borres (es con la que firmas las versiones que subes a Google).
- Al terminar (unos 10–20 minutos) te da un enlace y un código QR. Ábrelo en el teléfono, descarga el APK e instálalo (Android te pedirá permitir «instalar apps de origen desconocido» para el navegador).
- Prueba: juegos, un juego en vivo, posiciones, avisos de un juego, modo oscuro, y entrar al Fantasy con tu correo (y con Google).

### iPhone

Lo normal es probar con **TestFlight** después del build de producción (sección 9). Si quieres un build de prueba antes, registra tu iPhone y haz el perfil `preview` (necesita la cuenta de Apple ya aprobada):

```bash
npx eas-cli@latest device:create
```

```bash
npx eas-cli@latest build --profile preview --platform ios
```

## 7. Builds de producción

Primero revisa `version` en `app.json` (`1.0.0` para la primera versión). Luego:

```bash
npx eas-cli@latest build --profile production --platform all
```

O una plataforma a la vez con `--platform android` / `--platform ios`.

- **Android** produce un **.aab** (el formato que pide Google Play; no se instala directo en el teléfono).
- **iOS** produce un **.ipa**. La primera vez EAS te pide entrar con tu Apple ID (y el código de verificación), elegir tu equipo y crear el **certificado de distribución** y el **perfil de aprovisionamiento** → responde **Yes** a todo. EAS también registra el bundle ID `com.grullonb.elplay` en tu cuenta de Apple. Si pregunta por una llave de notificaciones push, responde **No**: los avisos de El Play son locales y no la necesitan.
- Puedes ver el progreso y descargar los archivos en [expo.dev](https://expo.dev) → tu proyecto → **Builds**.

## 8. Google Play paso a paso

### 8.1 Crear la app

En [Play Console](https://play.google.com/console) → **Crear app**:

- Nombre: **El Play**
- Idioma predeterminado: **Español (Latinoamérica) – es-419**
- App o juego: **App** · Gratis o pagada: **Gratis** (después no se puede cambiar a pagada)
- Acepta las declaraciones.

### 8.2 Configurar la app (Panel → «Configura tu app»)

Google muestra una lista de tareas. Respuestas para El Play:

| Tarea | Respuesta |
| --- | --- |
| Política de privacidad | `https://elplay.grullonb.com/privacidad` |
| Acceso a la app | «Algunas funciones están restringidas»: el Fantasy pide cuenta. Instrucciones (en inglés, abajo). |
| Anuncios | **No**, la app no tiene anuncios |
| Clasificación del contenido | Cuestionario IARC (abajo) |
| Público objetivo | Solo **13 años o más** (13-15, 16-17, 18+). No marques menores de 13: activaría las reglas de apps para familias. «¿Atrae a niños?» → No |
| Apps de noticias | No |
| Seguridad de los datos | Ver sección 12 |
| Apps gubernamentales / Funciones financieras / Salud | No |
| ID de publicidad | **No** usa ID de publicidad (el permiso está bloqueado en `app.json`) |
| Categoría y contacto (Ficha → Configuración de la tienda) | Categoría **Deportes**; tu correo de soporte; sitio `https://elplay.grullonb.com` |

Instrucciones de **Acceso a la app** (los revisores leen inglés):

```text
All game, standings and stats screens work without an account.
Only the Fantasy tab requires an account: tap Fantasy (or More > Account), enter any email address and
the app sends a 6-digit code (or a sign-in link) to that inbox. Anyone can create a free account this way.
Accounts can be deleted in More > Account > Delete my account.
```

**Clasificación del contenido (IARC):** categoría «Todos los demás tipos de apps». Violencia, sexo, lenguaje, drogas, apuestas: **No**. «¿Los usuarios pueden interactuar o compartir contenido?» → **Sí** (en el Fantasy se ven los nombres y equipos de otros jugadores en la tabla y en las ligas). «¿Comparte la ubicación?» → No. «¿Compras digitales?» → No. El resultado esperado es apta para todos, con el aviso «Los usuarios interactúan».

### 8.3 Ficha de Play Store (Crecimiento → Presencia en Play Store → Ficha principal)

- Nombre, descripción corta y descripción completa: copia los textos de la sección 10.
- Ícono: `assets/store/play-store-icon-512.png`
- Gráfico de funciones: `assets/store/feature-graphic-1024x500.png`
- Capturas del teléfono: de 2 a 8 (mejor 4 o más), ver sección 11.

### 8.4 Subir el primer build (prueba interna)

La forma más fácil la primera vez es a mano:

1. En expo.dev → **Builds** → el build de producción de Android → **Download** (baja el `.aab`).
2. Play Console → **Probar y publicar** → **Pruebas** → **Prueba interna** → **Crear versión**.
3. Si te pregunta por la **firma de apps de Google Play**, acepta la opción recomendada (Google guarda la llave final y la de EAS queda como «llave de subida»).
4. Sube el `.aab`, ponle nombre (por ejemplo «1.0.0») y una nota, **Guardar** → **Revisar versión** → **Publicar en prueba interna**.
5. En la pestaña **Probadores** agrega tu correo, abre el enlace de participación en el teléfono e instala la app desde Play Store.

### 8.5 Prueba cerrada (cuentas personales nuevas)

1. **Pruebas** → **Prueba cerrada** → crea una pista, sube el mismo `.aab` (o promueve la versión de prueba interna).
2. Agrega **al menos 12 probadores** (una lista de correos o un grupo de Google). Cada uno tiene que abrir el enlace de participación, aceptar e instalar la app desde Play Store.
3. Mantén a los 12 dentro **14 días seguidos**. Pídeles que la usen de verdad: Google lo revisa.
4. Después aparece **Solicitar acceso a producción** en el Panel. Responde el cuestionario (cómo encontraste a los probadores, qué cambiaste con sus comentarios, etc.).

### 8.6 Producción

**Probar y publicar** → **Producción** → **Crear versión** → sube el `.aab` (o promueve uno de prueba) → elige países (al menos República Dominicana; puedes poner todos) → **Enviar a revisión**. La primera revisión suele tardar de unos días a una semana.

### 8.7 Envíos automáticos con `eas submit` (opcional, para las siguientes versiones)

Para que EAS suba el `.aab` sin descargarlo:

1. Crea una **cuenta de servicio de Google** con su llave JSON y dale permisos en Play Console (Usuarios y permisos). Expo tiene la guía exacta: [Creating a Google Service Account](https://github.com/expo/fyi/blob/main/creating-google-service-account.md).
2. Súbela a EAS:

   ```bash
   npx eas-cli@latest credentials --platform android
   ```

   (elige el perfil `production` → **Google Service Account** → sube el JSON). Esa llave es secreta: no la subas a git (si la guardas en la carpeta del proyecto, nómbrala `google-service-account.json`, que ya está en `.gitignore`).
3. Envía el último build:

   ```bash
   npx eas-cli@latest submit --platform android --profile production
   ```

`eas.json` lo manda a la pista **internal** como **draft** (borrador): luego lo revisas y lo publicas en Play Console. Cuando la app ya esté publicada puedes cambiar `releaseStatus` a `completed` y la pista (`track`) a `production`.

## 9. App Store paso a paso

### 9.1 Crear la app en App Store Connect

[App Store Connect](https://appstoreconnect.apple.com) → **Apps** → **+** → **Nueva app**:

- Plataforma: **iOS**
- Nombre: **El Play** (los nombres son únicos en la App Store; si está tomado usa «El Play: Béisbol Dominicano»)
- Idioma principal: **Español (México)** (es el español de Latinoamérica que ofrece Apple)
- Bundle ID: `com.grullonb.elplay` (aparece después del primer build de iOS; si no, regístralo en developer.apple.com → Identifiers)
- SKU: `elplay-ios` · Acceso: completo

Si te saltas este paso, `eas submit` puede crear la app por ti.

### 9.2 Subir el build a TestFlight

```bash
npx eas-cli@latest submit --platform ios --profile production
```

Elige el último build. Te pide tu Apple ID; puedes dejar que EAS cree una **llave de API de App Store Connect** para no volver a escribir la contraseña. A los 10–15 minutos el build aparece en **TestFlight**.

1. TestFlight → **Pruebas internas** → agrégate como probador.
2. Instala la app **TestFlight** en tu iPhone y desde ahí instala El Play.
3. Pruébala completa y saca las capturas (sección 11).

Atajo para las próximas veces (compila y sube en un paso):

```bash
npx eas-cli@latest build --platform ios --profile production --auto-submit
```

### 9.3 Llenar la versión y enviar a revisión

En la app → **Distribución** (la versión 1.0):

- **Capturas** de iPhone (sección 11). Como la app es solo para teléfono (`supportsTablet: false`), no hacen falta capturas de iPad.
- **Texto promocional, descripción y palabras clave**: sección 10.
- **URL de soporte**: `https://elplay.grullonb.com` (que tenga un correo o forma de contacto visible). **URL de marketing**: opcional.
- **Copyright**: `2026 Tu Nombre`.
- **Build**: elige el que subiste.
- **Información para la revisión**: tu nombre, teléfono y correo; «Se requiere iniciar sesión» → **No** (solo el Fantasy) y estas notas:

  ```text
  El Play is a free Dominican baseball (LIDOM) live score app. No ads, no tracking.
  Games, standings, leaders and player stats work without an account.
  Only the Fantasy tab needs an account: enter any email address and the app sends a 6-digit code
  (or a sign-in link) to that inbox. Accounts can be deleted in the app: More > Account > Delete my account.
  Game notifications are local reminders scheduled on the device.
  ```

En **Información de la app** (menú izquierdo):

- **Subtítulo**: sección 10. **Categoría** principal: **Deportes**.
- **Clasificación de edad**: responde el cuestionario. Para El Play todo es «Ninguno»/«No» (violencia, contenido sexual, lenguaje, drogas, apuestas, acceso libre a la web). Si pregunta por contenido generado por usuarios o interacción entre usuarios, responde que **sí** hay nombres de usuario visibles en las tablas del Fantasy. Resultado esperado: la clasificación más baja o cercana.
- **Derechos sobre el contenido**: pregunta si la app muestra contenido de terceros. La respuesta honesta es **sí** (datos y fotos de MLB, nombres de equipos). Lee la sección 13 antes de contestar.
- **Privacidad de la app**: URL `https://elplay.grullonb.com/privacidad` y las respuestas de la sección 12.
- **Ley de Servicios Digitales de la UE**: si la publicas en países de la Unión Europea, Apple pregunta si eres «comerciante». Si no lo eres, márcalo; si no quieres lidiar con eso, quita los países de la UE en **Precio y disponibilidad**.

En **Precio y disponibilidad**: **Gratis** y los países donde se verá.

Luego **Agregar para revisión** → **Enviar a revisión de la App Store**. Suele tardar 1 o 2 días. Si la rechazan, Apple explica la regla en el Centro de resoluciones; se corrige, se hace un build nuevo y se vuelve a enviar.

## 10. Textos de la ficha

Escritos para El Play, dentro de los límites de cada tienda.

**Nombre** (máx. 30): `El Play` (o `El Play: Béisbol Dominicano`, 27 caracteres, si el nombre corto está tomado)

**Subtítulo de Apple** (máx. 30): `Béisbol dominicano en vivo`

**Descripción corta de Google** (máx. 80):

```text
Béisbol dominicano en vivo: pitcheo a pitcheo, posiciones, líderes y Fantasy.
```

**Texto promocional de Apple** (máx. 170; se puede cambiar sin nueva versión):

```text
Sigue cada lanzamiento de la pelota invernal en tiempo real: marcador, conteo, zona de strike y jugadas al instante. Gratis y sin anuncios.
```

**Palabras clave de Apple** (máx. 100, separadas por comas, sin espacios; no repitas palabras del nombre ni del subtítulo):

```text
pelota,invernal,marcador,resultados,estadisticas,fantasy,jonron,pitcheo,posiciones,lideres,juegos
```

No se ponen marcas de otros (LIDOM, MLB, nombres de equipos) en las palabras clave: Apple lo prohíbe (regla 2.3.7) y es motivo de rechazo.

**Descripción completa** (Apple y Google, máx. 4000):

```text
El Play es la forma más completa de seguir la pelota invernal dominicana desde tu teléfono. Cada lanzamiento, cada jugada y cada carrera, al instante.

EN VIVO, PITCHEO A PITCHEO
• Marcador, conteo, outs y corredores en base en tiempo real.
• Zona de strike con la ubicación y el tipo de cada lanzamiento.
• Jugada a jugada, resumen del juego y box score completo.
• Gráfica de batazos y el duelo de bateador contra lanzador.

POSICIONES Y ESTADÍSTICAS
• Tabla de posiciones siempre al día.
• Líderes de bateo y de pitcheo.
• Ficha de cada jugador con sus números de la temporada.

FANTASY GRATIS
• Arma tu equipo cada día y suma puntos con lo que hacen los jugadores en el terreno.
• Compite en la tabla general o crea ligas privadas con tus amigos.
• Comparte tu equipo como imagen.

HECHA PARA EL FANÁTICO
• Avisos antes de que empiecen los juegos que te interesan.
• Modo claro y modo oscuro.
• En español y en inglés.
• Sin anuncios. Para ver juegos y estadísticas no necesitas cuenta; solo el Fantasy pide un correo.

También sigue la Serie del Caribe y el Clásico Mundial cuando están en juego.

El Play es una app independiente: no está afiliada a la LIDOM ni a ninguna liga o equipo.
```

**Novedades** (para versiones siguientes), ejemplo: `Mejoras de rendimiento y correcciones.`

## 11. Capturas de pantalla e imágenes

### Qué pantallas capturar (4 a 6)

1. Juegos del día con marcadores.
2. Un juego en vivo con la zona de strike.
3. Jugada a jugada o box score.
4. Tabla de posiciones.
5. Líderes o la ficha de un jugador.
6. El Fantasy (sin que se vea tu correo).

Consejos: sácalas en un día con juegos interesantes, con la batería llena y sin notificaciones arriba. Puedes hacer unas en modo claro y otras en oscuro. Las capturas tienen que mostrar la app de verdad (sin pantallas inventadas).

### Apple (iPhone)

| Ranura en App Store Connect | Tamaño (vertical) | Cómo conseguirla |
| --- | --- | --- |
| iPhone 6,1"/6,3" (obligatoria) | 1179×2556 o 1206×2622 | Captura de un iPhone 14 Pro, 15, 16 o 17 normal |
| iPhone 6,9" (o 6,5") | 1290×2796 o 1320×2868 (6,5": 1284×2778 o 1242×2688) | La misma captura de 1179×2556 agrandada a 1290×2796 (tienen la misma proporción) o una de un iPhone Pro Max |

- De 1 a 10 por tamaño, en PNG o JPG, **sin transparencia**.
- En el iPhone: botón lateral + subir volumen. Pásalas a la PC por correo, iCloud o cable.
- Para agrandar: en Paint → **Cambiar tamaño** → **Píxeles**, desmarca «Mantener relación de aspecto» solo si hace falta y escribe 1290 × 2796.

### Google Play (teléfono)

- De 2 a 8, PNG (sin transparencia) o JPG, entre 320 y 3840 píxeles por lado, y **el lado largo no puede medir más del doble del corto**.
- Para que Google pueda destacar la app: al menos 4 capturas verticales de **1080×1920** (9:16) o más.
- En Android: botón de encendido + bajar volumen. Los teléfonos de hoy sacan capturas más alargadas (por ejemplo 1080×2400, que pasan del doble): recórtalas a 9:16 quitando la barra de arriba y la de abajo. La app **Fotos** de Windows tiene **Recortar** con proporción 9:16.

### Imágenes ya hechas (carpeta `assets/store/`)

| Archivo | Dónde va |
| --- | --- |
| `play-store-icon-512.png` | Google Play → ícono de la app (512×512, PNG de 32 bits) |
| `feature-graphic-1024x500.png` | Google Play → gráfico de funciones (obligatorio) |

Apple no pide ícono aparte: lo toma del build (`assets/images/icon.png`). Si cambias el logo, regenera todo con `node scripts/generar-iconos.js` (ver README).

## 12. Privacidad: lo que tienes que declarar

Lo que hace El Play con los datos (coincide con la pantalla de privacidad de la app y de la web):

- **Sin cuenta** (juegos, posiciones, estadísticas): no se recoge nada. Las preferencias (liga, tema, idioma, equipo favorito, avisos) quedan solo en el teléfono.
- **Con cuenta del Fantasy** (opcional): correo, el nombre que el usuario elige para la tabla (y, si entra con Google, el nombre de su perfil de Google), un identificador de usuario, sus equipos y pronósticos y las ligas privadas. Se guardan en Supabase. El nombre y los equipos se ven en la tabla y en las ligas; el correo no se muestra.
- **Avisos**: los programa el propio teléfono; no hay servidor de notificaciones ni identificador del dispositivo.
- **Sin anuncios, sin análisis, sin rastreo**, sin venta ni cesión de datos.
- **Borrado de cuenta**: dentro de la app en **Más → Cuenta → Borrar mi cuenta** (borra el perfil, los equipos y las ligas en Supabase y la copia del teléfono).
- Todo viaja cifrado (HTTPS).

### Apple: «Privacidad de la app»

- ¿Recopilas datos? **Sí.**
- ¿Se usan para rastrear al usuario? **No** (en ningún tipo de dato).

| Tipo de dato (Apple) | ¿Vinculado al usuario? | Uso |
| --- | --- | --- |
| Información de contacto → **Correo electrónico** | Sí | Funcionalidad de la app |
| Información de contacto → **Nombre** | Sí | Funcionalidad de la app |
| Identificadores → **ID de usuario** | Sí | Funcionalidad de la app |
| Contenido del usuario → **Otro contenido del usuario** (equipos y pronósticos del Fantasy) | Sí | Funcionalidad de la app |

Nada más: sin ubicación, sin historial, sin datos de diagnóstico, sin identificadores del dispositivo.

### Google: «Seguridad de los datos»

- ¿Recopila o comparte datos de usuario? **Sí.**
- ¿Todos los datos se cifran en tránsito? **Sí.**
- ¿Los usuarios pueden pedir que se borren sus datos? **Sí.**
- **URL para borrar la cuenta** (obligatoria): `https://elplay.grullonb.com/privacidad` (ver abajo).

| Tipo de dato (Google) | Recopilado | Compartido | Opcional | Fines |
| --- | --- | --- | --- | --- |
| Información personal → **Dirección de correo electrónico** | Sí | No | Sí (solo con cuenta del Fantasy) | Funcionalidad de la app, Administración de la cuenta |
| Información personal → **Nombre** | Sí | No | Sí | Funcionalidad de la app, Administración de la cuenta |
| Información personal → **ID de usuario** | Sí | No | Sí | Funcionalidad de la app, Administración de la cuenta |
| Actividad en la app → **Otro contenido generado por el usuario** | Sí | No | Sí | Funcionalidad de la app |

«Compartido» es **No** porque Supabase es un proveedor que guarda los datos por cuenta de El Play (Google no lo cuenta como compartir).

### Borrar la cuenta desde la web (Google lo exige)

Google pide, además del botón dentro de la app, **una página web** donde se pueda pedir el borrado sin instalar la app, que mencione El Play y explique los pasos. La política de privacidad de la web ya dice que se borra desde **Más → Tu cuenta → Borrar mi cuenta** en la web, lo que sirve. Para dejarlo claro conviene agregar en `https://elplay.grullonb.com/privacidad` un apartado **«Borrar tu cuenta»** con:

1. Los pasos en la app y en la web.
2. Un correo de contacto para quien ya no pueda entrar, y en cuánto tiempo se borran los datos.

Ese correo también sirve como contacto de soporte para Apple.

## 13. Reglas de revisión que importan

### Apple 4.8: «Continuar con Google» obliga a ofrecer otra opción privada

Si una app deja crear la cuenta con un servicio de terceros (Google), Apple exige ofrecer **también** un inicio de sesión que solo pida nombre y correo, que deje **ocultar el correo** y que no rastree para publicidad. Eso es **«Iniciar sesión con Apple»**, y la app ya lo trae (`expo-apple-authentication`, `"usesAppleSignIn": true` en `app.json`).

Cómo queda en el iPhone:

- El botón negro (o blanco en modo oscuro) **«Continuar con Apple»** sale arriba del correo cuando el proveedor Apple está activo en Supabase.
- **«Continuar con Google»** en iPhone sale **solo si Apple también está activo** (así nunca se rompe la regla). En Android y en la web, Google sale siempre.

Lo que tienes que hacer tú (una vez):

1. En [developer.apple.com](https://developer.apple.com/account/resources/identifiers/list) → **Identifiers** → `com.grullonb.elplay` → marca **Sign In with Apple**. (EAS también la activa solo al hacer el build si inicias sesión con tu Apple ID.)
2. En Supabase → **Authentication** → **Sign In / Providers** → **Apple**: actívalo y en **Client IDs** pon `com.grullonb.elplay`. Para el inicio de sesión nativo del iPhone no hace falta la llave secreta ni el Services ID (eso es solo para entrar con Apple desde la web).
3. Haz un build nuevo de iOS (`npx eas-cli@latest build --platform ios --profile production`): el módulo es nativo, no llega por `eas update`.

### Apple 5.1.1(v) y Google: borrar la cuenta dentro de la app

Ya existe (**Más → Cuenta → Borrar mi cuenta**) y borra los datos de verdad, que es lo que piden las dos tiendas. Los revisores lo buscan: menciónalo en las notas (ya está en el texto de la sección 9).

### Apple 2.1: que el revisor pueda probar todo

El Fantasy pide cuenta. Como cualquiera puede crear una con su correo, basta con explicarlo en las notas. Si el revisor pide una cuenta de demostración, habría que agregar una forma de entrar sin correo (por ejemplo, una cuenta de prueba con contraseña) y mandar un build nuevo.

### Los datos del béisbol: ¿se puede publicar así? (léelo antes de enviar)

**Respuesta corta: tal como está, no es seguro.** No hay una regla que diga «prohibido», pero hoy la app depende de tres cosas que no son tuyas, y las dos tiendas piden que tengas permiso:

1. **Los datos** salen de la API de estadísticas de MLB (MLB es dueña del sistema de anotación de LIDOM). Su aviso de derechos dice que solo se permite el uso «individual, no comercial y no masivo» ([copyright.txt](http://gdx.mlb.com/components/copyright.txt)); cualquier otro uso necesita permiso por escrito. Una app pública, con modo PRO y quizá anuncios, va más allá de eso.
2. **Las fotos** de los peloteros y **los logos** de los equipos son de terceros.
3. **Las reglas de las tiendas:**
   - Apple 5.2.1 (no usar marcas ni obras de otros sin permiso) y 5.2.2 (si la app muestra contenido de un servicio de terceros, sus términos tienen que permitirlo, y Apple puede pedir la autorización) ([guías](https://developer.apple.com/app-store/review/guidelines/)).
   - Google: la política de propiedad intelectual cita los logos de equipos como caso típico, y la de suplantación prohíbe dar a entender que eres oficial ([propiedad intelectual](https://support.google.com/googleplay/android-developer/answer/9888072), [suplantación](https://support.google.com/googleplay/android-developer/answer/9888374)).

Puede que pase la revisión (hay apps parecidas publicadas), pero queda expuesta a un rechazo por 5.2.2, a que la retiren si alguien reclama o a que MLB corte el acceso. En 2012 MLB le mandó una carta a la app Batter's Box y la retiraron de la App Store. La versión web (PWA) no pasa revisión, pero los términos de los datos le aplican igual. Un TWA en Play Store no evita las políticas: su contenido tiene que cumplirlas igual.

**Soluciones, de la más rápida a la más completa:**

1. **Ya mismo, sin tiendas:** seguir como PWA (se instala desde el navegador y ya funciona en iPhone y Android). Mientras uses estos datos, sin cobrar el PRO ni poner anuncios; el aviso de «no afiliado» ya está en la app.
2. **Pedir permiso a la LIDOM** (info@lidom.com, (809) 563-5085): una licencia escrita para el nombre, los logos y los datos, y que te digan si los datos de anotación son de ellos o de MLB. Hay apps oficiales de equipos (la del Licey, por ejemplo), así que licenciar con la liga o con un equipo es posible. Con esa carta respondes la pregunta de Apple sobre «Derechos sobre el contenido».
3. **Cotizar un proveedor con licencia:** Statscore (LSports) tiene a LIDOM en su lista; Sportradar tiene los derechos oficiales de MLB hasta 2032 (pregúntales por las ligas invernales). Ojo: el lanzamiento a lanzamiento con ubicación de la zona de strike, por ahora, solo lo vi en el feed de MLB; con otro proveedor la app tendría menos detalle.
4. **Solo con el 2 o el 3 resuelto, ir a las tiendas:** Apple US$99 al año; Google US$25 una vez y, en cuentas personales nuevas, prueba cerrada con 12 probadores durante 14 días seguidos (sección 8.5). Lo demás ya está listo: borrar la cuenta en la app y en la web, Iniciar sesión con Apple, privacidad y los formularios de datos (secciones 12 y 13).

Mientras tanto, para bajar el riesgo: no uses logos de la LIDOM ni de los equipos en el ícono, el nombre, las capturas ni las palabras clave, y no pongas «MLB» en ningún texto de la ficha. Esto no es asesoría legal: antes de cobrar o de crecer, consúltalo con un abogado.

### Contenido de usuarios (Apple 1.2)

En el Fantasy se ven los nombres que eligen los usuarios. Si alguien pone un nombre ofensivo, conviene poder cambiarlo o borrarlo desde Supabase y tener un correo de contacto para reportes. No suele ser motivo de rechazo en una tabla de puntos, pero es bueno tenerlo previsto.

## 14. Más adelante: login nativo con Google (opcional)

Hoy «Continuar con Google» abre una ventana del navegador y vuelve a la app (no necesita nada más que la sección 5). Si más adelante quieres el selector nativo de cuentas de Google:

1. En [Google Cloud Console](https://console.cloud.google.com) → **APIs y servicios** → **Credenciales**, crea dos **ID de cliente de OAuth**:
   - **Android**: paquete `com.grullonb.elplay` y la huella **SHA-1**. Necesitas dos huellas: la de EAS (`npx eas-cli@latest credentials --platform android` → muestra el SHA-1 del keystore) y la de Google Play (Play Console → **Integridad de la app** → **Firma de apps** → certificado de la llave de firma). Crea un cliente por cada una.
   - **iOS**: bundle ID `com.grullonb.elplay`.
2. En Supabase → **Authentication** → **Providers** → **Google**, agrega esos ID de cliente en **Authorized Client IDs**.
3. En la app: `@react-native-google-signin/google-signin` (necesita development build) y `signInWithIdToken` de Supabase. Recuerda la regla 4.8 de Apple.

## 15. Publicar una versión nueva

1. Cambia `version` en `app.json` (por ejemplo `1.0.0` → `1.0.1`; los números de build los sube EAS solo).
2. Compila:

   ```bash
   npx eas-cli@latest build --profile production --platform all
   ```

3. Sube:

   ```bash
   npx eas-cli@latest submit --platform ios --profile production
   ```

   ```bash
   npx eas-cli@latest submit --platform android --profile production
   ```

4. En App Store Connect crea la versión nueva, elige el build, escribe «Novedades» y envíala a revisión. En Play Console promueve la versión de la pista interna a producción.

Cada versión pasa por revisión otra vez. (Más adelante se puede agregar EAS Update para mandar cambios de JavaScript sin pasar por las tiendas; hoy no está instalado.)

## 16. Problemas comunes

| Problema | Solución |
| --- | --- |
| «Node.js (v20…) is outdated and unsupported» | Instala Node 22 LTS o 24 LTS (sección 1). |
| El build de `development` dice que falta `expo-dev-client` | `npx expo install expo-dev-client` y vuelve a compilar. |
| El Fantasy dice que no hay cuentas en el build | Falta `EXPO_PUBLIC_SUPABASE_ANON_KEY` en EAS (sección 4); haz un build nuevo. |
| Después de entrar con Google o con el enlace del correo, no vuelve a la app | Faltan `elplay://**` y `exp://**` en Supabase (sección 5). |
| Google Play no deja subir a producción | Cuenta personal nueva: falta la prueba cerrada de 12 personas por 14 días (sección 8.5). |
| Google Play rechaza capturas | Recórtalas para que el lado largo no pase del doble del corto (sección 11). |
| Apple rechaza por la regla 4.8 | Esconde «Continuar con Google» en iPhone o agrega «Iniciar sesión con Apple» (sección 13). |
| El nombre «El Play» está tomado en la App Store | Usa «El Play: Béisbol Dominicano»; en el teléfono se sigue viendo «El Play». |
| No ves el ícono ni la pantalla de inicio nuevos | En Expo Go no salen; se ven en el APK o en el build de TestFlight. |

Enlaces de referencia: [EAS Build](https://docs.expo.dev/build/introduction/) · [Variables de entorno de EAS](https://docs.expo.dev/eas/environment-variables/) · [Enviar a Google Play](https://docs.expo.dev/submit/android/) · [Enviar a App Store](https://docs.expo.dev/submit/ios/) · [Capturas de Apple](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications) · [Imágenes de Google Play](https://support.google.com/googleplay/android-developer/answer/9866151) · [Borrado de cuentas en Google Play](https://support.google.com/googleplay/android-developer/answer/13327111)
