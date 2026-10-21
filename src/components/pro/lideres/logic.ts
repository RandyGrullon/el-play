// Lógica de Líderes del modo PRO (pura, la misma de el-play/src/lib/pro/posiciones.ts de la web): tableros de líderes
// calculados con todas las líneas de la liga (/api/v2/pro/players) y la misma regla de calificado que Estadísticas PRO
// (2 apariciones por juego del equipo; lanzadores con 0,4 entradas por juego). Si algo no llega, no se inventa.
import type { LeagueAverages, ProHittingLine, ProPitchingLine, ProPlayerRow } from '../../../types/pro-liga';
import { joinList, phaseProgress } from '../posiciones/logic';

export { joinList };

/** Apariciones mínimas de un bateador calificado: 2 por juego del equipo (y al menos 5), como en Estadísticas */
export const minPlateAppearances = (teamGames: number) => Math.max(5, Math.floor(teamGames * 2));
/** Outs mínimos de un lanzador calificado en el PRO: 0,4 entradas por juego del equipo (20 IP en 50 juegos) */
export const minOutsPro = (teamGames: number) => Math.max(3, Math.floor(teamGames * 1.2));


export type LeaderGroupId = 'power' | 'contact' | 'discipline' | 'pitching' | 'fantasy';
export type LeaderCategoryId =
    | 'hr'
    | 'rbi'
    | 'slg'
    | 'iso'
    | 'avg'
    | 'h'
    | 'ops'
    | 'd'
    | 'obp'
    | 'bb'
    | 'bbPct'
    | 'kPct'
    | 'era'
    | 'k'
    | 'w'
    | 'sv'
    | 'pts'
    | 'ppgB'
    | 'ppgP'
    | 'ptsRP'
    | 'sb'
    | 'whip'
    | 'ip'
    | 'k9'
    | 'bb9'
    | 'fip'
    | 'hld';

/** Quién entra: bateadores, lanzadores, relevistas o todos (fantasy) */
export type LeaderPool = 'B' | 'P' | 'RP' | 'all';

export interface LeaderContext {
    /** Juegos del equipo que más ha jugado (regla de calificado de Estadísticas) */
    teamGames: number;
    /** Constante FIP de la liga (de /v2/pro/team-stats) */
    fip: number | null;
}

export interface LeaderCategory {
    id: LeaderCategoryId;
    pool: LeaderPool;
    /** count: conteo (nadie entra con 0); rate: tasa (solo calificados) */
    kind: 'count' | 'rate';
    lowerIsBetter?: boolean;
    value: (row: ProPlayerRow, context: LeaderContext) => number | null;
    /** Cómo se escribe (también decide los empates: mismo texto = empate) */
    format: (value: number) => string;
    /** Promedio de la liga para la barra de las tasas */
    average?: (averages: LeagueAverages) => number | null;
}

const num = (value: string | number | null | undefined) => {
    const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
    return Number.isFinite(parsed) ? parsed : null;
};

/** Promedio de bateo sin el cero de delante: .315, 1.039 */
export const rate3 = (value: number) => value.toFixed(3).replace(/^(-?)0(?=\.)/, '$1');
const fixed = (digits: number) => (value: number) => value.toFixed(digits);
const whole = (value: number) => String(Math.round(value));
const pctText = (value: number) => `${value.toFixed(1)}%`;
/** Entradas en notación de béisbol a partir de outs: 151 → «50.1» */
export const ipFromOuts = (outs: number) => `${Math.floor(outs / 3)}.${Math.round(outs) % 3}`;

const perPa = (row: ProPlayerRow, count: (h: NonNullable<ProPlayerRow['hitting']>) => number) => {
    const h = row.hitting;
    return h && h.pa > 0 ? (count(h) / h.pa) * 100 : null;
};
const perNine = (row: ProPlayerRow, count: (p: ProPitchingLine) => number) => {
    const p = row.pitching;
    return p && p.outs > 0 ? (count(p) * 27) / p.outs : null;
};

/** FIP con la constante de la liga: (13·HR + 3·(BB + GP) − 2·K) / IP + constante */
export const fipOf = (pitching: Pick<ProPitchingLine, 'hr' | 'bb' | 'hbp' | 'k' | 'outs'> | null | undefined, constant: number | null) => {
    if (!pitching || !(pitching.outs > 0) || constant === null || !Number.isFinite(constant)) return null;
    return (13 * pitching.hr + 3 * (pitching.bb + (pitching.hbp ?? 0)) - 2 * pitching.k) / (pitching.outs / 3) + constant;
};

