const fans = require('../fantasyFans');
const { RULES, perTeamLimit } = require('../fantasyScore');
const { todayOf, shiftDay } = require('./games');

// Fanáticos simulados para MLB_MOCK=1 (npm run dev:mock): equipos de mentira con los peloteros del simulador para que
// el fantasy PRO (% de fanáticos, histograma, tabla con flechas, perfiles) se vea completo sin cuentas reales.
// Todo sale de una semilla: los mismos fanáticos escogen lo mismo cada vez que se pide el mismo día.

const FANS = 30;
// Días hacia atrás con equipos (cada día simulado se calcula con el simulador: más días, más lento al arrancar)
const DAYS = 14;

const uuidOf = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const FAN_IDS = Array.from({ length: FANS }, (_, index) => uuidOf(index + 1));

const hash = (text) => [...text].reduce((acc, char) => (Math.imul(acc, 31) + char.charCodeAt(0)) >>> 0, 7);

const rng = (seed) => {
    let state = seed >>> 0 || 1;
    return () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 4294967296;
    };
};

/** Nombre y fecha de alta de un fanático simulado (cualquier uuid tiene uno) */
const profile = (userId) => {
    const index = FAN_IDS.indexOf(userId);
    return { name: index >= 0 ? `Fanático ${String(index + 1).padStart(2, '0')}` : 'Fanático de prueba', createdAt: '2026-10-01T12:00:00.000Z' };
};

/** Equipo de un fanático en un día: 5 bateadores y 1 lanzador con el máximo por equipo y el presupuesto, capitán y pronósticos */
const entryFor = (userId, day) => {
    const random = rng(hash(`${userId}:${day.date}`));
    // Uno de cada siete días no juega
    if (random() < 0.15) return null;
    const perTeam = perTeamLimit(day);
    const budget = day.credits && Number.isFinite(day.credits.budget) ? day.credits.budget : Infinity;
    // Los mejores (por lo que se espera de ellos) salen más, con algo de azar para que no todos escojan igual
    const weight = (player) => (player.proj ?? player.price ?? 5) * (0.4 + random());
    const ordered = [...day.players].map((player) => ({ player, score: weight(player) })).sort((a, b) => b.score - a.score);
    // Cada puesto que falta llenar necesita al menos el precio más bajo: así siempre queda para el lanzador
    const cheapest = day.credits && Number.isFinite(day.credits.min) ? day.credits.min : 0;
    const lineup = [];
    const slotsLeft = () => RULES.batters + RULES.pitchers - lineup.length;
    let spent = 0;
    for (const role of ['B', 'P']) {
        const slots = role === 'P' ? RULES.pitchers : RULES.batters;
        for (const { player } of ordered) {
            if (lineup.filter((p) => p.role === role).length >= slots) break;
            if (player.role !== role || lineup.includes(player)) continue;
            if (lineup.filter((p) => p.teamId === player.teamId).length >= perTeam) continue;
            const price = Number.isFinite(player.price) ? player.price : 0;
            if (spent + price + (slotsLeft() - 1) * cheapest > budget + 1e-9) continue;
            lineup.push(player);
            spent += price;
        }
    }
    const captain = lineup.length ? lineup[Math.floor(random() * lineup.length)].id : null;
    const picks = {};
    for (const game of day.games) {
        if (random() < 0.75) picks[game.gamePk] = random() < 0.5 ? game.away.id : game.home.id;
    }
    return { user_id: userId, day: day.date, lineup: lineup.map((player) => player.id), captain, picks, saved_at: 0 };
};

/** Filas de fantasy_entries simuladas entre `from` y `to` (solo los últimos 14 días hasta hoy) */
const rows = async (league, { from, to, userId } = {}) => {
    const today = todayOf(league);
    const first = [from, shiftDay(today, -(DAYS - 1))].filter(Boolean).sort().pop();
    const last = [to, today].filter(Boolean).sort()[0];
    const users = userId ? [userId] : FAN_IDS;
    const out = [];
    for (let date = last; date >= first; date = shiftDay(date, -1)) {
        let day;
        try {
            day = await fans.cachedDay(league, date);
        } catch {
            continue;
        }
        if (!day.games.length) continue;
        for (const user of users) {
            const entry = entryFor(user, day);
            if (entry) out.push(entry);
        }
    }
    return out;
};

module.exports = { rows, profile, entryFor, FAN_IDS, uuidOf };
