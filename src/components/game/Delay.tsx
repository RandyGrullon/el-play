import React from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { CirclePause, Cloud, CloudFog, CloudLightning, CloudRain, Droplets, ZapOff } from 'lucide-react-native';
import { inningName, type Delay, type DelayReason } from '../../lib/baseball';
import { useTheme } from '../../theme/theme';
import { radius, shadow } from '../../theme/tokens';
import { Txt } from '../ui';

// Juego detenido (lluvia, terreno mojado, tormenta…): la pastilla azul de las tarjetas y el aviso bajo la cabecera del
// juego. Va en azul de lluvia, no en el rojo de «en vivo». Igual que components/game/Delay.tsx de la web.

/** Azul frío de la lluvia (--rain de la web): `solid` va sobre los colores de los equipos, el mismo en los dos temas */
export const useRainTone = () => {
    const { isDark } = useTheme();
    const rgb = isDark ? '125,196,240' : '3,105,161';
    return { solid: '#0369a1', ink: `rgb(${rgb})`, soft: `rgba(${rgb},0.15)`, faint: `rgba(${rgb},0.1)`, line: `rgba(${rgb},0.2)` };
};

/** «Detenido · Lluvia» (con el inicio demorado, «Inicio demorado · Lluvia»; sin motivo conocido, solo «Detenido») */
export const delayPillText = (t: TFunction, delay: Delay) => {
    const short = t(delay.start ? 'delay.shortStart' : 'delay.short');
    const reason = t(`delay.reason.${delay.reason}`);
    return reason ? `${short} · ${reason}` : short;
};

/** «Juego detenido por lluvia» / «Inicio demorado por lluvia» */
export const delayTitle = (t: TFunction, delay: Delay) => t(`delay.${delay.start ? 'titleStart' : 'title'}.${delay.reason}`);

const ICONS: Record<DelayReason, typeof CloudRain> = {
    rain: CloudRain,
    wet: Droplets,
    lightning: CloudLightning,
    weather: Cloud,
    fog: CloudFog,
    power: ZapOff,
    other: CirclePause
};

export const DelayIcon: React.FC<{ reason: DelayReason; size?: number; color: string }> = ({ reason, size = 14, color }) => {
    const Icon = ICONS[reason];
    return <Icon size={size} color={color} />;
};

/**
 * Pastilla como la de la entrada, en azul de lluvia. `solid` va sobre los colores de los equipos (la cabecera del
 * juego). `suffix`: la entrada en que se detuvo («▲ 7»).
 */
export const DelayPill: React.FC<{ delay: Delay; suffix?: string | null; solid?: boolean; style?: StyleProp<ViewStyle> }> = ({ delay, suffix, solid, style }) => {
    const { t } = useTranslation();
    const tone = useRainTone();
    const ink = solid ? '#fff' : tone.ink;
    return (
        <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.pill, backgroundColor: solid ? tone.solid : tone.soft, paddingHorizontal: 12, paddingVertical: 4, flexShrink: 0 }, style]}>
            <DelayIcon reason={delay.reason} size={13} color={ink} />
            <Txt size={12} weight="bold" color={ink} numberOfLines={1}>
                {delayPillText(t, delay)}
                {suffix ? ` · ${suffix}` : ''}
            </Txt>
        </View>
    );
};

interface DelayBannerProps {
    delay: Delay;
    /** La entrada en que se detuvo (no va si todavía no empezaba) */
    inning?: { n?: number | null; isTop: boolean; state?: string | null } | null;
    /** Minutos de demora (info.delayMin), si los hay */
    minutes?: number | null;
    /** La lluvia de la pantalla: si se está viendo y cómo quitarla o ponerla (null: no hay botón) */
    rain?: { on: boolean; toggle: () => void } | null;
    style?: StyleProp<ViewStyle>;
}

/** Aviso bajo la cabecera: por qué se detuvo, en qué entrada, los minutos (si MLB los da) y el botón de la lluvia */
export const DelayBanner: React.FC<DelayBannerProps> = ({ delay, inning, minutes, rain, style }) => {
    const { t, i18n } = useTranslation();
    const { colors } = useTheme();
    const tone = useRainTone();
    const title = delayTitle(t, delay);
    const details = [!delay.start && inning?.n ? t('delay.stoppedAt', { inning: inningName(inning, i18n.language) }) : '', typeof minutes === 'number' && minutes > 0 ? t('delay.minutes', { count: minutes }) : ''].filter(Boolean).join(' · ');
    return (
        <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: radius.tile, borderWidth: 1, borderColor: tone.line, backgroundColor: tone.faint, paddingHorizontal: 14, paddingVertical: 12 }, style]}>
            <View accessible accessibilityRole="text" accessibilityLiveRegion="polite" accessibilityLabel={[title, details].filter(Boolean).join('. ')} style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: tone.soft, alignItems: 'center', justifyContent: 'center' }}>
                    <DelayIcon reason={delay.reason} size={20} color={tone.ink} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Txt size={15} weight="extrabold" style={{ lineHeight: 19 }}>
                        {title}
                    </Txt>
                    {details ? (
                        <Txt size={13} tone="muted" tabular style={{ marginTop: 2 }}>
                            {details}
                        </Txt>
                    ) : null}
                </View>
            </View>
            {rain && (
                <Pressable
                    onPress={rain.toggle}
                    accessibilityRole="button"
                    accessibilityLabel={rain.on ? t('delay.hideRain') : t('delay.showRain')}
                    hitSlop={6}
                    style={({ pressed }) => [{ flexShrink: 0, borderRadius: radius.pill, backgroundColor: colors.surface, paddingHorizontal: 12, paddingVertical: 8, opacity: pressed ? 0.8 : 1 }, shadow('card')]}
                >
                    <Txt size={12} weight="bold" numberOfLines={1}>
                        {rain.on ? t('delay.hideRain') : t('delay.showRain')}
                    </Txt>
                </Pressable>
            )}
        </View>
    );
};
