# Seguir el juego en segundo plano

En la vista en vivo de un juego hay un botón **«Seguir en segundo plano»**. Al tocarlo, el marcador sale fuera de la app:

- **iPhone:** una **Live Activity** en la pantalla bloqueada y en la isla dinámica.
- **Android:** una **notificación fija** con el marcador.

Tocar la actividad o la notificación abre ese juego en la app (`elplay://juego/<gamePk>`). El botón cambia a **«Dejar de seguir»** mientras se sigue. Se sigue un juego a la vez: si sigues otro, el anterior se quita.

Está hecho con `expo-widgets` (Expo SDK 58), sin código nativo propio. **No funciona en Expo Go ni en la web:** ahí el botón no sale (la app revisa si existe el módulo nativo `ExpoWidgets`). Hace falta un **development build** (sección 4).

## 1. Qué se ve

| Dónde | Qué muestra |
| --- | --- |
| Pantalla bloqueada (iPhone) | Marcador partido en los colores de los dos equipos, entrada ▲/▼ y outs en el medio; bases, bolas y strikes, bateador y lanzador; la última jugada en una línea; «Actualizado 9:40 p. m.» |
| Isla dinámica, compacta | Sigla del visitante y sus carreras a la izquierda; carreras y sigla del local a la derecha |
| Isla dinámica, mínima | El marcador («11-1»), cuando hay otra actividad abierta |
| Isla dinámica, expandida | Equipos (sigla en el color del equipo) y carreras, «Alta de la 7.ª» con los outs, bases, conteo, duelo y la última jugada |
| Android, plegada | Siglas y marcador; debajo «Alta de la 7.ª · 2 outs · 2-2» |
| Android, expandida | Los dos equipos con su color y carreras, la situación, bases, duelo, última jugada, la hora y el botón «Dejar de seguir» |

Al terminar el juego queda el **marcador final** unos 20 minutos y después se quita solo.

Los logos de MLB son SVG y ni la Live Activity ni la notificación pueden pintar SVG: por eso van las **siglas** en el color del equipo. Para poner logos habría que tener PNG y copiarlos a `widgetsDirectory` desde la app.

## 2. Qué funciona ya (sin servidor)

- **Con la app abierta** (en el juego o en cualquier otra pantalla), cada lectura nueva del juego (cada ~5 s en vivo) actualiza la actividad o la notificación. Solo se manda si cambió algo; si nada cambia, se manda una vez cada 2 minutos para que no se marque como vieja.
- **Al salir de la app o bloquear el teléfono**, la actividad y la notificación **se quedan** con la última jugada. El sistema congela la app a los pocos segundos, así que ya no cambian solas:
  - **iPhone:** a los 4 minutos sin lecturas la Live Activity se marca como desactualizada (`staleDate`): se atenúa y dice «Sin actualizar · abre El Play». iOS deja una Live Activity activa **hasta 8 horas** (después la termina el sistema y puede quedar hasta 4 horas más en la pantalla bloqueada).
  - **Android:** la notificación dice «Actualizado 9:40 p. m.» y, si pasan 30 minutos sin lecturas, se quita sola (para que no quede un marcador viejo fijo).
- **Al volver a la app** se pone al día enseguida.
- **Al reabrir la app** (en cualquier pantalla, o tocando la actividad), se recupera la que estaba abierta (`getInstances` en iPhone, `getActive` en Android) y se sigue actualizando. Las que sobran se quitan; el marcador final de Android se deja hasta que se va solo. Lo hace `src/lib/follow.ts`, que `src/app/_layout.tsx` importa al arrancar.
- **Dejar de seguir:** con el botón de la app; en el iPhone también deslizando la actividad en la pantalla bloqueada; en Android con el botón «Dejar de seguir» de la notificación (y en Android 14 o más nuevo, deslizándola).

## 3. Qué NO funciona todavía: que se actualice sola con la app cerrada

Para que la pantalla bloqueada cambie con cada carrera **aunque la app esté cerrada del todo**, alguien tiene que mandarle las jugadas al teléfono: eso es **push**. La sección 6 tiene el plan.

## 4. Cómo probarlo en un teléfono

`expo-widgets` tiene código nativo (en iPhone agrega una extensión, `ExpoWidgetsTarget`), así que no corre en Expo Go. Se necesita un development build, que ya está configurado en `eas.json` (perfil `development`, con `expo-dev-client` instalado):

