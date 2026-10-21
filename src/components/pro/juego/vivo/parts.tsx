import React, { useEffect } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { GameDetail, Pitch, PersonRef } from '../../../../types';
import type { GamePro, ProPitch, ProPlayer } from '../../../../lib/pro/juego';
import { pitchCallName } from '../../../../lib/baseball';
import { useColors } from '../../../../theme/theme';
import { alpha } from '../../../../theme/tokens';
import { PlayerPhoto, Txt } from '../../../ui';
import { MOTION_EASE, MOTION_MS, shortName, useMotion } from '../../kit';
import { zoneFromLocation, zonePlace } from './logic';

// Piezas compartidas del juego en vivo y la hoja de zona: puntos de bolas/strikes/outs, el diamante con los
// corredores, la foto del pelotero y los textos de cada pitcheo.

type Team = GameDetail['away'];

/** Equipo al bate y equipo en el terreno de un turno */
export const sidesOf = (game: GameDetail, top: boolean) => ({ batting: top ? game.away : game.home, fielding: top ? game.home : game.away });

/** Pelotero del juego (gameData.players + número del box) */
export const playerOf = (pro: GamePro | undefined, id: number | null | undefined): ProPlayer | null => (id && pro?.players?.[String(id)]) || null;

/** Ordinal corto de una entrada o base: «3.ª» en español, «3rd» en inglés */
export const ordinal = (n: number, lang: string) => {
    if (!lang.startsWith('en')) return `${n}.ª`;
    const tens = n % 100;
    const suffix = tens >= 11 && tens <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
    return `${n}${suffix}`;
};

/** «▲ 7.ª» / «▼ 3rd» */
export const halfInning = (n: number, top: boolean, lang: string) => `${top ? '▲' : '▼'} ${ordinal(n, lang)}`;

/** Entre entradas (Middle / End): no hay conteo ni corredores que mostrar */
export const isBetween = (game: Pick<GameDetail, 'inning'>) => game.inning?.state === 'Middle' || game.inning?.state === 'End';

// ---------------------------------------------------------------- Bolas, strikes y outs

/** Un punto que se enciende (color y escala, 200 ms) */
const Dot: React.FC<{ on: boolean; color: string; size: number }> = ({ on, color, size }) => {
    const colors = useColors();
    const motion = useMotion();
    const lit = useSharedValue(on ? 1 : 0);
    useEffect(() => {
        if (!motion.animate) {
            lit.set(on ? 1 : 0);
            return;
        }
        lit.set(withTiming(on ? 1 : 0, { duration: MOTION_MS.tab, easing: MOTION_EASE }));
        return () => cancelAnimation(lit);
    }, [on, motion.animate, lit]);
    const fill = useAnimatedStyle(() => ({ opacity: lit.get(), transform: [{ scale: 0.85 + 0.15 * lit.get() }] }));
    return (
        <View style={{ width: size, height: size }}>
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: size / 2, backgroundColor: alpha(colors.line, 0.18), transform: [{ scale: 0.85 }] }} />
            <Animated.View style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: size / 2, backgroundColor: color }, fill]} />
        </View>
    );
};

const DotsRow: React.FC<{ label: string; on: number; total: number; color: string; size: number }> = ({ label, on, total, color, size }) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Txt size={11} weight="extrabold" tone="muted" style={{ width: 12, lineHeight: 13 }}>
            {label}
        </Txt>
        {Array.from({ length: total }, (_, index) => (
            <Dot key={index} on={index < on} color={color} size={size} />
        ))}
    </View>
);

/** Puntos de bolas (3), strikes (2) y outs (2), con su texto para el lector */
export const CountDots: React.FC<{ balls: number; strikes: number; outs: number; size?: number; style?: StyleProp<ViewStyle> }> = ({ balls, strikes, outs, size = 10, style }) => {
    const { t } = useTranslation();
    const colors = useColors();
    return (
        <View accessible accessibilityRole="image" accessibilityLabel={t('pro.vivo.countAria', { balls, strikes, count: outs })} style={[{ gap: 4 }, style]}>
            <DotsRow label={t('pro.vivo.b')} on={Math.min(3, balls)} total={3} color={colors.ball} size={size} />
            <DotsRow label={t('pro.vivo.s')} on={Math.min(2, strikes)} total={2} color={colors.strike} size={size} />
            <DotsRow label={t('pro.vivo.o')} on={Math.min(2, outs)} total={2} color={colors.gold} size={size} />
        </View>
    );
};

// ---------------------------------------------------------------- Diamante con corredores

const BASES: { key: 'first' | 'second' | 'third'; x: number; y: number }[] = [
    { key: 'second', x: 50, y: 18 },
    { key: 'third', x: 18, y: 50 },
    { key: 'first', x: 82, y: 50 }
];

