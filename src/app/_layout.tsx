import React, { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider, focusManager, onlineManager } from '@tanstack/react-query';
import NetInfo from '@react-native-community/netinfo';
import { useFonts, Outfit_400Regular, Outfit_500Medium, Outfit_600SemiBold, Outfit_700Bold, Outfit_800ExtraBold, Outfit_900Black } from '@expo-google-fonts/outfit';
import { BarlowCondensed_800ExtraBold } from '@expo-google-fonts/barlow-condensed';
import { hydrateStorage } from '../lib/storage';
import { queryClient } from '../lib/queries';
// Al arrancar (no al abrir un juego): recupera la Live Activity / notificación del juego que se seguía
import '../lib/follow';
import { initLanguage } from '../i18n';
import { LeagueProvider } from '../state/league';
import { PreferencesProvider } from '../state/preferences';
import { ThemeProvider, useTheme } from '../theme/theme';
import { Toast } from '../components/layout';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

// React Query sabe si hay internet y si la app está a la vista (para refrescar el marcador al volver)
onlineManager.setEventListener((setOnline) => NetInfo.addEventListener((state) => setOnline(state.isConnected !== false)));
if (Platform.OS !== 'web') {
    AppState.addEventListener('change', (status) => focusManager.setFocused(status === 'active'));
}

const Navigator: React.FC = () => {
    const { colors, isDark } = useTheme();
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
    const [fontsLoaded] = useFonts({ Outfit_400Regular, Outfit_500Medium, Outfit_600SemiBold, Outfit_700Bold, Outfit_800ExtraBold, Outfit_900Black, BarlowCondensed_800ExtraBold });

    // Antes de pintar: lo guardado en el teléfono (favorito, liga, tema, sesión, fantasy) y el idioma
    useEffect(() => {
        hydrateStorage().then(() => {
            initLanguage();
            setReady(true);
        });
    }, []);
    useEffect(() => {
        if (ready && fontsLoaded) SplashScreen.hideAsync().catch(() => undefined);
    }, [ready, fontsLoaded]);

    if (!ready || !fontsLoaded) return null;

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
