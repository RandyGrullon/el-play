import React from 'react';
import { Pressable, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { Eye } from 'lucide-react-native';
import type { AtBat, GameDetail } from '../../../../types';
import type { GamePro } from '../../../../lib/pro/juego';
import { pitchTypeName } from '../../../../lib/baseball';
import { useColors } from '../../../../theme/theme';
import { alpha, radius } from '../../../../theme/tokens';
import { Txt } from '../../../ui';
import { uniformColors } from '../../../game/BatterFigure';
import { Enter, ModuleHeader, ProSection, lastName, readableInk, useGrow, useInView } from '../../kit';
import { typeMix, type PitchItem } from '../vivo/logic';
import { absOf, callText, fmtMph, sidesOf } from '../vivo/parts';
import { PitchCard } from './PitchCard';
import { ZoneField, pitchColor } from './ZoneField';

// Zona grande de la hoja: el turno (pitcheos numerados con la velocidad dentro, ficha y secuencia) o la nube de
// todos los pitcheos del lanzador o del bateador en el juego.

export type ZoneMode = 'atBat' | 'pitcher' | 'batter';

type T = (key: string, options?: Record<string, unknown>) => string;

interface ZoneCardProps {
    game: GameDetail;
    pro?: GamePro;
    atBat: AtBat;
    mode: ZoneMode;
    items: PitchItem[];
    selected: number | null;
    onSelect: (index: number | null) => void;
}

/** «5 sinkers y 1 slider» con los nombres en plural del idioma */
export const seenSentence = (t: T, rows: { type: string; count: number }[], fallback: (type: string) => string) => {
    const parts = rows.map((row) => `${row.count} ${t(`pro.zona.plural.${row.type}`, { count: row.count, defaultValue: fallback(row.type) })}`);
    if (parts.length <= 1) return parts.join('');
    return t('pro.zona.listAnd', { list: parts.slice(0, -1).join(', '), last: parts[parts.length - 1] });
};

/** Barra apilada de tipos con su sigla y cuántos («SI 5 · SL 1»); crece desde la izquierda al entrar en pantalla */
export const TypeStack: React.FC<{ rows: { type: string; count: number }[]; total: number; label: string; height?: number; style?: StyleProp<ViewStyle> }> = ({ rows, total, label, height = 28, style }) => {
    const colors = useColors();
    const { setNode, onLayout, seen } = useInView();
    const progress = useGrow(1, seen);
    const grow = useAnimatedStyle(() => ({ width: `${progress.get() * 100}%` }));
    return (
        <View ref={setNode} onLayout={onLayout} accessible accessibilityRole="image" accessibilityLabel={label} style={[{ height, width: '100%', borderRadius: 8, overflow: 'hidden', backgroundColor: alpha(colors.line, 0.1) }, style]}>
            <Animated.View style={[{ height: '100%', overflow: 'hidden' }, grow]}>
                <View style={{ flexDirection: 'row', height: '100%', width: '100%' }}>
                    {rows.map((row, index) => {
                        const color = pitchColor({ type: row.type, r: 'strike' }, row.type !== '??', colors);
                        const share = total ? row.count / total : 0;
                        return (
                            <View
                                key={row.type}
                                style={{ width: `${share * 100}%`, minWidth: 0, justifyContent: 'center', overflow: 'hidden', paddingHorizontal: 6, backgroundColor: color, borderLeftWidth: index ? 2 : 0, borderLeftColor: colors.surface }}
                            >
                                <Txt size={11} weight="extrabold" color={readableInk(color)} numberOfLines={1}>
                                    {share >= 0.12 ? `${row.type === '??' ? '—' : row.type} ${row.count}` : share >= 0.06 ? String(row.count) : ''}
                                </Txt>
                            </View>
                        );
                    })}
                </View>
            </Animated.View>
        </View>
    );
};

const LegendDot: React.FC<{ kind: 'strike' | 'ball' | 'inplay' | 'abs'; label: string }> = ({ kind, label }) => {
    const colors = useColors();
    const look: ViewStyle =
        kind === 'strike'
            ? { backgroundColor: colors.muted }
            : kind === 'ball'
              ? { borderWidth: 2, borderColor: colors.muted, backgroundColor: alpha(colors.muted, 0.25) }
              : kind === 'inplay'
                ? { backgroundColor: colors.muted, borderWidth: 2, borderColor: colors.ink }
                : { borderWidth: 2, borderColor: colors.ink };
    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={[{ width: 12, height: 12, borderRadius: 6 }, look]} />
            <Txt size={12} tone="muted">
                {label}
            </Txt>
        </View>
    );
};

