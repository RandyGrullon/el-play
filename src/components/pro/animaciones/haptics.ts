// Vibración de las jugadas del modo PRO (expo-haptics): éxito en jonrón, victoria y campeonato; impacto ligero en
// ponche; medio en carrera, robo y error. Solo en el teléfono y solo si la jugada se anima (con «Apagadas» o
// «Reducir movimiento» no vibra).
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import type { PlayKind } from '../../../lib/playEvents';

const SUCCESS: PlayKind[] = ['hr', 'win', 'champion'];
const LIGHT: PlayKind[] = ['k', 'out', 'walk'];
const MEDIUM: PlayKind[] = ['run', 'steal', 'error', 'wildPitch', 'noHitter'];

export const playHaptic = (kind: PlayKind, animate: boolean) => {
    if (!animate || Platform.OS === 'web') return;
    const done = (promise: Promise<void>) => promise.catch(() => undefined);
    if (SUCCESS.includes(kind)) done(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
    else if (LIGHT.includes(kind)) done(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
    else if (MEDIUM.includes(kind)) done(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
};
