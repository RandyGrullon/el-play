// Lógica de Posiciones del modo PRO (pura, la misma de el-play/src/lib/pro/posiciones.ts de la web): carrera por la
// clasificación, línea de corte, cara a cara, la fecha en cifras, situaciones e insignias.
// Todo sale de datos reales: si algo no llega, la función devuelve null y la pantalla no lo pinta.
// Las filas pueden venir sin `pro` (producción todavía sin /api/v2/pro/standings: se usan las posiciones del Lite).
import type { StandingRow } from '../../../types';
import type { CalendarGame, PhaseRace, ProPhaseId, SeasonCalendar, SplitType, StandingPro, WinLoss } from '../../../types/pro-liga';

/** Fila de la tabla PRO: la de siempre con `pro` si el servidor ya lo manda (y la diferencia del Clásico) */
export type TableRow = StandingRow & { runDiff?: number; pro?: StandingPro | null };

// ---------------------------------------------------------------- posiciones

/** Juegos sobre .500 (+15, −2) */
export const overFive = (record: { wins: number; losses: number }) => record.wins - record.losses;

/** Avance de una fase: lo que lleva el equipo que más ha jugado contra lo que juega cada uno */
export const phaseProgress = (rows: readonly { wins: number; losses: number }[], perTeam: number | null | undefined) => {
    const played = rows.reduce((max, row) => Math.max(max, row.wins + row.losses), 0);
    const total = perTeam && perTeam > 0 ? perTeam : null;
    return { played, perTeam: total, share: total ? Math.min(1, played / total) : null };
};

/** «W3» → ganó 3 seguidos; «L1» → perdió 1. null si MLB no manda racha («-») */
export const streakParts = (code: string | null | undefined): { won: boolean; count: number } | null => {
    const match = (code ?? '').match(/^([WL])(\d+)$/);
    return match ? { won: match[1] === 'W', count: Number(match[2]) } : null;
};

/** Ganados de más (+) o de menos (−) contra el récord esperado de MLB; null sin esperado */
export const luckOf = (row: Pick<TableRow, 'wins' | 'pro'>) => (row.pro?.expected ? row.wins - row.pro.expected.wins : null);

/** Diferencia de carreras: la de MLB (o la del Clásico, que calcula el servidor) o CA − CP */
export const runDiffOf = (row: Pick<TableRow, 'runDiff' | 'runsScored' | 'runsAllowed' | 'pro'>) => {
    if (row.pro?.runDiff !== null && row.pro?.runDiff !== undefined) return row.pro.runDiff;
    if (typeof row.runDiff === 'number') return row.runDiff;
    if (typeof row.runsScored === 'number' && typeof row.runsAllowed === 'number') return row.runsScored - row.runsAllowed;
    return null;
};

export type StandingBadge = { kind: 'clinched' } | { kind: 'eliminated' } | { kind: 'elimination'; number: number } | null;

/** Insignia bajo la sigla: clasificado, eliminado o el número de eliminación (solo debajo del corte) */
export const standingBadge = (row: TableRow, advance: number | null): StandingBadge => {
    const pro = row.pro;
    if (!pro) return null;
    if (pro.clinched) return { kind: 'clinched' };
    if (pro.eliminated || pro.eliminationNumber === 'E') return { kind: 'eliminated' };
    if (advance !== null && row.rank > advance && typeof pro.eliminationNumber === 'number' && pro.eliminationNumber > 0) return { kind: 'elimination', number: pro.eliminationNumber };
    return null;
};

export type CutStatus = { kind: 'clinched' } | { kind: 'eliminated' } | { kind: 'in' } | { kind: 'line' } | { kind: 'tied' } | { kind: 'behind'; games: number } | null;

