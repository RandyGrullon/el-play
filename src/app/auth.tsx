import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import i18n from '../i18n';
import { consumeAuthUrl, type AuthRedirect } from '../lib/account';
import { showToast } from '../lib/toast';
import { localText } from '../components/fantasy/texts';

// En la web Google vuelve a /auth dentro de la ventana que abrió openAuthSessionAsync: la dirección se le pasa a la
// ventana de la app (ella guarda la sesión) y esta se cierra sola, sin leer nada aquí
const popup = Platform.OS === 'web' && WebBrowser.maybeCompleteAuthSession().type === 'success';

// Lo mismo que dice la web al volver (el-play/src/main.tsx)
const authMessage = (auth: AuthRedirect) => {
    if (auth.result === 'signed-in') return i18n.t('account.linkSignedIn', { email: auth.email });
    if (auth.result === 'linked' || auth.code === 'identity_already_linked') return localText('methods.linked');
    if (auth.code === 'link_other_account') return localText('methods.errors.link_other_account');
    if (auth.code === 'identity_already_exists') return localText('methods.errors.identity_taken');
    if (auth.code === 'manual_linking_disabled') return localText('methods.errors.linking_disabled');
    if (auth.via === 'link') return localText('methods.linkFailed');
    if (auth.via === 'google') return localText('googleFailed');
    return i18n.t('account.linkExpired');
};

// Atrás si se llegó desde otra pantalla (vuelta de Google o del correo con la app abierta); si no, al Fantasy
const leave = () => (router.canGoBack() ? router.back() : router.replace('/fantasy'));

// elplay://auth#access_token=… : vuelta del enlace del correo o de Google. Se guarda la sesión y se avisa qué pasó.
export default function AuthReturn() {
    const url = Linking.useLinkingURL();
    // Cada dirección se atiende una vez (si el efecto corre dos veces no se sale dos veces)
    const handled = useRef<string | null>(null);
    useEffect(() => {
        if (popup) return undefined;
        // Si no llega ninguna dirección (se abrió /auth a mano), igual se sale
        if (!url) {
            const fallback = setTimeout(leave, 1500);
            return () => clearTimeout(fallback);
        }
        if (handled.current === url) return undefined;
        handled.current = url;
        const auth = consumeAuthUrl(url);
        // Ya leída (llegó dos veces o la sesión ya era esa): no se avisa nada
        if (auth && !auth.repeated) showToast(authMessage(auth), undefined, 7000);
        leave();
        return undefined;
    }, [url]);
    return null;
}
