import React, { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { Modal, Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, cancelAnimation, interpolate, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react-native';
import type { GameDetail, GameTeam } from '../../../types';
import { delayOf, inningName } from '../../../lib/baseball';
import { BASE_POINTS, FIELD_H, FIELD_W, fieldModel, type FieldFace, type FieldModel } from '../../../lib/field';
import { lastName } from '../../../lib/format';
import { useMotion } from '../../../lib/motion';
import { useIsPro } from '../../../lib/pro';
import { useGamePro } from '../../../lib/pro/juego';
import { useGame } from '../../../lib/queries';
import { teamDisplayName } from '../../../lib/teams';
import { useTheme } from '../../../theme/theme';
import { alpha, inkOn, radius, shadow } from '../../../theme/tokens';
import { PlayerPhoto, Skeleton, TeamLogo, Txt } from '../../ui';
import { openPlayer } from '../../stats/common';
import { OutsDots } from '../Bases';
import { DelayPill } from '../Delay';
import { FieldDrawing } from './FieldDrawing';

// El terreno a pantalla completa (al tocar las bases de un juego en vivo): el diamante que se tocó crece hasta ser el
// terreno con un resorte (~450 ms), el fondo se oscurece y van saliendo las caras una tras otra (lanzador, receptor,
// cuadro, jardines, corredores, el bateador y el que espera). Cada cara abre la ficha del pelotero. Se cierra con la X,
// tocando el fondo o con atrás de Android: el terreno vuelve al diamante. Sin animaciones (o con reducir movimiento),
// un fundido sin escalonar.

/** Centro de la primera–tercera del diamante tocado y su ancho en la pantalla (measureInWindow) */
export interface FieldOrigin {
    x: number;
    y: number;
    span: number;
}

const OPEN_SPRING = { duration: 300, dampingRatio: 0.8 } as const;
const CLOSE_MS = 320;
const FADE_MS = 150;
const FACES_START = 200;
const FACE_STEP = 50;
const ASPECT = FIELD_H / FIELD_W;
// Dónde va el centro de la primera–tercera en el dibujo (para que empate con el diamante tocado)
const ANCHOR_Y = BASE_POINTS.first.y / FIELD_H;
const ANCHOR_SPAN = (BASE_POINTS.first.x - BASE_POINTS.third.x) / FIELD_W;

type Rect = { x: number; y: number; width: number; height: number };

const teamById = (game: GameDetail, id: number | null) => (id === game.home.id ? game.home : id === game.away.id ? game.away : null);

/** «Leones» (el nombre corto del equipo); las selecciones, con el nombre del país en el idioma */
const shortTeam = (team: GameTeam, lang: string) => (team.flag ? teamDisplayName(team, lang) : team.teamName || team.name);

const RUNNER_N = { first: 1, second: 2, third: 3 } as Record<string, number>;
/** Lo que oye el lector de pantalla en cada cara: «Pitcher: Nombre Apellido», «Corredor en primera: …» */
const faceLabel = (face: FieldFace, t: (key: string) => string) => {
    const spot = face.role === 'runner' ? `runner${RUNNER_N[face.spot]}` : face.spot;
    return `${t(`field.pos.${spot}`)}: ${face.person.name}`;
};

const FaceView: React.FC<{ face: FieldFace; team: GameTeam | null; size: number; unitX: number; unitY: number; delay: number; animate: boolean; onPress: (face: FieldFace) => void }> = ({ face, team, size, unitX, unitY, delay, animate, onPress }) => {
    const { t } = useTranslation();
    const { colors } = useTheme();
    const shown = useSharedValue(animate ? 0 : 1);
    const pop = useSharedValue(animate ? 0.6 : 1);
    useEffect(() => {
        if (!animate) return;
        shown.set(withDelay(delay, withTiming(1, { duration: 180, easing: Easing.out(Easing.quad) })));
        // Un poco más allá de su tamaño y vuelve (resorte con rebote)
        pop.set(withDelay(delay, withSpring(1, { duration: 260, dampingRatio: 0.5 })));
        return () => {
            cancelAnimation(shown);
            cancelAnimation(pop);
        };
        // Solo al aparecer: si la cara cambia de persona es otra cara (otra key)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const style = useAnimatedStyle(() => ({ opacity: shown.get(), transform: [{ scale: pop.get() }] }));
    const ring = team?.color ?? colors.muted;
    const ink = inkOn(ring);
    const tag = face.tag === 'batter' ? t('field.atBat') : face.tag === 'onDeck' ? t('field.onDeck') : face.tag;
    const box = size + 44;
    const border = Math.max(2, Math.round(size * 0.07));
    return (
        <Animated.View style={[{ position: 'absolute', left: face.x * unitX - box / 2, top: face.y * unitY - size / 2, width: box, alignItems: 'center' }, style]}>
            <Pressable
                onPress={() => onPress(face)}
                accessibilityRole="link"
                accessibilityLabel={faceLabel(face, t)}
                hitSlop={4}
                style={({ pressed }) => ({ alignItems: 'center', opacity: pressed ? 0.75 : 1, transform: [{ scale: pressed ? 0.94 : 1 }] })}
            >
                <View style={[{ width: size, height: size, borderRadius: size / 2, borderWidth: border, borderColor: ring, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }, shadow('float')]}>
                    <PlayerPhoto personId={face.person.id || null} name={face.person.name} size={size - border * 2} team={team} background={alpha(ring, 0.18)} />
                </View>
                {/* Etiqueta de la posición montada sobre el borde de la foto */}
                <View style={{ marginTop: -7, borderRadius: radius.pill, backgroundColor: ring, paddingHorizontal: 5, minWidth: 18, alignItems: 'center', borderWidth: 1, borderColor: alpha('#ffffff', 0.7) }}>
                    <Txt size={9} weight="extrabold" color={ink} numberOfLines={1} style={{ lineHeight: 12, letterSpacing: 0.3 }}>
                        {tag}
                    </Txt>
                </View>
                <View style={{ marginTop: 2, maxWidth: box, borderRadius: 6, backgroundColor: alpha(colors.surface, 0.92), paddingHorizontal: 5 }}>
                    <Txt size={size < 34 ? 10 : 11} weight="extrabold" numberOfLines={1} style={{ lineHeight: 15 }}>
                        {lastName(face.person.name)}
                    </Txt>
                </View>
            </Pressable>
        </Animated.View>
    );
};

/** Mientras carga el juego (desde la tarjeta o el modal de en vivo): el terreno con huecos donde irán las caras */
const SkeletonFaces: React.FC<{ size: number; unitX: number; unitY: number }> = ({ size, unitX, unitY }) => {
    const spots: [number, number][] = [
        [50, 70.5],
        [50, 101],
        [80, 61],
        [64, 47],
        [36, 47],
        [20, 61],
        [20, 30],
        [50, 16],
        [80, 30]
    ];
    return (
        <>
            {spots.map(([x, y]) => (
                <View key={`${x}-${y}`} style={{ position: 'absolute', left: x * unitX - size / 2, top: y * unitY - size / 2 }}>
                    <Skeleton height={size} width={size} round={size / 2} />
                </View>
            ))}
        </>
    );
};

const Header: React.FC<{ game: GameDetail; model: FieldModel }> = ({ game, model }) => {
    const { t, i18n } = useTranslation();
    const { colors } = useTheme();
    const lang = i18n.language;
    const between = model.between;
    const delay = delayOf(game.detailedState);
    const defense = teamById(game, model.defenseTeamId);
    const offense = teamById(game, model.offenseTeamId);
    const side = (team: GameTeam, end: boolean) => (
        <View style={{ flex: 1, minWidth: 0, flexDirection: end ? 'row-reverse' : 'row', alignItems: 'center', gap: 8 }}>
            <TeamLogo team={team} size={30} />
            <View style={{ alignItems: end ? 'flex-end' : 'flex-start', minWidth: 0 }}>
                <Txt size={12} weight="extrabold" tone="muted" numberOfLines={1}>
                    {team.abbrev}
                </Txt>
                <Txt size={26} weight="extrabold" tabular style={{ lineHeight: 28 }}>
                    {team.runs}
                </Txt>
            </View>
        </View>
    );
    const chip = (team: GameTeam | null, key: 'defense' | 'offense') =>
        team ? (
            <View key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.pill, backgroundColor: alpha(team.color, 0.14), paddingHorizontal: 10, paddingVertical: 4, flexShrink: 1 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: team.color }} />
                <Txt size={12} weight="bold" numberOfLines={1} style={{ flexShrink: 1 }}>
                    {t(`field.${key}`, { team: shortTeam(team, lang) })}
                </Txt>
            </View>
        ) : null;
    return (
        <View style={[{ borderRadius: radius.card, backgroundColor: colors.surface, paddingHorizontal: 16, paddingVertical: 12, gap: 10 }, shadow('float')]}>
            <Txt
                eyebrow
                center
                accessibilityRole="header"
                accessibilityLabel={t('field.titleAria', { away: teamDisplayName(game.away, lang), awayRuns: game.away.runs, home: teamDisplayName(game.home, lang), homeRuns: game.home.runs })}
            >
                {t('field.title')}
            </Txt>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {side(game.away, false)}
                <View style={{ alignItems: 'center', gap: 4, paddingHorizontal: 4 }}>
                    {delay ? (
                        <DelayPill delay={delay} />
                    ) : (
                        <Txt size={14} weight="extrabold" color={colors.live} numberOfLines={1}>
                            {game.inning ? inningName(game.inning, lang) : ''}
                        </Txt>
                    )}
                    {!between && game.inning ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }} accessible accessibilityLabel={t('game.countAria', { balls: game.count.balls, strikes: game.count.strikes, outs: game.count.outs })}>
                            <Txt size={16} weight="extrabold" tabular>
                                {`${game.count.balls}-${game.count.strikes}`}
                            </Txt>
                            <OutsDots outs={game.count.outs} size={7} />
                        </View>
                    ) : delay && game.inning ? (
                        <Txt size={12} weight="semibold" tone="muted">
                            {inningName(game.inning, lang)}
                        </Txt>
                    ) : null}
                </View>
                {side(game.home, true)}
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, flexWrap: 'wrap' }}>
                {chip(defense, 'defense')}
                {chip(offense, 'offense')}
            </View>
        </View>
    );
};

