-- El Play · buscador de fanáticos (17 de octubre de 2026)
-- Para la base que ya existe: pegar completo en el SQL Editor de Supabase y correr. Se puede correr más de una vez.
-- El nombre del perfil es público y se puede buscar, así que ya no sale del correo.
-- CORRER ANTES de subir el buscador a main (el push despliega): si no, los nombres sacados del correo quedan buscables
-- y el disparador viejo se lo sigue poniendo a cada cuenta nueva. Para comprobarlo, esto tiene que dar 0:
--   select count(*) from public.profiles p join auth.users u on u.id = p.id where p.display_name = split_part(u.email, chr(64), 1);

-- 1. Las cuentas nuevas nacen sin nombre (lo eligen en la app). El disparador on_auth_user_created sigue igual.
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
    insert into public.profiles (id) values (new.id) on conflict do nothing;
    return new;
end $$;

-- 2. Borrar los nombres que son exactamente el inicio del correo (los puso el disparador viejo; chr(64) es la arroba).
--    Los nombres que la persona eligió se quedan.
update public.profiles p set display_name = null from auth.users u where u.id = p.id and p.display_name = split_part(u.email, chr(64), 1);

-- 3. El buscador hace display_name ILIKE '%texto%': un btree no sirve con el comodín al principio; un índice de trigramas sí.
--    En Supabase las extensiones van en el esquema extensions. Se quita el btree que dejaba la versión anterior.
create extension if not exists pg_trgm with schema extensions;
drop index if exists public.profiles_display_name_lower;
create index if not exists profiles_display_name_trgm on public.profiles using gin (display_name extensions.gin_trgm_ops);

-- Que la API vea los cambios enseguida
notify pgrst, 'reload schema';
