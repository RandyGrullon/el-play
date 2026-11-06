// Avisos del Fantasy mientras la app está abierta (web: hooks/useFantasyAlerts.ts): cuando un pelotero de tu equipo de
// hoy suma puntos (jonrón, hit, ponches de tu lanzador…) sale un aviso con lo que sumó y cómo va tu equipo, en cualquier
// pantalla. Con la app en segundo plano y permiso de avisos, sale como notificación (tocarla abre el Fantasy). Solo con
// cuenta, un equipo armado para hoy y «Tu equipo del Fantasy» encendido en Más (si no, ni se pide el día).
import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSession } from '../lib/account';
import { entryKey, playerScore, teamPoints, useFantasyDay, useFantasyStore, type FantasyDay } from '../lib/fantasy';
import { todayKey } from '../lib/format';
import { fantasyStep, fantasyText, type FantasySeen } from '../lib/gameAlerts';
import { postNow } from '../lib/notify';
import { showToast } from '../lib/toast';
import { useLeague } from '../state/league';
import { usePreferences } from '../state/preferences';

const shift = (day: string, days: number) => new Date(Date.parse(`${day}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);

export const useFantasyAlerts = () => {
    const { t } = useTranslation();
    const { activeLeague, leagueConfig } = useLeague();
    const { alertKinds } = usePreferences();
    const session = useSession();
    const store = useFantasyStore();
    const today = todayKey(leagueConfig.timeZone);
    // Pasada la medianoche el día del fantasy puede seguir siendo el de ayer
    const hasTeam = [today, shift(today, -1)].some((date) => (store[entryKey(activeLeague, date)]?.lineup.length ?? 0) > 0);
    const enabled = !!session && hasTeam && alertKinds.fantasy;
    const query = useFantasyDay(activeLeague, undefined, enabled);
    const seen = useRef<FantasySeen | null>(null);

    useEffect(() => {
        const day: FantasyDay | undefined = query.data;
        if (!enabled || !day) return;
        const entry = store[entryKey(day.league, day.date)];
        if (!entry?.lineup.length) return;
        const players = new Map(day.players.map((player) => [player.id, player]));
        const { seen: next, gains } = fantasyStep(seen.current, day.date, entry.lineup, (id) => {
            const player = players.get(id);
            return player ? playerScore(entry, player) : null;
        });
        seen.current = next;
        if (!gains.length) return;
        const text = fantasyText(
            gains.map(({ id, gain }) => ({ name: players.get(id)?.name ?? '', gain })),
            teamPoints(day, entry),
            (key, options) => t(key, options)
        );
        showToast(text, undefined, 7000);
        if (Platform.OS !== 'web' && AppState.currentState !== 'active') {
            postNow(t('fantasyAlerts.title'), text, { screen: 'fantasy' }).catch(() => undefined);
        }
    }, [query.data, enabled, store, t]);
};
