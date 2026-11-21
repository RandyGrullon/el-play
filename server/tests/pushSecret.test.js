import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const push = require('../services/pushAlerts');

// Valores de prueba: ni el secreto ni Supabase son reales
const ENV = { SUPABASE_URL: 'https://prueba.supabase.co', SUPABASE_ANON_KEY: 'llave-publica-de-prueba', PUSH_SECRET: 'secreto-de-prueba-largo-123456' };

describe('guardar y borrar suscripciones piden el secreto', () => {
    const calls = [];
    beforeEach(() => {
        Object.assign(process.env, ENV);
        calls.length = 0;
        vi.stubGlobal('fetch', vi.fn(async (url, init) => {
            calls.push({ url, body: JSON.parse(init.body) });
            return new Response('', { status: 200 });
        }));
    });
    afterEach(() => {
        vi.unstubAllGlobals();
        for (const name of Object.keys(ENV)) delete process.env[name];
    });

    it('push_save lleva el secreto del servidor', async () => {
        const sub = { endpoint: 'https://fcm.googleapis.com/fcm/send/prueba', p256dh: 'p', auth: 'a', games: [1], teams: [], kinds: {}, lang: 'es' };
        await push.saveSubscription(sub);
        expect(calls[0].url).toBe('https://prueba.supabase.co/rest/v1/rpc/push_save');
        expect(calls[0].body.run_secret).toBe('secreto-de-prueba-largo-123456');
        expect(calls[0].body.sub_endpoint).toBe(sub.endpoint);
    });

    it('push_delete también', async () => {
        await push.deleteSubscription('https://fcm.googleapis.com/fcm/send/prueba');
        expect(calls[0].url).toBe('https://prueba.supabase.co/rest/v1/rpc/push_delete');
        expect(calls[0].body).toEqual({ run_secret: 'secreto-de-prueba-largo-123456', sub_endpoint: 'https://fcm.googleapis.com/fcm/send/prueba' });
    });
});
