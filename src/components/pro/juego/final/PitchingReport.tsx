import React from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import type { GameDetail, PitcherLine } from '../../../../types';
import type { GamePro } from '../../../../lib/pro/juego';
import { useColors } from '../../../../theme/theme';
import { alpha, radius } from '../../../../theme/tokens';
import { TeamLogo, Txt } from '../../../ui';
import { GrowBar, ProNote, ProSection, shortName, useGrow, useInView } from '../../kit';
import { useDivider } from '../previa/shared';
import { litePitchers, pitcherSpans, situationBefore, strikePct, type PitcherSpan, type Side } from './logica';
import { basesText, nameOf } from './text';

// Informe de pitcheo: Game Score de cada abridor, el bullpen como barras por las entradas que lanzó cada uno
// (desde el out en que entró), pitcheos-strikes de cada lanzador y los corredores heredados que anotaron.
// Sin los datos PRO del servidor sale lo que da el box del Lite (sin Game Score ni corredores heredados).

const NAME = 86;
const PS = 46;

const TeamMark: React.FC<{ team: GameDetail['away']; size?: number }> = ({ team, size = 18 }) => (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
        <TeamLogo team={team} size={size - 4} />
    </View>
);

interface Starter {
    side: Side;
    id: number;
    line: PitcherLine | undefined;
    gs: number | null;
    np: number | null;
    st: number | null;
    bf: number | null;
}

const StarterCard: React.FC<{ game: GameDetail; pro?: GamePro; starter: Starter }> = ({ game, pro, starter }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const team = game[starter.side];
    const line = starter.line;
    const full = nameOf(game, pro, starter.id, line?.name ?? '');
    const runs = line ? (line.r !== line.er ? t('pro.final.report.runsEarned', { r: line.r, er: line.er }) : t('pro.final.report.runs', { r: line.r })) : null;
    const pct = strikePct(starter.np, starter.st);
    const stats = line ? [`${line.ip} IP`, `${line.h} H`, runs, `${line.bb} BB`, `${line.k} K`, line.hr ? `${line.hr} HR` : null].filter(Boolean).join(' · ') : '';
    const counts = [
        starter.np !== null ? t('pro.final.report.pitches', { count: starter.np }) : null,
        starter.st !== null && pct !== null ? t('pro.final.report.strikes', { count: starter.st, pct }) : null,
        starter.bf !== null ? t('pro.final.report.faced', { count: starter.bf }) : null
    ]
        .filter(Boolean)
        .join(' · ');
    return (
        <View
            accessible
            accessibilityLabel={[t('pro.final.report.starter', { team: team.abbrev }), full, starter.gs !== null ? `Game Score ${starter.gs}` : null, stats, counts].filter(Boolean).join(', ')}
            style={{ flex: 1, flexBasis: 0, minWidth: 0, gap: 6, borderRadius: radius.tile, backgroundColor: colors.raised, padding: 12 }}
        >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <TeamMark team={team} />
                <Txt size={11} weight="extrabold" tone="muted" numberOfLines={1} style={{ textTransform: 'uppercase', letterSpacing: 1, flexShrink: 1 }}>
                    {t('pro.final.report.starter', { team: team.abbrev })}
                </Txt>
            </View>
            <Txt size={14} weight="extrabold" style={{ lineHeight: 17 }}>
                {full}
            </Txt>
            {starter.gs !== null ? (
                <>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
                        <Txt condensed size={32} tabular style={{ lineHeight: 32 }}>
                            {starter.gs}
                        </Txt>
                        <Txt size={11} weight="extrabold" tone="muted" style={{ letterSpacing: 0.8 }}>
                            GAME SCORE
                        </Txt>
                    </View>
                    <GrowBar value={Math.max(0, starter.gs) / 100} color={team.color} />
                </>
            ) : null}
            {stats ? (
                <Txt condensed size={14} tabular style={{ lineHeight: 18 }}>
                    {stats}
                </Txt>
            ) : null}
            {counts ? (
                <Txt size={12} tone="muted" style={{ lineHeight: 16 }}>
                    {counts}
                </Txt>
            ) : null}
        </View>
    );
};