```bash
npx eas-cli@latest build --profile development --platform android
npx eas-cli@latest build --profile development --platform ios
```

- **Android:** instala el APK que te da EAS. La primera vez que toques «Seguir en segundo plano», la app pide permiso para las notificaciones y crea el canal **«Juego en segundo plano»** (importancia baja: no suena ni vibra en cada jugada y se ve en la pantalla bloqueada).
- **iPhone:** necesitas la cuenta de Apple Developer (US$99/año). EAS registra solo el **App Group** `group.com.grullonb.elplay` y el identificador de la extensión `com.grullonb.elplay.ExpoWidgetsTarget` cuando le das acceso a tu cuenta de Apple. Para instalar el build en tu iPhone, registra el teléfono con `npx eas-cli@latest device:create`. Hace falta iOS 16.4 o más nuevo (es el mínimo de la app) y que las Live Activities estén encendidas en **Ajustes → El Play → Actividades en vivo** (si están apagadas, la app lo dice y ofrece abrir Ajustes).

Después, en el teléfono:

1. Abre el development build y carga el proyecto con `npx expo start` (en la misma red).
2. Entra a un juego **en vivo** y toca **«Seguir en segundo plano»**.
3. Bloquea el teléfono (iPhone: mira también la isla dinámica en otra app; mantén pulsada la isla para verla expandida). En Android baja la cortina de notificaciones y expándela.
4. Vuelve a la app, espera una jugada y revisa que cambie.
5. Prueba «Dejar de seguir» desde la app y desde la notificación (Android).
6. Cierra la app del todo, ábrela desde el ícono (sin entrar al juego) y revisa que la actividad o la notificación vuelva a actualizarse. Pruébalo también en un build `preview` o `production`: en `development` Expo Router carga todas las rutas al arrancar y esconde los fallos de lo que solo se carga al abrir una pantalla.

## 5. Cómo está hecho

| Archivo | Qué hace |
| --- | --- |
| `src/live/LiveGame.tsx` | La Live Activity (`createLiveActivity('LiveGame', …)`): banner de la pantalla bloqueada y las regiones de la isla, con componentes de `@expo/ui/swift-ui` |
| `src/live/GameNotification.tsx` | La notificación de Android (`createCustomNotification('GameNotification', …)`) con componentes de `@expo/ui/jetpack-compose` |
| `src/live/props.ts` | Del detalle del juego a lo que se muestra (siglas, colores, marcador, «Alta de la 7.ª», outs, conteo, bases, duelo, última jugada) en el idioma de la app |
| `src/live/surface.ios.ts` / `surface.android.ts` / `surface.ts` | Empezar, actualizar, terminar y recuperar en cada sistema (Metro escoge el archivo según la plataforma; `surface.ts` es la web: nada) |
| `src/lib/follow.ts` | Qué juego se sigue (se guarda en el teléfono), actualizar con cada lectura, terminar al final, recuperar al abrir la app; el botón no sale si no hay `ExpoWidgets` |
| `src/app/juego/[gamePk].tsx` | El botón en la vista en vivo y la llamada que manda cada lectura de `useGame` |
| `app.json` | Plugin `expo-widgets` con `bundleIdentifier`, `groupIdentifier`, `enablePushNotifications: false` y `frequentUpdates: false` |

Reglas de `expo-widgets` que hay que respetar al tocar `LiveGame.tsx` o `GameNotification.tsx`: la función lleva la directiva `'widget'` y corre **aparte** (en la extensión del iPhone o en el proceso de la notificación). Ahí no hay hooks, no se puede importar nada y no se puede usar nada declarado fuera de la función, ni siquiera una constante del mismo archivo; todo llega por las props. Solo componentes y modificadores de `@expo/ui/swift-ui` (iPhone) o `@expo/ui/jetpack-compose` (Android). No se agrega nada en `widgets[]` del plugin: eso es para widgets de la pantalla de inicio.

Diferencias con el diseño (`pro-segundo-plano`):

