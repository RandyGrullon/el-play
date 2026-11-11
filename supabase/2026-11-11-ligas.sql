-- El Play · ligas privadas 2.0 (11 de noviembre de 2026)
-- Para la base que ya existe: pegar completo en el SQL Editor de Supabase y correr. Se puede correr más de una vez.
-- Herramientas del dueño de una liga: renombrarla, sacar a un miembro y borrarla. Cada función revisa que quien la
-- llama (auth.uid()) sea el dueño (leagues.owner); las tablas siguen sin políticas de update ni delete para los
-- demás (cada quien solo puede salirse él mismo de una liga, como antes).
-- La app las llama con supabase.rpc; si la función no existe (PGRST202 / 404), esconde esas herramientas.
-- Errores que puede ver la app: not_signed_in, league_not_found, not_league_owner, invalid_league_name, cannot_remove_owner.

-- Renombrar la liga (1 a 40 caracteres, sin espacios de sobra)
create or replace function public.rename_league(p_code text, p_name text) returns void language plpgsql security definer set search_path = public as $$
declare target uuid; league_owner uuid; clean text := btrim(coalesce(p_name, ''));
begin
    if auth.uid() is null then raise exception 'not_signed_in'; end if;
    select id, owner into target, league_owner from public.leagues where code = upper(btrim(coalesce(p_code, '')));
    if target is null then raise exception 'league_not_found'; end if;
    if league_owner <> auth.uid() then raise exception 'not_league_owner'; end if;
    if char_length(clean) < 1 or char_length(clean) > 40 then raise exception 'invalid_league_name'; end if;
    update public.leagues set name = clean where id = target;
end $$;

-- Sacar a un miembro (el dueño no se puede sacar a sí mismo: para eso está borrar la liga). Si ya no estaba, no pasa nada.
create or replace function public.remove_member(p_code text, p_user uuid) returns void language plpgsql security definer set search_path = public as $$
declare target uuid; league_owner uuid;
begin
    if auth.uid() is null then raise exception 'not_signed_in'; end if;
    select id, owner into target, league_owner from public.leagues where code = upper(btrim(coalesce(p_code, '')));
    if target is null then raise exception 'league_not_found'; end if;
    if league_owner <> auth.uid() then raise exception 'not_league_owner'; end if;
    if p_user = league_owner then raise exception 'cannot_remove_owner'; end if;
    delete from public.league_members where league_id = target and user_id = p_user;
end $$;

-- Borrar la liga con todos sus miembros (league_members cae en cascada). Los equipos de cada quien no se tocan.
create or replace function public.delete_league(p_code text) returns void language plpgsql security definer set search_path = public as $$
declare target uuid; league_owner uuid;
begin
    if auth.uid() is null then raise exception 'not_signed_in'; end if;
    select id, owner into target, league_owner from public.leagues where code = upper(btrim(coalesce(p_code, '')));
    if target is null then raise exception 'league_not_found'; end if;
    if league_owner <> auth.uid() then raise exception 'not_league_owner'; end if;
    delete from public.leagues where id = target;
end $$;

-- Solo con sesión iniciada
revoke execute on function public.rename_league(text, text), public.remove_member(text, uuid), public.delete_league(text) from public, anon;
grant execute on function public.rename_league(text, text), public.remove_member(text, uuid), public.delete_league(text) to authenticated;

-- Que la API vea las funciones nuevas enseguida
notify pgrst, 'reload schema';