export const ZoneCard: React.FC<ZoneCardProps> = ({ game, pro, atBat, mode, items, selected, onSelect }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const narrow = useWindowDimensions().width < 360;
    const lang = i18n.language;
    const { batting } = sidesOf(game, atBat.top);
    const typed = items.some(({ pitch }) => pitch.type);
    const turn = mode === 'atBat';
    const live = game.state === 'live' && !atBat.complete;
    const current = turn ? (selected !== null ? items[selected] : items[items.length - 1]) : undefined;
    const mix = typeMix(items);
    const batterLast = lastName(atBat.batter.name);
    const pitcherLast = lastName(atBat.pitcher.name);
    const side = atBat.batter.side;
    const runners = (['first', 'second', 'third'] as const).filter((base) => game.runners[base]);
    const challenged = items.filter((item) => absOf(item.pro)).length;
    const challengedGame = (pro?.plays ?? []).reduce((sum, play) => sum + play.pitches.filter((pitch) => absOf(pitch)).length, 0);

    const title = turn ? t('pro.zona.versus', { batter: batterLast, pitcher: pitcherLast }) : mode === 'pitcher' ? t('pro.zona.pitcherToday', { name: atBat.pitcher.name }) : t('pro.zona.batterToday', { name: atBat.batter.name });
    const sub = turn
        ? [
              t('pro.zona.pitches', { count: items.length }),
              live ? t('pro.zona.countNow', { value: `${game.count.balls}-${game.count.strikes}` }) : null,
              live ? t('pro.kit.game.outs', { count: game.count.outs }) : null,
              live && runners.length ? t('pro.zona.runnersOn', { count: runners.length, bases: runners.map((base) => t(`pro.vivo.base.${base}`)).join(t('pro.zona.and')) }) : null
          ]
              .filter(Boolean)
              .join(' · ')
        : t('pro.zona.cloudSub', { count: items.length });
    const viewChip = side === 'L' || side === 'R' ? t('pro.zona.viewSide', { side: t(`pro.vivo.hand.bats.${side}`) }) : t('pro.zona.view');

    const pitchName = (index: number) => {
        const { pitch } = items[index];
        return `${index + 1}: ${pitchTypeName(pitch, lang)} ${fmtMph(pitch.mph, lang) ?? ''} — ${callText(pitch, lang)}`;
    };

    return (
        <ProSection title={t('pro.zona.zoneTitle')} bodyStyle={{ gap: 12 }}>
            <View>
                <Txt size={19} weight="black" accessibilityRole="header" style={{ lineHeight: 23, letterSpacing: -0.3 }}>
                    {title}
                </Txt>
                <Txt size={12} tone="muted" style={{ marginTop: 2 }}>
                    {sub}
                </Txt>
            </View>
            <View style={{ borderRadius: 20, backgroundColor: alpha(colors.raised, 0.6), paddingHorizontal: 8, paddingBottom: 8, paddingTop: 44 }}>
                <View style={{ position: 'absolute', left: 12, top: 12, height: 28, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, backgroundColor: colors.surface, paddingHorizontal: 12 }}>
                    <Eye size={14} color={colors.muted} />
                    <Txt size={12} weight="bold">
                        {turn ? viewChip : t('pro.zona.normalized')}
                    </Txt>
                </View>
                {items.length ? (
                    <Enter key={mode}>
                        <ZoneField
                            items={items}
                            mode={turn ? 'sequence' : 'cloud'}
                            inner="speed"
                            batterSide={side}
                            uniform={uniformColors(batting, !atBat.top)}
                            selected={turn ? selected : null}
                            onSelect={turn ? (index) => onSelect(selected === index ? null : index) : undefined}
                            heights={(feet) => t('pro.zona.feet', { value: fmtMph(feet, lang) })}
                            label={t('pro.zona.zoneAria', { title, count: items.length })}
                        />
                    </Enter>
                ) : (
                    <Txt size={14} tone="muted" center style={{ paddingVertical: 64 }}>
                        {t('pro.zona.noPitches')}
                    </Txt>
                )}
            </View>

            {/* Leyenda: tipos que salen, resultado y retos ABS */}
            <View style={{ gap: 8 }}>
                {typed && (
                    <View accessibilityLabel={t('pro.zona.types')} style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 6 }}>
                        {mix.map((row) => (
                            <View key={row.type} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: pitchColor({ type: row.type, r: 'strike' }, true, colors) }} />
                                <Txt size={12} weight="extrabold">
                                    {pitchTypeName({ type: row.type === '??' ? null : row.type, typeDesc: null }, lang)}
                                    {!turn ? <Txt size={12} weight="semibold" tone="muted">{` ${row.count}`}</Txt> : null}
                                </Txt>
                            </View>
                        ))}
                    </View>
                )}
                {turn && (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 4 }}>
                        <LegendDot kind="strike" label={t('pro.zona.legend.strike')} />
                        <LegendDot kind="ball" label={t('pro.zona.legend.ball')} />
                        <LegendDot kind="inplay" label={t('pro.zona.legend.inPlay')} />
                        {challengedGame > 0 && <LegendDot kind="abs" label={t('pro.zona.legend.abs')} />}
                    </View>
                )}
                {challengedGame > 0 && (
                    <Txt size={12} tone="muted">
                        {t('pro.zona.absCount', { count: challenged, game: challengedGame })}
                    </Txt>
                )}
            </View>

            {turn && current && <PitchCard item={current} total={items.length} typed={typed} pro={pro} />}

            {turn && items.length > 0 && (
                <View>
                    <ModuleHeader title={t('pro.zona.sequence')} aside={t('pro.zona.tapHint')} style={{ marginBottom: 6 }} />
                    <View style={{ gap: 4 }}>
                        {items.map((item, index) => {
                            const active = (selected ?? items.length - 1) === index;
                            const color = pitchColor(item.pitch, typed, colors);
                            return (
                                <Pressable
                                    key={index}
                                    onPress={() => onSelect(selected === index ? null : index)}
                                    accessibilityRole="button"
                                    accessibilityState={{ selected: selected === index }}
                                    accessibilityLabel={pitchName(index)}
                                    style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, paddingHorizontal: 8, backgroundColor: active ? alpha(colors.accent, 0.15) : 'transparent' }}
                                >
                                    <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
                                        <Txt size={11} weight="extrabold" color={readableInk(color)} style={{ lineHeight: 13 }}>
                                            {index + 1}
                                        </Txt>
                                    </View>
                                    <View style={{ flex: 1, minWidth: 0 }}>
                                        <Txt size={14} weight="extrabold" numberOfLines={1}>
                                            {pitchTypeName(item.pitch, lang)}
                                        </Txt>
                                        {narrow && (
                                            <Txt size={12} tone="muted" numberOfLines={1}>
                                                {callText(item.pitch, lang)}
                                            </Txt>
                                        )}
                                    </View>
                                    <Txt condensed size={18} tabular style={{ width: 44, textAlign: 'right' }}>
                                        {fmtMph(item.pitch.mph, lang) ?? '—'}
                                    </Txt>
                                    {!narrow && (
                                        <Txt size={12} tone="muted" numberOfLines={1} style={{ width: 96 }}>
                                            {callText(item.pitch, lang)}
                                        </Txt>
                                    )}
                                    <Txt size={14} weight="extrabold" tabular style={{ minWidth: 26, textAlign: 'right' }}>
                                        {item.pitch.b !== null && item.pitch.s !== null ? `${item.pitch.b}-${item.pitch.s}` : ''}
                                    </Txt>
                                </Pressable>
                            );
                        })}
                    </View>
                </View>
            )}

            {turn && typed && items.length > 0 && (
                <View style={{ borderRadius: radius.tile, backgroundColor: colors.raised, padding: 12, gap: 8 }}>
                    <ModuleHeader title={t('pro.zona.seenTurn')} />
                    <TypeStack rows={mix} total={items.length} label={seenSentence(t, mix, (type) => pitchTypeName({ type, typeDesc: null }, lang))} />
                    <Txt size={12} tone="muted">
                        {seenSentence(t, mix, (type) => pitchTypeName({ type, typeDesc: null }, lang))}.
                    </Txt>
                </View>
            )}
        </ProSection>
    );
};
