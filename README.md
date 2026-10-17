# El Play (app para iPhone y Android)

El Play es la app de béisbol dominicano en vivo: la LIDOM (y la Serie del Caribe y el Clásico Mundial cuando hay) pitcheo a pitcheo, posiciones, líderes, estadísticas de jugadores y el Fantasy gratis con ligas privadas. Es la versión nativa de la web [elplay.grullonb.com](https://elplay.grullonb.com), hecha con [Expo](https://expo.dev) (SDK 58) y React Native, para publicarla en App Store y Google Play.

- Los datos de los juegos vienen de la API de El Play (`https://elplay.grullonb.com/api/v2/*`).
- Las cuentas del Fantasy están en Supabase (el mismo proyecto de la web).
- Sin anuncios ni herramientas de rastreo. Solo el Fantasy pide cuenta.

> ¿Vas a publicar la app? La guía paso a paso está en **[docs/TIENDAS.md](docs/TIENDAS.md)**.

## Requisitos

- **Node.js 22.13 o más nuevo** (LTS 22 o 24). Expo SDK 58, EAS CLI y expo-doctor lo piden; con Node 20 funcionan pero avisan «Node.js (v20…) is outdated and unsupported», y cualquier versión nueva puede dejar de funcionar. Descárgalo en [nodejs.org](https://nodejs.org/en/download).
- Un teléfono con la app **Expo Go** (App Store o Play Store) para probar rápido, o un emulador de Android.
- Una cuenta gratis en [expo.dev](https://expo.dev) para hacer builds con EAS.

## Cómo correrla

1. Instala las dependencias:

   ```bash
   npm install
   ```

2. Crea `.env.local` a partir de `.env.example` y llena los valores:

   ```bash
   cp .env.example .env.local
   ```

   | Variable | Valor |
   | --- | --- |
   | `EXPO_PUBLIC_API_URL` | `https://elplay.grullonb.com` |
   | `EXPO_PUBLIC_SUPABASE_URL` | `https://dopiehplwzfzgvaonynm.supabase.co` |
   | `EXPO_PUBLIC_SUPABASE_ANON_KEY` | La llave *publishable* (anon) de Supabase: Supabase → Project Settings → API Keys |

   Todas las variables `EXPO_PUBLIC_*` quedan dentro de la app y cualquiera las puede ver: son públicas a propósito. **Nunca pongas aquí la llave `service_role` ni otra llave secreta.** Sin las dos de Supabase la app funciona igual, pero el Fantasy queda sin cuentas. `.env.local` no se sube a git (está en `.gitignore`).

3. Arranca el servidor de desarrollo:

   ```bash
   npx expo start --go
   ```

   Con `--go` el código QR abre en **Expo Go**: escanéalo con la cámara (iPhone) o con Expo Go (Android). Sin `--go`, `npx expo start` arranca para el **development build** (el proyecto trae `expo-dev-client`) y Expo Go no abre ese QR; la tecla `s` cambia entre los dos. Otras teclas útiles: `a` abre el emulador de Android, `w` abre la web, `r` recarga.

### Expo Go o development build

- **Expo Go** es lo más rápido para probar pantallas: no hay que compilar nada. Limitaciones: no muestra el ícono ni la pantalla de inicio propios, el enlace de vuelta del login usa `exp://…` en vez de `elplay://…` y solo trae los módulos nativos que vienen con Expo Go.
- Un **development build** es tu propia app de desarrollo con el nombre, el ícono y los módulos nativos de El Play. Hace falta para lo que Expo Go no trae (por ejemplo seguir el juego en segundo plano con `expo-widgets`, ver `docs/SEGUNDO-PLANO.md`). `expo-dev-client` ya está instalado; para hacerlo:

  ```bash
  npx eas-cli@latest build --profile development --platform android
  ```

  Instala el APK que te da EAS y luego corre `npx expo start` (sin `--go`); la app se conecta sola.

### Web

```bash
npx expo start --web
```

La versión web de esta app es solo para desarrollo (la web pública sigue siendo el proyecto `el-play`). `web.output` está en `single` (una sola página).

## Comandos

```bash
npx expo start          # servidor de desarrollo (development build; con --go, para Expo Go)
npx expo lint           # revisar el código
npx tsc --noEmit        # revisar los tipos
npx expo-doctor         # revisar dependencias y configuración
npx expo install <pkg>  # agregar una librería (siempre así, no con npm install, para que la versión sea compatible)
```

## Estructura

```
app.json                 Configuración de la app: nombre, ícono, splash, bundle id, permisos, plugins
eas.json                 Perfiles de build de EAS (development, preview, production) y de envío a tiendas
assets/
  brand/logo.svg         Logo original de El Play (el de la web)
  images/                Íconos y splash que usa la app (generados, ver abajo)
  store/                 Imágenes para la ficha de Google Play (ícono 512 y gráfico 1024×500)
scripts/
  generar-iconos.js      Genera todos los PNG de assets/images y assets/store desde el logo
src/
  app/                   Pantallas (Expo Router: cada archivo es una ruta)
    _layout.tsx          Raíz: fuentes, tema, React Query, splash
    (tabs)/              Pestañas: Juegos (index), Posiciones, Fantasy, Más
    juego/[gamePk].tsx   Juego en vivo / resumen / box score
    jugador/[id].tsx     Ficha del jugador
    en-vivo.tsx, auth.tsx, privacidad.tsx
  components/            Componentes por sección (game, stats, fantasy, account, …)
  lib/                   API, Supabase (cuenta y Fantasy), formatos, consultas
  state/                 Liga elegida y preferencias (tema, idioma, avisos)
  theme/                 Colores y tema claro/oscuro (los mismos de la web)
  locales/               Textos en español e inglés (i18next)
docs/TIENDAS.md          Guía para publicar en App Store y Google Play
```

## Íconos y pantalla de inicio

Todos salen de `assets/brand/logo.svg` con el fondo oscuro de la marca (`#0b0c10`):

| Archivo | Para qué |
| --- | --- |
| `assets/images/icon.png` | Ícono de iOS y general (1024×1024, sin transparencia) |
| `assets/images/android-icon-foreground.png` / `-background.png` | Ícono adaptativo de Android (1024×1024; el logo cabe en el círculo seguro) |
| `assets/images/android-icon-monochrome.png` | Ícono temático de Android 13+ |
| `assets/images/splash-icon.png` | Pantalla de inicio (fondo claro `#f6f6f9` u oscuro `#0b0c10` según el teléfono) |
| `assets/images/notification-icon.png` | Ícono de los avisos en Android (blanco sobre transparente, 96×96) |
| `assets/images/favicon.png` | Favicon de la versión web |
| `assets/store/*` | Ícono 512×512 y gráfico de funciones 1024×500 de Google Play |

Para regenerarlos (por ejemplo, si cambia el logo) hace falta Playwright con Chromium, que no es dependencia del proyecto:

```bash
node scripts/generar-iconos.js
```

El script busca el paquete `playwright`; si no está instalado, usa las variables `PLAYWRIGHT_PATH` (carpeta del paquete) y `CHROMIUM_PATH` (ejecutable de Chromium). El ícono y el splash solo se ven en un build (no en Expo Go).

## Builds con EAS

[EAS](https://docs.expo.dev/eas/) compila la app en la nube: no hace falta Mac, Xcode ni Android Studio.

| Perfil | Qué produce | Para qué |
| --- | --- | --- |
| `development` | App de desarrollo (necesita `expo-dev-client`) | Programar con el código en vivo |
| `preview` | APK de Android (y build interno de iOS) | Instalarla en tu teléfono para probar |
| `production` | AAB (Android) e IPA (iOS) | Subirla a Google Play y App Store |

```bash
npx eas-cli@latest login
npx eas-cli@latest init
npx eas-cli@latest build --profile preview --platform android
npx eas-cli@latest build --profile production --platform all
npx eas-cli@latest submit --platform android
npx eas-cli@latest submit --platform ios
```

- La versión que ve el usuario es `version` en `app.json` (súbela en cada versión nueva: 1.0.0 → 1.0.1). Los números de build (`versionCode` de Android y `buildNumber` de iOS) los lleva EAS solo (`appVersionSource: remote` y `autoIncrement` en producción).
- `.env.local` **no** se sube a EAS. Las URL públicas ya están en `eas.json`; la llave anónima de Supabase se guarda como variable de entorno de EAS (ver [docs/TIENDAS.md](docs/TIENDAS.md#4-variables-de-entorno-en-eas)).
- Las notificaciones son locales (las programa el propio teléfono): no hace falta Firebase ni certificado de push.

Todo el detalle (cuentas, credenciales, ficha de tienda, privacidad y revisión) está en [docs/TIENDAS.md](docs/TIENDAS.md).