/**
 * Poder aislado exacto con los conteos: (2B + 2·3B + 3·HR) / VB. Restar el SLG y el AVG que manda MLB (ya
 * redondeados a 3 cifras) se equivoca por .001 e inventa o pierde empates.
 */
export const isoOf = (hitting: Pick<ProHittingLine, 'd' | 't' | 'hr' | 'ab'> | null | undefined) =>
    hitting && hitting.ab > 0 ? (hitting.d + 2 * hitting.t + 3 * hitting.hr) / hitting.ab : null;

/** Relevista: menos de la mitad de sus juegos como abridor */
export const isReliever = (row: ProPlayerRow) => !!row.pitching && row.pitching.g > 0 && row.pitching.gs * 2 < row.pitching.g;

export const LEADER_CATEGORIES: Record<LeaderCategoryId, LeaderCategory> = {
    hr: { id: 'hr', pool: 'B', kind: 'count', value: (r) => r.hitting?.hr ?? null, format: whole },
    rbi: { id: 'rbi', pool: 'B', kind: 'count', value: (r) => r.hitting?.rbi ?? null, format: whole },
    slg: { id: 'slg', pool: 'B', kind: 'rate', value: (r) => num(r.hitting?.slg), format: rate3, average: (a) => num(a.slg) },
    iso: { id: 'iso', pool: 'B', kind: 'rate', value: (r) => isoOf(r.hitting), format: rate3, average: (a) => num(a.iso) },
    avg: { id: 'avg', pool: 'B', kind: 'rate', value: (r) => num(r.hitting?.avg), format: rate3, average: (a) => num(a.avg) },
    h: { id: 'h', pool: 'B', kind: 'count', value: (r) => r.hitting?.h ?? null, format: whole },
    ops: { id: 'ops', pool: 'B', kind: 'rate', value: (r) => num(r.hitting?.ops), format: rate3, average: (a) => num(a.ops) },
    d: { id: 'd', pool: 'B', kind: 'count', value: (r) => r.hitting?.d ?? null, format: whole },
    obp: { id: 'obp', pool: 'B', kind: 'rate', value: (r) => num(r.hitting?.obp), format: rate3, average: (a) => num(a.obp) },
    bb: { id: 'bb', pool: 'B', kind: 'count', value: (r) => r.hitting?.bb ?? null, format: whole },
    bbPct: { id: 'bbPct', pool: 'B', kind: 'rate', value: (r) => perPa(r, (h) => h.bb), format: pctText, average: (a) => a.bbPct },
    kPct: { id: 'kPct', pool: 'B', kind: 'rate', lowerIsBetter: true, value: (r) => perPa(r, (h) => h.k), format: pctText, average: (a) => a.kPct },
    era: { id: 'era', pool: 'P', kind: 'rate', lowerIsBetter: true, value: (r) => num(r.pitching?.era), format: fixed(2), average: (a) => num(a.era) },
    k: { id: 'k', pool: 'P', kind: 'count', value: (r) => r.pitching?.k ?? null, format: whole },
    w: { id: 'w', pool: 'P', kind: 'count', value: (r) => r.pitching?.w ?? null, format: whole },
    sv: { id: 'sv', pool: 'P', kind: 'count', value: (r) => r.pitching?.sv ?? null, format: whole },
    pts: { id: 'pts', pool: 'all', kind: 'count', value: (r) => (r.g > 0 ? r.pts : null), format: (v) => String(Math.round(v * 10) / 10) },
    ppgB: { id: 'ppgB', pool: 'B', kind: 'rate', value: (r) => (r.g > 0 ? r.ppg : null), format: fixed(1) },
    ppgP: { id: 'ppgP', pool: 'P', kind: 'rate', value: (r) => (r.g > 0 ? r.ppg : null), format: fixed(1) },
    ptsRP: { id: 'ptsRP', pool: 'RP', kind: 'count', value: (r) => (r.g > 0 ? r.pts : null), format: (v) => String(Math.round(v * 10) / 10) },
    sb: { id: 'sb', pool: 'B', kind: 'count', value: (r) => r.hitting?.sb ?? null, format: whole },
    whip: { id: 'whip', pool: 'P', kind: 'rate', lowerIsBetter: true, value: (r) => num(r.pitching?.whip), format: fixed(2), average: (a) => num(a.whip) },
    ip: { id: 'ip', pool: 'P', kind: 'count', value: (r) => r.pitching?.outs ?? null, format: ipFromOuts },
    k9: { id: 'k9', pool: 'P', kind: 'rate', value: (r) => perNine(r, (p) => p.k), format: fixed(1), average: (a) => a.k9 },
    bb9: { id: 'bb9', pool: 'P', kind: 'rate', lowerIsBetter: true, value: (r) => perNine(r, (p) => p.bb), format: fixed(1), average: (a) => a.bb9 },
    fip: { id: 'fip', pool: 'P', kind: 'rate', lowerIsBetter: true, value: (r, c) => fipOf(r.pitching, c.fip), format: fixed(2), average: (a) => num(a.era) },
    hld: { id: 'hld', pool: 'P', kind: 'count', value: (r) => r.pitching?.hld ?? null, format: whole }
};

