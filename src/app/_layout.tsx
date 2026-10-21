import React, { useEffect, useState } from 'react';
import { AppState, Platform, useColorScheme } from 'react-native';
import { Stack, router, type ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider, focusManager, onlineManager } from '@tanstack/react-query';
import NetInfo from '@react-native-community/netinfo';
import { useFonts, Outfit_400Regular, Outfit_500Medium, Outfit_600SemiBold, Outfit_700Bold, Outfit_800ExtraBold, Outfit_900Black } from '@expo-google-fonts/outfit';
import { BarlowCondensed_800ExtraBold } from '@expo-google-fonts/barlow-condensed';
import { useTranslation } from 'react-i18next';
import { hydrateStorage } from '../lib/storage';
import { queryClient } from '../lib/queries';
// Al arrancar (no al abrir un juego): recupera la Live Activity / notificación del juego que se seguía
import '../lib/follow';
import { initLanguage } from '../i18n';
import { LeagueProvider } from '../state/league';
import { PreferencesProvider, useAlertTaps } from '../state/preferences';
import { ThemeProvider, useColors, useTheme } from '../theme/theme';
import { dark, light } from '../theme/tokens';
import { Toast } from '../components/layout';
import { ErrorScreen } from '../components/ErrorScreen';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

// React Query sabe si hay internet y si la app está a la vista (para refrescar el marcador al volver)
onlineManager.setEventListener((setOnline) => NetInfo.addEventListener((state) => setOnline(state.isConnected !== false)));
if (Platform.OS !== 'web') {
    AppState.addEventListener('change', (status) => focusManager.setFocused(status === 'active'));
}

/** Si una pantalla falla al pintarse, la navegación (pestañas, atrás) sigue y se puede reintentar */
const ScreenError: React.FC<ErrorBoundaryProps> = ({ error, retry }) => {
    const { t } = useTranslation();
    const colors = useColors();
    return (
        <ErrorScreen
            colors={colors}
            title={t('errors.screenTitle')}
            body={t('errors.screenBody')}
            detail={__DEV__ ? error.message : undefined}
            actions={[
                { label: t('common.retry'), run: retry },
                { label: t('errors.goGames'), run: () => router.navigate('/') }
            ]}
        />
    );
};

// Para todas las pantallas, también las de las pestañas (Expo Router lo hereda en los layouts de adentro)
export const unstable_settings = { screenErrorBoundary: ScreenError };

/** Si falla la raíz (proveedores, arranque): sin tema ni navegación, con los colores del sistema */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
    const { t } = useTranslation();
    const colors = useColorScheme() === 'dark' ? dark : light;
    // Si falló antes de quitar el splash, el splash taparía el error
    useEffect(() => {
        SplashScreen.hideAsync().catch(() => undefined);
    }, []);
    return <ErrorScreen colors={colors} title={t('errors.screenTitle')} body={t('errors.screenBody')} detail={__DEV__ ? error.message : undefined} actions={[{ label: t('common.retry'), run: retry }]} />;
}

const Navigator: React.FC = () => {
    const { colors, isDark } = useTheme();
    useAlertTaps();
    return (
        <>
            <StatusBar style={isDark ? 'light' : 'dark'} />
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="juego/[gamePk]" />
                <Stack.Screen name="jugador/[id]" options={{ presentation: 'modal' }} />
                <Stack.Screen name="en-vivo" options={{ presentation: 'modal' }} />
                <Stack.Screen name="privacidad" />
                <Stack.Screen name="auth" />
            </Stack>
            <Toast />
        </>
    );
};

export default function RootLayout() {
    const [ready, setReady] = useState(false);
    const [fontsLoaded, fontError] = useFonts({ Outfit_400Regular, Outfit_500Medium, Outfit_600SemiBold, Outfit_700Bold, Outfit_800ExtraBold, Outfit_900Black, BarlowCondensed_800ExtraBold });
    // Si una fuente falla se sigue con la del sistema: el splash no puede quedarse para siempre
    const fontsDone = fontsLoaded || !!fontError;

    // Antes de pintar: lo guardado en el teléfono (favorito, liga, tema, sesión, fantasy) y el idioma
    useEffect(() => {
        hydrateStorage().then(() => {
            initLanguage();
            setReady(true);
        });
    }, []);
    useEffect(() => {
        if (ready && fontsDone) SplashScreen.hideAsync().catch(() => undefined);
    }, [ready, fontsDone]);

    if (!ready || !fontsDone) return null;

    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <SafeAreaProvider>
                <QueryClientProvider client={queryClient}>
                    <LeagueProvider>
                        <ThemeProvider>
                            <PreferencesProvider>
                                <Navigator />
                            </PreferencesProvider>
                        </ThemeProvider>
                    </LeagueProvider>
                </QueryClientProvider>
            </SafeAreaProvider>
        </GestureHandlerRootView>
    );
}
