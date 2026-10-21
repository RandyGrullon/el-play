import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ArrowDown } from 'lucide-react-native';
import type { HittingLine, PitchingLine, PlayerDetail, StatsTeam } from '../../../lib/stats';
import { useColors } from '../../../theme/theme';
import { alpha, radius, shadow } from '../../../theme/tokens';
import type { PlayerPro, ProPhaseId } from '../../../types/pro-liga';
import { TeamLogo, Txt } from '../../ui';
import { ModuleHeader, ProButton, useElementWidth, useProColors } from '../kit';
import { doubleHeaderTags } from '../estadisticas/logic';
import { MovingRow, StickyHeader, useRowWindow } from '../estadisticas/scroll';
import { shortDate } from './format';

interface LogRow {
    gamePk: number;
    date: string;
    phase: ProPhaseId | null;
    isHome: boolean;
    isWin: boolean | null;
    opponent: StatsTeam | null;
    hitting: HittingLine | null;
    pitching: (PitchingLine & { r?: number }) | null;
    pts: number;
}

const TOP = 10;
const ROW = 48;
const HEAD = 44;
const LEFT = 100;
const PHASE_SHORT: Partial<Record<ProPhaseId, string>> = { roundRobin: 'RR', final: 'F', quarterfinal: 'CF', semifinal: 'SF' };

type Cell = { key: string; value: (row: LogRow) => string | number };

const BATTING: Cell[] = [
    { key: 'hab', value: (row) => (row.hitting ? `${row.hitting.h}-${row.hitting.ab}` : '—') },
    { key: 'r', value: (row) => row.hitting?.r ?? 0 },
    { key: 'd', value: (row) => row.hitting?.d ?? 0 },
    { key: 't', value: (row) => row.hitting?.t ?? 0 },
    { key: 'hr', value: (row) => row.hitting?.hr ?? 0 },
    { key: 'rbi', value: (row) => row.hitting?.rbi ?? 0 },
    { key: 'bb', value: (row) => row.hitting?.bb ?? 0 },
    { key: 'k', value: (row) => row.hitting?.k ?? 0 },
    { key: 'sb', value: (row) => row.hitting?.sb ?? 0 },
    { key: 'cs', value: (row) => row.hitting?.cs ?? 0 },
    { key: 'sf', value: (row) => row.hitting?.sf ?? 0 }
];

const PITCHING: Cell[] = [
    { key: 'ip', value: (row) => row.pitching?.ip ?? '—' },
    { key: 'h', value: (row) => row.pitching?.h ?? 0 },
    { key: 'r', value: (row) => row.pitching?.r ?? '—' },
    { key: 'er', value: (row) => row.pitching?.er ?? 0 },
    { key: 'bb', value: (row) => row.pitching?.bb ?? 0 },
    { key: 'k', value: (row) => row.pitching?.k ?? 0 },
    { key: 'hr', value: (row) => row.pitching?.hr ?? 0 },
    { key: 'np', value: (row) => row.pitching?.np ?? '—' },
    {
        key: 'dec',
        value: (row) => {
            const p = row.pitching;
            if (!p) return '';
            return [p.w ? 'G' : '', p.l ? 'P' : '', p.sv ? 'SV' : '', p.hld ? 'H' : ''].filter(Boolean).join(' ') || '·';
        }
    }
];