- **Android, «Abrir juego»:** es tocar la notificación. Los botones dentro de una notificación de `expo-widgets` solo mandan un aviso a la app (no pueden abrirla), y las acciones del sistema («Abrir juego / Dejar de seguir» abajo) no están en su API. «Dejar de seguir» sí es un botón: si la app está viva, la quita al momento; si estaba cerrada, la notificación dice «Ya no sigues este juego» y se quita al abrir la app (o sola a los 30 minutos de tocar el botón).
- **iPhone:** sin botones en la actividad (se quita deslizándola).
- Probabilidad de ganar, «Te lo perdiste», alertas por tipo de jugada y activarse solo para tu equipo: no están en esta entrega.

## 6. Plan para el push (que se actualice con la app cerrada)

Nada de esto está desplegado. Es la propuesta.

### Cómo funciona

1. Cuando alguien toca «Seguir», la app manda a Supabase el **token** de esa actividad (iPhone) o del teléfono (Android) y el `gamePk`.
2. Cada minuto, **pg_cron** llama una **Edge Function** de Supabase.
3. La función mira los juegos en vivo en `https://elplay.grullonb.com/api/v2/schedule`, pide `https://elplay.grullonb.com/api/v2/game/<pk>` de los que alguien sigue, arma lo que se muestra y lo manda si cambió o si pasaron 3 minutos sin mandar nada (latido: así no se marca «Sin actualizar» en una pausa larga, un cambio de lanzador o una revisión):
   - **iPhone:** a **APNs** con `apns-push-type: liveactivity` y `apns-topic: com.grullonb.elplay.push-type.liveactivity`. El `content-state` lleva `name: "LiveGame"` y `props` con las mismas props de la app en JSON. Al final manda `event: "end"`.
   - **Android:** a **FCM** un mensaje de datos con las props; la app lo recibe en segundo plano y redibuja la notificación.

### Lo que necesitas

| Qué | Para qué | Costo |
| --- | --- | --- |
| Supabase (el proyecto que ya usa El Play) | Tabla, Edge Function y pg_cron | Gratis: el plan Free trae 500 000 llamadas de Edge Functions al mes y una por minuto son ~43 000 |
| Apple Developer Program | La llave **.p8** de APNs (Certificates, Identifiers & Profiles → Keys → Apple Push Notifications service). Anota el **Key ID** y tu **Team ID** | US$99 al año (la misma cuenta de la App Store) |
| Proyecto de Firebase | FCM para Android: `google-services.json` en la app y una **cuenta de servicio** (JSON) para la función | Gratis (plan Spark) |

Ojo: los proyectos gratis de Supabase se pausan si pasan una semana sin uso; revisa que El Play lo mantenga activo.

### Cambios en la app cuando llegue el push

- `app.json`, plugin `expo-widgets`: `"enablePushNotifications": true` (agrega el permiso `aps-environment`) y `"frequentUpdates": true` (iOS deja más actualizaciones por push).
- `app.json`, plugin `expo-notifications`: `"enableRemoteNotifications": true` y `android.googleServicesFile: "./google-services.json"`.
- `src/live/surface.ios.ts`: después de `start`, leer `instance.getPushToken()` y escuchar `instance.addPushTokenListener()` (el token puede cambiar) y mandarlo a la función con `action: "follow"` (con `gamePk`, `activityId`, `lang` y `timeZone`). Al dejar de seguir, `action: "unfollow"`.
- Android: el token del teléfono sale de `Notifications.getDevicePushTokenAsync()`. Para recibir el mensaje con la app cerrada hace falta una tarea en segundo plano (`expo-task-manager` + `Notifications.registerTaskAsync`) que llame `gameNotification.update(props)`.
- Un nuevo development build (cambian permisos nativos).

### Tabla en Supabase (SQL)

```sql
-- Quién sigue qué juego y a qué token se le manda
create table public.live_follows (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('ios', 'android')),
  game_pk bigint not null,
  -- iOS: token de la Live Activity (hex). Android: token FCM del teléfono
  token text not null,
  -- iOS: id de ActivityKit. Android: id de la notificación (juego-<gamePk>)
  activity_id text,
  lang text not null default 'es' check (lang in ('es', 'en')),
  -- Para la hora de «Actualizado …»
  time_zone text not null default 'America/Santo_Domingo',
  -- Lo último que se mandó, para no repetir
  last_key text,
  last_runs text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ended_at timestamptz,
  unique (platform, token, game_pk)
);

create index live_follows_activos on public.live_follows (game_pk) where ended_at is null;

-- Sin políticas: nadie la lee ni la escribe con la llave anónima; solo la Edge Function (service role)
alter table public.live_follows enable row level security;

-- El JWT de APNs compartido entre arranques de la función: Apple rechaza renovarlo más de una vez cada 20 minutos
-- (429 TooManyProviderTokenUpdates) y cada arranque en frío de la Edge Function empieza sin memoria
create table public.live_push_tokens (
  name text primary key,
  token text not null,
  issued_at timestamptz not null
);
alter table public.live_push_tokens enable row level security;
```

