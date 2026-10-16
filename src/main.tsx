// Primero: revisa si la instalación ya tenía datos (aviso del logo nuevo en iPhone) antes de que se guarde nada
import './lib/appUpdate';
// Antes de React: Chrome lanza el aviso de instalación una sola vez y muy temprano
import './lib/install';
import './i18n';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import App from './App';
import { blockZoom } from './lib/noZoom';
import './styles.css';

blockZoom();

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
