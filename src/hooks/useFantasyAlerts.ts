import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { entryKey, playerScore, teamPoints, useFantasyDay, useFantasyStore, type FantasyDay } from '../lib/fantasy';
import { useSession } from '../lib/account';
import { useLeague } from '../store/LeagueContext';
import { usePreferences } from '../store/preferences';
import { todayKey } from '../lib/format';
import { showToast } from '../lib/toast';
import { showAlert } from './useGameAlerts';

const shift = (day: string, days: number) => new Date(Date.parse(`${day}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);

/**
 * Avisos del Fantasy mientras la app está abierta: cuando un pelotero de tu equipo de hoy suma puntos (jonrón, hit,
 * ponches de tu lanzador…) sale un aviso con lo que sumó y cómo va tu equipo. Con la app en segundo plano y permiso de
 * avisos, sale como notificación. Solo con cuenta y un equipo armado para hoy (si no, ni se pide el día).
 */
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
    const seen = useRef<{ date: string; points: Map<number, number> } | null>(null);

    useEffect(() => {
        const day: FantasyDay | undefined = query.data;
        if (!enabled || !day) return;
        const entry = store[entryKey(day.league, day.date)];
        if (!entry?.lineup.length) return;
        const now = new Map(entry.lineup.map((id) => [id, (() => {
            const player = day.players.find((p) => p.id === id);
            return player ? playerScore(entry, player) : 0;
        })()]));
        const previous = seen.current;
        seen.current = { date: day.date, points: now };
        // La primera lectura (o un día nuevo) solo marca desde dónde se cuenta
        if (!previous || previous.date !== day.date) return;
        const gains = entry.lineup
            .map((id) => ({ player: day.players.find((p) => p.id === id), gain: (now.get(id) ?? 0) - (previous.points.get(id) ?? 0) }))
            .filter((item) => item.player && item.gain >= 1);
        if (!gains.length) return;
        const total = teamPoints(day, entry);
        const parts = gains.map(({ player, gain }) => t('fantasyAlerts.gain', { name: player!.name, pts: Math.round(gain * 10) / 10 }));
        const text = `${parts.join(' · ')} · ${t('fantasyAlerts.total', { pts: total })}`;
        showToast(text, undefined, 7000);
        if (document.visibilityState === 'hidden' && 'Notification' in window && Notification.permission === 'granted') {
            showAlert(t('fantasyAlerts.title'), { body: text, icon: '/icons/icon-192-v2.png', tag: `fantasy-${day.date}`, data: { url: '/fantasy' } });
        }
    }, [query.data, enabled, store, t]);
};
