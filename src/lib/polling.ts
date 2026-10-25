import type { GameDetail, Schedule } from '../types';
import { isOnHold } from './baseball';

// Cada cuánto volver a pedir datos según el estado real del juego (status.abstractGameState).
// Nunca devuelve "no actualizar nunca" mientras pueda haber cambios: antes un juego que empezaba en
// más de 30 min dejaba de actualizarse y la pantalla se quedaba en "Programado" hasta recargar.

const SECOND = 1000;
const MINUTE = 60 * SECOND;

const jitter = (ms: number) => ms + Math.floor(Math.random() * Math.min(ms * 0.15, 2 * SECOND));

export function gameInterval(game: GameDetail | undefined, now = Date.now()): number | false {
    if (!game) return 15 * SECOND;
    if (game.state === 'final') return false;
    if (game.state === 'live') return jitter(5 * SECOND);
    if (isOnHold(game, now)) return 10 * MINUTE;
    const startsIn = game.date ? new Date(game.date).getTime() - now : Infinity;
    if (startsIn > 2 * 60 * MINUTE) return 15 * MINUTE;
    if (startsIn > 30 * MINUTE) return 3 * MINUTE;
    if (startsIn > 5 * MINUTE) return jitter(30 * SECOND);
    return jitter(10 * SECOND); // a punto de empezar o con retraso
}

export function scheduleInterval(schedule: Schedule | undefined, now = Date.now()): number {
    if (!schedule) return 30 * SECOND;
    const games = schedule.games;
    if (games.some((game) => game.state === 'live')) return jitter(10 * SECOND);

    const pending = games
        .filter((game) => game.state === 'preview' && !isOnHold(game, now))
        .map((game) => new Date(game.date).getTime() - now);
    // Ya pasó la hora y sigue "Programado" (retraso, calentamiento): mirar seguido
    if (pending.some((startsIn) => startsIn <= 5 * MINUTE)) return jitter(15 * SECOND);
    const next = Math.min(...pending.filter((startsIn) => startsIn > 0));
    if (Number.isFinite(next)) {
        // Despertar unos minutos antes del próximo juego, sin pasar de 10 min entre consultas
        return Math.max(30 * SECOND, Math.min(10 * MINUTE, next - 5 * MINUTE));
    }
    return 30 * MINUTE;
}
