import React from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { TrendingDown, TrendingUp } from 'lucide-react-native';
import type { HittingLine, PlayerDetail } from '../../../lib/stats';
import { numOf } from '../../../lib/advanced';
import { useColors } from '../../../theme/theme';
import { alpha, fonts, radius, shadow } from '../../../theme/tokens';
import type { PlayerPro, SplitLine } from '../../../types/pro-liga';
import { Txt } from '../../ui';
import { GrowBar, ModuleHeader, useInView } from '../kit';
import { minusHitting, pairVerdict, slashOf } from '../estadisticas/logic';
import { rate } from './format';

interface Side {
    label: string;
    value: number | null;
    /** Apariciones (bateador) o bateadores enfrentados (lanzador): la muestra */
    sample: number;
    sub: string;
}

interface Pair {
    key: string;
    title: string;
    left: Side;
    right: Side;
    /** Frase si la diferencia es grande (.100 de OPS y 20+ de muestra por lado) */
    phrase: string | null;
    /** La frase cuenta que baja (con corredores en posición rinde menos) */
    down?: boolean;
    note?: string;
}

const isHitting = (line: SplitLine): line is SplitLine & HittingLine => 'pa' in line;

// Situaciones en pares: contra zurdos y derechos, casa y visita, con corredores en posición, de día y de noche, y en
// victorias y derrotas de su equipo. Cada par con su OPS (en contra, si es lanzador), la muestra y una barra; si la
// diferencia es grande, la frase («Mata a los zurdos: .896 OPS»). Lo que MLB no manda no sale.
export const Situations: React.FC<{ player: PlayerDetail; pro: PlayerPro }> = ({ player, pro }) => {
    const { t } = useTranslation();
    const splits = pro.splits;
    const pitcher = player.role === 'P';
    const pairs: Pair[] = [];
    const sampleOf = (line: SplitLine | null | undefined) => (!line ? 0 : isHitting(line) ? line.pa : ((line as { bf?: number }).bf ?? 0));
    const sampleText = (line: SplitLine | null | undefined) => (pitcher ? t('pro.ficha.situations.bf', { count: sampleOf(line) }) : t('pro.ficha.situations.pa', { count: sampleOf(line) }));
    const opsOf = (line: SplitLine | null | undefined) => (line ? numOf(line.ops) : null);
    const metric = t(pitcher ? 'pro.ficha.situations.opsAgainst' : 'pro.ficha.situations.ops');
    const say = (key: string, side: 'left' | 'right', value: number | null, diff: number) => t(`pro.ficha.situations.phrase.${pitcher ? 'P' : 'B'}.${key}_${side}`, { ops: rate(value), diff: rate(diff), metric });

    const add = (key: string, left: SplitLine | null | undefined, right: SplitLine | null | undefined, extra?: { leftSub?: string; rightSub?: string; phrase?: boolean }) => {
        if (!left || !right) return;
        const lv = opsOf(left);
        const rv = opsOf(right);
        if (lv === null || rv === null) return;
        const verdict = extra?.phrase === false ? null : pairVerdict(lv, rv, sampleOf(left), sampleOf(right), player.role);
        pairs.push({
            key,
            title: t(`pro.ficha.situations.${key}.${pitcher && key === 'hand' ? 'titleP' : 'title'}`),
            left: { label: t(`pro.ficha.situations.${key}.left`), value: lv, sample: sampleOf(left), sub: extra?.leftSub ?? sampleText(left) },
            right: { label: t(`pro.ficha.situations.${key}.right`), value: rv, sample: sampleOf(right), sub: extra?.rightSub ?? sampleText(right) },
            phrase: verdict ? say(key, verdict.side, verdict.side === 'left' ? lv : rv, verdict.diff) : null
        });
    };

    if (splits) {
        add('hand', splits.vl, splits.vr);
        const homeSub = (line: SplitLine | undefined) =>
            line && isHitting(line) ? t('pro.ficha.situations.homeSub', { g: line.g, pa: line.pa, avg: line.avg }) : line ? t('pro.ficha.situations.homeSubP', { g: line.g, bf: (line as { bf?: number }).bf ?? 0, avg: line.avg ?? '—' }) : '';
        add('home', splits.h, splits.a, { leftSub: homeSub(splits.h), rightSub: homeSub(splits.a) });
        // Con corredores en posición: MLB no manda el «sin»; en bateo sale de la temporada menos esos turnos
        const risp = splits.risp;
        if (risp && !pitcher && player.hitting && isHitting(risp)) {
            const rest = minusHitting(player.hitting, risp);
            const restOps = slashOf(rest).ops;
            if (restOps !== null) {
                const lv = numOf(risp.ops);
                const verdict = lv !== null ? pairVerdict(lv, restOps, risp.pa, rest.pa, 'B') : null;
                pairs.push({
                    key: 'risp',
                    title: t('pro.ficha.situations.risp.title'),
                    left: { label: t('pro.ficha.situations.risp.left'), value: lv, sample: risp.pa, sub: sampleText(risp) },
                    right: { label: t('pro.ficha.situations.risp.right'), value: restOps, sample: rest.pa, sub: t('pro.ficha.situations.pa', { count: rest.pa }) },
                    phrase: verdict ? say('risp', verdict.side, verdict.side === 'left' ? lv : restOps, verdict.diff) : null,
                    down: verdict?.side === 'right',
                    note: t('pro.ficha.situations.risp.note')
                });
            }
        } else if (risp && pitcher) {
            const season = pro.advanced ? numOf(pro.advanced.ops as string) : null;
            const lv = numOf(risp.ops);
            if (lv !== null && season !== null) {
                const verdict = pairVerdict(lv, season, sampleOf(risp), player.pitching?.bf ?? 0, 'P');
                pairs.push({
                    key: 'risp',
                    title: t('pro.ficha.situations.risp.title'),
                    left: { label: t('pro.ficha.situations.risp.left'), value: lv, sample: sampleOf(risp), sub: sampleText(risp) },
                    right: { label: t('pro.ficha.situations.risp.season'), value: season, sample: player.pitching?.bf ?? 0, sub: t('pro.ficha.situations.bf', { count: player.pitching?.bf ?? 0 }) },
                    phrase: verdict ? say('risp', verdict.side, verdict.side === 'left' ? lv : season, verdict.diff) : null,
                    down: verdict?.side === 'right',
                    note: t('pro.ficha.situations.risp.noteP')
                });
            }
        }
        add('dayNight', splits.d, splits.n);
    }
    if (pro.byResult) add('result', pro.byResult.win, pro.byResult.loss, { phrase: false });
    if (!pairs.length) return null;

    return (
        <View style={{ gap: 12 }}>
            <ModuleHeader title={t('pro.ficha.situations.title')} aside={metric} />
            {pairs.map((pair) => (
                <PairCard key={pair.key} pair={pair} pitcher={pitcher} />
            ))}
        </View>
    );
};

