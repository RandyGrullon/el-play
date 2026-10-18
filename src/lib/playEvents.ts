// Jugadas que disparan una animación en la pantalla del juego en vivo: se comparan dos lecturas seguidas del
// juego y solo cuenta lo nuevo (al abrir el juego no se repite nada de lo que ya pasó).
import type { AtBat, GameDetail, GameTeam, LeagueId, SeriesStatus } from '../types';
import { basesOf, type Bases } from './runners';

export type PlayKind = 'inning' | 'k' | 'single' | 'double' | 'triple' | 'hr' | 'win' | 'champion' | 'pinchHitter' | 'pinchRunner' | 'out';

/** Cómo fue el out: cada uno tiene su propia trayectoria en la animación */
export type OutVariant = 'ground' | 'fly' | 'line' | 'pop' | 'force' | 'dp' | 'tp' | 'sac';

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
    league?: LeagueId;
    /** Serie del ganador después del juego (finales al mejor de varios) */
    seriesRecord?: { wins: number; losses: number } | null;
    /** Emergente: quién entra y a quién sustituye */
    sub?: { in: { id: number | null; name: string }; out: { id: number | null; name: string } | null };
    /** Out: tipo y outs que quedan en la entrada después de la jugada */
    out?: { variant: OutVariant; outs: number };
    /** Estadio (para dibujar el parque con sus medidas en el jonrón) */
    venue?: string;
    /** Hits y jonrones: quién estaba en base antes (de la lectura anterior; null si no se sabe) */
    bases?: Bases | null;
    /** Hits y jonrones: carreras del equipo al bate antes y después de la jugada */
    runs?: { before: number; after: number } | null;
}

/** Tipo de out según el evento de MLB y, en los «field_out», la trayectoria del batazo (o la etiqueta de MLB) */
export const outVariant = (atBat: Pick<AtBat, 'event' | 'eventLabel' | 'pitches'>): OutVariant | null => {
    const event = atBat.event ?? '';
    if (event === 'triple_play') return 'tp';
    if (event === 'grounded_into_double_play' || event === 'double_play' || event === 'sac_fly_double_play' || event === 'sac_bunt_double_play') return 'dp';
    if (event === 'sac_fly' || event === 'sac_bunt') return 'sac';
    if (event === 'force_out' || event === 'fielders_choice_out') return 'force';
    if (event !== 'field_out' && event !== 'other_out') return null;
    const traj = [...atBat.pitches].reverse().find((pitch) => pitch.r === 'inplay')?.hit?.traj ?? '';
    const label = atBat.eventLabel ?? '';
    if (/ground|bunt_grounder/i.test(traj) || /ground/i.test(label)) return 'ground';
    if (/line/i.test(traj) || /line/i.test(label)) return 'line';
    if (/popup|bunt_popup/i.test(traj) || /pop/i.test(label)) return 'pop';
    if (/fly/i.test(traj) || /fly/i.test(label)) return 'fly';
    return 'ground';
};

