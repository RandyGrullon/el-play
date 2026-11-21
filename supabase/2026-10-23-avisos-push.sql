-- El Play · avisos con la app cerrada (Web Push)
-- Se corre una vez en el SQL Editor de Supabase, DESPUÉS de cambiar el secreto de abajo por uno tuyo (el mismo que
-- pongas en Vercel como PUSH_SECRET). Antes: Database → Extensions → activar pg_cron y pg_net.
-- Todo pide el secreto, también guardar y borrar suscripciones: solo el servidor (que lo tiene) las toca, después de
-- revisarlas, y nadie más ve a quién se avisa ni puede llenar la tabla con la llave pública de la app.
-- Se puede volver a correr (por ejemplo, para cambiar el secreto): no borra las suscripciones.

create table if not exists public.push_subscriptions (
    endpoint text primary key check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
    p256dh text not null check (char_length(p256dh) <= 120),
    auth text not null check (char_length(auth) <= 40),
    games integer[] not null default '{}' check (cardinality(games) <= 40),
    teams integer[] not null default '{}' check (cardinality(teams) <= 6),
    kinds jsonb not null default '{}',
    lang text not null default 'es' check (lang in ('es', 'en')),
    updated_at timestamptz not null default now()
);

-- Avisos ya mandados (para no repetirlos si dos pasadas del cron coinciden); se limpian solos a los 3 días
create table if not exists public.push_log (
    key text primary key,
    sent_at timestamptz not null default now()
);

-- El secreto del cron (una sola fila)
create table if not exists public.push_settings (
    id integer primary key default 1 check (id = 1),
    secret text not null check (char_length(secret) >= 24)
);
insert into public.push_settings (id, secret) values (1, 'CAMBIA-ESTE-SECRETO-POR-UNO-LARGO-TUYO')
on conflict (id) do update set secret = excluded.secret;

-- El secreto de ejemplo está en el repositorio: con él cualquiera podría leer las suscripciones. Si no lo cambiaste,
-- aquí se detiene y no queda nada hecho.
do $$
begin
    if exists (select 1 from public.push_settings where id = 1 and secret like 'CAMBIA-ESTE-SECRETO%') then
        raise exception 'Cambia CAMBIA-ESTE-SECRETO-POR-UNO-LARGO-TUYO por el PUSH_SECRET de Vercel y vuelve a correrlo';
    end if;
end $$;

-- Sin políticas: con la seguridad por filas encendida, nadie lee ni escribe estas tablas directo (solo las funciones)
alter table public.push_subscriptions enable row level security;
alter table public.push_log enable row level security;
alter table public.push_settings enable row level security;

-- Antes guardar y borrar no pedían el secreto: se quitan esas versiones si ya estaban
drop function if exists public.push_save(text, text, text, integer[], integer[], jsonb, text);
drop function if exists public.push_delete(text);

create or replace function public.push_ok(run_secret text) returns boolean language sql stable security definer set search_path = public as $$
    select exists (select 1 from public.push_settings where id = 1 and secret = run_secret)
$$;

create or replace function public.push_save(run_secret text, sub_endpoint text, sub_p256dh text, sub_auth text, sub_games integer[], sub_teams integer[], sub_kinds jsonb, sub_lang text)
returns void language plpgsql security definer set search_path = public as $$
begin
    if not public.push_ok(run_secret) then raise exception 'unauthorized'; end if;
    insert into public.push_subscriptions (endpoint, p256dh, auth, games, teams, kinds, lang, updated_at)
    values (sub_endpoint, sub_p256dh, sub_auth, coalesce(sub_games, '{}'), coalesce(sub_teams, '{}'), coalesce(sub_kinds, '{}'), coalesce(sub_lang, 'es'), now())
    on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth, games = excluded.games, teams = excluded.teams, kinds = excluded.kinds, lang = excluded.lang, updated_at = now();
end $$;

create or replace function public.push_delete(run_secret text, sub_endpoint text) returns void language plpgsql security definer set search_path = public as $$
begin
    if not public.push_ok(run_secret) then raise exception 'unauthorized'; end if;
    delete from public.push_subscriptions where endpoint = sub_endpoint;
end $$;

create or replace function public.push_targets(run_secret text) returns setof public.push_subscriptions language plpgsql stable security definer set search_path = public as $$
begin
    if not public.push_ok(run_secret) then raise exception 'unauthorized'; end if;
    -- Las que no se han tocado en 60 días ya no se usan
    return query select * from public.push_subscriptions where updated_at > now() - interval '60 days';
end $$;

create or replace function public.push_claim(run_secret text, event_key text) returns boolean language plpgsql security definer set search_path = public as $$
declare inserted integer;
begin
    if not public.push_ok(run_secret) then raise exception 'unauthorized'; end if;
    delete from public.push_log where sent_at < now() - interval '3 days';
    insert into public.push_log (key) values (event_key) on conflict do nothing;
    get diagnostics inserted = row_count;
    return inserted = 1;
end $$;

create or replace function public.push_forget(run_secret text, sub_endpoint text) returns void language plpgsql security definer set search_path = public as $$
begin
    if not public.push_ok(run_secret) then raise exception 'unauthorized'; end if;
    delete from public.push_subscriptions where endpoint = sub_endpoint;
end $$;

revoke all on function public.push_ok(text) from public, anon, authenticated;
-- El servidor llama con la llave pública de la app (anon): sin el secreto, todas dicen «unauthorized»
grant execute on function public.push_save(text, text, text, text, integer[], integer[], jsonb, text), public.push_delete(text, text) to anon, authenticated;
grant execute on function public.push_targets(text), public.push_claim(text, text), public.push_forget(text, text) to anon, authenticated;

-- Cada minuto, Supabase le pide al servidor que revise los juegos y mande los avisos que toquen
select cron.unschedule('el-play-avisos') where exists (select 1 from cron.job where jobname = 'el-play-avisos');
select cron.schedule(
    'el-play-avisos',
    '* * * * *',
    $$ select net.http_post(
        url := 'https://elplay.grullonb.com/api/v2/push/run',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', (select secret from public.push_settings where id = 1)),
        body := '{}'::jsonb
    ) $$
);
