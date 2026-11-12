// Widget de la pantalla de inicio del iPhone (src/live/HomeWidget.tsx): qué juego va arriba, los otros del día, los
// accesos directos y los textos ya armados (la vista corre aparte, dentro de la extensión, y no puede formatear nada).
// El widget no busca datos solo: muestra lo último que la app le pasó (hooks/useHomeWidget.ts) y una línea de tiempo con
// lo que se sabe de antemano (cuando empieza el juego, cuando el marcador ya puede estar viejo).
// Sin nada de React Native: se prueba con node en scripts/probar-jugadas.js.
import type { SFSymbol } from 'sf-symbols-typescript';
import type { ScheduleGame, ScheduleTeam } from '../types';
import { finalLabel, inningName, isNotPlayed, isSuspended } from './baseball';
import { dayKey, formatTime } from './format';

export interface WidgetTeam {
    abbrev: string;
    /** Color del equipo (#RRGGBB) y el texto que se lee encima */
    color: string;
    ink: string;
    /** Carreras; vacío antes de empezar */
    runs: string;
    /** Récord «12-8» (lo que sale antes de empezar); vacío si no se sabe */
    record: string;
}

export type WidgetPhase = 'live' | 'pre' | 'final' | 'off';

export interface WidgetGame {
    gamePk: number;
    /** Abre el juego en la app */
    url: string;
    away: WidgetTeam;
    home: WidgetTeam;
    phase: WidgetPhase;
    /** «▲ 7», «7:00 p. m.», «Final», «Pospuesto» */
    status: string;
    /** «2 outs», «Hoy», «Mañana», «vie 14», «Ganó AAA» */
    detail: string;
    /** Juega tu equipo favorito */
    mine: boolean;
    outs: number;
    first: boolean;
    second: boolean;
    third: boolean;
}

export interface WidgetShortcut {
    label: string;
    url: string;
    /** Símbolo del sistema (SF Symbols) */
    icon: SFSymbol;
}

export interface HomeWidgetProps {
    /** La app ya le pasó datos alguna vez (si no, el widget invita a abrirla) */
    ready: boolean;
    /** «Tu equipo», «En vivo», «Próximo juego», «Último juego» */
    title: string;
    featured: WidgetGame | null;
    /** Los otros juegos del mismo día (hasta 4) */
    others: WidgetGame[];
    /** «3 en vivo»; vacío si no hay */
    liveCount: string;
    /** «No hay juegos hoy» o «Abre El Play para ver tus juegos» */
    emptyText: string;
    /** «Actualizado 9:40 p. m.» */
    updated: string;
    /** El marcador puede estar viejo (la línea de tiempo lo enciende): «Toca para actualizar» */
    stale: boolean;
    staleText: string;
    /** «En juego» (cuando la línea de tiempo llega a la hora de inicio) */
    startedText: string;
    shortcuts: WidgetShortcut[];
}

export interface HomeWidgetTexts {
    favorite: string;
    live: string;
    next: string;
    last: string;
    today: string;
    tomorrow: string;
    postponed: string;
    suspended: string;
    started: string;
    /** «{{count}} en vivo» ya con el número puesto */
    liveCount: (count: number) => string;
    outs: (count: number) => string;
    won: (abbrev: string) => string;
    noGames: string;
    openApp: string;
    updated: (time: string) => string;
    staleText: string;
    shortcutLive: string;
    shortcutTeam: string;
    shortcutToday: string;
    shortcutFantasy: string;
    shortcutStandings: string;
}

export interface HomeWidgetInput {
    games: ScheduleGame[];
    favoriteTeamId: number | null;
    lang: string;
    now: number;
    texts: HomeWidgetTexts;
    timeZone?: string;
    /** Cuándo se leyeron los datos (la lectura más reciente); si no, `now` */
    updatedAt?: number;
}

export const SCHEME = 'elplay://';
/** Pasado este tiempo sin otra lectura, un juego en vivo se marca como posiblemente viejo */
export const LIVE_STALE_MS = 15 * 60 * 1000;
/** Lo más lejos que se adelanta el inicio de un juego en la línea de tiempo */
const START_AHEAD_MS = 24 * 60 * 60 * 1000;

const HEX = /^#[0-9a-f]{6}$/i;

/** Texto sobre el color de un equipo (igual que inkOn de theme/tokens.ts) */
const inkOn = (hex: string) => {
    const value = parseInt(hex.slice(1), 16);
    const [r, g, b] = [(value >> 16) & 255, (value >> 8) & 255, value & 255];
    return 0.299 * r + 0.587 * g + 0.114 * b > 160 ? '#14151a' : '#ffffff';
};

const team = (side: ScheduleTeam, started: boolean): WidgetTeam => {
    const color = HEX.test(side.color) ? side.color : '#2563eb';
    const record = side.record ? `${side.record.wins}-${side.record.losses}` : '';
    return { abbrev: side.abbrev, color, ink: inkOn(color), runs: started ? String(side.score ?? 0) : '', record };
};

