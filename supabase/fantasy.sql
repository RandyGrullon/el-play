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

-- Perfil automático al crear la cuenta (nombre = inicio del correo)
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
    insert into public.profiles (id, display_name) values (new.id, split_part(new.email, '@', 1)) on conflict do nothing;
    return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
-- Cuentas creadas antes de correr este script (p. ej. una de prueba desde el panel): también llevan perfil
insert into public.profiles (id, display_name) select id, split_part(email, '@', 1) from auth.users on conflict do nothing;

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

-- Que la API vea las tablas nuevas enseguida
notify pgrst, 'reload schema';