/** Dónde queda un equipo respecto a la línea de corte (para «4.º lugar · en la línea de corte») */
export const cutStatus = (row: TableRow, advance: number | null): CutStatus => {
    const pro = row.pro;
    if (!pro || advance === null) return null;
    if (pro.clinched) return { kind: 'clinched' };
    if (pro.eliminated) return { kind: 'eliminated' };
    const games = pro.cutGamesBack;
    if (games === null || games === undefined) return null;
    if (games < 0) return { kind: 'in' };
    if (games === 0) return row.rank <= advance ? { kind: 'line' } : { kind: 'tied' };
    return { kind: 'behind', games };
};

// ---------------------------------------------------------------- carrera por la clasificación

export interface RaceLine {
    teamId: number;
    /** Juegos sobre .500: values[0] = 0 (inicio) y luego uno por fecha */
    values: number[];
}

export interface RaceModel {
    dates: string[];
    lines: RaceLine[];
    /** Centro de la línea de corte en cada punto (entre el último que pasa y el primero que no) */
    cut: number[] | null;
    /** Dominio simétrico del eje y (al menos ±2) */
    domain: [number, number];
}

/**
 * Líneas de la carrera: juegos sobre .500 de cada equipo al cierre de cada fecha (más el inicio en 0) y el centro
 * de la línea de corte (`advance` equipos pasan). Sin fechas no hay carrera.
 */
export const raceModel = (race: PhaseRace | undefined, teamIds: readonly number[], advance: number | null): RaceModel | null => {
    if (!race || !race.dates.length) return null;
    const lines: RaceLine[] = teamIds
        .filter((id) => race.teams[id])
        .map((id) => {
            const line = race.teams[id];
            return { teamId: id, values: [0, ...line.w.map((wins, index) => wins - (line.l[index] ?? 0))] };
        });
    if (!lines.length) return null;
    const points = race.dates.length + 1;
    const cut =
        advance !== null && advance > 0 && lines.length > advance
            ? Array.from({ length: points }, (_, index) => {
                  const sorted = lines.map((line) => line.values[index]).sort((a, b) => b - a);
                  return (sorted[advance - 1] + sorted[advance]) / 2;
              })
            : null;
    // Medio juego de aire arriba y abajo para que ninguna línea toque el borde
    const reach = Math.max(2, ...lines.flatMap((line) => line.values.map((value) => Math.abs(value) + 0.5)), ...(cut ?? []).map((value) => Math.abs(value) + 0.5));
    const top = Math.ceil(reach);
    return { dates: [...race.dates], lines, cut, domain: [-top, top] };
};

/** Marcas del eje y de la carrera: de 1 en 1 hasta ±4; si no, unas 5 marcas redondas pares */
export const raceTicks = (domain: [number, number]) => {
    const top = domain[1];
    const step = top <= 4 ? 1 : top <= 10 ? 2 : top <= 20 ? 5 : 10;
    const ticks: number[] = [];
    for (let value = -Math.floor(top / step) * step; value <= top; value += step) ticks.push(value);
    return ticks;
};

/** Qué fechas se rotulan en el eje x: el inicio, unas pocas intermedias y la última (índices de punto, 0 = inicio) */
export const raceDateTicks = (dates: number, max = 3) => {
    if (dates <= 0) return [0];
    if (dates <= max) return [0, ...Array.from({ length: dates }, (_, index) => index + 1)];
    const ticks = new Set<number>([0, dates]);
    for (let k = 1; k < max; k++) ticks.add(Math.round((dates * k) / max));
    return [...ticks].sort((a, b) => a - b);
};

/**
 * Reparte los rótulos del final de las líneas para que no se pisen: cada uno lo más cerca posible de su línea y
 * al menos `gap` px del vecino, dentro de [min, max]. Devuelve las y en el mismo orden.
 */