### Llamada cada minuto (pg_cron + pg_net)

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- El secreto se guarda en Vault: select vault.create_secret('<un texto largo al azar>', 'live_push_secret');
select cron.schedule(
  'el-play-live-push',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://<proyecto>.supabase.co/functions/v1/live-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <llave anon>',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'live_push_secret')
    ),
    body := '{"action":"tick"}'::jsonb
  );
  $$
);
```

pg_cron 1.5 o más nuevo también acepta intervalos en segundos (`'20 seconds'`) si un minuto se queda corto.

### Las props en el servidor

La Live Activity pinta exactamente las props que recibe, así que el servidor debe armarlas igual que la app (`src/live/props.ts`). Para no copiar a mano, se empaqueta el mismo código en un archivo para la función (con un sustituto de `react-native`, que solo usa `Platform`):

```bash
# supabase/functions/live-push/rn-stub.js:  export const Platform = { OS: 'web', select: (o) => o.default };
npx esbuild src/live/props.ts --bundle --format=esm --platform=neutral \
  --alias:react-native=./supabase/functions/live-push/rn-stub.js \
  --outfile=supabase/functions/live-push/props.js
```

Repite ese comando cada vez que cambie `src/live/props.ts`.

### Edge Function `live-push` (propuesta)

Secretos de la función (`npx supabase secrets set …`): `CRON_SECRET`, `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_PRIVATE_KEY` (el contenido del .p8), `APNS_PRODUCTION` (`true` para TestFlight/App Store; los development builds usan el sandbox) y `FCM_SERVICE_ACCOUNT` (el JSON de la cuenta de servicio).

```ts
// supabase/functions/live-push/index.ts
// Cada minuto: los juegos que alguien sigue → APNs (Live Activity) y FCM (notificación de Android).
// También recibe de la app «follow» / «unfollow» con el token.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { liveGameProps } from './props.js';

const API = 'https://elplay.grullonb.com/api/v2';
const LEAGUES = ['lidom'];
const TOPIC = 'com.grullonb.elplay.push-type.liveactivity';
const APNS = Deno.env.get('APNS_PRODUCTION') === 'true' ? 'https://api.push.apple.com' : 'https://api.sandbox.push.apple.com';
const STALE_S = 4 * 60;
const FINAL_S = 20 * 60;
/** Aunque nada cambie, se manda cada 3 min (antes de los 4 de stale-date) */
const HEARTBEAT_MS = 3 * 60 * 1000;

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

type Row = { id: string; platform: 'ios' | 'android'; game_pk: number; token: string; activity_id: string | null; lang: string; time_zone: string; last_key: string | null; last_runs: string | null; updated_at: string };
type Sent = { ok: boolean; status: number; reason: string };

Deno.serve(async (req) => {
  const body = await req.json().catch(() => ({}));
  if (body.action === 'tick') {
    if (req.headers.get('x-cron-secret') !== Deno.env.get('CRON_SECRET')) return new Response('no', { status: 401 });
    return Response.json(await tick());
  }
  if (body.action === 'follow') {
    const { platform, gamePk, token, activityId, lang, timeZone } = body;
    if (!['ios', 'android'].includes(platform) || !Number.isInteger(gamePk) || typeof token !== 'string') return new Response('bad', { status: 400 });
    await db.from('live_follows').upsert(
      { platform, game_pk: gamePk, token, activity_id: activityId ?? null, lang: lang === 'en' ? 'en' : 'es', time_zone: typeof timeZone === 'string' ? timeZone : 'America/Santo_Domingo', ended_at: null, last_key: null, updated_at: new Date().toISOString() },
      { onConflict: 'platform,token,game_pk' }
    );
    return Response.json({ ok: true });
  }
  if (body.action === 'unfollow') {
    await db.from('live_follows').update({ ended_at: new Date().toISOString() }).match({ platform: body.platform, token: body.token, game_pk: body.gamePk });
    return Response.json({ ok: true });
  }
  return new Response('bad', { status: 400 });
});