/** Las cuatro tarjetas de cada grupo del tablero (como el diseño) */
export const LEADER_GROUPS: Record<LeaderGroupId, LeaderCategoryId[]> = {
    power: ['hr', 'rbi', 'slg', 'iso'],
    contact: ['avg', 'h', 'ops', 'd'],
    discipline: ['obp', 'bb', 'bbPct', 'kPct'],
    pitching: ['era', 'k', 'w', 'sv'],
    fantasy: ['pts', 'ppgB', 'ppgP', 'ptsRP']
};

/** Categorías avanzadas: siempre de la temporada regular */
export const ADVANCED_CATEGORIES: LeaderCategoryId[] = ['sb', 'whip', 'ip', 'k9', 'bb9', 'fip', 'hld'];

/** Calificado para las tasas: bateadores por apariciones y lanzadores por outs, como en Estadísticas PRO */
export const isQualified = (row: ProPlayerRow, pool: LeaderPool, teamGames: number) => {
    const minimums = qualifierMinimums(teamGames);
    if (pool === 'B') return (row.hitting?.pa ?? 0) >= minimums.pa;
    if (pool === 'P' || pool === 'RP') return (row.pitching?.outs ?? 0) >= minimums.outs;
    return true;
};

const inPool = (row: ProPlayerRow, pool: LeaderPool) => {
    if (pool === 'B') return !!row.hitting && row.hitting.pa > 0;
    if (pool === 'P') return !!row.pitching && row.pitching.outs > 0;
    if (pool === 'RP') return isReliever(row) && (row.pitching?.outs ?? 0) > 0;
    return row.g > 0;
};

export interface RankedLeader {
    row: ProPlayerRow;
    value: number;
    display: string;
    /** Puesto con empates («T-4»: 4, 4, 4, 7…) */
    rank: number;
    tied: boolean;
}

export interface LeaderBoard {
    category: LeaderCategory;
    /** Hasta `limit` filas, del mejor al peor */
    leaders: RankedLeader[];
    /** Empatados en el último puesto que no caben («+2 empatados») */
    tiedOut: RankedLeader[];
    /** Cuántos entran en la categoría (calificados en las tasas, con más de 0 en los conteos) */
    eligible: number;
    /** Promedio de la liga (tasas) para la barra */
    average: number | null;
}

/** Todos los que entran en una categoría, ya ordenados y con su puesto (empates por el valor escrito) */
export const rankAll = (rows: readonly ProPlayerRow[], category: LeaderCategory, context: LeaderContext): RankedLeader[] => {
    const entries = rows
        .filter((row) => inPool(row, category.pool))
        .filter((row) => category.kind === 'count' || isQualified(row, category.pool, context.teamGames))
        .map((row) => ({ row, value: category.value(row, context) }))
        .filter((item): item is { row: ProPlayerRow; value: number } => item.value !== null && Number.isFinite(item.value) && (category.kind === 'rate' || item.value > 0))
        .map((item) => ({ ...item, display: category.format(item.value) }));
    const better = (a: number, b: number) => (category.lowerIsBetter ? a - b : b - a);
    entries.sort((a, b) => better(a.value, b.value) || a.row.name.localeCompare(b.row.name, 'es'));
    const ranked: RankedLeader[] = [];
    entries.forEach((entry, index) => {
        const previous = ranked[index - 1];
        const rank = previous && previous.display === entry.display ? previous.rank : index + 1;
        ranked.push({ ...entry, rank, tied: false });
    });
    for (const item of ranked) item.tied = ranked.filter((other) => other.rank === item.rank).length > 1;
    return ranked;
};

