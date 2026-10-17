-- El Play · cuentas y fantasy en Supabase
-- Se corre una vez en el SQL Editor del proyecto. Crea los perfiles, los equipos de fantasy por día y las ligas
-- privadas, con seguridad por filas (cada quien escribe solo lo suyo; la tabla de puntos se puede leer).

-- Perfiles: el nombre que se ve en la tabla
create table if not exists public.profiles (
    id uuid primary key references auth.users (id) on delete cascade,
    display_name text check (char_length(display_name) <= 30),
    created_at timestamptz not null default now()
);

-- Un equipo por usuario, liga y día
create table if not exists public.fantasy_entries (
    user_id uuid not null references auth.users (id) on delete cascade,
    league text not null check (league in ('lidom', 'wbc', 'sdc')),
    day date not null,
    lineup integer[] not null default '{}' check (cardinality(lineup) <= 6),
    captain integer,
    picks jsonb not null default '{}',
    saved_at bigint not null,
    primary key (user_id, league, day)
);
create index if not exists fantasy_entries_day on public.fantasy_entries (league, day);

-- Para que la tabla muestre el nombre del dueño de cada equipo (fantasy_entries → profiles)
alter table public.fantasy_entries drop constraint if exists fantasy_entries_profile_fk;
alter table public.fantasy_entries add constraint fantasy_entries_profile_fk foreign key (user_id) references public.profiles (id) on delete cascade deferrable initially deferred;

-- Ligas privadas con código
create table if not exists public.leagues (
    id uuid primary key default gen_random_uuid(),
    name text not null check (char_length(name) between 1 and 40),
    code text not null unique,
    owner uuid not null references auth.users (id) on delete cascade,
    created_at timestamptz not null default now()
);
create table if not exists public.league_members (
    league_id uuid not null references public.leagues (id) on delete cascade,
    user_id uuid not null references auth.users (id) on delete cascade,
    joined_at timestamptz not null default now(),
    primary key (league_id, user_id)
);

-- Perfil automático al crear la cuenta, sin nombre: el nombre lo elige cada quien en la app.
-- Nunca se toma del correo (el nombre es público y se puede buscar).
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
    insert into public.profiles (id) values (new.id) on conflict do nothing;
    return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
-- Cuentas creadas antes de correr este script (p. ej. una de prueba desde el panel): también llevan perfil, sin nombre
insert into public.profiles (id) select id from auth.users on conflict do nothing;

-- Crear y unirse a ligas (el código lo genera la base de datos)
create or replace function public.create_league(league_name text) returns table (code text) language plpgsql security definer set search_path = public as $$
declare new_code text; new_id uuid;
begin
    if auth.uid() is null then raise exception 'not_signed_in'; end if;
    loop
        new_code := upper(substr(md5(random()::text), 1, 6));
        exit when not exists (select 1 from public.leagues l where l.code = new_code);
    end loop;
    insert into public.leagues (name, code, owner) values (league_name, new_code, auth.uid()) returning id into new_id;
    insert into public.league_members (league_id, user_id) values (new_id, auth.uid());
    return query select new_code;
end $$;

create or replace function public.join_league(league_code text) returns void language plpgsql security definer set search_path = public as $$
declare target uuid;
begin
    if auth.uid() is null then raise exception 'not_signed_in'; end if;
    select id into target from public.leagues where code = upper(league_code);
    if target is null then raise exception 'league_not_found'; end if;
    insert into public.league_members (league_id, user_id) values (target, auth.uid()) on conflict do nothing;
end $$;

-- Seguridad por filas
alter table public.profiles enable row level security;
alter table public.fantasy_entries enable row level security;
alter table public.leagues enable row level security;
alter table public.league_members enable row level security;

drop policy if exists "perfiles visibles" on public.profiles;
create policy "perfiles visibles" on public.profiles for select using (true);
drop policy if exists "mi perfil" on public.profiles;
create policy "mi perfil" on public.profiles for all using (auth.uid() = id) with check (auth.uid() = id);

