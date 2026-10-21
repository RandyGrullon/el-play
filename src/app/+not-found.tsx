// Enlace a una pantalla que no existe (un aviso o enlace viejo, una ruta mal escrita)
import React from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ErrorScreen } from '../components/ErrorScreen';
import { useColors } from '../theme/theme';

export default function NotFound() {
    const { t } = useTranslation();
    const colors = useColors();
    return <ErrorScreen colors={colors} title={t('errors.notFoundTitle')} body={t('errors.not_found')} actions={[{ label: t('errors.goGames'), run: () => router.replace('/') }]} />;
}