const phaseOf = (game: ScheduleGame): WidgetPhase => {
    const state = game.detailedState ?? '';
    if (isNotPlayed(state) || (isSuspended(state) && game.state !== 'live')) return 'off';
    if (game.state === 'live') return 'live';
    if (game.state === 'final') return 'final';
    return 'pre';
};

const startOf = (game: ScheduleGame) => {
    const value = Date.parse(game.date);
    return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
};

/** «Hoy», «Mañana» o el día corto («vie 14») */
const dayLabel = (value: string, input: HomeWidgetInput) => {
    const key = dayKey(value, input.timeZone);
    if (key === dayKey(input.now, input.timeZone)) return input.texts.today;
    if (key === dayKey(input.now + 24 * 60 * 60 * 1000, input.timeZone)) return input.texts.tomorrow;
    const locale = input.lang.startsWith('en') ? 'en-US' : 'es-DO';
    return new Date(value).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', timeZone: input.timeZone ?? 'America/Santo_Domingo' }).replace(/\./g, '');
};

const widgetGame = (game: ScheduleGame, input: HomeWidgetInput): WidgetGame => {
    const phase = phaseOf(game);
    const { texts, lang } = input;
    const live = game.live;
    const started = phase === 'live' || phase === 'final';
    let status = '';
    let detail = '';
    if (phase === 'live') {
        status = live?.inning ? inningName({ n: live.inning, isTop: live.isTop, state: live.inningState }, lang, true) : texts.live;
        const between = live?.inningState === 'Middle' || live?.inningState === 'End';
        detail = between ? '' : texts.outs(live?.outs ?? 0);
    } else if (phase === 'final') {
        status = finalLabel(game.inningsPlayed ?? 0, game.scheduledInnings, lang);
        const winner = game.away.isWinner ? game.away : game.home.isWinner ? game.home : null;
        detail = winner ? texts.won(winner.abbrev) : '';
    } else if (phase === 'off') {
        status = isSuspended(game.detailedState ?? '') ? texts.suspended : texts.postponed;
        detail = dayLabel(game.date, input);
    } else {
        status = game.startTimeTBD ? '—' : formatTime(game.date, lang, input.timeZone);
        detail = dayLabel(game.date, input);
    }
    const runners = phase === 'live' && live ? live.runners : { first: false, second: false, third: false };
    return {
        gamePk: game.gamePk,
        url: `${SCHEME}juego/${game.gamePk}`,
        away: team(game.away, started),
        home: team(game.home, started),
        phase,
        status,
        detail,
        mine: input.favoriteTeamId !== null && (game.away.id === input.favoriteTeamId || game.home.id === input.favoriteTeamId),
        outs: phase === 'live' ? (live?.outs ?? 0) : 0,
        first: runners.first,
        second: runners.second,
        third: runners.third
    };
};

/** Orden para escoger: en vivo, el próximo que empieza, el último que terminó (los no jugados al final) */
const rank = (game: ScheduleGame, now: number) => {
    const phase = phaseOf(game);
    if (phase === 'live') return [0, startOf(game)];
    if (phase === 'pre' && startOf(game) >= now - 3 * 60 * 60 * 1000) return [1, startOf(game)];
    if (phase === 'final') return [2, -startOf(game)];
    return [3, startOf(game)];
};
const byRank = (now: number) => (a: ScheduleGame, b: ScheduleGame) => {
    const [ra, sa] = rank(a, now);
    const [rb, sb] = rank(b, now);
    return ra - rb || sa - sb || a.gamePk - b.gamePk;
};

/** El juego de arriba: el de tu equipo (en vivo, el próximo o el último); si no, uno en vivo, el próximo o el último */
const pickFeatured = (games: ScheduleGame[], input: HomeWidgetInput) => {
    const order = byRank(input.now);
    const mine = input.favoriteTeamId === null ? [] : games.filter((game) => game.away.id === input.favoriteTeamId || game.home.id === input.favoriteTeamId);
    const today = dayKey(input.now, input.timeZone);
    // De tu equipo: el de hoy o, si hoy no juega, el próximo (el último que terminó solo si es de hoy)
    const mineToday = mine.filter((game) => dayKey(game.date, input.timeZone) === today).sort(order);
    const mineNext = mine.filter((game) => phaseOf(game) === 'pre' && startOf(game) > input.now).sort(order);
    const favorite = mineToday[0] ?? mineNext[0];
    if (favorite) return { game: favorite, title: input.texts.favorite };
    const sorted = [...games].sort(order);
    const first = sorted[0];
    if (!first) return null;
    const phase = phaseOf(first);
    return { game: first, title: phase === 'live' ? input.texts.live : phase === 'final' ? input.texts.last : input.texts.next };
};

const shortcuts = (input: HomeWidgetInput): WidgetShortcut[] => {
    const { texts, favoriteTeamId } = input;
    return [
        { label: texts.shortcutLive, url: `${SCHEME}en-vivo`, icon: 'dot.radiowaves.left.and.right' },
        favoriteTeamId !== null
            ? { label: texts.shortcutTeam, url: `${SCHEME}equipo/${favoriteTeamId}`, icon: 'star.fill' }
            : { label: texts.shortcutToday, url: SCHEME, icon: 'calendar' },
        { label: texts.shortcutFantasy, url: `${SCHEME}fantasy`, icon: 'trophy.fill' },
        { label: texts.shortcutStandings, url: `${SCHEME}posiciones`, icon: 'list.number' }
    ];
};

