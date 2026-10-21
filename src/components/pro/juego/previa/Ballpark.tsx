import React from 'react';
import { View } from 'react-native';
import Svg, { G, Path, Text as SvgText } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { Cloud, Thermometer, Users, Wind } from 'lucide-react-native';
import type { GameDetail } from '../../../../types';
import type { GamePro } from '../../../../lib/pro/juego';
import type { PreviaVenue } from '../../../../lib/pro/pantallas';
import { localeFor } from '../../../../lib/format';
import { useColors } from '../../../../theme/theme';
import { alpha, fonts, radius } from '../../../../theme/tokens';
import { Txt } from '../../../ui';
import { DrawPath, ProNote, ProSection, middle, toCelsius, useInView } from '../../kit';
import { skyKey, toKmh, windKind } from './logica';

// Estadio: diagrama del parque con las medidas de MLB (solo algunos parques de LIDOM las tienen), ciudad y de quién
// es casa; el clima en °C con el viento y su flecha cuando MLB lo publica (al empezar el juego).

const Field: React.FC<{ field: PreviaVenue['field']; windDeg: number | null; label: string }> = ({ field, windDeg, label }) => {
    const colors = useColors();
    const { setNode, onLayout, seen } = useInView();
    // Flecha del viento: 0° = de home hacia el center, 90° = hacia el lado del right
    const angle = windDeg === null ? 0 : (windDeg * Math.PI) / 180;
    const dir = [Math.sin(angle), -Math.cos(angle)];
    const tip = windDeg === null ? null : [100 + dir[0] * 46, 104 + dir[1] * 46];
    const tail = windDeg === null ? null : [100 - dir[0] * 30, 104 - dir[1] * 30];
    const head = tip ? `M${tip[0] - dir[0] * 9 + dir[1] * 6} ${tip[1] - dir[1] * 9 - dir[0] * 6} L${tip[0]} ${tip[1]} L${tip[0] - dir[0] * 9 - dir[1] * 6} ${tip[1] - dir[1] * 9 + dir[0] * 6}` : '';
    const text = (x: number, y: number, value: number | null | undefined) =>
        value ? (
            <SvgText x={x} y={y} dy={middle(15)} textAnchor="middle" fontFamily={fonts.condensed} fontSize={15} fill={colors.ink}>
                {String(value)}
            </SvgText>
        ) : null;
    return (
        <View ref={setNode} onLayout={onLayout} accessible accessibilityRole="image" accessibilityLabel={label} style={{ width: 160, height: 141 }}>
            <Svg width={160} height={141} viewBox="0 0 200 176">
                {/* Jardines (abanico) y cuadro */}
                <Path d="M100 166 L22 88 Q100 2 178 88 Z" fill={alpha(colors.ball, 0.16)} stroke={alpha(colors.line, 0.3)} strokeWidth={1.5} />
                <Path d="M100 166 L64 130 Q100 92 136 130 Z" fill={alpha(colors.hbp, 0.2)} />
                <Path d="M100 166 L130 136 L100 106 L70 136 Z" fill="none" stroke={alpha(colors.ink, 0.6)} strokeWidth={1.5} />
                <Path d="M100 161.8 L104.2 166 L100 170.2 L95.8 166 Z" fill={colors.ink} />
                {text(26, 72, field?.leftLine)}
                {text(56, 30, field?.leftCenter)}
                {text(100, 14, field?.center)}
                {text(144, 30, field?.rightCenter)}
                {text(174, 72, field?.rightLine)}
                {tip && tail ? (
                    <G>
                        <DrawPath d={`M${tail[0]} ${tail[1]} L${tip[0]} ${tip[1]}`} length={76} seen={seen} stroke={colors.inplay} strokeWidth={3} strokeLinecap="round" fill="none" />
                        <Path d={head} stroke={colors.inplay} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" fill="none" />
                    </G>
                ) : null}
            </Svg>
        </View>
    );
};

