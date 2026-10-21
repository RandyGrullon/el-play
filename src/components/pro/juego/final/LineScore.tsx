import React from 'react';
import { ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { GameDetail } from '../../../../types';
import type { LineHalf } from '../../../../types/pro-juego';
import type { GamePro } from '../../../../lib/pro/juego';
import { useColors } from '../../../../theme/theme';
import { TeamLogo, Txt } from '../../../ui';
import { ProSection, useProColors, withAlpha } from '../../kit';
import { useDivider } from '../previa/shared';

// Pizarra completa fuera de la historia: carreras por entrada (en el color del equipo cuando anotó) y debajo
// H, E y LOB de cada entrada (con los datos PRO). El LOB más intenso = más corredores dejados.

type Side = 'away' | 'home';

const LABEL = 50;
const TOTAL = 26;

export const LineScore: React.FC<{ game: GameDetail; pro?: GamePro }> = ({ game, pro }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const proColors = useProColors();
    const divider = useDivider();
    const rows = pro?.linescore?.length ? pro.linescore : null;
    const innings = Math.max(game.scheduledInnings || 9, game.linescore.length);
    const list = Array.from({ length: innings }, (_, index) => index + 1);
    const half = (side: Side, n: number): LineHalf | null => rows?.find((inning) => inning.n === n)?.[side] ?? null;
    const runs = (side: Side, n: number) => game.linescore.find((inning) => inning.n === n)?.[side];
    const totals = (side: Side) => pro?.totals?.[side] ?? { r: game[side].runs, h: game[side].hits, e: game[side].errors, lob: game[side].lob };
    const label = (side: Side) => {
        const total = totals(side);
        const byInning = list.map((n) => `${n}: ${runs(side, n) ?? '—'}`).join(', ');
        return `${t('pro.final.line.aria', { team: game[side].name, r: total.r ?? 0, h: total.h ?? 0, e: total.e ?? 0, lob: total.lob ?? 0 })}. ${byInning}`;
    };
    const maxLob = Math.max(1, ...(rows ?? []).flatMap((inning) => [inning.away.lob ?? 0, inning.home.lob ?? 0]));
    const cell = { flex: 1, minWidth: 18, alignItems: 'center', justifyContent: 'center' } as const;
    const total = { width: TOTAL, alignItems: 'center', justifyContent: 'center' } as const;

    const block = (side: Side) => {
        const team = game[side];
        const sum = totals(side);
        const sub = (key: 'h' | 'e' | 'lob') => (
            <View style={{ flexDirection: 'row', height: 19, alignItems: 'center' }}>
                <View style={{ width: LABEL, paddingRight: 6, alignItems: 'flex-end' }}>
                    <Txt size={10} weight="extrabold" tone="muted" style={{ letterSpacing: 0.6 }}>
                        {t(`pro.final.line.${key}`)}
                    </Txt>
                </View>
                {list.map((n) => {
                    const value = half(side, n)?.[key];
                    if (value === null || value === undefined) return <View key={n} style={cell} />;
                    if (key === 'lob')
                        return (
                            <View key={n} style={[cell, { marginHorizontal: 2, borderRadius: 4, backgroundColor: value > 0 ? withAlpha(team.color, 0.12 + (value / maxLob) * 0.36) : undefined }]}>
                                <Txt condensed size={12} tabular color={value > 0 ? colors.ink : colors.muted} style={{ lineHeight: 15 }}>
                                    {value}
                                </Txt>
                            </View>
                        );
                    return (
                        <View key={n} style={cell}>
                            <Txt condensed size={12} tabular color={value > 0 ? (key === 'e' ? proColors.warn : colors.ink) : colors.muted}>
                                {value}
                            </Txt>
                        </View>
                    );
                })}
                <View style={total} />
                <View style={total} />
                <View style={total} />
                <View style={total} />
            </View>
        );
        return (
            <View accessible accessibilityLabel={label(side)}>
                <View style={[{ flexDirection: 'row', height: 36, alignItems: 'center' }, divider]}>
                    <View style={{ width: LABEL, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
                            <TeamLogo team={team} size={14} />
                        </View>
                        <Txt size={13} weight="extrabold">
                            {team.abbrev}
                        </Txt>
                    </View>
                    {list.map((n) => {
                        const value = runs(side, n);
                        const played = game.linescore.some((inning) => inning.n === n);
                        const text = value ?? (played && side === 'home' && n === game.linescore.length ? 'x' : '');
                        return (
                            <View key={n} style={[cell, { marginHorizontal: 1, height: 26, borderRadius: 6, backgroundColor: value ? withAlpha(team.color, 0.28) : undefined }]}>
                                <Txt condensed size={19} tabular color={value ? colors.ink : colors.muted} style={{ lineHeight: 24 }}>
                                    {String(text)}
                                </Txt>
                            </View>
                        );
                    })}
                    <View style={total}>
                        <Txt condensed size={22} tabular color={team.isWinner ? colors.ink : colors.muted}>
                            {sum.r ?? 0}
                        </Txt>
                    </View>
                    <View style={total}>
                        <Txt condensed size={17} tabular>
                            {sum.h ?? 0}
                        </Txt>
                    </View>
                    <View style={total}>
                        <Txt condensed size={17} tabular>
                            {sum.e ?? 0}
                        </Txt>
                    </View>
                    {rows ? (
                        <View style={total}>
                            <Txt condensed size={17} tabular>
                                {sum.lob ?? 0}
                            </Txt>
                        </View>
                    ) : null}
                </View>
                {rows ? (
                    <>
                        {sub('h')}
                        {sub('e')}
                        {sub('lob')}
                    </>
                ) : null}
            </View>
        );
    };

    return (
        <ProSection title={t('pro.final.line.title')} aside={rows ? t('pro.final.line.aside') : undefined}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1 }}>
                <View style={{ flexGrow: 1, minWidth: 280 }}>
                    <View style={{ flexDirection: 'row', height: 22, alignItems: 'center' }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
                        <View style={{ width: LABEL }} />
                        {list.map((n) => (
                            <View key={n} style={cell}>
                                <Txt size={10} weight="extrabold" tone="muted">
                                    {n}
                                </Txt>
                            </View>
                        ))}
                        <View style={total}>
                            <Txt size={10} weight="extrabold">
                                {t('lineScore.runs')}
                            </Txt>
                        </View>
                        <View style={total}>
                            <Txt size={10} weight="extrabold" tone="muted">
                                {t('lineScore.hits')}
                            </Txt>
                        </View>
                        <View style={total}>
                            <Txt size={10} weight="extrabold" tone="muted">
                                {t('lineScore.errors')}
                            </Txt>
                        </View>
                        {rows ? (
                            <View style={total}>
                                <Txt size={10} weight="extrabold" tone="muted">
                                    LOB
                                </Txt>
                            </View>
                        ) : null}
                    </View>
                    {block('away')}
                    <View style={{ height: 6 }} />
                    {block('home')}
                </View>
            </ScrollView>
            {rows ? (
                <Txt size={11} tone="muted" style={{ marginTop: 10, lineHeight: 15 }}>
                    {t('pro.final.line.note')}
                </Txt>
            ) : null}
        </ProSection>
    );
};