const HeaderSkeleton: React.FC = () => {
    const { colors } = useTheme();
    return (
        <View style={[{ borderRadius: radius.card, backgroundColor: colors.surface, padding: 16, gap: 10 }, shadow('float')]}>
            <Skeleton height={12} width={90} round={6} style={{ alignSelf: 'center' }} />
            <Skeleton height={40} round={12} />
            <Skeleton height={20} width={200} round={10} style={{ alignSelf: 'center' }} />
        </View>
    );
};

interface FieldViewProps {
    gamePk: number;
    origin: FieldOrigin | null;
    /** Ya se cerró (terminó la animación de salida): quien lo abrió lo desmonta */
    onClosed: () => void;
}

export const FieldView: React.FC<FieldViewProps> = ({ gamePk, origin, onClosed }) => {
    const { t, i18n } = useTranslation();
    const { colors, isDark } = useTheme();
    const insets = useSafeAreaInsets();
    const motion = useMotion();
    const animate = motion.animate;
    const { width: winW, height: winH } = useWindowDimensions();
    const query = useGame(String(gamePk));
    const game = query.data;
    // Sin `field` en el juego (servidor viejo), el PRO lo saca de sus extras
    const pro = useIsPro();
    const proData = useGamePro(gamePk, pro && !!game && game.field === undefined).data;
    const model = useMemo(() => (game ? fieldModel(game, proData) : null), [game, proData]);

    // Alto que queda para el terreno: la X, la tarjeta de arriba (~132) y la nota de abajo (~40)
    const available = winH - insets.top - insets.bottom - 56 - 132 - 40 - 24;
    const fieldW = Math.round(Math.max(240, Math.min(winW - 32, 460, available / ASPECT)));
    const fieldH = Math.round(fieldW * ASPECT);
    const unitX = fieldW / FIELD_W;
    const unitY = fieldH / FIELD_H;
    const faceSize = Math.round(Math.min(44, Math.max(30, fieldW * 0.105)));
    const sizeOf = (face: FieldFace) => (face.size === 'md' ? faceSize : face.size === 'sm' ? Math.round(faceSize * 0.86) : Math.round(faceSize * 0.72));

    // progress: 0 = el diamante tocado, 1 = el terreno; fade: fundido sin movimiento (o de salida al abrir una ficha)
    const progress = useSharedValue(0);
    const fade = useSharedValue(0);
    const facesFade = useSharedValue(1);
    const target = useSharedValue<Rect | null>(null);
    const start = useSharedValue<FieldOrigin | null>(origin);
    const frame = useRef<ComponentRef<typeof View>>(null);
    const [measured, setMeasured] = useState(false);
    const closing = useRef(false);
    const openedAt = useRef(Date.now());

    // Al acomodarse: dónde queda el terreno en la pantalla (la caja sin transformar) y arranca la entrada
    const onLayout = useCallback(() => {
        if (measured) return;
        const node = frame.current;
        const begin = (rect: Rect | null) => {
            target.set(rect);
            setMeasured(true);
            openedAt.current = Date.now();
            if (animate) {
                fade.set(1);
                progress.set(withSpring(1, OPEN_SPRING));
            } else {
                progress.set(1);
                fade.set(withTiming(1, { duration: FADE_MS }));
            }
        };
        if (!node?.measureInWindow) begin(null);
        else node.measureInWindow((x, y, width, height) => begin(width > 0 ? { x, y, width, height } : null));
    }, [measured, animate, fade, progress, target]);

    useEffect(
        () => () => {
            cancelAnimation(progress);
            cancelAnimation(fade);
            cancelAnimation(facesFade);
        },
        [progress, fade, facesFade]
    );

    /** Cierra: de vuelta al diamante (o un fundido) y luego `after` (abrir la ficha) */
    const close = useCallback(
        (after?: () => void, quick = false) => {
            if (closing.current) return;
            closing.current = true;
            const done = () => {
                onClosed();
                // iOS: el Modal tiene que terminar de irse antes de presentar la ficha (otro modal)
                if (after) setTimeout(after, Platform.OS === 'ios' ? 350 : 0);
            };
            if (animate && !quick) {
                facesFade.set(withTiming(0, { duration: 120 }));
                progress.set(withTiming(0, { duration: CLOSE_MS, easing: Easing.inOut(Easing.cubic) }));
                setTimeout(done, CLOSE_MS + 20);
            } else {
                fade.set(withTiming(0, { duration: FADE_MS }));
                setTimeout(done, FADE_MS + 20);
            }
        },
        [animate, onClosed, facesFade, progress, fade]
    );

    const openFace = useCallback(
        (face: FieldFace) => {
            const team = game ? teamById(game, face.teamId) : null;
            close(() => openPlayer({ id: face.person.id, name: face.person.name, teamId: team?.id ?? null }), true);
        },
        [close, game]
    );

    const backdrop = useAnimatedStyle(() => ({ opacity: fade.get() * Math.min(1, Math.max(0, progress.get())) }));
    const chrome = useAnimatedStyle(() => {
        const shown = fade.get() * interpolate(progress.get(), [0.45, 1], [0, 1], 'clamp');
        return { opacity: shown, transform: [{ translateY: (1 - Math.min(1, progress.get())) * -16 }] };
    });
    const below = useAnimatedStyle(() => ({ opacity: fade.get() * interpolate(progress.get(), [0.6, 1], [0, 1], 'clamp') }));
    // El terreno: del diamante tocado (escala y lugar) a su tamaño; con el resorte se pasa un poquito y vuelve
    const grow = useAnimatedStyle(() => {
        const rect = target.get();
        const from = start.get();
        const p = progress.get();
        const opacity = fade.get() * interpolate(p, [0, 0.18], [0, 1], 'clamp');
        if (!rect) return { opacity, transform: [{ scale: 0.92 + 0.08 * p }] };
        if (!from) return { opacity, transform: [{ translateY: (1 - p) * 24 }, { scale: 0.85 + 0.15 * p }] };
        const s0 = Math.max(0.02, from.span / (rect.width * ANCHOR_SPAN));
        const scale = s0 + (1 - s0) * p;
        const cx = rect.x + rect.width / 2;
        const cy = rect.y + rect.height / 2;
        const dy = (ANCHOR_Y - 0.5) * rect.height;
        const tx = (from.x - cx) * (1 - p);
        const ty = (from.y - cy - s0 * dy) * (1 - p);
        return { opacity, transform: [{ translateX: tx }, { translateY: ty }, { scale }] };
    });
    const facesStyle = useAnimatedStyle(() => ({ opacity: facesFade.get() }));

    const defense = model && game ? teamById(game, model.defenseTeamId) : null;
    let note: string | null = null;
    if (game && model) {
        if (!model.hasDefense) note = t('field.empty');
        else if (model.between && defense) note = t('field.between', { team: shortTeam(defense, i18n.language) });
    } else if (!game) note = t('field.loading');

    return (
        <Modal transparent visible animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={() => close()} supportedOrientations={['portrait']}>
            <View style={{ flex: 1 }}>
                <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? 'rgba(2,4,8,0.84)' : 'rgba(8,12,22,0.72)' }, backdrop]}>
                    {/* Tocar el fondo cierra (el lector de pantalla usa la X) */}
                    <Pressable style={StyleSheet.absoluteFill} onPress={() => close()} accessible={false} importantForAccessibility="no" />
                </Animated.View>
                <View pointerEvents="box-none" style={{ flex: 1, paddingTop: insets.top + 56, paddingBottom: insets.bottom + 12, alignItems: 'center', justifyContent: 'center' }}>
                    <View pointerEvents="box-none" style={{ width: fieldW, gap: 12 }}>
                        <Animated.View style={chrome}>{game && model ? <Header game={game} model={model} /> : <HeaderSkeleton />}</Animated.View>
                        {/* Caja sin transformar para medir; adentro el terreno que crece */}
                        <View ref={frame} collapsable={false} onLayout={onLayout} style={{ width: fieldW, height: fieldH }}>
                            <Animated.View style={[{ width: fieldW, height: fieldH, borderRadius: 18, overflow: 'visible' }, grow]}>
                                <View style={[{ borderRadius: 18, overflow: 'hidden' }, shadow('float')]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
                                    <FieldDrawing width={fieldW} height={fieldH} dark={isDark} />
                                </View>
                                <Animated.View pointerEvents="box-none" style={[StyleSheet.absoluteFill, facesStyle]}>
                                    {!game ? (
                                        <View style={{ opacity: 0.55 }}>
                                            <SkeletonFaces size={faceSize} unitX={unitX} unitY={unitY} />
                                        </View>
                                    ) : (
                                        measured &&
                                        model?.faces.map((face) => {
                                            // Al abrir salen escalonadas; las que llegan después (otro bateador) salen de una vez
                                            const late = Date.now() - openedAt.current > 1200;
                                            return (
                                                <FaceView
                                                    key={`${face.key}-${face.person.id}`}
                                                    face={face}
                                                    team={teamById(game, face.teamId)}
                                                    size={sizeOf(face)}
                                                    unitX={unitX}
                                                    unitY={unitY}
                                                    delay={late ? 0 : FACES_START + face.order * FACE_STEP}
                                                    animate={animate}
                                                    onPress={openFace}
                                                />
                                            );
                                        })
                                    )}
                                </Animated.View>
                            </Animated.View>
                        </View>
                        {note ? (
                            <Animated.View style={below}>
                                <Txt size={13} weight="semibold" color="rgba(255,255,255,0.86)" center accessibilityLiveRegion="polite">
                                    {note}
                                </Txt>
                            </Animated.View>
                        ) : null}
                    </View>
                </View>
                <Animated.View style={[{ position: 'absolute', right: 16, top: insets.top + 8 }, chrome]}>
                    <Pressable
                        onPress={() => close()}
                        accessibilityRole="button"
                        accessibilityLabel={t('field.close')}
                        hitSlop={8}
                        style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, backgroundColor: alpha(colors.surface, 0.95), alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}
                    >
                        <X size={20} color={colors.ink} />
                    </Pressable>
                </Animated.View>
            </View>
        </Modal>
    );
};