async function tick() {
  const { data: rows } = await db.from('live_follows').select('*').is('ended_at', null);
  if (!rows?.length) return { sent: 0 };

  // Estado de cada juego según el calendario: los que no han empezado no se piden
  const states = new Map<number, string>();
  for (const league of LEAGUES) {
    const schedule = await getJson(`${API}/schedule?league=${league}`);
    for (const game of schedule?.games ?? []) states.set(game.gamePk, game.state);
  }

  let sent = 0;
  const byGame = Map.groupBy(rows as Row[], (row) => row.game_pk);
  for (const [gamePk, follows] of byGame) {
    if (states.get(gamePk) === 'preview') continue;
    const game = await getJson(`${API}/game/${gamePk}`);
    if (!game) continue;
    const final = game.state === 'final';
    for (const row of follows) {
      const props = liveGameProps(game, row.lang, Date.now(), row.time_zone);
      const key = JSON.stringify({ ...props, updated: '' });
      // Sin cambios no se manda, salvo el latido
      if (key === row.last_key && !final && Date.now() - Date.parse(row.updated_at) < HEARTBEAT_MS) continue;
      const runs = `${props.away.runs}-${props.home.runs}`;
      const result = row.platform === 'ios' ? await sendApns(row.token, props, final, runs !== row.last_runs) : await sendFcm(row.token, props, final);
      sent++;
      // Token vencido o actividad quitada: se deja de seguir. Otros 400 de APNs (BadTopic, MissingTopic, TopicDisallowed)
      // son de configuración: tomarlos como «vencido» apagaría todos los seguimientos sin aviso. FCM: 404 es UNREGISTERED
      const gone = row.platform === 'ios' ? result.status === 410 || (result.status === 400 && ['BadDeviceToken', 'ExpiredToken'].includes(result.reason)) : result.status === 404;
      // Falló por otra cosa (configuración, servicio caído): no se marca como mandado y se reintenta el próximo minuto
      if (!result.ok && !gone) continue;
      await db
        .from('live_follows')
        .update({ last_key: key, last_runs: runs, updated_at: new Date().toISOString(), ended_at: final || gone ? new Date().toISOString() : null })
        .eq('id', row.id);
    }
  }
  return { sent };
}

async function getJson(url: string) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  return res.ok ? res.json() : null;
}

// ---------------------------------------------------------------- APNs (Live Activity)

let apnsJwt: { token: string; at: number } | null = null;
const APNS_JWT_MS = 40 * 60 * 1000;

async function apnsToken() {
  // Apple pide renovarlo entre 20 y 60 minutos, y no más seguido: se guarda en la tabla para los otros arranques
  if (apnsJwt && Date.now() - apnsJwt.at < APNS_JWT_MS) return apnsJwt.token;
  const { data: saved } = await db.from('live_push_tokens').select('token, issued_at').eq('name', 'apns').maybeSingle();
  if (saved && Date.now() - Date.parse(saved.issued_at) < APNS_JWT_MS) {
    apnsJwt = { token: saved.token, at: Date.parse(saved.issued_at) };
    return apnsJwt.token;
  }
  const key = await crypto.subtle.importKey('pkcs8', pemToDer(Deno.env.get('APNS_PRIVATE_KEY')!), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const head = b64url(JSON.stringify({ alg: 'ES256', kid: Deno.env.get('APNS_KEY_ID') }));
  const claims = b64url(JSON.stringify({ iss: Deno.env.get('APNS_TEAM_ID'), iat: Math.floor(Date.now() / 1000) }));
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(`${head}.${claims}`));
  apnsJwt = { token: `${head}.${claims}.${b64url(new Uint8Array(signature))}`, at: Date.now() };
  await db.from('live_push_tokens').upsert({ name: 'apns', token: apnsJwt.token, issued_at: new Date(apnsJwt.at).toISOString() });
  return apnsJwt.token;
}

