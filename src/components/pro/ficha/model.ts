// Cuentas de la ficha PRO que comparten la pantalla y la imagen para compartir (como la web).
import { STAT_COLUMNS, type PlayerDetail, type PlayerRow, type StatContext } from '../../../lib/stats';
import type { LeagueAverages } from '../../../types/pro-liga';
import { columnStandings, percentileAgainst, type Standing } from '../estadisticas/logic';

/** Métricas de los percentiles de la ficha (las del diseño) */
export const PERCENTILE_METRICS = {
    B: ['avg', 'obp', 'slg', 'ops', 'iso', 'babip', 'kPct', 'bbPct'],
    P: ['era', 'fip', 'whip', 'kPct', 'bbPct', 'k9']
} as const;

/** La fila del pelotero con la forma de la lista de la liga (para usar las mismas columnas) */
export const rowOf = (player: PlayerDetail): PlayerRow => ({
    id: player.id,
    name: player.name,
    teamId: player.team?.id ?? null,
    pos: player.pos,
    number: player.number,
    role: player.role,
    hitting: player.hitting,
    pitching: player.pitching,
    g: player.g,
    pts: player.pts,
    ppg: player.ppg
});

/** El promedio de la liga de cada métrica; el de FIP es la EFE de la liga por construcción */
export const leagueValue = (key: string, role: 'B' | 'P', averages: LeagueAverages | null) => {
    if (!averages) return null;
    const percent = (value: number | null) => (value === null ? null : `${value.toFixed(1)}%`);
    if (role === 'B') {
        const map: Record<string, string | null> = { avg: averages.avg, obp: averages.obp, slg: averages.slg, ops: averages.ops, iso: averages.iso, babip: averages.babip, kPct: percent(averages.kPct), bbPct: percent(averages.bbPct) };
        return map[key] ?? null;
    }
    const map: Record<string, string | null> = {
        era: averages.era,
        fip: averages.era,
        whip: averages.whip,
        kPct: percent(averages.pitchingKPct),
        bbPct: percent(averages.pitchingBbPct),
        k9: averages.k9 !== null ? averages.k9.toFixed(1) : null
    };
    return map[key] ?? null;
};

export interface PercentileRow {
    key: string;
    value: string;
    league: string | null;
    standing: Standing;
}

/**
 * Percentil de cada métrica contra el grupo. Si el pelotero no califica se compara su cifra con la del grupo,
 * sin puesto (rank 0).
 */
export const percentileRowsOf = (player: PlayerDetail, pool: PlayerRow[], ctx: StatContext | null, averages: LeagueAverages | null) => {
    const row = rowOf(player);
    const inPool = pool.some((item) => item.id === player.id);
    const columns = STAT_COLUMNS[player.role];
    const rows: PercentileRow[] = [];
    for (const key of PERCENTILE_METRICS[player.role]) {
        const column = columns[key];
        const value = column.value(row, ctx);
        if (value === null || !Number.isFinite(value)) continue;
        let standing: Standing | null = null;
        if (inPool) standing = columnStandings(pool, column, ctx).get(player.id) ?? null;
        else {
            const values = pool.map((item) => column.value(item, ctx)).filter((item): item is number => item !== null && Number.isFinite(item));
            const pct = percentileAgainst(value, values, !!column.asc);
            standing = pct === null ? null : { pct, rank: 0, tied: false, n: values.length };
        }
        if (standing) rows.push({ key, value: column.show(row, ctx), league: leagueValue(key, player.role, averages), standing });
    }
    return { rows, inPool };
};