const Tile: React.FC<{ icon: React.ReactNode; value: string; label: string; aside?: React.ReactNode }> = ({ icon, value, label, aside }) => {
    const colors = useColors();
    return (
        <View accessible accessibilityLabel={`${label}: ${value}`} style={{ flex: 1, flexBasis: 0, minWidth: 0, gap: 4, borderRadius: radius.tile, backgroundColor: colors.raised, paddingHorizontal: 8, paddingVertical: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                {icon}
                {aside}
            </View>
            <Txt condensed size={19} tabular numberOfLines={2} style={{ lineHeight: 21 }}>
                {value}
            </Txt>
            <Txt size={10} weight="extrabold" tone="muted" numberOfLines={1} style={{ textTransform: 'uppercase', letterSpacing: 0.4 }}>
                {label}
            </Txt>
        </View>
    );
};

interface BallparkProps {
    game: GameDetail;
    pro?: GamePro;
    venue: PreviaVenue | null;
    /** Nombres de los equipos que juegan ahí de local */
    homeOf: string[];
}

export const Ballpark: React.FC<BallparkProps> = ({ game, pro, venue, homeOf }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const field = venue?.field ?? pro?.game.venue.field ?? null;
    const name = venue?.name ?? pro?.game.venue.name ?? game.venue;
    const weather = pro?.game.weather ?? null;
    const celsius = weather?.tempC ?? toCelsius(game.weather?.temp);
    const condition = weather?.condition ?? game.weather?.condition ?? null;
    const sky = skyKey(condition);
    const wind = weather?.wind ?? null;
    const kind = windKind(wind?.text);
    const kmh = toKmh(wind?.mph);
    const hasMeasures = !!(field?.leftLine || field?.center || field?.rightLine);
    const windText = kind.kind ? t(`pro.previa.park.wind.${kind.kind}`, { field: kind.field ? t(`pro.previa.park.field.${kind.field}`) : '' }) : (wind?.text ?? null);
    const measures = [field?.leftLine, field?.center, field?.rightLine].filter(Boolean).join(', ');
    const aria = [
        hasMeasures ? t('pro.previa.park.aria', { left: field?.leftLine ?? '—', center: field?.center ?? '—', right: field?.rightLine ?? '—' }) : t('pro.previa.park.ariaNone'),
        windText ? t('pro.previa.park.ariaWind', { wind: windText }) : ''
    ]
        .filter(Boolean)
        .join(' ');
    const teams = homeOf.length > 1 ? `${homeOf.slice(0, -1).join(', ')} ${t('pro.previa.park.and')} ${homeOf[homeOf.length - 1]}` : homeOf[0];
    const place = [venue?.city, homeOf.length ? t('pro.previa.park.homeOf', { teams }) : null].filter(Boolean).join(' · ');
    const muted = colors.muted;

    return (
        <ProSection title={t('pro.previa.park.title')} headerOutside>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                <Field field={field} windDeg={wind?.deg ?? null} label={aria} />
                <View style={{ flexGrow: 1, flexBasis: 150, minWidth: 0, gap: 6 }}>
                    <Txt size={18} weight="black" accessibilityRole="header" style={{ lineHeight: 21, letterSpacing: -0.5 }}>
                        {name}
                    </Txt>
                    {place ? (
                        <Txt size={12} tone="muted" style={{ lineHeight: 16 }}>
                            {place}
                        </Txt>
                    ) : null}
                    {/* «MLB no tiene las medidas» solo si se sabe (con los datos PRO del parque); si no, no se dice nada */}
                    {hasMeasures || venue || pro ? (
                        <Txt size={12} tone="muted" style={{ lineHeight: 16 }}>
                            {hasMeasures ? t('pro.previa.park.measures', { list: measures }) : t('pro.previa.park.noMeasures')}
                        </Txt>
                    ) : null}
                </View>
            </View>

            {weather || game.weather ? (
                <>
                    <View style={{ marginTop: 14, flexDirection: 'row', gap: 8 }}>
                        <Tile icon={<Thermometer size={16} color={muted} />} value={celsius !== null && celsius !== undefined ? `${celsius} °C` : '—'} label={t('pro.previa.park.temp')} />
                        <Tile icon={<Cloud size={16} color={muted} />} value={sky ? t(`pro.previa.park.sky.${sky}`) : (condition ?? '—')} label={t('pro.previa.park.skyLabel')} />
                        {wind ? (
                            <Tile
                                icon={<Wind size={16} color={muted} />}
                                aside={
                                    wind?.deg !== null && wind?.deg !== undefined ? (
                                        <Txt size={14} weight="bold" color={colors.inplay} style={{ transform: [{ rotate: `${wind.deg}deg` }] }} importantForAccessibility="no" accessibilityElementsHidden>
                                            ↑
                                        </Txt>
                                    ) : undefined
                                }
                                value={kmh !== null ? `${kmh} km/h` : '—'}
                                label={t('pro.previa.park.windLabel')}
                            />
                        ) : null}
                    </View>
                    {windText ? (
                        <Txt size={12} tone="muted" style={{ marginTop: 12, lineHeight: 16 }}>
                            {t('pro.previa.park.windNote', { wind: windText })}
                        </Txt>
                    ) : null}
                </>
            ) : (
                <>
                    {field?.capacity ? (
                        <View style={{ marginTop: 14, flexDirection: 'row', gap: 8 }}>
                            <Tile icon={<Users size={16} color={muted} />} value={field.capacity.toLocaleString(localeFor(i18n.language))} label={t('pro.previa.park.capacity')} />
                            {field.turf ? (
                                <Tile
                                    icon={<View style={{ width: 16, height: 16, borderRadius: 3, backgroundColor: alpha(colors.ball, 0.5) }} />}
                                    value={t(`pro.previa.park.turf.${field.turf === 'Grass' ? 'grass' : 'artificial'}`)}
                                    label={t('pro.previa.park.turfLabel')}
                                />
                            ) : null}
                        </View>
                    ) : null}
                    <ProNote tone="pending" style={{ marginTop: 12 }}>
                        {t('pro.previa.park.weatherLater')}
                    </ProNote>
                </>
            )}
        </ProSection>
    );
};
