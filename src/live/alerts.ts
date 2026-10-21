// Alertas PRO del juego que se sigue en segundo plano: jonrón de tu equipo, empate o cambio de ventaja, no-hitter
// desde la 6.ª y final. Salen comparando cada lectura nueva del detalle con lo ya visto, como aviso local del teléfono
// mientras la app lee el juego (abierta, o viva en segundo plano en Android). Con la app cerrada del todo hace falta
// el push del servidor (docs/SEGUNDO-PLANO.md). Tocar el aviso abre el juego (data.gamePk: useAlertTaps).
import { Platform } from 'react-native';
import { AndroidImportance } from 'expo-notifications';
import * as Notifications from 'expo-notifications';
import type { GameDetail } from '../types';
import i18n from '../i18n';

export type AlertKind = 'homer' | 'lead' | 'noHitter' | 'final';
export type AlertPrefs = Record<AlertKind, boolean>;

/** De fábrica (como el diseño): todas menos el no-hitter */
export const DEFAULT_ALERTS: AlertPrefs = { homer: true, lead: true, noHitter: false, final: true };

/** Lo ya visto del juego: lo de antes de empezar a seguirlo no avisa */
export interface AlertMemory {
    gamePk: number;
    /** Último turno terminado que se revisó */
    lastAtBat: number;
    /** Quién iba ganando en la lectura anterior (null: empate) y el último que fue ganando (sin contar empates) */
    leader: 'away' | 'home' | null;
    lastLeader: 'away' | 'home' | null;
    /** No-hitter ya avisado, por el equipo que lanza */
    noHitter: { away: boolean; home: boolean };
    final: boolean;
}

export interface GameAlert {
    kind: AlertKind;
    title: string;
    body: string;
}

const leaderOf = (game: GameDetail) => ((game.away.runs ?? 0) > (game.home.runs ?? 0) ? 'away' : (game.home.runs ?? 0) > (game.away.runs ?? 0) ? 'home' : null);
const lastDone = (game: GameDetail) => game.atBats.reduce((max, atBat) => (atBat.complete && atBat.i > max ? atBat.i : max), -1);
/** Un equipo lanza un no-hitter si el otro no tiene hits desde la 6.ª */
const noHitterBy = (game: GameDetail, side: 'away' | 'home') => game.state === 'live' && (game.inning?.n ?? 0) >= 6 && (side === 'away' ? game.home.hits : game.away.hits) === 0;

/** Primera lectura del juego que se sigue: lo que ya pasó no avisa */
export const alertBaseline = (game: GameDetail): AlertMemory => ({
    gamePk: game.gamePk ?? 0,
    lastAtBat: lastDone(game),
    leader: leaderOf(game),
    lastLeader: leaderOf(game),
    noHitter: { away: noHitterBy(game, 'away'), home: noHitterBy(game, 'home') },
    final: game.state === 'final'
});

const score = (game: GameDetail) => `${game.away.abbrev} ${game.away.runs ?? 0} – ${game.home.runs ?? 0} ${game.home.abbrev}`;
const inningMark = (top: boolean, n: number) => `${top ? '▲' : '▼'} ${n}`;

/**
 * Las alertas que tocan con esta lectura (según lo que el usuario dejó encendido) y lo visto actualizado.
 * favoriteTeamId: «tu equipo» para los jonrones; si tu equipo no juega, cuentan los de los dos.
 */
