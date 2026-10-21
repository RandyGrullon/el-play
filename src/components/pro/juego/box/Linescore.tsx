import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { GameDetail } from '../../../../types';
import type { LineHalf } from '../../../../types/pro-juego';
import type { GamePro } from '../../../../lib/pro/juego';
import { lastOf } from '../jugadas/model';
import { useColors } from '../../../../theme/theme';
import { alpha, radius, shadow } from '../../../../theme/tokens';
import { TeamLogo, Txt } from '../../../ui';
import { ProSegmented, teamInk, useElementWidth, useProColors } from '../../kit';
import { usePlayColors } from '../jugadas/parts';

type Metric = 'r' | 'h' | 'lob';
type Side = 'away' | 'home';
const TOTALS = ['r', 'h', 'e', 'lob'] as const;
const TOTAL_WIDTH = { r: 24, h: 24, e: 20, lob: 30 } as const;

/** Valor de una mitad: lo de la pizarra PRO (R/H/E/LOB) o, sin ella, las carreras del Lite */
const valueOf = (game: GameDetail, pro: GamePro | undefined, n: number, side: Side, metric: Metric): number | null => {
    const line = pro?.linescore.find((entry) => entry.n === n)?.[side];
    if (line) return line[metric];
    if (metric === 'r') return game.linescore.find((entry) => entry.n === n)?.[side] ?? null;
    return null;
};

const totalOf = (game: GameDetail, pro: GamePro | undefined, side: Side, key: keyof LineHalf) => {
    const fromPro = pro?.totals?.[side]?.[key];
    if (fromPro !== undefined && fromPro !== null) return fromPro;
    const team = game[side];
    return key === 'r' ? team.runs : key === 'h' ? team.hits : key === 'e' ? team.errors : team.lob;
};

