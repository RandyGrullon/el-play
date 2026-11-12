// Avisos con la app abierta (web: hooks/useGameAlerts.ts): el resultado final, el juego sin hit desde la 6.ª y jugada a
// jugada (carreras, cambio de ventaja, jonrones y hits) de los juegos con campana y de tu equipo favorito, como aviso del
// teléfono (con la app a la vista sale arriba, como el de la web). Los de 10 minutos antes y el playball no van aquí: se
// programan en el teléfono (state/preferences.tsx).
// Mira lo que la app ya lee (los calendarios de cualquier liga y el detalle del juego) y, por si ninguna pantalla mira el
// calendario de la liga, lo pide cada minuto mientras haya un juego tuyo en vivo (con la app a la vista). Las jugadas
// salen de comparar una lectura con la anterior (lib/gameAlerts.ts: playAlerts); con el detalle se sabe además quién
// bateó y si fue jonrón.
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { liveAlerts, liveAlertText, playAlerts, watchInterval, watchedFromDetail, watchedFromSchedule, type LiveAlert, type PlaySeen, type WatchedGame } from '../lib/gameAlerts';
import { notifyOnce, postNow, wasNotified } from '../lib/notify';
import { keys } from '../lib/queries';
import { useLeague } from '../state/league';
import { alertName, usePreferences } from '../state/preferences';
import type { GameDetail, Schedule } from '../types';

/** Los juegos de una lectura del calendario o del detalle (lo demás de la caché no cuenta) */
const gamesOf = (kind: unknown, data: unknown): WatchedGame[] => {
    if (!data) return [];
    if (kind === 'schedule') return ((data as Schedule).games ?? []).map(watchedFromSchedule);
    if (kind === 'game') {
        const game = watchedFromDetail(data as GameDetail);
        return game ? [game] : [];
    }
    return [];
};

export const useGameAlerts = () => {
    const { t, i18n } = useTranslation();
    const client = useQueryClient();
    const { activeLeague } = useLeague();
    const { subscribedGames, favoriteTeamId, alertKinds } = usePreferences();
    const active =
        Platform.OS !== 'web' &&
        (subscribedGames.length > 0 || favoriteTeamId !== null) &&
        (alertKinds.final || alertKinds.noHitter || alertKinds.runs || alertKinds.lead || alertKinds.hr || alertKinds.hits);
    // Carreras y hits vistos de cada juego en la lectura anterior (para las jugadas); sigue de un cambio de avisos a otro
    const seen = useRef<ReadonlyMap<number, PlaySeen>>(new Map());
    const mine = (game: WatchedGame) => subscribedGames.includes(game.gamePk) || (favoriteTeamId !== null && (game.away.id === favoriteTeamId || game.home.id === favoriteTeamId));

    // La misma consulta del calendario que la portada (misma llave y caché), con su propio ritmo, más lento
    useQuery({
        queryKey: keys.schedule(activeLeague),
        queryFn: ({ signal }) => api.schedule(activeLeague, signal),
        enabled: active,
        staleTime: 30 * 1000,
        refetchInterval: (query) => watchInterval(query.state.data?.games.map(watchedFromSchedule), mine, Date.now())
    });

    useEffect(() => {
        if (!active) return;
        const lang = i18n.language;
        /** quiet: lo que ya estaba en la caché, que para las jugadas solo marca desde dónde se cuenta */
        const check = (games: WatchedGame[], quiet = false) => {
            if (!games.length) return;
            try {
                const now = Date.now();
                const options = { bell: subscribedGames, favoriteTeamId, kinds: alertKinds, now, notified: wasNotified };
                const plays = playAlerts(games, { ...options, seen: seen.current, quiet });
                seen.current = plays.seen;
                const found: LiveAlert[] = [...liveAlerts(games, options), ...plays.alerts];
                for (const alert of found) {
                    const { title, body } = liveAlertText(alert, (key, values) => t(key, values), (team) => alertName(team, lang), lang);
                    // Si no sale (sin permiso), no se marca: el final y el juego sin hit se intentan en la próxima
                    // lectura; la jugada no (en la próxima ya no hay cambio que avisar)
                    notifyOnce(alert.key, () => postNow(title, body, { gamePk: alert.game.gamePk })).catch(() => undefined);
                }
            } catch {
                /* un dato raro del servidor no tumba la app */
            }
        };
        // Lo que ya está en la caché (al abrir la app o al cambiar los avisos) y después cada lectura nueva
        check(
            client
                .getQueryCache()
                .getAll()
                .flatMap((query) => gamesOf(query.queryKey[0], query.state.data)),
            true
        );
        return client.getQueryCache().subscribe((event) => {
            if (event.type !== 'updated' || event.action.type !== 'success') return;
            check(gamesOf(event.query.queryKey[0], event.action.data));
        });
    }, [active, client, subscribedGames, favoriteTeamId, alertKinds, t, i18n.language]);
};