/** Tablero de una categoría: top `limit` (con empates) y los empatados que no caben */
export const rankCategory = (rows: readonly ProPlayerRow[], category: LeaderCategory, context: LeaderContext, averages?: LeagueAverages | null, limit = 10): LeaderBoard => {
    const all = rankAll(rows, category, context);
    const top = all.filter((item) => item.rank <= limit);
    return {
        category,
        leaders: top.slice(0, limit),
        tiedOut: top.slice(limit),
        eligible: all.length,
        average: averages && category.average ? category.average(averages) : null
    };
};

/**
 * Largo de la barra de un líder (0 a 1): en los conteos, proporcional al N.º 1 desde 0; en las tasas arranca en el
 * promedio de la liga (si no lo hay, en 0) y el N.º 1 llena la barra.
 */
export const leaderBar = (value: number, best: number, category: Pick<LeaderCategory, 'kind' | 'lowerIsBetter'>, average: number | null) => {
    const hasAverage = category.kind === 'rate' && average !== null && Number.isFinite(average);
    // Menos es mejor sin promedio de la liga: proporción inversa al N.º 1
    if (category.lowerIsBetter && !hasAverage) return value <= 0 ? 1 : Math.min(1, Math.max(0, best / value));
    const base = hasAverage ? (average as number) : 0;
    const span = category.lowerIsBetter ? base - best : best - base;
    if (!(span > 0)) return value === best ? 1 : 0;
    const share = category.lowerIsBetter ? (base - value) / span : (value - base) / span;
    return Math.min(1, Math.max(0, share));
};

/** Ventaja del N.º 1 sobre el siguiente puesto (0 si están empatados; null si no hay segundo) */
export const marginOverSecond = (board: Pick<LeaderBoard, 'leaders'>) => {
    const [first, ...rest] = board.leaders;
    if (!first || !rest.length) return null;
    const second = rest.find((item) => item.rank > first.rank);
    if (!second) return 0;
    return first.value - second.value;
};

/** Histograma de valores en `bins` tramos iguales; `binOf` dice en qué tramo cae un valor */
export const histogram = (values: readonly number[], bins = 8) => {
    const finite = values.filter((value) => Number.isFinite(value));
    const counts = new Array<number>(bins).fill(0);
    if (!finite.length) return { counts, min: 0, max: 0, binOf: () => 0 };
    const min = Math.min(...finite);
    const max = Math.max(...finite);
    const binOf = (value: number) => (max === min ? bins - 1 : Math.min(bins - 1, Math.max(0, Math.floor(((value - min) / (max - min)) * bins))));
    for (const value of finite) counts[binOf(value)]++;
    return { counts, min, max, binOf };
};

/**
 * Triple corona: quién va primero en cada una de las tres (con empates), si alguien las lidera todas y quiénes
 * están en el top 10 de las tres.
 */
export const tripleCrown = (boards: readonly LeaderBoard[]) => {
    const firsts = boards.map((board) => board.leaders.filter((item) => item.rank === 1));
    const ids = (board: LeaderBoard) => new Set([...board.leaders, ...board.tiedOut].map((item) => item.row.id));
    const sets = boards.map(ids);
    const leadsAll = firsts.length > 0 && firsts.every((list) => list.length > 0) ? firsts[0].filter((item) => firsts.every((list) => list.some((other) => other.row.id === item.row.id))).map((item) => item.row) : [];
    const order = boards[0] ? [...boards[0].leaders, ...boards[0].tiedOut] : [];
    const inAll = order.filter((item) => sets.every((set) => set.has(item.row.id))).map((item) => item.row);
    return { firsts, leadsAll, inAll };
};

/** Mínimos para calificar con la regla de Estadísticas PRO: apariciones de los bateadores y outs de los lanzadores */
export const qualifierMinimums = (teamGames: number) => ({ pa: minPlateAppearances(teamGames), outs: minOutsPro(teamGames) });