// Pizarra por entradas con C H E LOB fijos a la derecha; arriba se elige qué se ve en cada entrada (carreras, hits o
// quedados en base). Las entradas grandes se resaltan; la «x» es la baja que no hizo falta. Con extrainnings, las
// entradas se deslizan de lado y el equipo y los totales quedan fijos.
export const Linescore: React.FC<{ game: GameDetail; pro?: GamePro }> = ({ game, pro }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const proColors = useProColors();
    const paint = usePlayColors();
    const [metric, setMetric] = useState<Metric>('r');
    const { width, onLayout } = useElementWidth(326);
    const hasPro = !!pro?.linescore.length;
    const played = Math.max(game.linescore.length, pro?.linescore.length ?? 0);
    const innings = Array.from({ length: Math.max(game.scheduledInnings || 9, played) }, (_, index) => index + 1);
    const live = game.state === 'live' && game.inning ? game.inning : null;
    const decisions = game.decisions;
    // A menos de 300 px de tabla, el equipo va solo con su logo
    const compact = width < 300;
    const teamWidth = compact ? 30 : 56;
    const totalsWidth = TOTALS.reduce((sum, key) => sum + TOTAL_WIDTH[key], 0) + 6;
    const room = width - teamWidth - totalsWidth;
    const cellWidth = Math.max(16, Math.min(26, Math.floor(room / innings.length)));
    const options: { value: Metric; label: string }[] = [
        { value: 'r', label: t('pro.box.line.runs') },
        { value: 'h', label: t('pro.box.line.hits') },
        { value: 'lob', label: t('pro.box.line.lob') }
    ];
    const metricName = options.find((option) => option.value === metric)?.label ?? '';

    const cell = (n: number, side: Side) => {
        const value = valueOf(game, pro, n, side, metric);
        if (value === null || value === undefined) {
            // La baja del último inning que no se jugó porque el local ya ganaba
            const skipped = game.state === 'final' && side === 'home' && n === played && n >= (game.scheduledInnings || 9);
            return { text: skipped ? 'x' : '', bg: undefined, ink: colors.muted };
        }
        if (metric === 'lob') return { text: String(value), bg: value ? alpha(proColors.warn, Math.min(0.5, value * 0.15)) : undefined, ink: colors.ink };
        const big = value >= 3;
        return { text: String(value), bg: big ? colors.accent : undefined, ink: big ? '#fff' : colors.ink };
    };

    const rowLabel = (side: Side) => {
        const team = game[side];
        const values = innings.map((n) => valueOf(game, pro, n, side, metric)).filter((value): value is number => value !== null && value !== undefined);
        return t('pro.box.line.rowAria', {
            team: team.name,
            metric: metricName.toLowerCase(),
            values: values.join(', '),
            r: totalOf(game, pro, side, 'r') ?? '—',
            h: totalOf(game, pro, side, 'h') ?? '—',
            e: totalOf(game, pro, side, 'e') ?? '—',
            lob: totalOf(game, pro, side, 'lob') ?? '—'
        });
    };

    const head = (text: string, key: string, cellStyle: object, strong = false, fill?: string) => (
        <View key={key} style={[{ height: 22, alignItems: 'center', justifyContent: 'center' }, cellStyle]}>
            <View style={{ minWidth: 15, height: 20, borderRadius: 6, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2, backgroundColor: fill }}>
                <Txt size={11} weight={strong ? 'extrabold' : 'bold'} color={fill ? teamInk(fill) : colors.muted}>
                    {text}
                </Txt>
            </View>
        </View>
    );

    const inningsGrid = (
        <View>
            <View style={{ flexDirection: 'row' }}>
                {innings.map((n) => {
                    const now = live?.n === n;
                    return head(String(n), `h${n}`, { width: cellWidth }, now, now ? game[live!.isTop ? 'away' : 'home'].color : undefined);
                })}
            </View>
            {(['away', 'home'] as const).map((side) => (
                <View key={side} style={{ flexDirection: 'row', height: 34, alignItems: 'center' }}>
                    {innings.map((n) => {
                        const value = cell(n, side);
                        return (
                            <View key={n} style={{ width: cellWidth, alignItems: 'center' }}>
                                <View style={{ minWidth: Math.min(cellWidth - 2, 20), height: 28, borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: value.bg }}>
                                    <Txt size={17} condensed tabular color={value.ink}>
                                        {value.text}
                                    </Txt>
                                </View>
                            </View>
                        );
                    })}
                </View>
            ))}
        </View>
    );

    return (
        <View style={[{ backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: alpha(colors.line, 0.06), padding: 16, paddingHorizontal: compact ? 12 : 16, gap: 10 }, shadow('card')]}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <Txt size={15} weight="extrabold" accessibilityRole="header">
                    {t('pro.box.line.title')}
                </Txt>
                {hasPro && <ProSegmented value={metric} onChange={setMetric} options={options} label={t('pro.box.line.metric')} size="sm" fill={false} />}
            </View>
            <View onLayout={onLayout} style={{ flexDirection: 'row' }}>
                {/* Equipos */}
                <View style={{ width: teamWidth }}>
                    <View style={{ height: 22 }} />
                    {(['away', 'home'] as const).map((side) => (
                        <View key={side} accessible accessibilityLabel={rowLabel(side)} style={{ height: 34, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
                                <TeamLogo team={game[side]} size={18} />
                            </View>
                            {!compact && (
                                <Txt size={13} weight="extrabold">
                                    {game[side].abbrev}
                                </Txt>
                            )}
                        </View>
                    ))}
                </View>
                {/* Entradas (se deslizan si no caben) */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }} aria-hidden>
                    {inningsGrid}
                </ScrollView>
                {/* Totales */}
                <View style={{ paddingLeft: 6 }} aria-hidden>
                    <View style={{ flexDirection: 'row' }}>{TOTALS.map((key) => head(t(`pro.box.line.short.${key}`), key, { width: TOTAL_WIDTH[key] }))}</View>
                    {(['away', 'home'] as const).map((side) => (
                        <View key={side} style={{ flexDirection: 'row', height: 34, alignItems: 'center' }}>
                            {TOTALS.map((key, index) => (
                                <Txt key={key} size={index === 0 ? 19 : 17} condensed tabular color={index === 0 || index === 1 ? colors.ink : colors.muted} center style={{ width: TOTAL_WIDTH[key] }}>
                                    {totalOf(game, pro, side, key) ?? '—'}
                                </Txt>
                            ))}
                        </View>
                    ))}
                </View>
            </View>
            {game.state === 'final' && (decisions.winner || decisions.loser) && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 4 }}>
                    {decisions.winner && (
                        <Txt size={12} tone="muted">
                            <Txt size={12} weight="extrabold" color={paint.tone(proColors.up)}>
                                {t('pro.box.dec.W')}
                            </Txt>{' '}
                            {lastOf(decisions.winner.name)}
                            {decisions.winner.wins !== null && ` (${decisions.winner.wins}-${decisions.winner.losses}${decisions.winner.era ? `, ${decisions.winner.era}` : ''})`}
                        </Txt>
                    )}
                    {decisions.loser && (
                        <Txt size={12} tone="muted">
                            <Txt size={12} weight="extrabold" color={paint.tone(proColors.down)}>
                                {t('pro.box.dec.L')}
                            </Txt>{' '}
                            {lastOf(decisions.loser.name)}
                            {decisions.loser.wins !== null && ` (${decisions.loser.wins}-${decisions.loser.losses}${decisions.loser.era ? `, ${decisions.loser.era}` : ''})`}
                        </Txt>
                    )}
                    {decisions.save ? (
                        <Txt size={12} tone="muted">
                            <Txt size={12} weight="extrabold" color={colors.accentInk}>
                                {t('pro.box.dec.S')}
                            </Txt>{' '}
                            {lastOf(decisions.save.name)}
                            {decisions.save.saves != null && ` (${decisions.save.saves})`}
                        </Txt>
                    ) : (
                        <Txt size={12} tone="muted">
                            {t('pro.box.dec.noSave')}
                        </Txt>
                    )}
                </View>
            )}
        </View>
    );
};
