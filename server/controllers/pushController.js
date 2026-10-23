const crypto = require('crypto');
const express = require('express');
const env = require('../utils/env');
const push = require('../services/pushAlerts');
const { fetchSchedule } = require('../services/mlbService');

// Avisos con la app cerrada y reporte de errores de la app. Los cuerpos son JSON chicos (máx. 4 KB)
const json = express.json({ limit: '4kb' });

/** La app pregunta si el servidor puede avisar con la app cerrada y con qué llave suscribirse */
const getPushConfig = (req, res) => {
    res.set('Cache-Control', 'public, max-age=0, s-maxage=300');
    res.json({ enabled: push.pushEnabled(), publicKey: push.pushEnabled() ? push.vapidConfig().publicKey : null });
};

const subscribe = [
    json,
    async (req, res, next) => {
        try {
            if (!push.pushEnabled()) return res.status(503).json({ error: 'push_disabled' });
            const sub = push.cleanSubscription(req.body);
            if (!sub) return res.status(400).json({ error: 'invalid_subscription' });
            await push.saveSubscription(sub);
            res.set('Cache-Control', 'no-store').json({ ok: true });
        } catch (error) {
            next(error);
        }
    }
];

const unsubscribe = [
    json,
    async (req, res, next) => {
        try {
            const endpoint = req.body?.endpoint;
            if (typeof endpoint !== 'string' || endpoint.length > 1000) return res.status(400).json({ error: 'invalid_subscription' });
            if (push.pushEnabled()) await push.deleteSubscription(endpoint);
            res.set('Cache-Control', 'no-store').json({ ok: true });
        } catch (error) {
            next(error);
        }
    }
];

const sameSecret = (given, expected) => {
    const a = Buffer.from(String(given || ''));
    const b = Buffer.from(String(expected || ''));
    return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
};

/** El cron de Supabase (cada minuto) con el secreto en x-push-secret */
const run = async (req, res, next) => {
    try {
        if (!sameSecret(req.get('x-push-secret'), env.env('PUSH_SECRET'))) return res.status(401).json({ error: 'unauthorized' });
        const result = await push.runPush({ fetchSchedule });
        res.set('Cache-Control', 'no-store').json(result);
    } catch (error) {
        next(error);
    }
};

// ---------------------------------------------------------------- errores de la app (sin servicios de terceros: quedan en los logs de Vercel)

const recent = new Map();
const clientError = [
    json,
    (req, res) => {
        const body = req.body || {};
        const text = (value, max) => (typeof value === 'string' ? value.slice(0, max) : '');
        const report = { message: text(body.message, 300), stack: text(body.stack, 1500), url: text(body.url, 200), version: text(body.version, 40), agent: text(req.get('user-agent'), 160) };
        if (!report.message) return res.status(400).json({ error: 'invalid_report' });
        // El mismo error de muchos teléfonos: una vez por minuto en los logs
        const key = `${report.message}|${report.url}`;
        const last = recent.get(key) || 0;
        if (Date.now() - last > 60000) {
            recent.set(key, Date.now());
            if (recent.size > 200) recent.delete(recent.keys().next().value);
            console.error(`[app] ${report.message} · ${report.url} · ${report.version} · ${report.agent}\n${report.stack}`);
        }
        res.set('Cache-Control', 'no-store').status(204).end();
    }
];

module.exports = { getPushConfig, subscribe, unsubscribe, run, clientError };
