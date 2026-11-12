// Le pasa al widget del iPhone (src/live/HomeWidget.tsx) lo que la app ya leyó: los calendarios de las ligas que están en
// la caché, con tu equipo favorito arriba. El widget no busca datos solo, así que se le manda al cambiar algo, cada 5
// minutos aunque nada cambie (para la hora de «Actualizado») y al salir de la app. En la web, Android y Expo Go no hace
// nada: no hay módulo nativo de expo-widgets (o, en Android, todavía no hay widget).
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { featuredStartOf, homeWidgetKey, homeWidgetProps, homeWidgetTimeline, type HomeWidgetSurface, type HomeWidgetTexts } from '../lib/homeWidget';
import { usePreferences } from '../state/preferences';
import type { Schedule, ScheduleGame } from '../types';

const load = (): HomeWidgetSurface | null => {
    if (Platform.OS !== 'ios') return null;
    try {
        if (!requireOptionalNativeModule('ExpoWidgets')) return null;
        // Se carga tarde a propósito: importar expo-widgets sin su módulo nativo (Expo Go) rompe la pantalla
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        return (require('../live/homeWidgetSurface') as typeof import('../live/homeWidgetSurface')).homeWidgetSurface;
    } catch {
        return null;
    }
};

const surface = load();
/** Aunque nada cambie, cada tanto se manda de nuevo (la hora de «Actualizado» y el aviso de marcador viejo) */
const REFRESH_MS = 5 * 60 * 1000;

export const useHomeWidget = () => {
    const client = useQueryClient();
    const { favoriteTeamId } = usePreferences();
    const { t, i18n } = useTranslation();

    useEffect(() => {
        if (!surface) return;
        const lang = i18n.language;
        const texts: HomeWidgetTexts = {
            favorite: t('widget.favorite'),
            live: t('widget.live'),
            next: t('widget.next'),
            last: t('widget.last'),
            today: t('widget.today'),
            tomorrow: t('widget.tomorrow'),
            postponed: t('widget.postponed'),
            suspended: t('widget.suspended'),
            started: t('widget.started'),
            liveCount: (count) => t('widget.liveCount', { count }),
            outs: (count) => t('widget.outs', { count }),
            won: (team) => t('widget.won', { team }),
            noGames: t('widget.noGames'),
            openApp: t('widget.openApp'),
            updated: (time) => t('widget.updated', { time }),
            staleText: t('widget.stale'),
            shortcutLive: t('widget.shortcutLive'),
            shortcutTeam: t('widget.shortcutTeam'),
            shortcutToday: t('widget.shortcutToday'),
            shortcutFantasy: t('widget.shortcutFantasy'),
            shortcutStandings: t('widget.shortcutStandings')
        };
        let lastKey = '';
        let lastAt = 0;
        let timer: ReturnType<typeof setTimeout> | undefined;

        const send = (force: boolean) => {
            try {
                const queries = client.getQueryCache().findAll({ queryKey: ['schedule'] });
                const games: ScheduleGame[] = queries.flatMap((query) => (query.state.data as Schedule | undefined)?.games ?? []);
                // Sin datos (sin señal al abrir) se queda lo último que se le mandó
                if (!games.length) return;
                const now = Date.now();
                const updatedAt = Math.max(...queries.map((query) => query.state.dataUpdatedAt || 0)) || now;
                const props = homeWidgetProps({ games, favoriteTeamId, lang, now, texts, updatedAt });
                const key = homeWidgetKey(props);
                if (!force && key === lastKey && now - lastAt < REFRESH_MS) return;
                lastKey = key;
                lastAt = now;
                surface.update(homeWidgetTimeline(props, now, featuredStartOf(games, props), updatedAt));
            } catch {
                /* el widget nunca tumba la app */
            }
        };
        // Las ligas llegan casi juntas: se espera un momento para mandar una sola vez
        const soon = () => {
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => send(false), 800);
        };

        send(true);
        const unsubscribe = client.getQueryCache().subscribe((event) => {
            if (event.type === 'updated' && event.action.type === 'success' && event.query.queryKey[0] === 'schedule') soon();
        });
        const appState = AppState.addEventListener('change', (state) => {
            if (state === 'background') send(true);
        });
        return () => {
            if (timer) clearTimeout(timer);
            unsubscribe();
            appState.remove();
        };
    }, [client, favoriteTeamId, i18n.language, t]);
};
