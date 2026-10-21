import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, Dimensions, Pressable, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { GestureDetector, useExclusiveGestures, usePanGesture, useTapGesture } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Hand, Pause, Play } from 'lucide-react-native';
import type { GameDetail } from '../../../../types';
import type { GamePro, WinProb } from '../../../../lib/pro/juego';
import { useColors } from '../../../../theme/theme';
import { radius, shadow } from '../../../../theme/tokens';
import { TeamLogo, Txt } from '../../../ui';
import { MOTION_EASE, ModuleHeader, contrastRatio, mix, teamInk, useMotion, withAlpha, type ViewNode } from '../../kit';
import { buildSlides, type StoryTheme } from './StorySlides';

// Historia PRO del juego: diapositivas que avanzan solas cada 5 s (la barra de progreso va por tiempo, no por
// cuadros), con deslizar y toques en los lados (react-native-gesture-handler) y los botones de abajo (anterior,
// pausa, siguiente), que hacen lo mismo para el teclado y el lector de pantalla. Se pausa sola si no está en
// pantalla; con «Reducir movimiento» o las animaciones apagadas empieza en pausa y cambia sin deslizarse.

const SLIDE_MS = 5000;
const SWAP_MS = 350;
const GOLD = '#f2b84b';

/** El color del ganador, oscurecido (o aclarado) lo justo para que el texto pase 4.5:1 encima */
const readableBase = (color: string, ink: string) => {
    const toward = ink === '#ffffff' ? '#000000' : '#ffffff';
    let base = color;
    for (let step = 1; step <= 12 && contrastRatio(base, ink) < 4.5; step++) base = mix(color, toward, step * 0.05);
    return base;
};

/** Barra de progreso de una diapositiva: llena (ya vista), avanzando (la actual) o vacía */
const Bar: React.FC<{ state: 'done' | 'current' | 'todo'; progress: SharedValue<number>; ink: string }> = ({ state, progress, ink }) => {
    const fill = useAnimatedStyle(() => ({ width: `${(state === 'done' ? 1 : state === 'current' ? progress.get() : 0) * 100}%` }));
    return (
        <View style={{ flex: 1, height: 4, borderRadius: 2, overflow: 'hidden', backgroundColor: withAlpha(ink, 0.32) }}>
            <Animated.View style={[{ position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 2, backgroundColor: ink }, fill]} />
        </View>
    );
};

/** Una diapositiva: aparece y se desliza 24 px desde su lado (350 ms); sin movimiento cambia de golpe */
const Frame: React.FC<{ active: boolean; offset: number; animate: boolean; onHeight: (height: number) => void; label: string; children: React.ReactNode }> = ({ active, offset, animate, onHeight, label, children }) => {
    const shown = useSharedValue(active ? 1 : 0);
    const shift = useSharedValue(offset);
    useEffect(() => {
        const timing = { duration: animate ? SWAP_MS : 0, easing: MOTION_EASE };
        shown.set(withTiming(active ? 1 : 0, timing));
        shift.set(withTiming(offset, timing));
        return () => {
            cancelAnimation(shown);
            cancelAnimation(shift);
        };
    }, [active, offset, animate, shown, shift]);
    const style = useAnimatedStyle(() => ({ opacity: shown.get(), transform: [{ translateX: animate ? shift.get() : 0 }] }));
    return (
        <Animated.View
            onLayout={(event: LayoutChangeEvent) => onHeight(Math.ceil(event.nativeEvent.layout.height))}
            pointerEvents={active ? 'auto' : 'none'}
            accessibilityLabel={label}
            importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}
            accessibilityElementsHidden={!active}
            style={[{ gap: 10 }, active ? null : { position: 'absolute', top: 0, left: 0, right: 0 }, style]}
        >
            {children}
        </Animated.View>
    );
};

