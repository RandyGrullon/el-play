import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    test: {
        environment: 'jsdom',
        environmentMatchGlobs: [['api/**', 'node']],
        include: ['src/**/*.{test,spec}.{js,ts,jsx,tsx}', 'api/**/*.test.js'],
        globals: true,
    },
});