-- La tabla se puede leer; cada quien escribe solo sus equipos y solo del día de hoy en adelante (hora de RD)
drop policy if exists "equipos visibles" on public.fantasy_entries;
create policy "equipos visibles" on public.fantasy_entries for select using (true);
drop policy if exists "mis equipos" on public.fantasy_entries;
create policy "mis equipos" on public.fantasy_entries for insert with check (auth.uid() = user_id and day >= (now() at time zone 'America/Santo_Domingo')::date);
drop policy if exists "mis equipos cambian" on public.fantasy_entries;
create policy "mis equipos cambian" on public.fantasy_entries for update using (auth.uid() = user_id and day >= (now() at time zone 'America/Santo_Domingo')::date);

-- Ligas: las ven sus miembros; se crean y se unen con las funciones de arriba.
-- La pertenencia se revisa con una función (una política que consulta su propia tabla entra en recursión).
create or replace function public.is_league_member(target uuid) returns boolean language sql stable security definer set search_path = public as $$
    select exists (select 1 from public.league_members where league_id = target and user_id = auth.uid())
$$;
drop policy if exists "mis ligas" on public.leagues;
create policy "mis ligas" on public.leagues for select using (public.is_league_member(id));
drop policy if exists "miembros de mis ligas" on public.league_members;
create policy "miembros de mis ligas" on public.league_members for select using (public.is_league_member(league_id));
drop policy if exists "salir de una liga" on public.league_members;
create policy "salir de una liga" on public.league_members for delete using (auth.uid() = user_id);

-- Permisos de la API (algunos proyectos nuevos ya no los dan solos a las tablas nuevas)
grant usage on schema public to anon, authenticated;
grant select on public.profiles, public.fantasy_entries to anon, authenticated;
grant insert, update on public.profiles, public.fantasy_entries to authenticated;
grant select on public.leagues, public.league_members to authenticated;
grant delete on public.league_members to authenticated;
grant execute on function public.is_league_member(uuid) to anon, authenticated;
grant execute on function public.create_league(text), public.join_league(text) to authenticated;

-- Borrar la cuenta desde la app (lo pide la App Store): se van el perfil, los equipos y las ligas que creó
create or replace function public.delete_my_account() returns void language plpgsql security definer set search_path = public, auth as $$
begin
    if auth.uid() is null then raise exception 'not_signed_in'; end if;
    delete from auth.users where id = auth.uid();
end $$;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- Buscador de fanáticos (también en 2026-10-17-buscador.sql para bases que ya existían).
-- Antes el perfil nacía con el inicio del correo como nombre; con el buscador eso expondría parte del correo.
-- Se borran solo los nombres que son exactamente el inicio del correo (chr(64) es la arroba); el resto se queda.
update public.profiles p set display_name = null from auth.users u where u.id = p.id and p.display_name = split_part(u.email, chr(64), 1);
-- El buscador hace display_name ILIKE '%texto%': un btree no sirve con el comodín al principio; un índice de trigramas sí.
-- En Supabase las extensiones van en el esquema extensions.
create extension if not exists pg_trgm with schema extensions;
drop index if exists public.profiles_display_name_lower;
create index if not exists profiles_display_name_trgm on public.profiles using gin (display_name extensions.gin_trgm_ops);

-- Fantasy sin trampas (también en 2026-10-17-antitrampa.sql para bases que ya existían): la base anota con su hora
-- cuándo entró y salió cada pelotero y cuándo cambiaron el capitán y cada pronóstico. La app y el servidor puntúan
-- cada juego con lo que había cuando empezó.
alter table public.fantasy_entries add column if not exists history jsonb;

create or replace function public.fantasy_entry_history() returns trigger language plpgsql set search_path = public as $$
declare
    stamp bigint := floor(extract(epoch from now()) * 1000)::bigint;
    h jsonb;
    before_lineup integer[] := '{}';
    before_captain integer;
    before_picks jsonb := '{}'::jsonb;
    player integer;
    game text;
    spans jsonb;
    last_span integer;