// Partículas que van con el apellido («De La Cruz», «De Los Santos», «Van der Meer») y sufijos («Rojas Jr.»)
const PARTICLES = new Set(['de', 'del', 'la', 'las', 'los', 'da', 'das', 'do', 'dos', 'di', 'du', 'van', 'von', 'der', 'den', 'ter', 'ten', 'le', 'st.', 'st']);
const SUFFIXES = new Set(['jr.', 'jr', 'sr.', 'sr', 'ii', 'iii', 'iv']);

/** Divide un nombre en nombre(s) de pila y apellido: el último apellido con sus partículas y su sufijo */
const splitName = (name: string) => {
    const parts = name.split(/\s+/).filter(Boolean);
    let end = parts.length;
    while (end > 1 && SUFFIXES.has(parts[end - 1].toLowerCase())) end--;
    if (end <= 1) return { given: [] as string[], last: parts.join(' ') };
    let start = end - 1;
    while (start > 1 && PARTICLES.has(parts[start - 1].toLowerCase())) start--;
    return { given: parts.slice(0, start), last: parts.slice(start).join(' ') };
};

/**
 * Apellido para rótulos cortos: el último apellido con sus partículas y su sufijo, sin los nombres de pila
 * («Bryan De La Cruz» → «De La Cruz», «José Manuel Fernández» → «Fernández», «Mel Rojas Jr.» → «Rojas Jr.»).
 */
export const surname = (name: string) => splitName(name).last || name;

/** Para comparar apellidos: sin tildes ni mayúsculas («Rodriguez» = «Rodríguez») */
const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Rótulos cortos sin confusiones entre los peloteros que se ven en pantalla: el apellido solo; si dos comparten
 * apellido, la inicial delante («B. De La Cruz» y «O. De La Cruz») y, si también comparten inicial, las letras
 * que hagan falta («Ad. Rodríguez», «Al. Rodríguez»).
 */
export const shortLabels = (people: readonly { id: number; name: string }[]) => {
    const unique = [...new Map(people.map((person) => [person.id, person])).values()];
    const groups = new Map<string, { id: number; name: string; given: string; last: string }[]>();
    for (const person of unique) {
        const { given, last } = splitName(person.name);
        const key = fold(last || person.name);
        const list = groups.get(key) ?? [];
        list.push({ id: person.id, name: person.name, given: given[0] ?? '', last: last || person.name });
        groups.set(key, list);
    }
    const labels = new Map<number, string>();
    for (const list of groups.values()) {
        for (const person of list) {
            const others = list.filter((other) => other.id !== person.id);
            if (!others.length || !person.given) {
                labels.set(person.id, person.last);
                continue;
            }
            const mine = fold(person.given);
            let size = 1;
            while (size < mine.length && others.some((other) => fold(other.given).startsWith(mine.slice(0, size)))) size++;
            const prefix = person.given.slice(0, size);
            labels.set(person.id, size >= person.given.length ? `${person.given} ${person.last}` : `${prefix}. ${person.last}`);
        }
    }
    return labels;
};

/** Juegos del equipo que más ha jugado (como Estadísticas: el bateador con más juegos) */
export const teamGamesOf = (rows: readonly ProPlayerRow[]) => rows.reduce((max, row) => Math.max(max, row.hitting?.g ?? 0), 0);

/** Con menos de estos juegos por equipo en la regular, Líderes muestra la temporada anterior completa */
export const MIN_TEAM_GAMES = 10;

/**
 * Temporada de los líderes: la de las posiciones; en LIDOM, si la nueva lleva muy pocos juegos en la regular,
 * la anterior completa (y la pantalla lo dice). `preferCurrent` es el «ver la nueva igual» del usuario.
 */
export const leadersSeason = (
    standings: { season: number; isPreviousSeason: boolean; type: string; regular?: readonly { wins: number; losses: number }[] } | undefined,
    preferCurrent = false
) => {
    if (!standings) return null;
    const games = standings.type === 'lidom' && standings.regular ? phaseProgress(standings.regular, null).played : null;
    const thin = standings.type === 'lidom' && !standings.isPreviousSeason && games !== null && games < MIN_TEAM_GAMES;
    return { season: thin && !preferCurrent ? standings.season - 1 : standings.season, current: standings.season, games, thin, fallback: thin && !preferCurrent };
};