/** Una base del diamante: se llena con escala (300 ms) cuando llega un corredor */
const Base: React.FC<{ on: boolean; color: string; size: number; x: number; y: number }> = ({ on, color, size, x, y }) => {
    const colors = useColors();
    const motion = useMotion();
    const pop = useSharedValue(1);
    const previous = React.useRef(on);
    useEffect(() => {
        const arrived = on && !previous.current;
        previous.current = on;
        if (!arrived || !motion.animate) return;
        pop.set(withSequence(withTiming(1.25, { duration: MOTION_MS.fade }), withTiming(1, { duration: MOTION_MS.fade, easing: MOTION_EASE })));
        return () => cancelAnimation(pop);
    }, [on, motion.animate, pop]);
    const scale = useAnimatedStyle(() => ({ transform: [{ rotate: '45deg' }, { scale: pop.get() }] }));
    const side = size * 0.16;
    return (
        <Animated.View
            style={[
                {
                    position: 'absolute',
                    left: (x / 100) * size - side / 2,
                    top: (y / 100) * size - side / 2,
                    width: side,
                    height: side,
                    borderRadius: side * 0.16,
                    borderWidth: 1.8,
                    borderColor: on ? color : colors.faint,
                    backgroundColor: on ? color : colors.surface
                },
                scale
            ]}
        />
    );
};

/** Diamante grande: las bases ocupadas en el color del equipo al bate, con la inicial y el apellido (sin «Jr.») */
export const RunnerDiamond: React.FC<{ runners: GameDetail['runners']; color: string; size?: number; names?: boolean }> = ({ runners, color, size = 128, names = true }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const occupied = BASES.filter((base) => runners[base.key]);
    const aria = occupied.length ? t('pro.vivo.runnersOn', { list: occupied.map((base) => `${t(`pro.vivo.base.${base.key}`)}: ${runners[base.key]!.name}`).join(', ') }) : t('pro.vivo.basesEmpty');
    const height = size * 0.78;
    return (
        <View accessible accessibilityRole="image" accessibilityLabel={aria} style={{ width: size, height, flexShrink: 0 }}>
            <Svg width={size} height={height} viewBox="0 0 100 78" style={{ position: 'absolute', left: 0, top: 0 }}>
                <Path d="M50 70 L82 50 L50 18 L18 50 Z" fill="none" stroke={alpha(colors.line, 0.25)} strokeWidth={1.2} />
                <Path d="M46 66 L54 66 L54 70 L50 74 L46 70 Z" fill={colors.muted} />
            </Svg>
            {BASES.map((base) => (
                <Base key={base.key} on={!!runners[base.key]} color={color} size={size} x={base.x} y={base.y} />
            ))}
            {names &&
                BASES.map((base) => {
                    const runner = runners[base.key];
                    if (!runner) return null;
                    const top = (base.y / 100) * size + (base.key === 'second' ? -0.27 : 0.13) * height;
                    return (
                        <View key={`n-${base.key}`} pointerEvents="none" style={{ position: 'absolute', left: (base.x / 100) * size - 34, top, width: 68, alignItems: 'center' }}>
                            <Txt size={11} weight="extrabold" numberOfLines={1} style={{ maxWidth: 68, borderRadius: 6, backgroundColor: alpha(colors.surface, 0.9), paddingHorizontal: 4, lineHeight: 16, overflow: 'hidden' }}>
                                {shortName(runner.name, true)}
                            </Txt>
                        </View>
                    );
                })}
        </View>
    );
};

// ---------------------------------------------------------------- Foto

/** Foto del pelotero en círculo con el logo de su equipo (o sus iniciales en el color del equipo) */
export const Avatar: React.FC<{ person: PersonRef | null | undefined; team: Team; size?: number }> = ({ person, team, size = 52 }) =>
    person ? <PlayerPhoto personId={person.id} name={person.name} size={size} background={alpha(team.color, 0.2)} team={team} /> : null;

// ---------------------------------------------------------------- Textos de un pitcheo

/** «abajo y afuera», «el corazón de la zona», «fuera de la zona, arriba y adentro» */
export const placeText = (t: TFunction, pitch: Pick<Pitch, 'zone' | 'x' | 'z' | 'top' | 'bot'>, batterSide: string | null | undefined) => {
    const zone = pitch.zone ?? zoneFromLocation(pitch.x, pitch.z, pitch.top, pitch.bot);
    const place = zonePlace(zone, batterSide);
    if (!place) return null;
    if (place.heart) return t('pro.vivo.place.heart');
    const where = t(`pro.vivo.place.${place.row}_${place.col}`);
    return place.inZone ? where : t('pro.vivo.place.outside', { where });
};

/** Resultado del pitcheo en palabras cortas (la misma traducción del Lite) */
export const callText = (pitch: Pick<Pitch, 'code' | 'call'>, lang: string) => pitchCallName(pitch, lang);

/** Velocidad con un decimal: 95.3 (punto en los dos idiomas, como el resto de la app) */
export const fmtMph = (value: number | null | undefined, _lang: string, digits = 1) => (typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : null);

/** Pulgadas con signo: «16.2″», «−15.2″» */
export const fmtInches = (value: number | null | undefined, lang: string) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    return `${value < -0.05 ? '−' : ''}${fmtMph(Math.abs(value), lang)}″`;
};

/** «a 2.4 pies del suelo» */
export const heightText = (t: TFunction, z: number | null, lang: string) => (typeof z === 'number' ? t('pro.vivo.height', { feet: fmtMph(z, lang) }) : null);

/** El reto ABS de un pitcheo: quién lo pidió y cómo terminó */
export const absOf = (pro: ProPitch | null | undefined) => (pro?.rev && pro.rev.type === 'MJ' ? pro.rev : null);