begin
    if tg_op = 'UPDATE' then
        -- Un equipo no se muda de cuenta, de liga ni de día
        if new.user_id is distinct from old.user_id or new.league is distinct from old.league or new.day is distinct from old.day then
            raise exception 'fantasy_entry_key_locked';
        end if;
        before_lineup := coalesce(old.lineup, '{}');
        before_captain := old.captain;
        before_picks := coalesce(old.picks, '{}'::jsonb);
        h := old.history;
        if h is null then
            -- Fila de antes de este arreglo: lo que ya tenía vale desde siempre (0)
            h := jsonb_build_object('v', 1, 'players', '{}'::jsonb, 'captain', '[]'::jsonb, 'picks', '{}'::jsonb);
            for player in select distinct unnest(before_lineup) loop
                h := jsonb_set(h, array['players', player::text], jsonb_build_array(jsonb_build_array(0, null)));
            end loop;
            if before_captain is not null then
                h := jsonb_set(h, '{captain}', jsonb_build_array(jsonb_build_array(before_captain, 0)));
            end if;
            for game in select jsonb_object_keys(before_picks) loop
                h := jsonb_set(h, array['picks', game], jsonb_build_array(jsonb_build_array(before_picks -> game, 0)));
            end loop;
        end if;
    else
        h := jsonb_build_object('v', 1, 'players', '{}'::jsonb, 'captain', '[]'::jsonb, 'picks', '{}'::jsonb);
    end if;

    new.lineup := coalesce(new.lineup, '{}');
    new.picks := coalesce(new.picks, '{}'::jsonb);

    -- Entra un pelotero: tramo nuevo desde ahora (si ya tenía uno abierto, sigue ese)
    for player in select distinct unnest(new.lineup) loop
        spans := coalesce(h -> 'players' -> player::text, '[]'::jsonb);
        if jsonb_array_length(spans) = 0 or (spans -> -1 -> 1) <> 'null'::jsonb then
            h := jsonb_set(h, array['players', player::text], spans || jsonb_build_array(jsonb_build_array(stamp, null)));
        end if;
    end loop;
    -- Sale un pelotero: se cierra su tramo abierto
    for player in select distinct unnest(before_lineup) loop
        if not (player = any(new.lineup)) then
            spans := coalesce(h -> 'players' -> player::text, '[]'::jsonb);
            last_span := jsonb_array_length(spans) - 1;
            if last_span >= 0 and (spans -> last_span -> 1) = 'null'::jsonb then
                h := jsonb_set(h, array['players', player::text, last_span::text, '1'], to_jsonb(stamp));
            end if;
        end if;
    end loop;
    -- Capitán
    if new.captain is distinct from before_captain then
        h := jsonb_set(h, '{captain}', coalesce(h -> 'captain', '[]'::jsonb) || jsonb_build_array(jsonb_build_array(new.captain, stamp)));
    end if;
    -- Pronósticos que cambiaron (o se quitaron)
    for game in select jsonb_object_keys(new.picks) union select jsonb_object_keys(before_picks) loop
        if (new.picks -> game) is distinct from (before_picks -> game) then
            h := jsonb_set(h, array['picks', game], coalesce(h -> 'picks' -> game, '[]'::jsonb) || jsonb_build_array(jsonb_build_array(coalesce(new.picks -> game, 'null'::jsonb), stamp)));
        end if;
    end loop;

    -- Un equipo normal cambia unas decenas de veces al día; esto frena a quien lo llene a propósito
    if pg_column_size(h) > 65536 then
        raise exception 'fantasy_history_full';
    end if;
    new.history := h;
    return new;
end $$;

drop trigger if exists fantasy_entries_history on public.fantasy_entries;
create trigger fantasy_entries_history before insert or update on public.fantasy_entries for each row execute function public.fantasy_entry_history();

-- Que la API vea las tablas nuevas enseguida
notify pgrst, 'reload schema';
