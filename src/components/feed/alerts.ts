import { useCallback } from 'react';
import { Linking, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { usePreferences } from '../../state/preferences';
import { showToast } from '../../lib/toast';
import type { ScheduleGame } from '../../types';

// Textos propios de la app (la web habla del navegador)
const TEXTS = {
    es: { blocked: 'Tienes los avisos bloqueados. Actívalos para El Play en los ajustes del teléfono.', settings: 'Ajustes', web: 'Los avisos llegan en la app del teléfono.', past: 'Ese juego ya empezó.' },
    en: { blocked: 'Notifications are off. Turn them on for El Play in your phone settings.', settings: 'Settings', web: 'Alerts arrive in the phone app.', past: 'That game already started.' }
};

/** Lo que hace falta de un juego (del calendario o del detalle) para su aviso */
export interface AlertGame {
    gamePk: number;
    date: string;
    away: { name: string };
    home: { name: string };
}

/** Activa o quita el aviso de un juego y siempre dice qué pasó */
export const useAlertToggle = () => {
    const { t, i18n } = useTranslation();
    const { toggleGameSubscription } = usePreferences();
    return useCallback(
        async (game: AlertGame) => {
            const words = i18n.language.startsWith('en') ? TEXTS.en : TEXTS.es;
            // Para programar los avisos solo hacen falta la hora y los nombres
            const result = await toggleGameSubscription(game as Pick<ScheduleGame, 'gamePk' | 'date' | 'away' | 'home'>).catch(() => 'blocked' as const);
            if (result === 'blocked') {
                if (Platform.OS === 'web') showToast(words.web, undefined, 5000);
                else showToast(words.blocked, { label: words.settings, run: () => Linking.openSettings().catch(() => undefined) }, 9000);
            } else if (result === 'past') showToast(words.past, undefined, 3500);
            else showToast(t(`alerts.${result}`), undefined, 3500);
        },
        [t, i18n.language, toggleGameSubscription]
    );
};
