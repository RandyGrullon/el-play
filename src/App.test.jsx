import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App.jsx';

const queryClient = new QueryClient({
    defaultOptions: {
        queries: { retry: false },
    },
});

function Wrapper({ children }) {
    return (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );
}

describe('App', () => {
    it('renders without crashing and shows EL PLAY or loading', () => {
        render(<App />, { wrapper: Wrapper });
        // After a moment the app shows either SplashLoader (with "EL" / "PLAY") or main content
        const el = document.body.textContent;
        expect(el).toMatch(/EL|PLAY/);
    });
});