const PairCard: React.FC<{ pair: Pair; pitcher: boolean }> = ({ pair, pitcher }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const { setNode, onLayout, seen } = useInView();
    const { left, right } = pair;
    const top = Math.max(left.value ?? 0, right.value ?? 0, 0.001);
    const leftBetter = left.value !== null && right.value !== null && (pitcher ? left.value < right.value : left.value > right.value);
    const rightBetter = left.value !== null && right.value !== null && (pitcher ? right.value < left.value : right.value > left.value);
    const Icon = pair.down ? TrendingDown : TrendingUp;
    const muted = alpha(colors.muted, 0.45);
    const spoken = [t('pro.ficha.situations.sr', { title: pair.title, left: left.label, lv: rate(left.value), right: right.label, rv: rate(right.value) }), `${left.sub}; ${right.sub}`, pair.phrase].filter(Boolean).join('. ');
    return (
        <View ref={setNode} onLayout={onLayout} style={[{ borderRadius: radius.card, backgroundColor: colors.surface, borderWidth: 1, borderColor: alpha(colors.line, 0.06), padding: 16 }, shadow('card')]}>
            <View accessible accessibilityLabel={spoken}>
                <Txt size={11} weight="extrabold" tone="muted" style={{ marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1.2 }}>
                    {pair.title}
                </Txt>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                    {[left, right].map((side, index) => (
                        <View key={index} style={{ flex: 1, flexBasis: 0, minWidth: 0, alignItems: index ? 'flex-end' : 'flex-start' }}>
                            <Txt size={13} weight="semibold" tone="muted" style={{ minHeight: 36, lineHeight: 18, textAlign: index ? 'right' : 'left' }}>
                                {side.label}
                            </Txt>
                            <Txt style={{ fontFamily: fonts.condensed, fontSize: 36, lineHeight: 38, color: colors.ink, fontVariant: ['tabular-nums'] }}>{rate(side.value)}</Txt>
                            <Txt size={11} tone="muted" style={{ marginTop: 2, textAlign: index ? 'right' : 'left' }}>
                                {side.sub}
                            </Txt>
                        </View>
                    ))}
                </View>
                <View style={{ marginTop: 10, flexDirection: 'row', gap: 6 }}>
                    <GrowBar value={(left.value ?? 0) / top} color={leftBetter ? colors.accent : muted} index={0} seen={seen} height={8} style={{ flex: 1 }} />
                    <GrowBar value={(right.value ?? 0) / top} color={rightBetter ? colors.accent : muted} index={1} seen={seen} height={8} style={{ flex: 1 }} />
                </View>
                {pair.phrase ? (
                    <View style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: radius.tile, backgroundColor: alpha(colors.accent, 0.1), paddingHorizontal: 12, paddingVertical: 10 }}>
                        <Icon size={16} color={colors.accentInk} />
                        <Txt size={13} weight="bold" color={colors.accentInk} style={{ flexShrink: 1, textAlign: 'center' }}>
                            {pair.phrase}
                        </Txt>
                    </View>
                ) : null}
                {pair.note ? (
                    <Txt size={11} tone="muted" style={{ marginTop: 8, lineHeight: 15 }}>
                        {pair.note}
                    </Txt>
                ) : null}
            </View>
        </View>
    );
};
