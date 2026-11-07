const { MLB_API_BASE, LEAGUES } = require('../../config/constants');
const http = require('../http'); // por el módulo: las pruebas sustituyen http.mlbGet
const fantasy = require('../fantasy');
const { cached } = require('../../utils/cache');
const { gameState, uniqueGames } = require('../../utils/transformers');

// Ayudas del fantasy PRO para leer juegos: días en la hora de la liga, el calendario de unos días y, de cada juego, lo
// poco que hace falta del box score (puntos de cada pelotero y quién abrió en la alineación). Un juego terminado ya no
// cambia: lo calculado se guarda un día y el box score completo (~300 KB) no se queda en memoria.

const leagueOf = (leagueKey) => LEAGUES[leagueKey] || LEAGUES.lidom;

const isoDay = (date, timeZone) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
const todayOf = (leagueKey, now = new Date()) => isoDay(now, leagueOf(leagueKey).timeZone);
const shiftDay = (day, days) => new Date(Date.parse(`${day}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
const daysBetween = (from, to) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000);

/** AAAA-MM-DD que existe (2026-13-45 no) */
const realDay = (value) => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const time = Date.parse(`${value}T12:00:00Z`);
    return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
};

// Pospuesto o cancelado: MLB lo da «Final» (codedGameState D o C) aunque no se jugó
const isPlayable = (game) => !/^(Postponed|Cancelled)/i.test(game.status?.detailedState || '') && !['D', 'C'].includes(game.status?.codedGameState);

/** Juegos de la liga entre dos días (sin repetidos ni pospuestos), con las alineaciones publicadas; un minuto en caché */
const scheduleBetween = (leagueKey, startDate, endDate) => {
    const league = leagueOf(leagueKey);
    return cached(
        `pro_schedule_${league.id}_${startDate}_${endDate}`,
        60,
        async () => {
            const data = await http.mlbGet(`${MLB_API_BASE}/schedule`, { sportId: league.sportId, leagueId: league.leagueId, startDate, endDate, hydrate: 'team,linescore,lineups' });
            return uniqueGames((data?.dates || []).flatMap((entry) => entry.games || [])).filter(isPlayable);
        },
        { staleSec: 600 }
    );
};

/**
 * Titulares de un equipo en el box score: los que abrieron en cada turno del orden (battingOrder 100, 200…). La lista
 * del equipo (team.battingOrder) cambia con los emergentes; si el box score no trae el orden de cada uno, se usa esa.
 */
const startersOf = (team) => {
    const opened = Object.values(team?.players || {})
        .filter((player) => player.person?.id && /^\d+$/.test(String(player.battingOrder ?? '')) && Number(player.battingOrder) % 100 === 0)
        .sort((a, b) => Number(a.battingOrder) - Number(b.battingOrder))
        .map((player) => player.person.id);
    if (opened.length) return opened;
    return Array.isArray(team?.battingOrder) ? team.battingOrder.filter(Boolean) : [];
};

/** Lo que el fantasy necesita de un box score: los puntos de cada uno que jugó y las alineaciones */
const linesOfBox = (boxscore, gamePk, withStats = true) => {
    const doc = { liveData: { boxscore } };
    const players = fantasy
        .playersFromFeed(doc, gamePk, withStats)
        .filter((player) => !withStats || player.played)
        .map((player) => ({ id: player.id, name: player.name, teamId: player.teamId, role: player.role, pos: player.pos, points: player.points }));
    const lineups = {};
    for (const side of ['away', 'home']) {
        const list = startersOf(boxscore?.teams?.[side]);
        lineups[side] = list.length ? list : null;
    }
    return { players, lineups, teams: { away: boxscore?.teams?.away?.team?.id ?? null, home: boxscore?.teams?.home?.team?.id ?? null } };
};

/**
 * Puntos y alineaciones de un juego. `state` decide el caché: terminado un día (MLB a veces corrige el box score
 * después, pero el fantasy del día ya lo tomó así), en vivo o por empezar un minuto.
 */
const gameLines = (gamePk, state) =>
    cached(
        `pro_lines_${gamePk}_${state}`,
        state === 'final' ? 86400 : 60,
        async () => {
            const boxscore = await http.mlbGet(`${MLB_API_BASE}/game/${gamePk}/boxscore`);
            if (!boxscore?.teams) throw new Error(`sin box score de ${gamePk}`);
            return linesOfBox(boxscore, gamePk, state !== 'preview');
        },
        { staleSec: state === 'final' ? 86400 : 300 }
    );

/** Igual que gameLines pero null si MLB falla (el que llama marca el resultado como parcial) */
const gameLinesOrNull = async (gamePk, state) => {
    try {
        return await gameLines(gamePk, state);
    } catch (error) {
        console.warn(`[pro] box score ${gamePk}: ${error.message}`);
        return null;
    }
};

/** Corre `task` sobre la lista con `limit` a la vez hasta `deadline` (ms); lo que no alcanza queda sin hacer */
const pool = async (items, limit, task, deadline = Infinity) => {
    const results = new Array(items.length);
    let next = 0;
    let skipped = 0;
    const worker = async () => {
        while (next < items.length) {
            const index = next++;
            if (Date.now() >= deadline) {
                skipped += 1;
                continue;
            }
            results[index] = await task(items[index], index);
        }
    };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return { results, skipped };
};

module.exports = { leagueOf, isoDay, todayOf, shiftDay, daysBetween, realDay, scheduleBetween, startersOf, linesOfBox, gameLines, gameLinesOrNull, pool, gameState };