export const detectAlerts = (memory: AlertMemory, game: GameDetail, prefs: AlertPrefs, favoriteTeamId: number | null): { alerts: GameAlert[]; memory: AlertMemory } => {
    const t = (key: string, options?: Record<string, unknown>) => i18n.t(`pro.segundo-plano.alerts.${key}`, options ?? {}) as string;
    const alerts: GameAlert[] = [];
    const next: AlertMemory = { ...memory, noHitter: { ...memory.noHitter } };
    const mine = favoriteTeamId !== null && (game.away.id === favoriteTeamId || game.home.id === favoriteTeamId) ? favoriteTeamId : null;

    // Jonrones de los turnos nuevos
    for (const atBat of game.atBats) {
        if (!atBat.complete || atBat.i <= memory.lastAtBat || atBat.event !== 'home_run') continue;
        const team = atBat.top ? game.away : game.home;
        if (!prefs.homer || (mine !== null && team.id !== mine)) continue;
        alerts.push({
            kind: 'homer',
            title: t('homerTitle', { team: team.abbrev }),
            body: [atBat.batter.name, `${game.away.abbrev} ${atBat.away ?? game.away.runs} – ${atBat.home ?? game.home.runs} ${game.home.abbrev}`, inningMark(atBat.top, atBat.inning)].join(' · ')
        });
    }
    next.lastAtBat = Math.max(memory.lastAtBat, lastDone(game));

    // Empate o cambio de ventaja (el primer carrerón del juego no cuenta: nadie iba ganando antes)
    const leader = leaderOf(game);
    if (prefs.lead && game.state === 'live') {
        if (leader === null && memory.leader !== null) {
            alerts.push({ kind: 'lead', title: t('tieTitle'), body: score(game) });
        } else if (leader !== null && memory.lastLeader !== null && leader !== memory.lastLeader) {
            const team = leader === 'away' ? game.away : game.home;
            alerts.push({ kind: 'lead', title: t('leadTitle', { team: team.abbrev }), body: score(game) });
        }
    }
    next.leader = leader;
    if (leader !== null) next.lastLeader = leader;

    // No-hitter desde la 6.ª (una vez por equipo)
    (['away', 'home'] as const).forEach((side) => {
        if (!noHitterBy(game, side) || next.noHitter[side]) return;
        next.noHitter[side] = true;
        if (!prefs.noHitter) return;
        const pitching = side === 'away' ? game.away : game.home;
        const batting = side === 'away' ? game.home : game.away;
        alerts.push({ kind: 'noHitter', title: t('noHitterTitle', { team: pitching.abbrev }), body: t('noHitterBody', { team: batting.abbrev, inning: game.inning?.n ?? 6 }) + ' · ' + score(game) });
    });

    // Final
    if (game.state === 'final' && !memory.final) {
        next.final = true;
        if (prefs.final) {
            const winner = leader === 'away' ? game.away : leader === 'home' ? game.home : null;
            alerts.push({ kind: 'final', title: t('finalTitle', { score: score(game) }), body: winner ? t('finalBody', { team: winner.name }) : score(game) });
        }
    }
    return { alerts, memory: next };
};

const CHANNEL = 'alertas-juego';
let channelReady = false;

/** Permiso de avisos (el iPhone lo pide la primera vez; en Android lo pidió seguir el juego) */
export const ensureAlertPermission = async (ask: boolean) => {
    if (Platform.OS === 'web') return false;
    try {
        const current = await Notifications.getPermissionsAsync();
        if (current.granted) return true;
        if (!ask || !current.canAskAgain) return false;
        return (await Notifications.requestPermissionsAsync()).granted;
    } catch {
        return false;
    }
};

/** Manda el aviso ya (sin esperar): con sonido, en su propio canal de Android */
export const postAlert = async (alert: GameAlert, gamePk: number) => {
    if (Platform.OS === 'web') {
        // Web de desarrollo (superficie de prueba): solo queda en la consola
        console.info('[segundo-plano] alerta', alert.kind, alert.title, alert.body);
        return;
    }
    try {
        if (Platform.OS === 'android' && !channelReady) {
            await Notifications.setNotificationChannelAsync(CHANNEL, { name: i18n.t('pro.segundo-plano.alerts.channel'), importance: AndroidImportance.HIGH });
            channelReady = true;
        }
        await Notifications.scheduleNotificationAsync({
            content: { title: alert.title, body: alert.body, data: { gamePk } },
            trigger: Platform.OS === 'android' ? { channelId: CHANNEL } : null
        });
    } catch {
        /* sin permiso o sin avisos: no pasa nada */
    }
};
