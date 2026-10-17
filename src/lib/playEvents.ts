// Jugadas que disparan una animación en la pantalla del juego en vivo: se comparan dos lecturas seguidas del
// juego y solo cuenta lo nuevo (al abrir el juego no se repite nada de lo que ya pasó).
import type { AtBat, GameDetail, GameTeam } from '../types';

export type PlayKind = 'inning' | 'k' | 'single' | 'double' | 'triple' | 'hr';

export interface PlayEvent {
    /** Una animación por jugada aunque el juego se lea varias veces */
    key: string;
    kind: PlayKind;
    /** Equipo protagonista: el que batea en hits y jonrones, el que lanza en ponches, el que entra a batear al cambiar de entrada */
    team: GameTeam;
    rival: GameTeam;
    away: GameTeam;
    home: GameTeam;
    atBat: AtBat | null;
    /** Media entrada que terminó (solo en fin de entrada) */
    inning: { n: number; isTop: boolean } | null;
    /** Ponches del lanzador en el juego, contando este */
    strikeouts?: number;
}

const KIND: Record<string, PlayKind> = {
    single: 'single',
    double: 'double',
    triple: 'triple',
    home_run: 'hr',
    strikeout: 'k',
    strikeout_double_play: 'k',
    strikeout_triple_play: 'k'
};

export const playKind = (atBat: Pick<AtBat, 'event'>): PlayKind | null => (atBat.event ? KIND[atBat.event] ?? null : null);

export const newPlayEvents = (prev: GameDetail | null | undefined, next: GameDetail): PlayEvent[] => {
    // Solo si ya se estaba viendo este juego en vivo (un jonrón que deja en el terreno sí sale aunque el juego ya diga «final»)
    if (!prev || prev.gamePk !== next.gamePk || prev.state !== 'live') return [];
    const done = new Set(prev.atBats.filter((atBat) => atBat.complete).map((atBat) => atBat.i));
    const events: PlayEvent[] = [];

    for (const atBat of next.atBats) {
        if (!atBat.complete || done.has(atBat.i)) continue;
        const kind = playKind(atBat);
        if (!kind) continue;
        const batting = atBat.top ? next.away : next.home;
        const fielding = atBat.top ? next.home : next.away;
        events.push({
            key: `ab-${atBat.i}`,
            kind,
            team: kind === 'k' ? fielding : batting,
            rival: kind === 'k' ? batting : fielding,
            away: next.away,
            home: next.home,
            atBat,
            inning: null,
            strikeouts:
                kind === 'k'
                    ? next.atBats.filter((other) => other.complete && other.i <= atBat.i && other.pitcher.id === atBat.pitcher.id && playKind(other) === 'k').length
                    : undefined
        });
    }

    // Fin de media entrada: se pasó de jugar (alta/baja) a la mitad o al final, o ya cambió de lado
    const before = prev.inning;
    const after = next.inning;
    if (next.state === 'live' && before && after && (before.state === 'Top' || before.state === 'Bottom')) {
        const ended = after.state === 'Middle' || after.state === 'End' || after.n !== before.n || after.isTop !== before.isTop;
        if (ended) {
            events.push({
                key: `inning-${before.n}-${before.isTop ? 'top' : 'bottom'}`,
                kind: 'inning',
                team: before.isTop ? next.home : next.away,
                rival: before.isTop ? next.away : next.home,
                away: next.away,
                home: next.home,
                atBat: null,
                inning: { n: before.n, isTop: before.isTop }
            });
        }
    }
    return events;
};
