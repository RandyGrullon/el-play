// Del detalle del juego (useGame / api.game) a lo que muestran la pantalla bloqueada, la isla y la notificación
import type { GameDetail, GameTeam } from '../types';
import { describePlay, eventName, finalLabel, inningName, stateName } from '../lib/baseball';
import { formatTime } from '../lib/format';
import { teamDisplayName } from '../lib/teams';
import { inkOn } from '../theme/tokens';
import type { LiveGameProps, LiveTeam } from './types';

const TEXTS = {
    es: {
        halves: { Top: 'Alta', Bottom: 'Baja', Middle: 'Mitad', End: 'Fin' } as Record<string, string>,
        batter: 'Al bate',
        pitcher: 'Lanza',
        pitches: 'lanz.',
        out: 'out',
        outs: 'outs',
        updated: 'Actualizado',
        stale: 'Sin actualizar · abre El Play',
        open: 'Toca para abrir el juego',
        stop: 'Dejar de seguir',
        stopped: 'Ya no sigues este juego'
    },
    en: {
        halves: { Top: 'Top', Bottom: 'Bot', Middle: 'Mid', End: 'End' } as Record<string, string>,
        batter: 'At bat',
        pitcher: 'Pitching',
        pitches: 'P',
        out: 'out',
        outs: 'outs',
        updated: 'Updated',
        stale: 'Not updated · open El Play',
        open: 'Tap to open the game',
        stop: 'Stop following',
        stopped: 'You stopped following this game'
    }
};

const HEX = /^#[0-9a-f]{6}$/i;

/** «Estevan Florial» → «E. Florial» */
const shortName = (name: string) => {
    const parts = name.trim().split(/\s+/);
    return parts.length > 1 ? `${parts[0][0]}. ${parts.slice(1).join(' ')}` : name;
};

const team = (side: GameTeam, lang: string): LiveTeam => {
    // Las notificaciones de Android solo aceptan #RRGGBB
    const color = HEX.test(side.color) ? side.color : '#2563eb';
    return { abbrev: side.abbrev, name: teamDisplayName(side, lang), color, ink: inkOn(color), runs: String(side.runs ?? 0) };
};

/** «Alta de la 7.ª» / «Top 7th» */
const inningLong = (inning: NonNullable<GameDetail['inning']>, es: boolean) => {
    const words = es ? TEXTS.es : TEXTS.en;
    const half = words.halves[inning.state] ?? words.halves[inning.isTop ? 'Top' : 'Bottom'];
    return es ? `${half} de la ${inning.n}.ª` : `${half} ${inning.ordinal}`;
};

/** timeZone: la del teléfono; el servidor del push pasa la de cada suscripción */
export const liveGameProps = (game: GameDetail, lang: string, now = Date.now(), timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone): LiveGameProps => {
    const es = !lang.startsWith('en');
    const words = es ? TEXTS.es : TEXTS.en;
    const live = game.state === 'live';
    const between = !live || game.inning?.state === 'Middle' || game.inning?.state === 'End';
    const innings = game.linescore.length || game.inning?.n || game.scheduledInnings;

    let inning = '';
    let inningShort = '';
    if (game.state === 'final') {
        inning = finalLabel(innings, game.scheduledInnings, lang);
        inningShort = 'F';
    } else if (!live) {
        // Demorado, calentamiento…
        inning = stateName(game.detailedState, lang);
    } else if (game.inning) {
        inning = inningLong(game.inning, es);
        inningShort = inningName(game.inning, lang, true);
    }

    // Última jugada terminada (la del bateador actual todavía no tiene resultado)
    const last = [...game.atBats].reverse().find((atBat) => atBat.complete && (atBat.eventLabel || atBat.event));
    const matchup = live && !between ? game.matchup : null;
    const batterLine = matchup?.batter.h != null && matchup.batter.ab != null ? ` · ${matchup.batter.h}-${matchup.batter.ab}` : '';
    const pitches = matchup?.pitcher.pitches != null ? ` · ${matchup.pitcher.pitches} ${words.pitches}` : '';
    const outs = Math.min(game.count.outs, 3);

    return {
        gamePk: game.gamePk ?? 0,
        live,
        away: team(game.away, lang),
        home: team(game.home, lang),
        inning,
        inningShort,
        between,
        outs: between ? 0 : outs,
        balls: between ? 0 : Math.min(game.count.balls, 3),
        strikes: between ? 0 : Math.min(game.count.strikes, 2),
        first: !between && !!game.runners.first,
        second: !between && !!game.runners.second,
        third: !between && !!game.runners.third,
        count: between ? '' : `${game.count.balls}-${game.count.strikes}`,
        outsText: between ? '' : `${outs} ${outs === 1 ? words.out : words.outs}`,
        batter: matchup ? `${words.batter} ${shortName(matchup.batter.name)}${batterLine}` : '',
        pitcher: matchup ? `${words.pitcher} ${shortName(matchup.pitcher.name)}${pitches}` : '',
        lastLabel: last ? eventName(last, lang).toUpperCase() : '',
        lastText: last ? describePlay(last.desc, lang) : '',
        updated: `${words.updated} ${formatTime(new Date(now).toISOString(), lang, timeZone)}`,
        staleText: words.stale,
        openText: words.open,
        stopText: words.stop,
        stoppedText: words.stopped,
        stopped: false
    };
};

/** Lo que cambia de verdad (sin la hora): para no gastar actualizaciones si nada pasó */
export const liveGameKey = (props: LiveGameProps) => JSON.stringify({ ...props, updated: '' });
