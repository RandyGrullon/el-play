import React, { useEffect } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { ShieldCheck } from 'lucide-react-native';
import type { GamePro } from '../../../../lib/pro/juego';
import { pitchTypeName } from '../../../../lib/baseball';
import { useColors } from '../../../../theme/theme';
import { alpha, radius, shadow } from '../../../../theme/tokens';
import { Txt } from '../../../ui';
import { ProNote, useMotion } from '../../kit';
import { countBefore, hbView, spinClock, type PitchItem } from '../vivo/logic';
import { absOf, callText, fmtInches, fmtMph, placeText } from '../vivo/parts';
import { pitchColor } from './ZoneField';

// Ficha de un pitcheo en la hoja de zona: velocidad de salida y al plato, resultado y lugar en palabras, el conteo
// antes y después, giro, tiempo al plato, extensión, eje y quiebres, y si fue retado por ABS. Sube con resorte al cambiar.

interface PitchCardProps {
    item: PitchItem;
    /** Pitcheos del turno */
    total: number;
    typed: boolean;
    pro?: GamePro;
}

/** Sube 12 px con resorte y aparece al montarse (con key distinta por pitcheo vuelve a subir) */
export const SpringUp: React.FC<{ style?: StyleProp<ViewStyle>; children: React.ReactNode }> = ({ style, children }) => {
    const motion = useMotion();
    const shown = useSharedValue(motion.animate ? 0 : 1);
    useEffect(() => {
        if (!motion.animate) {
            shown.set(1);
            return;
        }
        shown.set(withSpring(1, { damping: 16, stiffness: 180, mass: 0.8 }));
        return () => cancelAnimation(shown);
        // Solo al montarse
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const rise = useAnimatedStyle(() => ({ opacity: Math.min(1, shown.get() * 1.4), transform: [{ translateY: (1 - shown.get()) * 12 }] }));
    return <Animated.View style={[style, rise]}>{children}</Animated.View>;
};

const Tile: React.FC<{ value: string | null; unit?: string; label: string }> = ({ value, unit, label }) => {
    const colors = useColors();
    if (value === null) return null;
    return (
        <View style={{ flexBasis: '30%', flexGrow: 1, minWidth: 0, borderRadius: radius.tile, backgroundColor: colors.raised, paddingHorizontal: 10, paddingVertical: 10 }}>
            <Txt condensed size={22} tabular numberOfLines={1} style={{ lineHeight: 24 }}>
                {value}
                {unit ? (
                    <Txt size={11} weight="bold" tone="muted">
                        {' '}
                        {unit}
                    </Txt>
                ) : null}
            </Txt>
            <Txt size={11} weight="semibold" tone="muted" numberOfLines={1} style={{ marginTop: 2 }}>
                {label}
            </Txt>
        </View>
    );
};

/** Quién pidió el reto ABS y cómo terminó: «Reto ABS de Mejía (LIC): revocado» */
export const absLine = (t: (key: string, options?: Record<string, unknown>) => string, item: Pick<PitchItem, 'pro'>, pro: GamePro | undefined) => {
    const review = absOf(item.pro);
    if (!review) return null;
    const who = review.player ? pro?.players?.[String(review.player)]?.name : null;
    const result = t(review.over ? 'pro.vivo.abs.overturned' : 'pro.vivo.abs.confirmed');
    return who ? t('pro.vivo.abs.byWho', { who, result }) : t('pro.vivo.abs.noWho', { result });
};

export const PitchCard: React.FC<PitchCardProps> = ({ item, total, typed, pro }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const lang = i18n.language;
    const { pitch, atBat, k } = item;
    const extra = item.pro;
    const color = pitchColor(pitch, typed, colors);
    const before = countBefore(atBat.pitches, k);
    const after = { balls: pitch.b ?? before.balls, strikes: pitch.s ?? before.strikes };
    const place = placeText(t, pitch, atBat.batter.side);
    const tracked = !!extra && [extra.end, extra.pt, extra.ext, extra.ivb].some((value) => typeof value === 'number');
    const abs = absLine(t, item, pro);
    const mph = fmtMph(pitch.mph, lang);
    const end = fmtMph(extra?.end, lang);
    const call = callText(pitch, lang);

    return (
        <SpringUp key={`${atBat.i}-${k}`}>
            <View accessibilityLiveRegion="polite" style={[{ borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: alpha(colors.line, 0.06), padding: 16, gap: 4 }, shadow('card')]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <View style={{ height: 28, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, backgroundColor: colors.raised, paddingHorizontal: 12, flexShrink: 1 }}>
                        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />
                        <Txt size={13} weight="extrabold" numberOfLines={1}>
                            {pitchTypeName(pitch, lang)}
                        </Txt>
                    </View>
                    <Txt size={12} weight="semibold" tone="muted">
                        {t('pro.zona.pitchOf', { n: k + 1, total })}
                    </Txt>
                </View>
                {mph && (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 6, marginTop: 4 }}>
                        <Txt condensed size={44} tabular style={{ lineHeight: 46 }}>
                            {mph}
                        </Txt>
                        <Txt size={14} weight="bold" tone="muted">
                            mph
                        </Txt>
                        {end && (
                            <Txt size={14} weight="semibold" tone="muted">
                                {t('pro.zona.toPlate', { mph: end })}
                            </Txt>
                        )}
                    </View>
                )}
                <Txt size={15} weight="extrabold" style={{ marginTop: 2 }}>
                    {call.charAt(0).toUpperCase() + call.slice(1)}
                    {place ? <Txt weight="semibold" tone="muted">{` · ${place}`}</Txt> : null}
                </Txt>
                <Txt size={12} tone="muted">
                    {t('pro.zona.countMove', { from: `${before.balls}-${before.strikes}`, to: `${after.balls}-${after.strikes}` })}
                </Txt>

                {tracked ? (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                        <Tile value={typeof pitch.spin === 'number' ? String(pitch.spin) : null} label={t('pro.zona.tile.spin')} />
                        <Tile value={fmtMph(extra?.pt, lang, 2)} unit="s" label={t('pro.zona.tile.plateTime')} />
                        <Tile value={fmtMph(extra?.ext, lang)} unit={t('pro.zona.feetUnit')} label={t('pro.zona.tile.extension')} />
                        <Tile value={spinClock(extra?.sd)} label={t('pro.zona.tile.axis')} />
                        <Tile value={fmtInches(extra?.ivb, lang)} label={t('pro.zona.tile.ivb')} />
                        <Tile value={fmtInches(hbView(extra), lang)} label={t('pro.zona.tile.hb')} />
                    </View>
                ) : (
                    <ProNote tone="pending" style={{ marginTop: 8 }}>
                        {`${t('pro.kit.game.noTracking')} ${t('pro.zona.noTrackingPitch')}`}
                    </ProNote>
                )}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
                    <ShieldCheck size={16} color={colors.muted} />
                    <Txt size={12} tone="muted" style={{ flexShrink: 1 }}>
                        {abs ?? t('pro.vivo.abs.none')}
                    </Txt>
                </View>
            </View>
        </SpringUp>
    );
};
