import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { usePreferences } from '../store/preferences';
import { isIOS, openInstallSheet } from '../lib/install';
import { showToast } from '../lib/toast';

/** El botón «Avisarme» se muestra si el navegador tiene avisos, o en iPhone (para explicar que hace falta instalarla) */
export const alertsAvailable = () => typeof window !== 'undefined' && ('Notification' in window || isIOS());

/** Activa o quita el aviso de un juego y siempre dice qué pasó (antes, si estaban bloqueados, no pasaba nada) */
export const useAlertToggle = () => {
    const { t } = useTranslation();
    const { toggleGameSubscription } = usePreferences();
    return useCallback(
        async (gamePk: number) => {
            const result = await toggleGameSubscription(gamePk);
            if (result === 'needs-install') showToast(t('alerts.needsInstall'), { label: t('alerts.howToInstall'), run: openInstallSheet }, 9000);
            else if (result === 'blocked') showToast(t('alerts.blocked'), undefined, 9000);
            else showToast(t(`alerts.${result}`), undefined, 3500);
        },
        [t, toggleGameSubscription]
    );
};
