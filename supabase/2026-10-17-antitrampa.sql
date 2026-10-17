-- El Play · Fantasy sin trampas (2026-10-17)
-- Se corre una vez en el SQL Editor, después de fantasy.sql (se puede volver a correr sin problema).
--
-- Antes la base guardaba solo lo último de cada equipo: con su sesión, alguien podía cambiar peloteros, capitán o
-- pronósticos por la API después de empezar los juegos, y contaba. Ahora cada fila lleva su historial (history),
-- escrito por la base con su propia hora: cuándo entró y salió cada pelotero, cuándo cambió el capitán y cada
-- pronóstico. La app y el servidor puntúan cada juego con lo que había cuando empezó; lo de después no cuenta.
-- Lo que se mande en history desde afuera se ignora: el historial lo escribe solo este trigger.
--
-- Forma de history (horas en milisegundos desde 1970; 0 = ya estaba antes de este arreglo):
--   { "v": 1,
--     "players": { "<id>": [[entró, salió o null], ...] },
--     "captain": [[id o null, cuándo], ...],
--     "picks": { "<gamePk>": [[teamId o null, cuándo], ...] } }

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

-- Que la API vea la columna nueva enseguida
notify pgrst, 'reload schema';
