// Enlace a una pantalla que no existe (un aviso o enlace viejo, una ruta mal escrita)
import React from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ErrorScreen } from '../components/ErrorScreen';
import { SwipeBack } from '../components/SwipeBack';
import { useColors } from '../theme/theme';

// Deslizar a la derecha vuelve adonde se estaba; si no hay adónde, a los juegos (como el botón)
const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));

export default function NotFound() {
    const { t } = useTranslation();
    const colors = useColors();
    return (
        <SwipeBack onBack={leave}>
            <ErrorScreen colors={colors} title={t('errors.notFoundTitle')} body={t('errors.not_found')} actions={[{ label: t('errors.goGames'), run: () => router.replace('/') }]} />
        </SwipeBack>
    );
}