const SpanBar: React.FC<{ left: number; width: number; color: string; index: number; seen: boolean }> = ({ left, width, color, index, seen }) => {
    const progress = useGrow(1, seen, index);
    const grow = useAnimatedStyle(() => ({ width: `${width * progress.get()}%` }));
    return <Animated.View style={[{ position: 'absolute', top: 10, height: 14, borderRadius: 7, left: `${left}%`, backgroundColor: color }, grow]} />;
};

const SpanRow: React.FC<{ span: PitcherSpan; name: string; ip: string; ps: string; innings: number; color: string; index: number; seen: boolean }> = ({ span, name, ip, ps, innings, color, index, seen }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const left = (span.start / innings) * 100;
    const width = Math.max(1.5, (span.length / innings) * 100);
    const inherited = span.ir ? t('pro.final.report.inherited', { ir: span.ir, irs: span.irs ?? 0 }) : null;
    return (
        <View accessible accessibilityLabel={[name, ip, inherited, `${t('pro.final.report.psAria', { value: ps })}`].filter(Boolean).join(', ')} style={{ height: 34, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: NAME, minWidth: 0 }}>
                <Txt size={12} weight="bold" numberOfLines={1}>
                    {name}
                </Txt>
                <Txt size={10} weight="semibold" tone="muted" numberOfLines={1}>
                    {inherited ? `${ip} · ${inherited}` : ip}
                </Txt>
            </View>
            <View style={{ flex: 1, height: 34 }}>
                {Array.from({ length: innings - 1 }, (_, n) => (
                    <View key={n} style={{ position: 'absolute', top: 0, bottom: 0, left: `${((n + 1) / innings) * 100}%`, width: 1, backgroundColor: alpha(colors.line, 0.07) }} />
                ))}
                <SpanBar left={left} width={width} color={color} index={index} seen={seen} />
            </View>
            <Txt condensed size={14} tabular style={{ width: PS, textAlign: 'right' }}>
                {ps}
            </Txt>
        </View>
    );
};