const RoundButton: React.FC<{ label: string; onPress: () => void; disabled?: boolean; strong?: boolean; children: (color: string) => React.ReactNode }> = ({ label, onPress, disabled, strong, children }) => {
    const colors = useColors();
    return (
        <Pressable
            onPress={onPress}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ disabled: !!disabled }}
            style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: strong ? colors.ink : colors.raised, opacity: disabled ? 0.4 : pressed ? 0.8 : 1 })}
        >
            {children(strong ? colors.bg : colors.ink)}
        </Pressable>
    );
};

export const ProStory: React.FC<{ game: GameDetail; pro?: GamePro; winProb?: WinProb }> = ({ game, pro, winProb }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const motion = useMotion();
    const window = useWindowDimensions();
    const winner = game.home.isWinner ? game.home : game.away;
    const ink = teamInk(winner.color);
    const base = readableBase(winner.color, ink);
    const end = ink === '#ffffff' ? mix(base, '#000000', 0.38) : mix(base, '#ffffff', 0.25);
    const accent = contrastRatio(GOLD, base) >= 3 && contrastRatio(GOLD, end) >= 3 ? GOLD : ink;
    const title = Math.round(Math.min(30, Math.max(24, window.width * 0.075)));
    const theme: StoryTheme = { bg: base, ink, soft: ink === '#ffffff' ? 'rgba(8, 20, 60, 0.32)' : 'rgba(20, 21, 26, 0.1)', accent, title, big: Math.round(Math.min(64, Math.max(48, window.width * 0.15))) };
    const slides = buildSlides(game, pro, winProb, theme, t, i18n.language);
    const count = slides.length;

    const [index, setIndex] = useState(0);
    // null = lo que diga el movimiento (sin animaciones empieza en pausa); true/false = lo que eligió la persona
    const [playing, setPlaying] = useState<boolean | null>(null);
    const [onScreen, setOnScreen] = useState(false);
    const [node, setNode] = useState<ViewNode | null>(null);
    const [heights, setHeights] = useState<Record<string, number>>({});
    const [width, setWidth] = useState(0);
    const progress = useSharedValue(0);
    const current = Math.min(index, Math.max(0, count - 1));
    const paused = playing === null ? !motion.animate : !playing;
    const running = !paused && onScreen && count > 1;

    // ¿Se ve? (mientras corre o puede correr): se mira cada medio segundo; fuera de la pantalla se detiene el reloj
    useEffect(() => {
        if (!node || paused || count < 2) return;
        const look = () =>
            node.measureInWindow((x, y, w, h) => {
                const screen = Dimensions.get('window');
                setOnScreen(w > 0 && y < screen.height * 0.85 && y + h > screen.height * 0.15);
            });
        look();
        const id = setInterval(look, 500);
        return () => clearInterval(id);
    }, [node, paused, count]);

    // Reloj de la diapositiva: la barra se llena con el tiempo real y al terminar pasa a la siguiente
    useEffect(() => {
        if (!running) {
            cancelAnimation(progress);
            return;
        }
        const remaining = Math.max(0, (1 - progress.get()) * SLIDE_MS);
        progress.set(withTiming(1, { duration: remaining, easing: Easing.linear }));
        const timer = setTimeout(() => {
            if (current < count - 1) {
                progress.set(0);
                setIndex(current + 1);
            } else setPlaying(false);
        }, remaining);
        return () => {
            clearTimeout(timer);
            cancelAnimation(progress);
        };
    }, [running, current, count, progress]);

    const go = (step: number) => {
        const next = Math.max(0, Math.min(count - 1, current + step));
        if (next === current) return;
        progress.set(0);
        setIndex(next);
        AccessibilityInfo.announceForAccessibility(t('pro.final.story.slideLabel', { n: next + 1, total: count, name: slides[next].pill }));
    };
    const toggle = () => {
        // Al final, «reproducir» vuelve a empezar
        if (paused && current === count - 1 && progress.get() >= 1) {
            progress.set(0);
            setIndex(0);
        }
        setPlaying(paused);
    };

    // Deslizar a los lados cambia de diapositiva; tocar el 35 % izquierdo vuelve y el resto avanza
    const pan = usePanGesture({
        runOnJS: true,
        activeOffsetX: [-20, 20],
        failOffsetY: [-14, 14],
        onDeactivate: (event) => {
            if (event.canceled || Math.abs(event.translationX) < 40) return;
            go(event.translationX < 0 ? 1 : -1);
        }
    });
    const tap = useTapGesture({
        runOnJS: true,
        onActivate: (event) => go(width > 0 && event.x < width * 0.35 ? -1 : 1)
    });
    const gestures = useExclusiveGestures(pan, tap);

    if (!count) return null;

    const label = `${game.away.abbrev} ${game.away.runs} · ${game.home.abbrev} ${game.home.runs} · ${t('pro.final.story.final')}`;
    const tallest = Math.max(0, ...slides.map((slide) => heights[slide.id] ?? 0));

    return (
        <View accessibilityLabel={t('pro.final.story.title')} style={{ gap: 10 }}>
            <ModuleHeader title={t('pro.final.story.title')} aside={t('pro.final.story.slides', { count })} />
            <View ref={setNode} style={[{ borderRadius: radius.card }, shadow('float')]}>
                <LinearGradient colors={[base, mix(base, end, 0.6), end]} locations={[0, 0.55, 1]} start={{ x: 0.3, y: 0 }} end={{ x: 0.7, y: 1 }} style={{ borderRadius: radius.card, overflow: 'hidden' }}>
                    <View style={{ flexDirection: 'row', gap: 4, paddingHorizontal: 16, paddingTop: 14 }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
                        {slides.map((slide, position) => (
                            <Bar key={slide.id} state={position < current ? 'done' : position === current ? 'current' : 'todo'} progress={progress} ink={ink} />
                        ))}
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 20, paddingTop: 12 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1, minWidth: 0 }}>
                            <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
                                <TeamLogo team={winner} size={16} />
                            </View>
                            <Txt size={12} weight="bold" color={ink} numberOfLines={1} style={{ flexShrink: 1 }}>
                                {label}
                            </Txt>
                        </View>
                        <Txt condensed size={14} tabular color={ink} accessibilityLabel={t('pro.final.story.slideLabel', { n: current + 1, total: count, name: slides[current].pill })}>{`${current + 1} / ${count}`}</Txt>
                    </View>
                    <GestureDetector gesture={gestures}>
                        <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)} style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20 }}>
                            <View style={{ minHeight: tallest || undefined }}>
                                {slides.map((slide, position) => (
                                    <Frame
                                        key={slide.id}
                                        active={position === current}
                                        offset={position < current ? -24 : position > current ? 24 : 0}
                                        animate={motion.animate}
                                        label={t('pro.final.story.slideLabel', { n: position + 1, total: count, name: slide.pill })}
                                        onHeight={(height) => setHeights((list) => (list[slide.id] === height ? list : { ...list, [slide.id]: height }))}
                                    >
                                        {slide.content}
                                    </Frame>
                                ))}
                            </View>
                        </View>
                    </GestureDetector>
                </LinearGradient>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1, minWidth: 0 }}>
                    <Hand size={16} color={colors.muted} />
                    <Txt size={12} weight="semibold" tone="muted" style={{ flexShrink: 1, lineHeight: 15 }}>
                        {motion.animate ? t('pro.final.story.help') : t('pro.final.story.helpStill')}
                    </Txt>
                </View>
                <View style={{ flexDirection: 'row', gap: 6, flexShrink: 0 }}>
                    <RoundButton label={t('recap.previous')} onPress={() => go(-1)} disabled={current === 0}>
                        {(color) => <ChevronLeft size={20} color={color} />}
                    </RoundButton>
                    <RoundButton label={paused ? t('pro.final.story.play') : t('pro.final.story.pause')} onPress={toggle} strong>
                        {(color) => (paused ? <Play size={16} color={color} /> : <Pause size={16} color={color} />)}
                    </RoundButton>
                    <RoundButton label={t('recap.next')} onPress={() => go(1)} disabled={current >= count - 1}>
                        {(color) => <ChevronRight size={20} color={color} />}
                    </RoundButton>
                </View>
            </View>
        </View>
    );
};