async function sendApns(token: string, props: Record<string, unknown>, final: boolean, scored: boolean): Promise<Sent> {
  const now = Math.floor(Date.now() / 1000);
  const aps: Record<string, unknown> = {
    timestamp: now,
    event: final ? 'end' : 'update',
    // Mismo formato que usa expo-widgets por dentro: nombre de createLiveActivity + props en JSON
    'content-state': { name: 'LiveGame', props: JSON.stringify(props) },
    'stale-date': now + STALE_S
  };
  if (final) aps['dismissal-date'] = now + FINAL_S;
  const res = await fetch(`${APNS}/3/device/${token}`, {
    method: 'POST',
    headers: {
      authorization: `bearer ${await apnsToken()}`,
      'apns-push-type': 'liveactivity',
      'apns-topic': TOPIC,
      // 10 = inmediata (carreras y final); 5 = baja prioridad (lo demás y el latido), no gasta el cupo de iOS
      'apns-priority': final || scored ? '10' : '5'
    },
    body: JSON.stringify({ aps })
  });
  // APNs explica el error en el cuerpo: { "reason": "BadDeviceToken" }
  const reason = res.ok ? '' : (((await res.json().catch(() => ({}))) as { reason?: string }).reason ?? '');
  return { ok: res.ok, status: res.status, reason };
}

// ---------------------------------------------------------------- FCM (Android)

let fcm: { token: string; at: number; project: string } | null = null;

async function fcmToken() {
  if (fcm && Date.now() - fcm.at < 50 * 60 * 1000) return fcm;
  const account = JSON.parse(Deno.env.get('FCM_SERVICE_ACCOUNT')!);
  const key = await crypto.subtle.importKey('pkcs8', pemToDer(account.private_key), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const iat = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({ iss: account.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat, exp: iat + 3600 }));
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${head}.${claims}`));
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${claims}.${b64url(new Uint8Array(signature))}` })
  });
  const { access_token } = await res.json();
  fcm = { token: access_token, at: Date.now(), project: account.project_id };
  return fcm;
}

async function sendFcm(token: string, props: Record<string, unknown>, final: boolean): Promise<Sent> {
  const { token: access, project } = await fcmToken();
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${project}/messages:send`, {
    method: 'POST',
    headers: { authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
    // Mensaje de datos (sin «notification»): lo recibe la tarea en segundo plano de la app y redibuja la notificación
    body: JSON.stringify({ message: { token, data: { type: 'el-play-live', final: String(final), props: JSON.stringify(props) }, android: { priority: 'high', ttl: '120s' } } })
  });
  return { ok: res.ok, status: res.status, reason: '' };
}

// ---------------------------------------------------------------- utilidades

function pemToDer(pem: string) {
  const base64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

function b64url(input: string | Uint8Array) {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
```

Para desplegarla (cuando toque): `npx supabase functions deploy live-push`. Lo primero a comprobar en la prueba: que APNs acepte la conexión desde la Edge Function (APNs exige HTTP/2) y que el iPhone reciba el `update`.

### Límites que hay que tener en cuenta

- iOS reparte un **cupo** de actualizaciones por push con prioridad 10; por eso la función usa 10 solo para carreras y el final, y 5 para lo demás (también para el latido de cada 3 minutos). `frequentUpdates: true` sube ese cupo.
- El JWT de APNs se renueva cada 40 minutos y queda en `live_push_tokens`: Apple responde 429 (`TooManyProviderTokenUpdates`) si se renueva más de una vez cada 20 minutos.
- Una Live Activity dura como máximo 8 horas activa; un juego de pelota cabe de sobra.
- Android puede retrasar los mensajes de datos si el teléfono está en ahorro de batería extremo.

## 7. Pendiente

- Probar en un iPhone y un Android de verdad (aquí solo se probó la web, el empaquetado de Metro para iOS y Android, y que las vistas de la Live Activity y de la notificación corren solas con un juego real).
- El `prebuild` de iOS no corre en Windows (Expo lo salta); lo hace EAS en macOS al compilar. El de Android sí se probó.
- Probar la recuperación al abrir la app (paso 6 de la sección 4) en un build `preview` o `production`, no solo en `development`.
- La altura del banner de la pantalla bloqueada (Apple lo corta pasados 160 pt) está calculada, no medida: revisarla en un iPhone con el texto grande.