export const PitchingReport: React.FC<{ game: GameDetail; pro?: GamePro }> = ({ game, pro }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const divider = useDivider();
    const { setNode, onLayout, seen } = useInView();
    const innings = Math.max(game.scheduledInnings || 9, game.linescore.length);
    const pitchersOf = (side: Side) => (pro ? pro.box[side].pitchers : litePitchers(game, side));
    const lineOf = (side: Side, id: number) => game.box[side].pitchers.find((item) => item.id === id);
    const starters: Starter[] = (['away', 'home'] as const)
        .map((side): Starter | null => {
            if (pro) {
                const pitcher = pro.box[side].pitchers.find((item) => item.starter) ?? pro.box[side].pitchers[0];
                return pitcher ? { side, id: pitcher.id, line: lineOf(side, pitcher.id), gs: pitcher.gs, np: pitcher.np, st: pitcher.st, bf: pitcher.bf } : null;
            }
            const line = game.box[side].pitchers[0];
            return line ? { side, id: line.id, line, gs: null, np: line.np, st: line.st, bf: null } : null;
        })
        .filter((item): item is Starter => item !== null);
    const spansOf = (side: Side) => pitcherSpans(side, pitchersOf(side), game.atBats);
    const inherited = pro ? (['away', 'home'] as const).flatMap((side) => spansOf(side).filter((span) => !span.starter && (span.ir ?? 0) > 0)) : [];
    const opened = (side: Side) => spansOf(side).filter((span) => !span.starter);
    let order = 0;

    // Cómo estaba el juego cuando entró el relevista: «bases llenas, 2 outs»
    const entry = (id: number) => {
        const first = game.atBats.find((atBat) => atBat.pitcher.id === id);
        const situation = first ? situationBefore(game.atBats, pro?.plays, first.i) : null;
        if (!situation) return null;
        return [basesText(situation.bases, t), t('pro.kit.game.outs', { count: situation.outs })].filter(Boolean).join(', ');
    };

    const group = (side: Side) => {
        const spans = spansOf(side);
        if (!spans.length) return null;
        const team = game[side];
        return (
            <View key={side}>
                <View style={{ marginTop: 10, marginBottom: 2, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <TeamMark team={team} size={16} />
                    <Txt size={12} weight="extrabold">
                        {t(side === 'away' ? 'pro.final.report.awayHalves' : 'pro.final.report.homeHalves', { team: team.abbrev })}
                    </Txt>
                </View>
                <View accessibilityLabel={t('pro.final.report.groupAria', { team: team.name })}>
                    {spans.map((span) => {
                        const line = lineOf(side, span.id);
                        const pitcher = pro?.box[side].pitchers.find((item) => item.id === span.id);
                        const np = pitcher?.np ?? line?.np ?? null;
                        const st = pitcher?.st ?? line?.st ?? null;
                        return (
                            <SpanRow
                                key={span.id}
                                span={span}
                                name={shortName(nameOf(game, pro, span.id, line?.name ?? ''))}
                                ip={`${line?.ip ?? '—'} IP`}
                                ps={np !== null ? `${np}-${st ?? 0}` : '—'}
                                innings={innings}
                                color={team.color}
                                index={order++}
                                seen={seen}
                            />
                        );
                    })}
                </View>
            </View>
        );
    };

    return (
        <ProSection title={t('pro.final.report.title')}>
            {starters.length > 0 ? (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                    {starters.map((starter) => (
                        <StarterCard key={starter.side} game={game} pro={pro} starter={starter} />
                    ))}
                </View>
            ) : null}
            <View ref={setNode} onLayout={onLayout} accessibilityLabel={t('pro.final.report.bullpenAria')}>
                <View style={{ marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 8 }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
                    <Txt size={10} weight="extrabold" tone="muted" style={{ width: NAME }}>
                        {t('pro.final.report.pitcher')}
                    </Txt>
                    <View style={{ flex: 1, flexDirection: 'row' }}>
                        {Array.from({ length: innings }, (_, index) => (
                            <Txt key={index} size={10} weight="extrabold" tone="muted" center style={{ flex: 1 }}>
                                {index + 1}
                            </Txt>
                        ))}
                    </View>
                    <Txt size={10} weight="extrabold" tone="muted" style={{ width: PS, textAlign: 'right' }}>
                        P-S
                    </Txt>
                </View>
                {group('away')}
                {group('home')}
            </View>
            <View style={[{ marginTop: 12, paddingTop: 12 }, divider]}>
                {pro ? (
                    <>
                        <Txt size={10} weight="extrabold" tone="muted" style={{ marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1.2 }}>
                            {t('pro.final.report.inheritedTitle')}
                        </Txt>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                            {inherited.map((span) => {
                                const situation = entry(span.id);
                                return (
                                    <View key={span.id} style={{ borderRadius: radius.pill, backgroundColor: colors.raised, paddingHorizontal: 10, paddingVertical: 6 }}>
                                        <Txt size={12} weight="semibold">
                                            {`${shortName(nameOf(game, pro, span.id, lineOf(span.side, span.id)?.name ?? ''))} `}
                                            <Txt condensed size={14} tabular>{`${span.ir} · ${span.irs ?? 0}`}</Txt>
                                            {situation ? <Txt size={12} tone="muted">{` (${situation})`}</Txt> : null}
                                        </Txt>
                                    </View>
                                );
                            })}
                            {(['away', 'home'] as const)
                                .filter((side) => opened(side).length > 0 && opened(side).every((span) => span.openedInning))
                                .map((side) => (
                                    <View key={side} style={{ borderRadius: radius.pill, backgroundColor: colors.raised, paddingHorizontal: 10, paddingVertical: 6 }}>
                                        <Txt size={12} weight="semibold" tone="muted">
                                            {t('pro.final.report.opened', { team: game[side].abbrev })}
                                        </Txt>
                                    </View>
                                ))}
                            {!inherited.length && opened('away').length + opened('home').length === 0 ? (
                                <Txt size={12} tone="muted">
                                    {t('pro.final.report.noRelief')}
                                </Txt>
                            ) : null}
                        </View>
                    </>
                ) : (
                    <ProNote tone="neutral">{t('pro.final.report.liteNote')}</ProNote>
                )}
            </View>
        </ProSection>
    );
};