// Juego a juego en tabla compacta: fecha, rival, G/P (y J1/J2 en dobles juegos, RR o F en otras fases), la línea
// completa sin cortar y los puntos de fantasy. Se ordena por fecha o por puntos (las filas se deslizan a su lugar);
// cada fila abre su juego. Con todos los juegos solo se montan las filas que se ven.
export const GameLogPro: React.FC<{ player: PlayerDetail; pro?: PlayerPro; onOpenGame: (gamePk: number) => void }> = ({ player, pro, onOpenGame }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const proColors = useProColors();
    const { width, onLayout } = useElementWidth(358);
    const [byPts, setByPts] = useState(false);
    const [all, setAll] = useState(false);
    const [born] = useState(() => Date.now());
    const rows: LogRow[] = useMemo(
        () =>
            pro?.log?.length
                ? pro.log.map((game) => ({ ...game }))
                : player.log.map((game) => ({ gamePk: game.gamePk, date: game.date, phase: null, isHome: game.isHome, isWin: game.isWin, opponent: game.opponent, hitting: game.hitting, pitching: game.pitching, pts: game.pts })),
        [pro?.log, player.log]
    );
    const tags = useMemo(() => doubleHeaderTags(rows), [rows]);
    const sorted = useMemo(() => (byPts ? [...rows].sort((a, b) => b.pts - a.pts || b.date.localeCompare(a.date)) : rows), [rows, byPts]);
    const shown = all ? sorted : sorted.slice(0, TOP);
    const body = useRowWindow(shown.length, ROW);
    const { setNode, onLayout: measureBody, first, last, offset } = body;
    if (!rows.length) return null;
    const pitcher = player.role === 'P';
    const cells = pitcher ? PITCHING : BATTING;
    const wideKey = pitcher ? 'ip' : 'hab';
    const wideWidth = 36;
    const ptsWidth = 40;
    const available = width - LEFT;
    const small = Math.min(26, Math.max(18, (available - wideWidth - ptsWidth - 6) / (cells.length - 1)));
    const cellWidth = (key: string) => (key === wideKey ? wideWidth : key === 'dec' ? Math.max(small, 34) : small);
    const contentWidth = cells.reduce((sum, cell) => sum + cellWidth(cell.key), 0) + ptsWidth + 6;
    const bodyHeight = shown.length * ROW;
    const where = (row: LogRow) => (row.isHome ? t('pro.ficha.today.vs') : t('pro.ficha.today.at'));
    const ptsText = (pts: number) => (pts < 0 ? `−${Math.abs(pts)}` : String(pts));

    const left = (row: LogRow) => {
        const tag = tags.get(row.gamePk);
        const phase = row.phase ? PHASE_SHORT[row.phase] : undefined;
        const day = shortDate(row.date, i18n.language);
        const label = [
            t('pro.ficha.log.openAria', { date: day, where: where(row), rival: row.opponent?.abbrev ?? '', result: row.isWin === null ? '' : t(row.isWin ? 'pro.ficha.log.won' : 'pro.ficha.log.lost') }),
            cells.map((cell) => `${t(`pro.ficha.log.long.${cell.key}`)} ${cell.value(row)}`).join(', '),
            `${t('pro.ficha.log.pts')} ${ptsText(row.pts)}`
        ].join('. ');
        return (
            <Pressable
                onPress={() => onOpenGame(row.gamePk)}
                accessibilityRole="link"
                accessibilityLabel={label}
                style={({ pressed }) => [{ height: ROW, flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 10, borderTopWidth: 1, borderTopColor: alpha(colors.line, 0.08), backgroundColor: colors.surface }, pressed && { backgroundColor: colors.raised }]}
            >
                {row.opponent && <TeamLogo team={row.opponent} size={18} />}
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Txt size={12} weight="extrabold" numberOfLines={1} style={{ lineHeight: 16 }}>
                        <Txt size={12} weight="semibold" tone="muted">{`${where(row)} `}</Txt>
                        {row.opponent?.abbrev ?? '—'}
                    </Txt>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                        <Txt size={10} tone="muted" numberOfLines={1} style={{ lineHeight: 15 }}>
                            {day}
                        </Txt>
                        {tag ? <Badge text={t('pro.ficha.log.gameN', { n: tag })} bg={colors.raised} ink={colors.ink} /> : null}
                        {phase ? <Badge text={phase} bg={alpha(colors.accent, 0.15)} ink={colors.accentInk} /> : null}
                        {row.isWin !== null ? <Badge text={t(row.isWin ? 'pro.ficha.log.w' : 'pro.ficha.log.l')} bg={alpha(row.isWin ? proColors.up : proColors.down, 0.15)} ink={row.isWin ? proColors.up : proColors.down} /> : null}
                    </View>
                </View>
            </Pressable>
        );
    };

    const right = (row: LogRow) => (
        <Pressable
            onPress={() => onOpenGame(row.gamePk)}
            accessible={false}
            importantForAccessibility="no-hide-descendants"
            style={({ pressed }) => [{ height: ROW, flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: alpha(colors.line, 0.08) }, pressed && { backgroundColor: colors.raised }]}
        >
            {cells.map((cell) => {
                const value = cell.value(row);
                const zero = value === 0;
                return (
                    <Txt key={cell.key} size={12} weight={cell.key === wideKey ? 'extrabold' : zero ? 'semibold' : 'bold'} tone={zero ? 'muted' : 'ink'} tabular numberOfLines={1} style={{ width: cellWidth(cell.key), textAlign: 'right', paddingRight: 3 }}>
                        {value}
                    </Txt>
                );
            })}
            <View style={{ width: ptsWidth + 6, height: ROW, alignItems: 'flex-end', justifyContent: 'center', paddingRight: 10, backgroundColor: byPts ? alpha(colors.accent, 0.1) : undefined }}>
                <Txt size={13} weight="extrabold" tabular color={row.pts < 0 ? proColors.down : row.pts >= 20 ? proColors.fantasy : colors.ink}>
                    {ptsText(row.pts)}
                </Txt>
            </View>
        </Pressable>
    );

    const headerLeft = (
        <Pressable
            onPress={() => setByPts(false)}
            accessibilityRole="button"
            accessibilityState={{ selected: !byPts }}
            accessibilityLabel={t('pro.ficha.log.sortDate')}
            style={{ height: HEAD, flexDirection: 'row', alignItems: 'center', gap: 2, paddingLeft: 10, backgroundColor: !byPts ? alpha(colors.accent, 0.1) : colors.surface }}
        >
            <Txt size={10} weight="extrabold" color={!byPts ? colors.accentInk : colors.muted} style={{ textTransform: 'uppercase' }}>
                {t('pro.ficha.log.game')}
            </Txt>
            {!byPts && <ArrowDown size={10} color={colors.accentInk} />}
        </Pressable>
    );
    const headerRight = (
        <View style={{ height: HEAD, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface }}>
            {cells.map((cell) => (
                <Txt key={cell.key} size={10} weight="extrabold" tone="muted" numberOfLines={1} accessibilityLabel={t(`pro.ficha.log.long.${cell.key}`)} style={{ width: cellWidth(cell.key), textAlign: 'right', paddingRight: 3, textTransform: 'uppercase' }}>
                    {t(`pro.ficha.log.cols.${cell.key}`)}
                </Txt>
            ))}
            <Pressable
                onPress={() => setByPts(true)}
                accessibilityRole="button"
                accessibilityState={{ selected: byPts }}
                accessibilityLabel={t('pro.ficha.log.sortPts')}
                style={{ width: ptsWidth + 6, height: HEAD, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 2, paddingRight: 10, borderTopLeftRadius: 8, borderTopRightRadius: 8, backgroundColor: byPts ? alpha(colors.accent, 0.1) : undefined }}
            >
                <Txt size={10} weight="extrabold" color={byPts ? colors.accentInk : colors.muted} style={{ textTransform: 'uppercase' }}>
                    {t('pro.ficha.log.pts')}
                </Txt>
                {byPts && <ArrowDown size={10} color={colors.accentInk} />}
            </Pressable>
        </View>
    );
    const visible = shown.map((row, index) => ({ row, index })).filter(({ index }) => index >= first && index <= last);

    return (
        <View style={{ gap: 12 }}>
            <ModuleHeader title={t('pro.ficha.log.title')} />
            <View onLayout={onLayout} accessibilityLabel={t('pro.ficha.log.caption', { count: shown.length, total: rows.length })} style={[{ borderRadius: radius.card, backgroundColor: colors.surface, borderWidth: 1, borderColor: alpha(colors.line, 0.06), overflow: 'hidden' }, shadow('card')]}>
                <View style={{ flexDirection: 'row' }}>
                    {/* Juego: columna fija */}
                    <View style={{ width: LEFT, zIndex: 1, backgroundColor: colors.surface }}>
                        <StickyHeader offset={offset} height={HEAD} bodyHeight={bodyHeight}>
                            {headerLeft}
                        </StickyHeader>
                        <View ref={setNode} onLayout={measureBody} collapsable={false} style={{ height: bodyHeight }}>
                            {visible.map(({ row, index }) => (
                                <MovingRow key={row.gamePk} index={index} rowHeight={ROW} born={born}>
                                    {left(row)}
                                </MovingRow>
                            ))}
                        </View>
                    </View>
                    {/* La línea, de lado a lado si no cabe */}
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ minWidth: '100%' }}>
                        <View style={{ width: Math.max(contentWidth, available), alignItems: 'flex-end' }}>
                            <StickyHeader offset={offset} height={HEAD} bodyHeight={bodyHeight} style={{ alignSelf: 'stretch', alignItems: 'flex-end' }}>
                                {headerRight}
                            </StickyHeader>
                            <View style={{ height: bodyHeight, width: contentWidth }}>
                                {visible.map(({ row, index }) => (
                                    <MovingRow key={row.gamePk} index={index} rowHeight={ROW} born={born}>
                                        {right(row)}
                                    </MovingRow>
                                ))}
                            </View>
                        </View>
                    </ScrollView>
                </View>
                <View style={{ gap: 8, borderTopWidth: 1, borderTopColor: alpha(colors.line, 0.08), padding: 12 }}>
                    <Txt size={11} tone="muted">
                        {t(pitcher ? 'pro.ficha.log.legendP' : 'pro.ficha.log.legendB')}
                    </Txt>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <Txt size={12} tone="muted" style={{ flexShrink: 1 }}>
                            {all ? t('pro.ficha.log.hintAll', { count: rows.length }) : t('pro.ficha.log.hint', { count: Math.min(TOP, rows.length) })}
                        </Txt>
                        {rows.length > TOP && <ProButton label={all ? t('pro.ficha.log.less') : t('pro.ficha.log.all', { count: rows.length })} onPress={() => setAll((now) => !now)} />}
                    </View>
                </View>
            </View>
        </View>
    );
};

const Badge: React.FC<{ text: string; bg: string; ink: string }> = ({ text, bg, ink }) => (
    <View style={{ borderRadius: 4, paddingHorizontal: 3, backgroundColor: bg }}>
        <Txt size={10} weight="extrabold" color={ink} style={{ lineHeight: 14 }}>
            {text}
        </Txt>
    </View>
);
