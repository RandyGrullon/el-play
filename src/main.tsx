// Primero: revisa si la instalación ya tenía datos (aviso del logo nuevo en iPhone) antes de que se guarde nada
import './lib/appUpdate';
// Antes de React: Chrome lanza el aviso de instalación una sola vez y muy temprano
import './lib/install';
import i18n from './i18n';
import { consumeAuthRedirect, type AuthRedirect } from './lib/account';
import { showToast } from './lib/toast';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import App from './App';
import { blockDoubleTapZoom } from './lib/noZoom';
import './styles.css';

blockDoubleTapZoom();

// Vuelta desde el enlace del correo o desde Google: la sesión queda abierta (o se dice qué falló)
const authMessage = (auth: AuthRedirect) => {
    if (auth.result === 'signed-in') return i18n.t('account.linkSignedIn', { email: auth.email });
    if (auth.result === 'kept') return i18n.t('account.keptSession', { email: auth.email });
    if (auth.result === 'linked' || auth.code === 'identity_already_linked') return i18n.t('account.methods.linked');
    if (auth.code === 'link_other_account') return i18n.t('account.methods.linkOther');
    if (auth.code === 'identity_already_exists') return i18n.t('account.errors.identity_taken');
    if (auth.code === 'manual_linking_disabled') return i18n.t('account.errors.linking_disabled');
    if (auth.via === 'link') return i18n.t('account.methods.linkFailed');
    if (auth.via === 'google') return i18n.t('account.googleFailed');
    return i18n.t('account.linkExpired');
};
// Si ya había otra cuenta abierta, se pregunta antes de cambiarla por la del enlace
const auth = consumeAuthRedirect((current, next) => window.confirm(i18n.t('account.switchConfirm', { current, next })));
if (auth) showToast(authMessage(auth), undefined, 7000);

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            // Cada consulta define su staleTime/refetchInterval (lib/queries.ts); aquí solo lo común
            refetchOnReconnect: true,
            refetchIntervalInBackground: false,
            gcTime: 15 * 60 * 1000
        }
    }
});

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <QueryClientProvider client={queryClient}>
            <App />
            {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />}
        </QueryClientProvider>
    </React.StrictMode>
);