/** Victorias del equipo en la serie después de este juego, y si con eso se lleva el título */
export const titleClinch = (series: SeriesStatus | null | undefined, winnerId: number) => {
    if (!series?.championship) return { champion: false, record: null };
    const total = series.total || 1;
    const needed = Math.floor(total / 2) + 1;
    // Si MLB ya contó este juego, la serie dice quién la ganó; si no, se suma la victoria de hoy
    if (series.over) {
        const champion = series.leaderId === winnerId;
        return { champion, record: total > 1 ? { wins: series.wins, losses: series.losses } : null };
    }
    const mine = series.leaderId === winnerId || series.tied ? series.wins : series.losses;
    const theirs = series.leaderId === winnerId || series.tied ? series.losses : series.wins;
    const record = total > 1 ? { wins: mine + 1, losses: theirs } : null;
    return { champion: mine + 1 >= needed, record };
};

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
    // Los corredores de la lectura anterior son los de antes de la primera jugada nueva (de las siguientes no se sabe)
    let basesKnown = true;
    const scoreOf = (atBat: AtBat | undefined, top: boolean) => (atBat ? (top ? atBat.away : atBat.home) : 0);

    for (const atBat of next.atBats) {
        if (!atBat.complete || done.has(atBat.i)) continue;
        const variant = outVariant(atBat);
        const kind = playKind(atBat) ?? (variant ? 'out' : null);
        if (!kind) continue;
        const batting = atBat.top ? next.away : next.home;
        const fielding = atBat.top ? next.home : next.away;
        // El out lo celebra el equipo que lo hizo (como el ponche)
        const defense = kind === 'k' || kind === 'out';
        const hit = kind === 'single' || kind === 'double' || kind === 'triple' || kind === 'hr';
        const after = scoreOf(atBat, atBat.top);
        const before = scoreOf(next.atBats.find((other) => other.i === atBat.i - 1), atBat.top);
        const bases = hit && basesKnown ? basesOf(prev.runners) : null;
        basesKnown = false;
        events.push({
            key: `ab-${atBat.i}`,
            kind,
            team: defense ? fielding : batting,
            rival: defense ? batting : fielding,
            out: kind === 'out' && variant ? { variant, outs: atBat.outs ?? 0 } : undefined,
            away: next.away,
            home: next.home,
            atBat,
            inning: null,
            venue: next.venue,
            bases,
            runs: hit && after !== null && before !== null && after >= before ? { before, after } : null,
            strikeouts:
                kind === 'k'
                    ? next.atBats.filter((other) => other.complete && other.i <= atBat.i && other.pitcher.id === atBat.pitcher.id && playKind(other) === 'k').length
                    : undefined
        });
    }

    // Bateador o corredor emergente: acciones nuevas de cambio ofensivo (PH / PR)
    const seenActions = new Map(prev.atBats.map((atBat) => [atBat.i, atBat.actions.length]));
    for (const atBat of next.atBats) {
        atBat.actions.forEach((action, index) => {
            if (index < (seenActions.get(atBat.i) ?? 0) || !action.sub) return;
            const kind: PlayKind | null = action.sub.pos === 'PH' ? 'pinchHitter' : action.sub.pos === 'PR' ? 'pinchRunner' : null;
            if (!kind) return;
            events.push({
                key: `sub-${atBat.i}-${index}`,
                kind,
                team: atBat.top ? next.away : next.home,
                rival: atBat.top ? next.home : next.away,
                away: next.away,
                home: next.home,
                atBat,
                inning: null,
                sub: { in: action.sub.in, out: action.sub.out }
            });
        });
    }

    // Final del juego: victoria del ganador, o campeonato si con este juego se lleva el título
    if (next.state === 'final') {
        const winner = next.home.isWinner ? next.home : next.away.isWinner ? next.away : null;
        if (winner) {
            const { champion, record } = titleClinch(next.series ?? prev.series, winner.id);
            events.push({
                key: `final-${next.gamePk}`,
                kind: champion ? 'champion' : 'win',
                team: winner,
                rival: winner === next.home ? next.away : next.home,
                away: next.away,
                home: next.home,
                atBat: null,
                inning: null,
                league: next.league,
                seriesRecord: record
            });
        }
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

/** Las que siempre salen aunque el juego no sea de tu equipo */
const BIG: PlayKind[] = ['hr', 'k', 'inning', 'win', 'champion'];

/** Filtra las animaciones según lo elegido en «Más» (en «smart», tu equipo las ve todas) */
export const forMode = (events: PlayEvent[], mode: 'all' | 'smart' | 'off', favoriteTeamId: number | null, teamIds: number[]) => {
    if (mode === 'off') return [];
    if (mode === 'all' || (favoriteTeamId !== null && teamIds.includes(favoriteTeamId))) return events;
    return events.filter((event) => BIG.includes(event.kind));
};
