import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    test: {
        environment: 'jsdom',
        environmentMatchGlobs: [['server/**', 'node']],
        include: ['src/**/*.{test,spec}.{js,ts,jsx,tsx}', 'server/**/*.test.js'],
        globals: true,
    },
});
