import React, { useEffect } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import Animated, { cancelAnimation, useAnimatedProps, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { pitchTypeColor, pitchTypeName } from '../../../lib/baseball';
import { useColors } from '../../../theme/theme';
import { alpha, fonts, radius, shadow } from '../../../theme/tokens';
import type { PlayerPro } from '../../../types/pro-liga';
import { Txt } from '../../ui';
import { GrowBar, MOTION_EASE, MOTION_MS, ModuleHeader, arcLength, arcPath, useInView, useMotion } from '../kit';

const AnimatedPath = Animated.createAnimatedComponent(Path);

/** Un tramo de la dona: se dibuja después del anterior (la dona entera tarda 600 ms) */
const Segment: React.FC<{ d: string; length: number; color: string; start: number; share: number; seen: boolean }> = ({ d, length, color, start, share, seen }) => {
    const motion = useMotion();
    const progress = useSharedValue(motion.animate ? 0 : 1);
    useEffect(() => {
        if (!motion.animate) {
            progress.set(1);
            return;
        }
        if (!seen) return;
        progress.set(withDelay(Math.round(MOTION_MS.count * start), withTiming(1, { duration: Math.max(80, Math.round(MOTION_MS.count * share)), easing: MOTION_EASE })));
        return () => cancelAnimation(progress);
    }, [seen, motion.animate, start, share, progress]);
    const total = Math.max(1, length + 1);
    const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: total * (1 - progress.get()) }));
    return <AnimatedPath d={d} fill="none" stroke={color} strokeWidth={18} strokeDasharray={[total, total]} animatedProps={animatedProps} />;
};

// Repertorio del lanzador (MLB pitchArsenal, solo pitcheos con rastreo): dona con el % de cada tipo dibujándose por
// segmentos y la lista con barras, velocidad media y cuántos.
export const Arsenal: React.FC<{ pro: PlayerPro }> = ({ pro }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const { setNode, onLayout, seen } = useInView();
    const pitches = (pro.arsenal ?? []).filter((pitch) => pitch.pct > 0);
    if (!pitches.length) return null;
    const total = pitches[0].total ?? pitches.reduce((sum, pitch) => sum + pitch.count, 0);
    const name = (code: string, fallback: string) => pitchTypeName({ type: code, typeDesc: fallback }, i18n.language);
    const size = 156;
    const c = size / 2;
    const r = 60;
    const sum = pitches.reduce((value, pitch) => value + pitch.pct, 0) || 100;
    // Cada tajada empieza donde terminó la anterior
    const segments: { pitch: (typeof pitches)[number]; from: number; to: number; sweep: number; share: number; begin: number }[] = [];
    let start = 0;
    for (const pitch of pitches) {
        const sweep = (pitch.pct / sum) * 360;
        const to = start + Math.max(0.5, sweep - 1.2);
        segments.push({ pitch, from: start, to, sweep: to - start, share: sweep / 360, begin: start / 360 });
        start += sweep;
    }
    const top = pitches[0];
    const summary = pitches.map((pitch) => `${name(pitch.code, pitch.name)} ${pitch.pct.toFixed(1)} %${pitch.mph ? `, ${pitch.mph.toFixed(1)} mph` : ''}`).join('; ');
    return (
        <View style={{ gap: 12 }}>
            <ModuleHeader title={t('pro.ficha.arsenal.title')} aside={t('pro.ficha.arsenal.tracked', { count: total })} />
            <View ref={setNode} onLayout={onLayout} style={[{ borderRadius: radius.card, backgroundColor: colors.surface, borderWidth: 1, borderColor: alpha(colors.line, 0.06), padding: 16 }, shadow('card')]}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
                    <View accessible accessibilityRole="image" accessibilityLabel={t('pro.ficha.arsenal.aria', { list: summary })} style={{ width: size, height: size }}>
                        <Svg width={size} height={size}>
                            <Circle cx={c} cy={c} r={r} fill="none" stroke={alpha(colors.line, 0.1)} strokeWidth={18} />
                            {segments.map((segment) => (
                                <Segment key={segment.pitch.code} d={arcPath(c, c, r, segment.from, segment.to)} length={arcLength(r, segment.sweep)} color={pitchTypeColor(segment.pitch.code)} start={segment.begin} share={segment.share} seen={seen} />
                            ))}
                        </Svg>
                        <View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' }}>
                            <Txt style={{ fontFamily: fonts.condensed, fontSize: 26, lineHeight: 28, color: colors.ink, fontVariant: ['tabular-nums'] }}>{`${top.pct.toFixed(1)}%`}</Txt>
                            <Txt size={11} weight="bold" tone="muted" numberOfLines={1} style={{ maxWidth: 84 }}>
                                {name(top.code, top.name)}
                            </Txt>
                        </View>
                    </View>
                    <View style={{ flexGrow: 1, flexBasis: 180, minWidth: 0, gap: 10 }}>
                        {pitches.map((pitch, index) => (
                            <View key={pitch.code} accessible accessibilityLabel={`${name(pitch.code, pitch.name)}: ${pitch.pct.toFixed(1)} %${pitch.mph ? `, ${t('pro.ficha.arsenal.mph', { mph: pitch.mph.toFixed(1) })}` : ''}, ${t('pro.ficha.arsenal.count', { count: pitch.count })}`}>
                                <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1, minWidth: 0 }}>
                                        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: pitchTypeColor(pitch.code) }} />
                                        <Txt size={13} weight="bold" numberOfLines={1} style={{ flexShrink: 1 }}>
                                            {name(pitch.code, pitch.name)}
                                        </Txt>
                                    </View>
                                    <Txt size={13} weight="extrabold" tabular>
                                        {`${pitch.pct.toFixed(1)}%`}
                                        {pitch.mph ? (
                                            <Txt size={13} weight="semibold" tone="muted">
                                                {`  ${t('pro.ficha.arsenal.mph', { mph: pitch.mph.toFixed(1) })}`}
                                            </Txt>
                                        ) : null}
                                    </Txt>
                                </View>
                                <GrowBar value={pitch.pct / pitches[0].pct} color={pitchTypeColor(pitch.code)} index={index} seen={seen} style={{ marginTop: 4 }} />
                                <Txt size={11} tone="muted">
                                    {t('pro.ficha.arsenal.count', { count: pitch.count })}
                                </Txt>
                            </View>
                        ))}
                    </View>
                </View>
                <Txt size={11} tone="muted" style={{ marginTop: 12, lineHeight: 15 }}>
                    {t('pro.ficha.arsenal.note')}
                </Txt>
            </View>
        </View>
    );
};
