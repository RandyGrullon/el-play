# El Play en tu teléfono con Expo: paso a paso

Todo lo que hay que hacer, en orden, para tener la app en el teléfono y mandarle cambios. Hay dos caminos:

| Camino | Para qué | Cuánto tarda |
| --- | --- | --- |
| **A. Expo Go** | Ver la app ya mismo desde tu PC, sin compilar nada | 5 minutos |
| **B. La app de verdad (APK con EAS)** | Tenerla instalada con su ícono, que funcione sin la PC y que se actualice sola | 30 minutos la primera vez |

Los pasos 0, 1 y 2 sirven para los dos caminos. Los comandos se corren en una terminal **dentro de la carpeta de la app** (`el-play-app`).

## Resumen rápido

- [ ] 0. Node 22, Git, cuenta de Expo y Expo Go en el teléfono
- [ ] 1. Bajar el código (`git pull` + `npm install`)
- [ ] 2. Crear `.env.local` con la llave de Supabase
- [ ] 3. **Camino A:** `npx expo start --go` y escanear el QR con Expo Go
- [ ] 4. **Camino B, una sola vez:** `login` → `init` → `update:configure` → variables en EAS → `build` → instalar el APK
- [ ] 5. **Cada vez que haya cambios:** `eas update` (sin reinstalar)
- [ ] 6. Aparte: correr el SQL de las ligas en Supabase

---

## 0. Lo que necesitas (una sola vez)

