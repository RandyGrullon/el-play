# Avisos con la app cerrada

La app ya avisa con la app **abierta** (10 minutos antes, playball, final, juego sin hit y tu equipo del Fantasy).
Para que los avisos lleguen también con la app **cerrada** faltan tres cosas que haces tú (una sola vez). Hasta
entonces, en Más → Avisos sale «Todavía no están disponibles» y todo lo demás funciona igual.

## 1. Las llaves

En la carpeta del proyecto:

```bash
node scripts/llaves-avisos.js
```

Salen cuatro líneas (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` y `PUSH_SECRET`). No las pegues en
ningún chat ni las subas al repositorio.

## 2. Vercel

Vercel → el proyecto → Settings → Environment Variables (Production): agrega las cuatro. En `VAPID_SUBJECT` pon
`mailto:` y tu correo. Vuelve a desplegar para que las tome.

## 3. Supabase

1. Database → Extensions: activa **pg_cron** y **pg_net**.
2. Abre `supabase/2026-10-23-avisos-push.sql`, cambia `CAMBIA-ESTE-SECRETO-POR-UNO-LARGO-TUYO` por el mismo
   `PUSH_SECRET` de Vercel y córrelo en el SQL Editor.

Desde ese momento Supabase llama cada minuto a `/api/v2/push/run` y el servidor manda los avisos que toquen.

## Cómo probarlo

1. En el teléfono, abre la app instalada (en iPhone tiene que estar en la pantalla de inicio, iOS 16.4 o más).
2. Más → Avisos → «Activar avisos» y acepta el permiso.
3. Pon la campana en un juego que empiece pronto y cierra la app: 10 minutos antes llega el aviso.

En Supabase, `select * from cron.job_run_details order by start_time desc limit 5;` muestra si el cron está
corriendo, y en Vercel → Logs se ven las llamadas a `/api/v2/push/run`.
