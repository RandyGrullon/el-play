import React, { createContext, useCallback, useContext, useEffect, useRef, useState, type ComponentRef } from 'react';
import { Platform, Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useFocusEffect, useNavigationContainerRef, useRoute } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { fieldReturnOf, fieldReturnStep, hostPlace, navChainTo, type FieldReturn } from '../../../lib/fieldReturn';
import { FieldView, type FieldOrigin } from './FieldView';

// Tocar las bases de un juego en vivo abre el terreno. El diamante que se toca (BasesButton) mide dónde está en la
// pantalla para que el terreno crezca desde ahí. useFieldLauncher guarda cuál está abierto y da el elemento que hay que
// pintar FUERA de la tarjeta que se toca (en la web los toques dentro del Modal suben por el árbol de React y abrirían
// el juego). En la pantalla del juego va en un contexto para el diamante del PRO.
// Tocar una cara del terreno abre la ficha del pelotero; al volver atrás a la pantalla que lo tenía abierto (el juego, la
// tarjeta de la portada, la lista de en vivo), el terreno de ese juego sale otra vez, con un fundido. Una sola vez: si
// desde la ficha se fue a otra parte (otra pestaña, otra pantalla en su lugar), se olvida (lib/fieldReturn.ts).

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

// Al volver, el terreno sale cuando ya se fue la ficha (en el teléfono la pantalla tarda ~350 ms en salir)
const RETURN_MS = Platform.OS === 'web' ? 60 : 400;

export const useFieldLauncher = (gamePk?: number | null) => {
    const [state, setState] = useState<{ gamePk: number; origin: FieldOrigin | null; again: boolean } | null>(null);
    const open = useCallback<OpenField>(
        (origin, target) => {
            const pk = target ?? gamePk;
            if (!pk) return;
            if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
            setState({ gamePk: pk, origin, again: false });
        },
        [gamePk]
    );
    const close = useCallback(() => setState(null), []);

    // Volver al terreno después de la ficha de un pelotero
    const container = useNavigationContainerRef();
    const hostKey = useRoute().key;
    const back = useRef<FieldReturn | null>(null);
    const unsubscribe = useRef<(() => void) | null>(null);
    const forget = useCallback(() => {
        back.current = null;
        unsubscribe.current?.();
        unsubscribe.current = null;
    }, []);
    useEffect(() => forget, [forget]);
    /** Se va a la ficha desde el terreno de `pk`: se recuerda y se sigue la navegación hasta que vuelva o se vaya a otra parte */
    const leave = useCallback(
        (pk: number) => {
            forget();
            const chain = container.isReady() ? navChainTo(container.getRootState(), hostKey) : null;
            if (!chain) return;
            back.current = fieldReturnOf(pk, chain, Date.now());
            unsubscribe.current = container.addListener('state', () => {
                if (!back.current) return;
                const next = fieldReturnStep(back.current, hostPlace(container.getRootState(), back.current.chain), Date.now());
                if (next) back.current = next;
                else forget();
            });
        },
        [container, hostKey, forget]
    );
    // De vuelta en esta pantalla (atrás desde la ficha): el terreno otra vez, cuando ya terminó de irse la ficha
    useFocusEffect(
        useCallback(() => {
            const ticket = back.current;
            if (!ticket?.away) return;
            forget();
            const timer = setTimeout(() => setState({ gamePk: ticket.gamePk, origin: null, again: true }), RETURN_MS);
            return () => clearTimeout(timer);
        }, [forget])
    );

    const element = state ? <FieldView key={state.gamePk} gamePk={state.gamePk} origin={state.origin} again={state.again} onClosed={close} onLeave={() => leave(state.gamePk)} /> : null;
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
