// Del detalle del juego (useGame / api.game) a lo que muestran la pantalla bloqueada, la isla y la notificación
// Los textos van aquí (no en los JSON de i18n) porque el servidor del push empaqueta este archivo tal cual.
import type { AtBat, GameDetail, GameTeam } from '../types';
import { describePlay, eventName, eventTone, finalLabel, inningName, pitchCallName, pitchTypeName, stateName } from '../lib/baseball';
import { formatTime, lastName } from '../lib/format';
import { teamDisplayName } from '../lib/teams';
import { inkOn } from '../theme/tokens';
import type { LiveGameProps, LivePlay, LiveTeam } from './types';

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
        stopped: 'Ya no sigues este juego',
        // PRO
        pitching: 'Lanzando',
        batterTag: 'B:',
        pitcherTag: 'L:',
        today: (line: string) => `hoy ${line}`,
        pitchCount: (n: number) => `${n} ${n === 1 ? 'pitcheo' : 'pitcheos'}`,
        winProb: 'Prob. de ganar',
        percent: (value: string) => `${value} %`
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
        stopped: 'You stopped following this game',
        // PRO
        pitching: 'Pitching',
        batterTag: 'B:',
        pitcherTag: 'P:',
        today: (line: string) => `${line} today`,
        pitchCount: (n: number) => `${n} ${n === 1 ? 'pitch' : 'pitches'}`,
        winProb: 'Win prob.',
        percent: (value: string) => `${value}%`
    }
};

/** Lo que la app sabe además del detalle (solo en PRO) */
export interface LiveExtras {
    pro: boolean;
    /** Logos ya descargados: id del equipo → file:// */
    logos?: Record<number, string>;
    /** Probabilidad de ganar del visitante (0-100), de /winprob o de /live */
    wpAway?: number | null;
    /** La del visitante turno a turno (0-100), de /winprob */
    wpSeries?: number[];
}

const HEX = /^#[0-9a-f]{6}$/i;

// ---------------------------------------------------------------- Color del equipo legible sobre negro o blanco