/** Lo que se le pasa al widget con los juegos que la app tiene a mano */
export const homeWidgetProps = (input: HomeWidgetInput): HomeWidgetProps => {
    const unique = new Map<number, ScheduleGame>();
    for (const game of input.games) if (!unique.has(game.gamePk)) unique.set(game.gamePk, game);
    const games = [...unique.values()];
    const picked = pickFeatured(games, input);
    const featured = picked ? widgetGame(picked.game, input) : null;
    // Los otros: los del mismo día del juego de arriba (o de hoy), en el mismo orden
    const day = picked ? dayKey(picked.game.date, input.timeZone) : dayKey(input.now, input.timeZone);
    const others = games
        .filter((game) => game.gamePk !== picked?.game.gamePk && dayKey(game.date, input.timeZone) === day)
        .sort(byRank(input.now))
        .slice(0, 4)
        .map((game) => widgetGame(game, input));
    const live = games.filter((game) => phaseOf(game) === 'live').length;
    return {
        ready: true,
        title: picked?.title ?? '',
        featured,
        others,
        liveCount: live > 0 ? input.texts.liveCount(live) : '',
        emptyText: input.texts.noGames,
        updated: input.texts.updated(formatTime(new Date(input.updatedAt ?? input.now).toISOString(), input.lang, input.timeZone)),
        stale: false,
        staleText: input.texts.staleText,
        startedText: input.texts.started,
        shortcuts: shortcuts(input)
    };
};

/** Para no mandarle lo mismo al widget: todo menos la hora de actualizado */
export const homeWidgetKey = (props: HomeWidgetProps) => JSON.stringify({ ...props, updated: '' });

export interface WidgetEntry {
    at: number;
    props: HomeWidgetProps;
}

/**
 * Línea de tiempo del iPhone: ahora; cuando empieza el juego de arriba (si es antes de 24 h), que pase a «En juego»
 * con «Toca para actualizar» (no se sabe el marcador); y si hay algo en vivo, a los 15 minutos se marca como viejo.
 */
export const homeWidgetTimeline = (props: HomeWidgetProps, now: number, featuredStart: number | null, updatedAt = now): WidgetEntry[] => {
    const anyLive = props.featured?.phase === 'live' || props.others.some((game) => game.phase === 'live');
    // La lectura ya tiene más de 15 minutos con algo en vivo: viejo desde ya
    const staleAt = updatedAt + LIVE_STALE_MS;
    const entries: WidgetEntry[] = [{ at: now, props: anyLive && staleAt <= now ? { ...props, stale: true } : props }];
    const featured = props.featured;
    if (featured?.phase === 'pre' && featuredStart !== null && featuredStart > now && featuredStart - now <= START_AHEAD_MS) {
        const zero = (side: WidgetTeam): WidgetTeam => ({ ...side, runs: '0' });
        entries.push({
            at: featuredStart,
            props: { ...props, stale: true, featured: { ...featured, phase: 'live', status: props.startedText, detail: '', away: zero(featured.away), home: zero(featured.home) } }
        });
    }
    if (anyLive && staleAt > now) entries.push({ at: staleAt, props: { ...props, stale: true } });
    return entries.sort((a, b) => a.at - b.at);
};

/** La hora de inicio del juego de arriba (para la línea de tiempo) */
export const featuredStartOf = (games: ScheduleGame[], props: HomeWidgetProps) => {
    const game = games.find((item) => item.gamePk === props.featured?.gamePk);
    if (!game || game.startTimeTBD) return null;
    const start = Date.parse(game.date);
    return Number.isFinite(start) ? start : null;
};

/** Antes de que la app le pase datos (recién instalado): la invitación a abrirla y los accesos directos */
export const emptyHomeWidgetProps = (texts: Pick<HomeWidgetTexts, 'openApp' | 'shortcutLive' | 'shortcutToday' | 'shortcutFantasy' | 'shortcutStandings'>): HomeWidgetProps => ({
    ready: false,
    title: '',
    featured: null,
    others: [],
    liveCount: '',
    emptyText: texts.openApp,
    updated: '',
    stale: false,
    staleText: '',
    startedText: '',
    shortcuts: [
        { label: texts.shortcutLive, url: `${SCHEME}en-vivo`, icon: 'dot.radiowaves.left.and.right' },
        { label: texts.shortcutToday, url: SCHEME, icon: 'calendar' },
        { label: texts.shortcutFantasy, url: `${SCHEME}fantasy`, icon: 'trophy.fill' },
        { label: texts.shortcutStandings, url: `${SCHEME}posiciones`, icon: 'list.number' }
    ]
});

/** Lo que la app usa para pasarle la línea de tiempo al widget (src/live/homeWidgetSurface.ios.ts; null fuera del iPhone) */
export interface HomeWidgetSurface {
    update: (entries: WidgetEntry[]) => void;
}