1. **Node.js 22.13 o más nuevo.** Revisa con:

   ```bash
   node -v
   ```

   Si sale `v20…` o menos, instala el LTS 22 o 24 de [nodejs.org](https://nodejs.org/en/download) y abre otra terminal.

2. **Git** y acceso al repo `RandyGrullon/el-play` (la app vive en la rama `app-movil`).
3. **Una cuenta gratis en [expo.dev](https://expo.dev).** Si ya hiciste un build antes, usa la misma cuenta.
4. **Expo Go en el teléfono:** [Play Store](https://play.google.com/store/apps/details?id=host.exp.exponent) o [App Store](https://apps.apple.com/app/expo-go/id982107779). Si ya lo tenías, actualízalo: el proyecto es **Expo SDK 58** y Expo Go tiene que soportarlo.
5. La PC y el teléfono **en el mismo Wi-Fi** (si no se puede, en el paso 3 está el truco del túnel).

## 1. Bajar el código

**Si es la primera vez en esa PC:**

```bash
git clone --branch app-movil https://github.com/RandyGrullon/el-play.git el-play-app
```

```bash
cd el-play-app
```

```bash
npm install
```

**Si ya la tenías:**

```bash
git pull
```

```bash
npm install
```

Corre `npm install` siempre después de `git pull`: a veces llegan librerías nuevas (la última fue `expo-updates`).

> Si `git pull` se queja de `app.json`, es porque en esa PC ya tenías el `projectId` de un build anterior sin guardar. Corre `git stash`, luego `git pull`, luego `git stash pop`, y si choca deja las dos cosas: lo tuyo (`extra.eas.projectId`, `owner`) y lo nuevo (`runtimeVersion`, `updates`).

## 2. Crear `.env.local`

```bash
cp .env.example .env.local
```

Abre `.env.local` y déjalo así:

```bash
EXPO_PUBLIC_API_URL=https://elplay.grullonb.com
EXPO_PUBLIC_SUPABASE_URL=https://dopiehplwzfzgvaonynm.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=TU_LLAVE
```

`TU_LLAVE` es la llave **publishable** (anon) de Supabase: Supabase → Project Settings → API Keys (es la misma de la web). **Nunca** pongas la `service_role`. Sin esta llave la app funciona, pero el Fantasy queda sin cuentas. `.env.local` no se sube a git.

---

## 3. Camino A: probarla en Expo Go

1. Arranca el servidor de desarrollo:

   ```bash
   npx expo start --go
   ```

   El `--go` es importante: el proyecto trae `expo-dev-client` y sin `--go` el QR es para un *development build*, que Expo Go no abre. Si se te olvidó, aprieta `s` en la terminal para cambiar a Expo Go.

2. Escanea el código QR que sale en la terminal:
   - **Android:** abre Expo Go → **Scan QR code**.
   - **iPhone:** con la cámara normal; toca el aviso y se abre en Expo Go.

3. La primera carga tarda un poco (arma todo el código). Después, cada vez que guardas un archivo en la PC, el teléfono se actualiza solo.

4. Teclas útiles en la terminal: `r` recarga la app, `m` abre el menú en el teléfono, `j` abre el depurador, `w` la abre en el navegador de la PC.

**Si el teléfono no conecta** (se queda cargando o dice que no encuentra el servidor), casi siempre es el Wi-Fi (redes de oficina o de invitados no dejan que los equipos se vean). Usa el túnel:

```bash
npx expo start --go --tunnel
```

La primera vez te pide instalar `@expo/ngrok`: dile que sí.

**Para que el login del Fantasy funcione en Expo Go**, en Supabase → Authentication → URL Configuration → **Redirect URLs** tienen que estar `exp://**` y `elplay://**` (ver [TIENDAS.md, sección 5](TIENDAS.md#5-supabase-dejar-que-la-app-vuelva-del-login)).

**Lo que Expo Go NO muestra** (todo esto sí sale en el camino B):

- El ícono y la pantalla de inicio de El Play.
- «Seguir el juego» en segundo plano (el botón no aparece).
- El aviso «Hay una versión nueva de El Play» (en Expo Go no hace falta: el código llega de tu PC).
- La app solo funciona mientras la PC tenga `npx expo start` corriendo.

---

## 4. Camino B: la app de verdad (una sola vez)

### 4.1 Entrar a Expo

```bash
npx eas-cli@latest login
```

```bash
npx eas-cli@latest whoami
```

`whoami` tiene que decir tu usuario de Expo.

### 4.2 Conectar el proyecto

```bash
npx eas-cli@latest init
```

- Si ya hiciste un build antes, te ofrece el proyecto que ya existe (`el-play`): **escoge ese**, no crees otro.
- Agrega a `app.json` el `owner` y `extra.eas.projectId`.

Luego activa las actualizaciones sin reinstalar:

```bash
npx eas-cli@latest update:configure
```

- Agrega `updates.url` a `app.json`.
- Si pregunta por `runtimeVersion`, deja el que ya está (`fingerprint`). Los canales `preview` y `production` ya están en `eas.json`: no los cambies.

Guarda esos cambios de `app.json` en git para que no se pierdan:

```bash
git add app.json
```

```bash
git commit -m "chore: conectar eas update"
```

```bash
git push
```

### 4.3 Darle las variables a EAS

EAS no ve tu `.env.local`. Las tres variables tienen que estar en expo.dev; `eas update` las necesita (el `env` de `eas.json` solo lo usan los builds). Cambia `TU_LLAVE` por la llave del paso 2:

```bash
npx eas-cli@latest env:set --name EXPO_PUBLIC_API_URL --value https://elplay.grullonb.com --environment production --environment preview --environment development --visibility plaintext
```

```bash
npx eas-cli@latest env:set --name EXPO_PUBLIC_SUPABASE_URL --value https://dopiehplwzfzgvaonynm.supabase.co --environment production --environment preview --environment development --visibility plaintext
```

```bash
npx eas-cli@latest env:set --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value TU_LLAVE --environment production --environment preview --environment development --visibility plaintext
```

Si alguna ya existía, `env:set` la actualiza (puede preguntar si la sobrescribe: di que sí). Revisa que quedaron las tres:

```bash
npx eas-cli@latest env:list --environment preview
```

Usa `plaintext` (o `sensitive`), **no** `secret`: las `EXPO_PUBLIC_*` van dentro de la app de todas formas.

### 4.4 Compilar el APK (Android)

```bash
npx eas-cli@latest build --profile preview --platform android
```

- Si pregunta **«Generate a new Android Keystore?»**, responde **Yes** (solo pasa la primera vez). Esa llave queda guardada en EAS: no la borres nunca.
- Tarda unos 10–20 minutos (con el plan gratis a veces hay fila). Puedes cerrar la terminal y seguirlo en [expo.dev](https://expo.dev) → tu proyecto → Builds.
- Este build **tiene** que ser después del paso 4.2: los builds viejos no traen `expo-updates` y nunca van a recibir cambios.

### 4.5 Instalarlo en el teléfono

1. Al terminar, EAS da un **enlace y un QR**. Ábrelo en el teléfono y descarga el APK.
2. Ábrelo para instalarlo. Android te pide permitir «instalar apps de origen desconocido» para el navegador: actívalo.
3. Si dice **«App no instalada»**, desinstala primero la versión vieja de El Play (pasa cuando el build viejo se firmó con otra llave) y vuelve a instalar.
4. Abre la app y prueba: juegos, un juego en vivo, Fantasy con tu cuenta, «Seguir el juego».

### iPhone

En iPhone no hay APK. Hace falta la cuenta de **Apple Developer** (US$99 al año) y se instala por TestFlight o registrando tu iPhone. El paso a paso está en [TIENDAS.md, sección 6](TIENDAS.md#6-probar-la-app-en-tu-teléfono) y sección 9. Mientras tanto, en iPhone usa el camino A.

### Widget del iPhone (pantalla de inicio y bloqueada)

El Play trae un widget: tu equipo (o el juego en vivo, el próximo o el último) con el marcador, los otros juegos del día y accesos directos a **En vivo**, **Mi equipo** (u **Hoy** si no tienes favorito), **Fantasy** y **Posiciones**. Solo existe en una app de El Play instalada con un build (TestFlight o development build). **En Expo Go y en la web no sale**: el widget va dentro de la app instalada, y Expo Go es otra app.

1. Instala un build nuevo (el widget es nativo: un `eas update` no lo agrega a un build viejo).
2. Abre El Play una vez y deja que cargue los juegos (así el widget ya tiene datos).
3. En la pantalla de inicio, mantén presionado un espacio vacío hasta que los íconos se muevan → **+** (arriba a la izquierda, o **Editar → Agregar widget** en iOS 18 o más nuevo) → busca **El Play**.
4. Escoge el tamaño y toca **Agregar widget**:
   - **Pequeño:** el juego; tocarlo lo abre.
   - **Mediano:** el juego y los cuatro accesos directos.
   - **Grande:** el juego, hasta tres juegos más del día (cada uno abre el suyo) y los accesos directos.
5. En la pantalla bloqueada: mantén presionado → **Personalizar** → **Pantalla bloqueada** → toca la fila de widgets → **El Play** (marcador en una línea o en un rectángulo).

Cómo se actualiza: el widget **no busca datos solo**; muestra lo último que leyó la app (al abrirla, mientras está abierta y al salir). Con un juego en vivo, a los 15 minutos de la última lectura dice **«Toca para actualizar»**; a la hora en que empieza tu juego pasa a **«En juego»**. Para que siga el marcador con la app cerrada está **«Seguir el juego»** (pantalla bloqueada e isla dinámica).

En Android, los widgets de `expo-widgets` 58 todavía no pueden abrir la app (los botones solo le avisan a la app si está abierta), así que por ahora el widget es solo del iPhone.

---

## 5. Cada vez que haya cambios: actualizar sin reinstalar

Cuando la app ya está instalada con el build del paso 4, los cambios de pantallas, textos y lógica se mandan así, sin compilar:

```bash
git pull
```

```bash
npm install
```

```bash
npx eas-cli@latest update --channel preview --environment preview --message "qué cambió"
```

En el teléfono: abre El Play (o sal y vuelve a entrar). Sale el aviso **«Hay una versión nueva de El Play»** → toca **Actualizar**. Si no lo tocas, se pone sola la próxima vez que abras la app. Si no sale, cierra la app del todo (quítala de las recientes), ábrela y espera unos segundos.

Cuando publiques en las tiendas, el mismo comando con `production`:

```bash
npx eas-cli@latest update --channel production --environment production --message "qué cambió"
```

### Cuándo hace falta un build nuevo (repetir 4.4 y 4.5)

`eas update` solo manda JavaScript. Hace falta compilar de nuevo si el cambio:

- agregó, quitó o subió de versión una librería con código nativo (cambió `package.json`), o subió de SDK;
- cambió `app.json` (nombre, ícono, splash, permisos, plugins).

No tienes que adivinar: `runtimeVersion` con `fingerprint` lo detecta. Si cambió algo nativo, la actualización no llega a los builds viejos (no se rompen, siguen como estaban). Orden correcto: **primero `eas build`, después `eas update`**. En expo.dev cada build y cada update muestran su *runtime version*: si un update no llega, compáralos.

---

## 6. Aparte: Supabase (no es del teléfono, pero la app lo usa)

Para que salgan las herramientas del dueño de una liga (renombrar, sacar a alguien, borrar la liga), corre una vez el archivo `supabase/2026-11-11-ligas.sql` del repo de la web (`el-play`, rama `main`):

1. [supabase.com/dashboard](https://supabase.com/dashboard) → proyecto de El Play → **SQL Editor** → **New query**.
2. Pega todo el contenido del archivo y dale **Run**.

Sin eso todo lo demás funciona igual; solo se esconden esos botones.

---

## 7. Development build (opcional, para programar)

Si vas a programar algo que Expo Go no trae (por ejemplo «Seguir el juego»), haz tu propia app de desarrollo una vez:

```bash
npx eas-cli@latest build --profile development --platform android
```

Instala ese APK y luego arranca **sin** `--go`:

```bash
npx expo start
```

La app de desarrollo se conecta sola a tu PC, igual que Expo Go.

---

## 8. Problemas comunes

| Problema | Solución |
| --- | --- |
| Expo Go dice que el proyecto es incompatible con su versión | Actualiza Expo Go. Si la tienda ya trae un SDK más nuevo que el 58, usa el development build (paso 7) o el APK (paso 4). |
| El QR abre pero se queda cargando o «could not connect» | PC y teléfono en el mismo Wi-Fi, o `npx expo start --go --tunnel`. |
| Expo Go dice «No development build installed» | Arrancaste sin `--go`: aprieta `s` en la terminal o vuelve a arrancar con `npx expo start --go`. |
| El Fantasy dice que no hay cuentas | Expo Go: falta la llave en `.env.local` (paso 2), reinicia `npx expo start --go`. APK: falta en EAS (paso 4.3) y hace falta otro build. |
| Después del login no vuelve a la app | Faltan `exp://**` y `elplay://**` en Supabase → Redirect URLs. |
| «App no instalada» al poner el APK | Desinstala El Play viejo y vuelve a instalar. |
| No sale «Hay una versión nueva» | El build es de antes del paso 4.2, el update fue a otro canal (`preview` vs `production`) o cambió algo nativo: haz un build nuevo. |
| `Node.js (v20…) is outdated` | Instala Node 22 LTS o 24 LTS. |
| `npm install` o `eas` fallan con errores de certificado | Pasa en la red de la oficina: hazlo desde otra red (la casa). |
| No ves el ícono ni la pantalla de inicio nuevos | En Expo Go no salen; se ven en el APK. |

Más detalle: [README](../README.md) (cómo correrla y «Actualizar sin reinstalar») y [TIENDAS.md](TIENDAS.md) (publicar en App Store y Google Play).