export const spreadLabels = (targets: readonly number[], gap: number, min: number, max: number) => {
    const order = targets.map((y, index) => ({ y, index })).sort((a, b) => a.y - b.y || a.index - b.index);
    const placed = order.map((item) => item.y);
    for (let index = 0; index < placed.length; index++) {
        placed[index] = Math.max(placed[index], index === 0 ? min : placed[index - 1] + gap);
    }
    // Si se salieron por abajo, se empujan hacia arriba
    for (let index = placed.length - 1; index >= 0; index--) {
        const limit = index === placed.length - 1 ? max : placed[index + 1] - gap;
        placed[index] = Math.min(placed[index], limit);
    }
    const result = new Array<number>(targets.length);
    order.forEach((item, index) => (result[item.index] = placed[index]));
    return result;
};

// ---------------------------------------------------------------- calendario: hoy, cara a cara y la fecha en cifras

const isFinal = (game: CalendarGame) => game.state === 'final' && game.away.score !== null && game.home.score !== null;
const isPending = (game: CalendarGame) => game.state === 'preview' || game.state === 'live';

/** Juegos de la próxima fecha con juegos por jugar o en vivo de la fase (hoy si los hay) */
export const upcomingDay = (calendar: SeasonCalendar | undefined, phase: ProPhaseId, today: string) => {
    const games = (calendar?.games ?? []).filter((game) => game.phase === phase && isPending(game) && game.day >= today);
    if (!games.length) return null;
    const day = games.reduce((first, game) => (game.day < first ? game.day : first), games[0].day);
    return { day, games: games.filter((game) => game.day === day).sort((a, b) => a.date.localeCompare(b.date)) };
};

/** Juegos por jugar de la fase desde hoy (para «Por jugar · 3 juegos hoy») */
export const pendingGames = (calendar: SeasonCalendar | undefined, phase: ProPhaseId, today: string) =>
    (calendar?.games ?? []).filter((game) => game.phase === phase && isPending(game) && game.day >= today);

/** Desde esta diferencia un juego es una paliza; con menos, es solo el mayor margen de la fecha */
export const BLOWOUT_RUNS = 5;

/** Cómo llamar al juego de mayor diferencia de la fecha: paliza (5+), margen (1-4) o nada (sin diferencia) */
export const marginKind = (margin: number | null | undefined): 'blowout' | 'margin' | null => (!margin || margin <= 0 ? null : margin >= BLOWOUT_RUNS ? 'blowout' : 'margin');

/** Nombre corto del estadio: sin «Estadio», sin la dedicatoria («Quisqueya Juan Marichal» → «Quisqueya») ni el «de …» */
export const shortVenue = (venue: string | null | undefined) => {
    const name = (venue ?? '')
        .trim()
        .replace(/^Estadio\s+(de\s+Béisbol\s+)?/i, '')
        .replace(/\s+Stadium$/i, '');
    if (/^Quisqueya\b/i.test(name)) return 'Quisqueya';
    // «Panamericano de los Charros» → «Panamericano»
    return name.replace(/\s+(de|del)\s+.+$/i, '') || name;
};

/** Última fecha con juegos terminados de la fase: cuántos, carreras por juego y la mayor paliza */
export const lastDayNumbers = (calendar: SeasonCalendar | undefined, phase: ProPhaseId) => {
    const finals = (calendar?.games ?? []).filter((game) => game.phase === phase && isFinal(game));
    if (!finals.length) return null;
    const day = finals.reduce((last, game) => (game.day > last ? game.day : last), finals[0].day);
    const games = finals.filter((game) => game.day === day);
    const runs = games.reduce((total, game) => total + (game.away.score ?? 0) + (game.home.score ?? 0), 0);
    const blowout = games.reduce<{ game: CalendarGame; margin: number } | null>((best, game) => {
        const margin = Math.abs((game.away.score ?? 0) - (game.home.score ?? 0));
        return !best || margin > best.margin ? { game, margin } : best;
    }, null);
    const dates = calendar?.race[phase]?.dates ?? [];
    const position = dates.indexOf(day);
    return { day, number: position >= 0 ? position + 1 : null, games: games.length, runsPerGame: runs / games.length, blowout };
};

