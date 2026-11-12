import React, { createContext, useContext } from 'react';
import { Pressable, type StyleProp, type ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Play } from 'lucide-react-native';
import { useColors } from '../../theme/theme';

// Repetir la animación de una jugada desde el historial (Lite «Jugada a jugada», la cronología del Lite en vivo y la
// pestaña «Jugadas» del PRO). La pantalla del juego tiene el candado (useReplayHost, en ReplayHost.tsx) y lo pasa por
// este contexto a las filas. En la cronología también se repiten las acciones de un turno (robo, atrapado robando,
// cambio de lanzador, emergente): por el mismo candado.

export interface ReplayApi {
    /** ¿La jugada (su `i`) tiene animación para repetir? Nunca con «Apagadas» en «Más» ni con «Reducir movimiento» */
    can: (atBatIndex: number) => boolean;
    /** Sale una repetición o una animación en vivo, o corre la pausa: el ▶ se ve apagado y los toques se ignoran */
    locked: boolean;
    /** La repite si se puede; si no, no hace nada (ni la reinicia ni la pone en cola) */
    replay: (atBatIndex: number) => void;
    /** ¿La acción `actionIndex` (su lugar en atBat.actions) del turno `atBatIndex` tiene animación para repetir? */
    canAction: (atBatIndex: number, actionIndex: number) => boolean;
    /** Repite esa acción (robo, cambio de lanzador, emergente) con el mismo candado que las jugadas */
    replayAction: (atBatIndex: number, actionIndex: number) => void;
}

export const ReplayContext = createContext<ReplayApi | null>(null);

/** El candado de la pantalla del juego (null fuera de ella: las filas no ofrecen repetir) */
export const useReplay = () => useContext(ReplayContext);

/**
 * Tocar la fila hace lo de siempre (abrir los pitcheos) y, si la jugada se puede repetir, la repite: devuelve el
 * `onPress` de la fila.
 */
export const useReplayPress = (atBatIndex: number, onPress: () => void) => {
    const replay = useReplay();
    const can = !!replay?.can(atBatIndex);
    return () => {
        onPress();
        if (can) replay?.replay(atBatIndex);
    };
};

/** El ▶ a la derecha de cada jugada que se puede repetir; apagado (y sin efecto) mientras dura el candado */
export const ReplayButton: React.FC<{ atBatIndex: number; size?: number; style?: StyleProp<ViewStyle> }> = ({ atBatIndex, size = 36, style }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const replay = useReplay();
    if (!replay?.can(atBatIndex)) return null;
    const { locked } = replay;
    return (
        <Pressable
            onPress={() => replay.replay(atBatIndex)}
            disabled={locked}
            accessibilityRole="button"
            accessibilityLabel={t('plays.replay')}
            accessibilityState={{ disabled: locked }}
            hitSlop={6}
            style={({ pressed }) => [
                { width: size, height: size, flexShrink: 0, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.raised, opacity: locked ? 0.4 : pressed ? 0.7 : 1 },
                style
            ]}
        >
            <Play size={Math.round(size * 0.38)} color={colors.ink} fill={colors.ink} style={{ marginLeft: 2 }} />
        </Pressable>
    );
};