const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toHex = (rgb: number[]) => `#${rgb.map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, '0')).join('')}`;
const mixHex = (a: string, b: string, t: number) => {
    const ca = channels(a);
    const cb = channels(b);
    return toHex(ca.map((c, i) => c + (cb[i] - c) * t));
};
const luminance = (hex: string) => {
    const [r, g, b] = channels(hex).map((c) => {
        const v = c / 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
};
/** El color del equipo mezclado con `toward` lo justo para leerse (4.5:1) sobre `background` */
const readableOn = (color: string, background: string, toward: string) => {
    for (let t = 0; t <= 1; t += 0.05) {
        const candidate = mixHex(color, toward, t);
        if (contrast(candidate, background) >= 4.5) return candidate;
    }
    return toward;
};
// Fondos de la actividad y de la notificación (oscuro / claro)
const DARK_BG = '#16181f';
const LIGHT_BG = '#ffffff';

/** «Estevan Florial» → «E. Florial» */
const shortName = (name: string) => {
    const parts = name.trim().split(/\s+/);
    return parts.length > 1 ? `${parts[0][0]}. ${parts.slice(1).join(' ')}` : name;
};

/** 99.94 → «99.9»; 50 → «50» */
const percentNumber = (value: number) => {
    const fixed = (Math.round(value * 10) / 10).toFixed(1);
    return fixed.endsWith('.0') ? fixed.slice(0, -2) : fixed;
};

const team = (side: GameTeam, lang: string, extras?: LiveExtras): LiveTeam => {
    // Las notificaciones de Android solo aceptan #RRGGBB
    const color = HEX.test(side.color) ? side.color : '#2563eb';
    return {
        abbrev: side.abbrev,
        name: teamDisplayName(side, lang),
        color,
        ink: inkOn(color),
        runs: String(side.runs ?? 0),
        light: extras?.pro ? readableOn(color, DARK_BG, '#ffffff') : '',
        dark: extras?.pro ? readableOn(color, LIGHT_BG, '#000000') : '',
        logo: extras?.pro ? (extras.logos?.[side.id] ?? '') : '',
        short: extras?.pro ? (side.flag ? teamDisplayName(side, lang) : side.teamName || side.abbrev) : ''
    };
};

/** «Alta de la 7.ª» / «Top 7th» */
const inningLong = (inning: NonNullable<GameDetail['inning']>, es: boolean) => {
    const words = es ? TEXTS.es : TEXTS.en;
    const half = words.halves[inning.state] ?? words.halves[inning.isTop ? 'Top' : 'Bottom'];
    return es ? `${half} de la ${inning.n}.ª` : `${half} ${inning.ordinal}`;
};

/** «▲ 7.ª» / «▲ 7th»; entre entradas «Mit 7» */
const inningMarkOf = (inning: NonNullable<GameDetail['inning']>, lang: string, es: boolean) => {
    if (inning.state === 'Middle' || inning.state === 'End') return inningName(inning, lang, true);
    return `${inning.isTop ? '▲' : '▼'} ${es ? `${inning.n}.ª` : inning.ordinal}`;
};

/** Último pitcheo del turno en curso: «95.3 mph Sinker · foul» */
const lastPitchText = (atBat: AtBat | undefined, lang: string) => {
    const pitch = atBat?.pitches[atBat.pitches.length - 1];
    if (!pitch) return '';
    const kind = [pitch.mph ? `${pitch.mph.toFixed(1)} mph` : '', pitch.type || pitch.typeDesc ? pitchTypeName(pitch, lang) : ''].filter(Boolean).join(' ');
    const call = pitch.code || pitch.call ? pitchCallName(pitch, lang).toLowerCase() : '';
    return [kind, call].filter(Boolean).join(' · ');
};

/** Hasta `max` puntos repartidos, siempre con el último */
const sample = (values: number[], max: number) => {
    if (values.length <= max) return values.map((value) => Math.round(value * 10) / 10);
    const step = (values.length - 1) / (max - 1);
    return Array.from({ length: max }, (_, index) => Math.round(values[Math.round(index * step)] * 10) / 10);
};

/** timeZone: la del teléfono; el servidor del push pasa la de cada suscripción */
export const liveGameProps = (game: GameDetail, lang: string, now = Date.now(), timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone, extras?: LiveExtras): LiveGameProps => {
    const es = !lang.startsWith('en');
    const words = es ? TEXTS.es : TEXTS.en;
    const live = game.state === 'live';
    const between = !live || game.inning?.state === 'Middle' || game.inning?.state === 'End';
    const innings = game.linescore.length || game.inning?.n || game.scheduledInnings;
    const pro = extras?.pro === true;

    let inning = '';
    let inningShort = '';
    let inningMark = '';
    if (game.state === 'final') {
        inning = finalLabel(innings, game.scheduledInnings, lang);
        inningShort = 'F';
        inningMark = inning;
    } else if (!live) {
        // Demorado, calentamiento…
        inning = stateName(game.detailedState, lang);
        inningMark = inning;
    } else if (game.inning) {
        inning = inningLong(game.inning, es);
        inningShort = inningName(game.inning, lang, true);
        inningMark = inningMarkOf(game.inning, lang, es);
    }

    // Última jugada terminada (la del bateador actual todavía no tiene resultado)
    const last = [...game.atBats].reverse().find((atBat) => atBat.complete && (atBat.eventLabel || atBat.event));
    const matchup = live && !between ? game.matchup : null;
    const batterLine = matchup?.batter.h != null && matchup.batter.ab != null ? ` · ${matchup.batter.h}-${matchup.batter.ab}` : '';
    const pitches = matchup?.pitcher.pitches != null ? ` · ${matchup.pitcher.pitches} ${words.pitches}` : '';
    const outs = Math.min(game.count.outs, 3);
    const away = team(game.away, lang, extras);
    const home = team(game.home, lang, extras);

    const props: LiveGameProps = {
        gamePk: game.gamePk ?? 0,
        live,
        away,
        home,
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
        stopped: false,
        // PRO: vacíos en el Lite (la vista no los mira)
        pro,
        inningMark: '',
        leader: '',
        batterLabel: '',
        pitcherLabel: '',
        batterTag: '',
        pitcherTag: '',
        batterName: '',
        batterToday: '',
        batterLast: '',
        pitcherName: '',
        pitcherPitches: '',
        pitcherLast: '',
        pitch: '',
        firstName: '',
        secondName: '',
        thirdName: '',
        lastTone: '',
        plays: [],
        wpAway: -1,
        wpAwayText: '',
        wpHomeText: '',
        wpLeadText: '',
        wpLabel: '',
        wpSeries: [],
        summary: ''
    };
    if (!pro) return props;

    const awayRuns = game.away.runs ?? 0;
    const homeRuns = game.home.runs ?? 0;
    const current = matchup ? (game.atBats.find((atBat) => atBat.i === game.currentAtBat) ?? game.atBats.find((atBat) => !atBat.complete)) : undefined;
    const plays: LivePlay[] = [...game.atBats]
        .reverse()
        .filter((atBat) => atBat.complete && (atBat.eventLabel || atBat.event))
        .slice(0, 3)
        .map((atBat) => ({ label: eventName(atBat, lang).toUpperCase(), text: describePlay(atBat.desc, lang), tone: eventTone(atBat.event) }));
    const wpAway = typeof extras?.wpAway === 'number' && Number.isFinite(extras.wpAway) ? Math.min(100, Math.max(0, extras.wpAway)) : -1;
    const runner = (base: 'first' | 'second' | 'third') => (!between && game.runners[base]?.name ? lastName(game.runners[base]!.name) : '');

    props.inningMark = inningMark;
    props.leader = awayRuns > homeRuns ? 'away' : homeRuns > awayRuns ? 'home' : '';
    props.batterLabel = words.batter;
    props.pitcherLabel = words.pitching;
    props.batterTag = words.batterTag;
    props.pitcherTag = words.pitcherTag;
    if (matchup) {
        props.batterName = shortName(matchup.batter.name);
        props.batterToday = matchup.batter.h != null && matchup.batter.ab != null ? words.today(`${matchup.batter.h}-${matchup.batter.ab}`) : '';
        props.batterLast = lastName(matchup.batter.name);
        props.pitcherName = shortName(matchup.pitcher.name);
        props.pitcherPitches = matchup.pitcher.pitches != null ? words.pitchCount(matchup.pitcher.pitches) : '';
        props.pitcherLast = lastName(matchup.pitcher.name);
        props.pitch = lastPitchText(current, lang);
    }
    props.firstName = runner('first');
    props.secondName = runner('second');
    props.thirdName = runner('third');
    props.lastTone = last ? eventTone(last.event) : '';
    props.plays = plays;
    if (wpAway >= 0) {
        const homeWp = 100 - wpAway;
        props.wpAway = Math.round(wpAway * 10) / 10;
        props.wpAwayText = `${game.away.abbrev} ${words.percent(percentNumber(wpAway))}`;
        props.wpHomeText = `${game.home.abbrev} ${words.percent(percentNumber(homeWp))}`;
        props.wpLeadText = wpAway >= homeWp ? props.wpAwayText : props.wpHomeText;
        props.wpLabel = words.winProb;
        props.wpSeries = sample(extras?.wpSeries ?? [], 16);
    }
    props.summary = [`${away.name} ${awayRuns}`, `${home.name} ${homeRuns}`, inning, between ? '' : props.outsText].filter(Boolean).join(', ');
    return props;
};

/** Lo que cambia de verdad (sin la hora): para no gastar actualizaciones si nada pasó */
export const liveGameKey = (props: LiveGameProps) => JSON.stringify({ ...props, updated: '' });

/**
 * Con la fuente ligera (/api/v2/live) entre dos lecturas del detalle: solo cambian bolas y strikes del mismo turno.
 * Se cambia el conteo y se quita el último pitcheo (ya no es el que se ve).
 */
export const withCount = (props: LiveGameProps, balls: number, strikes: number): LiveGameProps => {
    if (props.between || (props.balls === Math.min(balls, 3) && props.strikes === Math.min(strikes, 2))) return props;
    return { ...props, balls: Math.min(balls, 3), strikes: Math.min(strikes, 2), count: `${balls}-${strikes}`, pitch: '' };
};