export interface HeadToHeadCell {
    wins: number;
    losses: number;
    /** Juegos terminados entre los dos */
    played: number;
    /** Día del próximo duelo por jugar (YYYY-MM-DD) */
    next: string | null;
}

/** Matriz del cara a cara: matrix[fila][columna] = récord de la fila contra la columna (null en la diagonal) */
export const headToHeadMatrix = (calendar: SeasonCalendar | undefined, phase: ProPhaseId, teamIds: readonly number[], today: string): (HeadToHeadCell | null)[][] => {
    const records = calendar?.headToHead[phase] ?? {};
    const games = (calendar?.games ?? []).filter((game) => game.phase === phase && isPending(game) && game.day >= today).sort((a, b) => a.date.localeCompare(b.date));
    return teamIds.map((team) =>
        teamIds.map((rival) => {
            if (team === rival) return null;
            const record = records[team]?.[rival];
            const next = games.find((game) => (game.away.id === team && game.home.id === rival) || (game.away.id === rival && game.home.id === team));
            const wins = record?.wins ?? 0;
            const losses = record?.losses ?? 0;
            return { wins, losses, played: wins + losses, next: next?.day ?? null };
        })
    );
};

/** Parejas que todavía no se han visto y el día en que ya se habrán cruzado todas (null si ya se vieron todas) */
export const pairsPending = (matrix: readonly (HeadToHeadCell | null)[][]) => {
    let pairs = 0;
    let pending = 0;
    let by: string | null = null;
    let unknown = false;
    for (let row = 0; row < matrix.length; row++) {
        for (let column = row + 1; column < matrix.length; column++) {
            const cell = matrix[row][column];
            if (!cell) continue;
            pairs++;
            if (cell.played > 0) continue;
            pending++;
            if (!cell.next) unknown = true;
            else if (!by || cell.next > by) by = cell.next;
        }
    }
    return { pairs, pending, by: unknown ? null : by };
};

/** Resultados de los últimos 10 de un equipo (del más reciente al más viejo) según el calendario */
export const formResults = (calendar: SeasonCalendar | undefined, teamId: number): ('W' | 'L')[] | null => {
    const form = calendar?.form[teamId];
    return form ? form.slice(0, 10).map((game) => (game.isWin ? 'W' : 'L')) : null;
};

// ---------------------------------------------------------------- situaciones (mapa de récords)

export const SITUATIONS: readonly SplitType[] = ['home', 'away', 'day', 'night', 'left', 'right', 'oneRun', 'extraInning', 'winners'];

/**
 * Récords por situación de una fila: los de `pro.splits` y, si el servidor todavía no los manda (producción), los
 * que ya trae la fila del Lite (casa, visita, una carrera y entradas extra).
 */
export const splitsOf = (row: TableRow): Partial<Record<SplitType, WinLoss>> => {
    if (row.pro?.splits) return row.pro.splits;
    const lite: Partial<Record<SplitType, WinLoss>> = {};
    if (row.home) lite.home = row.home;
    if (row.away) lite.away = row.away;
    if (row.oneRun) lite.oneRun = row.oneRun;
    if (row.extraInning) lite.extraInning = row.extraInning;
    return lite;
};

export const gamesOf = (record: WinLoss | null | undefined) => (record ? record.wins + record.losses : 0);

/** % de victorias de un récord (null sin juegos) */
export const winShare = (record: WinLoss | null | undefined) => {
    const games = gamesOf(record);
    return record && games > 0 ? record.wins / games : null;
};

/** Situaciones con al menos un juego de algún equipo (las vacías no salen como columnas) */
export const activeSituations = (rows: readonly TableRow[]) => SITUATIONS.filter((id) => rows.some((row) => gamesOf(splitsOf(row)[id]) > 0));

/** Une una lista como se dice: «a», «a y b», «a, b y c» (`and` es « y » o « and ») */
export const joinList = (items: readonly string[], and: string) => (items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')}${and}${items[items.length - 1]}`);
