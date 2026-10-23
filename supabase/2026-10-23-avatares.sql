-- El Play · retratos de los peloteros (los genera la PC con docs/GENERADOR-DE-IMAGEN.md)
-- Se corre una vez en el SQL Editor de Supabase, DESPUÉS de cambiar el secreto de abajo por uno tuyo (el mismo que
-- pongas en .env.local como AVATARS_SECRET). Leerlos es público; guardarlos y borrarlos pide el secreto.

create table if not exists public.player_avatars (
    person_id integer primary key check (person_id > 0),
    team_id integer not null check (team_id between 667 and 672),
    season integer not null check (season between 2000 and 2100),
    mime text not null default 'image/webp' check (mime in ('image/webp', 'image/jpeg', 'image/png')),
    -- La imagen en base64 (512 × 512, menos de 200 KB)
    image text not null check (char_length(image) <= 280000),
    sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
    updated_at timestamptz not null default now()
);

-- El secreto de la subida (una sola fila)
create table if not exists public.avatar_settings (
    id integer primary key default 1 check (id = 1),
    secret text not null check (char_length(secret) >= 24)
);
insert into public.avatar_settings (id, secret) values (1, 'CAMBIA-ESTE-SECRETO-POR-UNO-LARGO-TUYO')
on conflict (id) do update set secret = excluded.secret;

alter table public.player_avatars enable row level security;
alter table public.avatar_settings enable row level security;

-- Los retratos son las imágenes que muestra la app: cualquiera los lee. Nadie escribe directo (solo las funciones).
drop policy if exists "retratos visibles" on public.player_avatars;
create policy "retratos visibles" on public.player_avatars for select to anon, authenticated using (true);

create or replace function public.avatar_ok(run_secret text) returns boolean language sql stable security definer set search_path = public as $$
    select exists (select 1 from public.avatar_settings where id = 1 and secret = run_secret and secret <> 'CAMBIA-ESTE-SECRETO-POR-UNO-LARGO-TUYO')
$$;

create or replace function public.avatar_save(run_secret text, p_person_id integer, p_team_id integer, p_season integer, p_mime text, p_image text, p_sha256 text)
returns void language plpgsql security definer set search_path = public as $$
begin
    if not public.avatar_ok(run_secret) then raise exception 'unauthorized'; end if;
    insert into public.player_avatars (person_id, team_id, season, mime, image, sha256, updated_at)
    values (p_person_id, p_team_id, p_season, p_mime, p_image, p_sha256, now())
    on conflict (person_id) do update set team_id = excluded.team_id, season = excluded.season, mime = excluded.mime, image = excluded.image, sha256 = excluded.sha256, updated_at = now();
end $$;

create or replace function public.avatar_delete(run_secret text, p_person_id integer) returns void language plpgsql security definer set search_path = public as $$
begin
    if not public.avatar_ok(run_secret) then raise exception 'unauthorized'; end if;
    delete from public.player_avatars where person_id = p_person_id;
end $$;

revoke all on function public.avatar_ok(text) from public, anon, authenticated;
grant execute on function public.avatar_save(text, integer, integer, integer, text, text, text), public.avatar_delete(text, integer) to anon, authenticated;
