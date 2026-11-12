import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Platform, View } from 'react-native';
import { FullWindowOverlay } from 'react-native-screens';
import * as Haptics from 'expo-haptics';
import type { GameDetail } from '../../types';
import { replayActionOf, replayEventOf, replayGate, type PlayEvent } from '../../lib/playEvents';
import { useIsPro } from '../../lib/pro';
import { useMotion } from '../../lib/motion';
import { PlayAnimation } from './PlayAnimation';
import type { ReplayApi } from './replay';

/**
 * Capa de la repetición, encima de todo: también de la hoja abierta (un Modal), para no perder el sitio en el historial.
 * En iOS un Modal de la pantalla no se puede presentar sobre la hoja (UIKit ya la está presentando): va en la capa
 * nativa de toda la ventana, como el aviso. En Android y en la web, un Modal transparente que se monta después queda
 * encima (como el terreno).
 */
const ReplayLayer: React.FC<{ onClose: () => void; children: React.ReactNode }> = ({ onClose, children }) => {
    if (Platform.OS === 'ios') return <FullWindowOverlay unstable_accessibilityContainerViewIsModal={false}>{children}</FullWindowOverlay>;
    return (
        <Modal transparent visible animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose} supportedOrientations={['portrait']}>
            <View pointerEvents="box-none" style={{ flex: 1 }}>
                {children}
            </View>
        </Modal>
    );
};

/**
 * Repetir una jugada del historial en la pantalla del juego: una a la vez y con una pausa entre repeticiones, para que
 * tocar varias veces no la reinicie ni la ponga en cola. El candado es de esta pantalla, en memoria. Con una animación
 * en vivo saliendo (`liveBusy`) el toque también se ignora; lo que llegue en vivo mientras sale una repetición espera
 * en su cola (`playing`). Con «Apagadas» o «Reducir movimiento» no se ofrece; con «Solo las grandes» sí (se pidió).
 * Las acciones de un turno (robo, cambio de lanzador, emergente: desde la cronología) van por el mismo candado.
 * `api` va al contexto de las filas y `element` se pinta en la pantalla.
 */
export const useReplayHost = (game: GameDetail | undefined, liveBusy: boolean) => {
    const pro = useIsPro();
    const motion = useMotion();
    const enabled = motion.animate;
    const [event, setEvent] = useState<PlayEvent | null>(null);
    const [cooling, setCooling] = useState(false);
    const gate = useRef(replayGate.idle);
    const cooldown = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    // Lo de la última lectura, para los toques (el candado se mira al momento, no en el render)
    const latest = useRef({ game, pro, enabled, liveBusy });
    useEffect(() => {
        latest.current = { game, pro, enabled, liveBusy };
    });
    useEffect(() => () => clearTimeout(cooldown.current), []);

    // Los turnos cuyo resultado tiene animación (los mismos que salen en vivo) y las acciones que se animan («turno-acción»)
    const replayable = useMemo(() => {
        const atBats = new Set<number>();
        const actions = new Set<string>();
        if (!game || !enabled) return { atBats, actions };
        for (const atBat of game.atBats) {
            if (atBat.complete && replayEventOf(game, atBat.i, { pro })) atBats.add(atBat.i);
            atBat.actions.forEach((_action, index) => {
                if (replayActionOf(game, atBat.i, index, { pro })) actions.add(`${atBat.i}-${index}`);
            });
        }
        return { atBats, actions };
    }, [game, pro, enabled]);

    // Arma la repetición con la última lectura y la saca si el candado lo deja
    const start = useCallback((build: (game: GameDetail, pro: boolean) => PlayEvent | null) => {
        const now = latest.current;
        if (!now.game || !now.enabled || now.liveBusy) return;
        const play = build(now.game, now.pro);
        const started = play ? replayGate.start(gate.current, Date.now()) : null;
        if (!play || !started) return;
        gate.current = started;
        setEvent(play);
        // Vibra solo si sale (un toque ignorado no hace nada)
        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    }, []);
    const replay = useCallback((atBatIndex: number) => start((now, isPro) => replayEventOf(now, atBatIndex, { pro: isPro })), [start]);
    const replayAction = useCallback((atBatIndex: number, actionIndex: number) => start((now, isPro) => replayActionOf(now, atBatIndex, actionIndex, { pro: isPro })), [start]);

    // Terminó sola, al tocarla o con «atrás»: empieza la pausa
    const end = useCallback(() => {
        const at = Date.now();
        gate.current = replayGate.end(gate.current, at);
        setEvent(null);
        setCooling(true);
        clearTimeout(cooldown.current);
        cooldown.current = setTimeout(() => setCooling(false), Math.max(0, gate.current.readyAt - at));
    }, []);

    const locked = !!event || cooling || liveBusy;
    const api = useMemo<ReplayApi>(
        () => ({
            can: (atBatIndex) => replayable.atBats.has(atBatIndex),
            locked,
            replay,
            canAction: (atBatIndex, actionIndex) => replayable.actions.has(`${atBatIndex}-${actionIndex}`),
            replayAction
        }),
        [replayable, locked, replay, replayAction]
    );
    const element = event ? (
        <ReplayLayer key={event.key} onClose={end}>
            <PlayAnimation event={event} onDone={end} />
        </ReplayLayer>
    ) : null;
    return { api, element, playing: !!event };
};
