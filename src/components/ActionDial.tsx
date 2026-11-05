// Botón flotante abajo a la derecha (el de la web, components/ui/ActionDial.tsx): al tocarlo se oscurece la pantalla,
// el + gira hasta quedar en ×, sale una onda del botón y las opciones saltan en abanico a su alrededor (de la izquierda
// hacia arriba), una tras otra con rebote; cada una con su nombre debajo. Se cierra al tocar fuera, al elegir y con
// «atrás» de Android. Con «Reducir movimiento» las opciones solo aparecen en su sitio.
// Va al final de la pantalla y la cubre entera (sin tapar los toques mientras está cerrado): en Android no se puede
// tocar lo que queda fuera del padre, y las opciones salen hasta 156 px del botón.
import React, { useEffect, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, cancelAnimation, interpolate, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { Plus, type LucideIcon } from 'lucide-react-native';
import { fonts, inkOn, shadow } from '../theme/tokens';
import { useReduceMotion } from './ui';

export interface DialAction {
    key: string;
    label: string;
    icon: LucideIcon;
    onSelect: () => void;
    disabled?: boolean;
    /** Encendida (p. ej. «Mi equipo» ya elegido) */
    active?: boolean;
}

/** Dónde queda cada opción respecto al botón: en un cuarto de círculo de la izquierda (180°) hacia arriba (90°) */
export const dialPositions = (count: number) => {
    const radius = count <= 3 ? 128 : 156;
    return Array.from({ length: count }, (_, index) => {
        const angle = ((180 - (90 * index) / Math.max(1, count - 1)) * Math.PI) / 180;
        return { x: Math.round(Math.cos(angle) * radius), y: Math.round(-Math.sin(angle) * radius) };
    });
};

const FAB = 60;
const OPTION = 48;
/** Ancho del nombre de cada opción (cabe «Próximo juego» en una línea) */
const LABEL = 100;
/** Separación del borde de la pantalla y alto de la barra de abajo (si la pantalla la tiene) */
const EDGE = 16;
const TAB_BAR = 84;
// Rebote de cada opción al salir (como el cubic-bezier(.34,1.56,.64,1) de la web) y del giro del +
const POP = { duration: 380, dampingRatio: 0.55 } as const;
const TURN = { duration: 360, dampingRatio: 0.62 } as const;

const DialOption: React.FC<{
    action: DialAction;
    index: number;
    count: number;
    x: number;
    y: number;
    open: boolean;
    reduce: boolean;
    color: string;
    ink: string;
    iconColor: string;
    anchor: { right: number; bottom: number };
    onChoose: (action: DialAction) => void;
}> = ({ action, index, count, x, y, open, reduce, color, ink, iconColor, anchor, onChoose }) => {
    // Posición (pasa de 1 con el rebote) y opacidad
    const spread = useSharedValue(0);
    const fade = useSharedValue(0);
    useEffect(() => {
        if (reduce) {
            spread.set(1);
            fade.set(withTiming(open ? 1 : 0, { duration: 150 }));
            return () => cancelAnimation(fade);
        }
        // Salen una tras otra y vuelven en el orden contrario
        const delay = open ? index * 45 : (count - 1 - index) * 25;
        spread.set(withDelay(delay, open ? withSpring(1, POP) : withTiming(0, { duration: 200, easing: Easing.in(Easing.quad) })));
        fade.set(withDelay(delay, withTiming(open ? 1 : 0, { duration: open ? 220 : 180, easing: Easing.out(Easing.quad) })));
        return () => {
            cancelAnimation(spread);
            cancelAnimation(fade);
        };
    }, [open, reduce, index, count, spread, fade]);
    const motion = useAnimatedStyle(() => {
        const p = spread.get();
        return { opacity: fade.get(), transform: [{ translateX: x * p }, { translateY: y * p }, { scale: 0.35 + 0.65 * p }] };
    });
    const Icon = action.icon;
    const inset = (FAB - OPTION) / 2;

    return (
        <Animated.View
            pointerEvents={open ? 'box-none' : 'none'}
            accessibilityElementsHidden={!open}
            importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
            style={[{ position: 'absolute', right: anchor.right + inset, bottom: anchor.bottom + inset, width: OPTION, height: OPTION }, motion]}
        >
            <Pressable
                onPress={() => onChoose(action)}
                disabled={action.disabled || !open}
                accessibilityRole="menuitem"
                accessibilityLabel={action.label}
                accessibilityState={{ disabled: !!action.disabled, selected: action.active }}
                style={({ pressed }) => [
                    { width: OPTION, height: OPTION, borderRadius: OPTION / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: action.active ? color : '#ffffff', opacity: action.disabled ? 0.45 : 1, transform: [{ scale: pressed ? 0.9 : 1 }] },
                    shadow('float')
                ]}
            >
                <Icon size={22} color={action.active ? ink : iconColor} fill={action.active ? ink : 'transparent'} />
            </Pressable>
            {/* El nombre debajo, en blanco con sombra (va sobre el fondo oscuro); el lector ya lo lee en el botón.
                Va en su propia caja ancha: dentro de la de 48 px la web lo partía a la mitad de la palabra */}
            <View pointerEvents="none" style={{ position: 'absolute', top: OPTION + 5, left: (OPTION - LABEL) / 2, width: LABEL, alignItems: 'center' }}>
                <Text
                    accessible={false}
                    accessibilityElementsHidden
                    importantForAccessibility="no"
                    numberOfLines={1}
                    style={{
                        maxWidth: LABEL,
                        textAlign: 'center',
                        fontFamily: fonts.extrabold,
                        fontSize: 11,
                        lineHeight: 13,
                        color: '#ffffff',
                        opacity: action.disabled ? 0.6 : 1,
                        textShadowColor: 'rgba(0,0,0,0.7)',
                        textShadowOffset: { width: 0, height: 1 },
                        textShadowRadius: 6
                    }}
                >
                    {action.label}
                </Text>
            </View>
        </Animated.View>
    );
};

export const ActionDial: React.FC<{ actions: DialAction[]; color: string; label: string; aboveTabBar?: boolean }> = ({ actions, color, label, aboveTabBar }) => {
    const { t } = useTranslation();
    const insets = useSafeAreaInsets();
    const reduce = useReduceMotion();
    const [open, setOpen] = useState(false);
    const ink = inkOn(color);
    // Los íconos van sobre blanco: un color muy claro (dorado, amarillo) no se vería y se usa el oscuro
    const iconColor = ink === '#ffffff' ? color : '#14151a';
    const positions = dialPositions(actions.length);
    const anchor = { right: EDGE + insets.right, bottom: EDGE + insets.bottom + (aboveTabBar ? TAB_BAR : 0) };

    // 0 cerrado, 1 abierto: el fondo oscuro, el giro del + y la onda que sale del botón
    const dim = useSharedValue(0);
    const turn = useSharedValue(0);
    const ring = useSharedValue(1);
    useEffect(() => {
        dim.set(withTiming(open ? 1 : 0, { duration: open ? 250 : 200, easing: Easing.out(Easing.quad) }));
        turn.set(reduce ? (open ? 1 : 0) : withSpring(open ? 1 : 0, TURN));
    }, [open, reduce, dim, turn]);

    // Android: «atrás» cierra las opciones en vez de salir de la pantalla
    useEffect(() => {
        if (!open) return;
        const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
            setOpen(false);
            return true;
        });
        return () => subscription.remove();
    }, [open]);

    const backdrop = useAnimatedStyle(() => ({ opacity: dim.get() }));
    const plus = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.get() * 135}deg` }] }));
    const wave = useAnimatedStyle(() => ({ opacity: interpolate(ring.get(), [0, 1], [0.8, 0]), transform: [{ scale: interpolate(ring.get(), [0, 1], [1, 3.4]) }] }));

    const toggle = () => {
        if (!open) {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
            if (!reduce) ring.set(withSequence(withTiming(0, { duration: 0 }), withTiming(1, { duration: 650, easing: Easing.out(Easing.cubic) })));
        }
        setOpen(!open);
    };
    const choose = (action: DialAction) => {
        setOpen(false);
        action.onSelect();
    };

    return (
        // Cerrado no tapa nada (box-none); abierto, el lector de pantalla solo ve el menú
        <View pointerEvents="box-none" style={StyleSheet.absoluteFill} accessibilityViewIsModal={open}>
            <Animated.View pointerEvents={open ? 'auto' : 'none'} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(8,10,14,0.58)' }, backdrop]}>
                <Pressable accessible={false} importantForAccessibility="no" onPress={() => setOpen(false)} style={StyleSheet.absoluteFill} />
            </Animated.View>
            <View
                accessibilityRole="menu"
                accessibilityLabel={label}
                accessibilityElementsHidden={!open}
                importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
                pointerEvents="box-none"
                style={StyleSheet.absoluteFill}
            >
                {actions.map((action, index) => (
                    <DialOption
                        key={action.key}
                        action={action}
                        index={index}
                        count={actions.length}
                        x={positions[index].x}
                        y={positions[index].y}
                        open={open}
                        reduce={reduce}
                        color={color}
                        ink={ink}
                        iconColor={iconColor}
                        anchor={anchor}
                        onChoose={choose}
                    />
                ))}
            </View>
            <View pointerEvents="box-none" style={{ position: 'absolute', right: anchor.right, bottom: anchor.bottom, width: FAB, height: FAB }}>
                <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: FAB / 2, borderWidth: 2, borderColor: color }, wave]} />
                <Pressable
                    onPress={toggle}
                    accessibilityRole="button"
                    accessibilityLabel={open ? t('dial.close') : label}
                    accessibilityState={{ expanded: open }}
                    style={({ pressed }) => [
                        { width: FAB, height: FAB, borderRadius: FAB / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: color, borderWidth: 2, borderColor: open ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.18)', transform: [{ scale: pressed ? 0.9 : 1 }] },
                        shadow('float')
                    ]}
                >
                    <Animated.View style={plus}>
                        <Plus size={28} strokeWidth={2.6} color={ink} />
                    </Animated.View>
                </Pressable>
            </View>
        </View>
    );
};
