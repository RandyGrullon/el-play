import React from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { StandingRow } from '../../types';
import { pythagorean } from '../../lib/advanced';
import { teamDisplayName } from '../../lib/teams';
import { showToast } from '../../lib/toast';
import { useColors } from '../../theme/theme';
import { alpha } from '../../theme/tokens';
import { Row, TeamLogo, Txt } from '../ui';
import { CellText, FrozenTable, HeadText, type FrozenColumn } from '../stats/FrozenTable';

// Posiciones del modo PRO: carreras anotadas y permitidas, diferencia, récord esperado (Pitágoras),
// casa/visita, juegos de una carrera, extra innings, últimos 10 y racha. Tocar un encabezado dice qué es.

const record = (split: { wins: number; losses: number } | null | undefined) => (split ? `${split.wins}-${split.losses}` : '—');
const luckText = (n: number) => (n > 0 ? `+${n}` : String(n));

const WIDTHS: Record<string, number> = { w: 36, l: 36, pct: 56, gb: 44, rs: 44, ra: 44, diff: 48, expected: 56, home: 56, away: 60, oneRun: 52, extra: 52, last10: 60, streak: 60 };

export const StandingsTable: React.FC<{ rows: StandingRow[]; cutoff?: number }> = ({ rows, cutoff }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    if (!rows.length) {
        return (
            <View style={{ backgroundColor: colors.surface, borderRadius: 24, paddingVertical: 32, paddingHorizontal: 16 }}>
                <Txt size={14} tone="muted" center>
                    {t('standings.noData')}
                </Txt>
            </View>
        );
    }

    const diffOf = (row: StandingRow) => (row.runsScored != null && row.runsAllowed != null ? row.runsScored - row.runsAllowed : null);
    const expectedOf = (row: StandingRow) => pythagorean(row.runsScored, row.runsAllowed, row.wins + row.losses);

    const cells: Record<string, (row: StandingRow) => React.ReactNode> = {
        w: (row) => <CellText bold>{row.wins}</CellText>,
        l: (row) => <CellText bold>{row.losses}</CellText>,
        pct: (row) => <CellText>{row.pct}</CellText>,
        gb: (row) => <CellText tone="muted">{row.gamesBack === '-' ? '—' : row.gamesBack}</CellText>,
        rs: (row) => <CellText>{row.runsScored ?? '—'}</CellText>,
        ra: (row) => <CellText>{row.runsAllowed ?? '—'}</CellText>,
        diff: (row) => {
            const diff = diffOf(row);
            return (
                <CellText bold color={diff === null || diff === 0 ? undefined : diff > 0 ? colors.ball : colors.live}>
                    {diff === null ? '—' : diff > 0 ? `+${diff}` : diff}
                </CellText>
            );
        },
        expected: (row) => {
            const expected = expectedOf(row);
            return <CellText>{expected ? `${expected.wins}-${expected.losses}` : '—'}</CellText>;
        },
        home: (row) => <CellText>{record(row.home)}</CellText>,
        away: (row) => <CellText>{record(row.away)}</CellText>,
        oneRun: (row) => <CellText>{record(row.oneRun)}</CellText>,
        extra: (row) => <CellText>{record(row.extraInning)}</CellText>,
        last10: (row) => <CellText>{record(row.lastTen)}</CellText>,
        streak: (row) => <CellText bold>{row.streak === '-' ? '—' : row.streak}</CellText>
    };

    const columns: FrozenColumn<StandingRow>[] = Object.keys(WIDTHS).map((key) => ({
        key,
        width: WIDTHS[key],
        header: <HeadText>{t(`pro.standings.${key}`)}</HeadText>,
        headerLabel: t(`pro.standings.long.${key}`),
        onHeaderPress: () => showToast(`${t(`pro.standings.${key}`)}: ${t(`pro.standings.long.${key}`)}`, undefined, 3000),
        cell: cells[key]
    }));

    return (
        <FrozenTable
            rows={rows}
            rowKey={(row) => String(row.team.id)}
            rowHeight={44}
            first={{
                width: 184,
                header: <HeadText>{t('pro.standings.team')}</HeadText>,
                cell: (row) => (
                    <Row gap={8}>
                        <Txt size={12} weight="extrabold" tone="muted" center style={{ width: 16 }}>
                            {row.rank}
                        </Txt>
                        <TeamLogo team={row.team} size={22} />
                        <Txt size={13} weight="extrabold" numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
                            {teamDisplayName(row.team, i18n.language)}
                        </Txt>
                    </Row>
                )
            }}
            columns={columns}
            // Tocar la fila dice cuántos ganó de más o de menos según sus carreras (el `title` de la web)
            onRowPress={(row) => {
                const expected = expectedOf(row);
                if (expected) showToast(`${teamDisplayName(row.team, i18n.language)} · ${t('pro.standings.luck', { n: luckText(row.wins - expected.wins) })}`, undefined, 3500);
            }}
            rowLabel={(row) => `${teamDisplayName(row.team, i18n.language)}, ${row.wins}-${row.losses}`}
            rowStyle={(_row, index) => (cutoff !== undefined && index === cutoff ? { borderTopWidth: 2, borderTopColor: alpha(colors.accent, 0.4) } : undefined)}
        />
    );
};
