import React, { createContext, useCallback, useContext, useRef, useState, type ComponentRef } from 'react';
import { Platform, Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';
import { FieldView, type FieldOrigin } from './FieldView';

// Tocar las bases de un juego en vivo abre el terreno. El diamante que se toca (BasesButton) mide dónde está en la
// pantalla para que el terreno crezca desde ahí. useFieldLauncher guarda cuál está abierto y da el elemento que hay que
// pintar FUERA de la tarjeta que se toca (en la web los toques dentro del Modal suben por el árbol de React y abrirían
// el juego). En la pantalla del juego va en un contexto para el diamante del PRO.

export type { FieldOrigin } from './FieldView';
export type OpenField = (origin: FieldOrigin | null, gamePk?: number | null) => void;

/** Dónde caen la primera y la tercera dentro del dibujo del diamante que se toca (fracción del ancho y del alto) */
export interface DiamondAnchor {
    /** Distancia de tercera a primera / ancho */
    span: number;
    /** Altura de la primera y la tercera / alto */
    y: number;
}

/** El diamante pequeño de la app (Bases: viewBox 40 × 32, bases en x 8 y 32, y 19) */
export const BASES_ANCHOR: DiamondAnchor = { span: 24 / 40, y: 19 / 32 };

export const useFieldLauncher = (gamePk?: number | null) => {
    const [state, setState] = useState<{ gamePk: number; origin: FieldOrigin | null } | null>(null);
    const open = useCallback<OpenField>(
        (origin, target) => {
            const pk = target ?? gamePk;
            if (!pk) return;
            if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
            setState({ gamePk: pk, origin });
        },
        [gamePk]
    );
    const close = useCallback(() => setState(null), []);
    const element = state ? <FieldView key={state.gamePk} gamePk={state.gamePk} origin={state.origin} onClosed={close} /> : null;
    return { open, element };
};

const FieldContext = createContext<OpenField | null>(null);

/** La pantalla del juego abre el terreno desde cualquier diamante de adentro */
export const FieldLauncherProvider: React.FC<{ open: OpenField | null; children: React.ReactNode }> = ({ open, children }) => <FieldContext.Provider value={open}>{children}</FieldContext.Provider>;

export const useOpenField = () => useContext(FieldContext);

interface BasesButtonProps {
    /** Sin `onOpen` (fuera de vivo o sin pantalla que lo abra) el diamante queda como estaba */
    onOpen: OpenField | null | undefined;
    gamePk?: number | null;
    anchor?: DiamondAnchor;
    children: React.ReactNode;
    style?: StyleProp<ViewStyle>;
    hitSlop?: number;
}

/** El diamante que se toca para ver el terreno («Ver el terreno») */
export const BasesButton: React.FC<BasesButtonProps> = ({ onOpen, gamePk, anchor = BASES_ANCHOR, children, style, hitSlop = 8 }) => {
    const { t } = useTranslation();
    const box = useRef<ComponentRef<typeof View>>(null);
    if (!onOpen) return <View style={style}>{children}</View>;
    const press = () => {
        const node = box.current;
        if (!node?.measureInWindow) {
            onOpen(null, gamePk);
            return;
        }
        node.measureInWindow((x, y, width, height) => {
            onOpen(width > 0 && height > 0 ? { x: x + width / 2, y: y + height * anchor.y, span: width * anchor.span } : null, gamePk);
        });
    };
    return (
        <Pressable onPress={press} accessibilityRole="button" accessibilityLabel={t('field.open')} hitSlop={hitSlop} style={({ pressed }) => [style, { opacity: pressed ? 0.7 : 1, transform: [{ scale: pressed ? 0.94 : 1 }] }]}>
            <View ref={box} collapsable={false}>
                {children}
            </View>
        </Pressable>
    );
};
