// Datos y fechas de Posiciones PRO. Las posiciones PRO (/api/v2/pro/standings) todavía no están en producción: si la
// ruta no existe se usan las del Lite (/api/v2/standings), con la misma llave de caché que la pantalla del Lite.
import { useQuery } from '@tanstack/react-query';
import type { LeagueId, Standings } from '../../../types';
import { api, ApiError } from '../../../lib/api';
import { keys } from '../../../lib/queries';
import { formatDayNumber, formatLongDate, formatWeekday, localeFor } from '../../../lib/format';

const MINUTE = 60 * 1000;

const retry = (failureCount: number, error: Error) => {
    if (error instanceof ApiError && [400, 404].includes(error.status)) return false;
    return failureCount < 2;
};

/** Las posiciones del Lite (solo cuando hacen falta: `enabled`), con las mismas opciones que useStandings */
export const useLiteStandings = (league: LeagueId, enabled: boolean) =>
    useQuery<Standings>({
        queryKey: keys.standings(league),
        queryFn: ({ signal }) => api.standings(league, signal),
        enabled,
        staleTime: 5 * MINUTE,
        refetchInterval: enabled ? 10 * MINUTE : false,
        retry
    });

/** «vie 16» */
export const shortDay = (day: string, lang: string) => `${formatWeekday(day, lang)} ${formatDayNumber(day)}`;

/** «viernes, 16 de octubre» → «viernes 16 de octubre» */
export const longDay = (day: string, lang: string) => formatLongDate(day, lang).replace(',', '');

const dayMonth = (day: string, lang: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString(localeFor(lang), { day: 'numeric', month: 'long', timeZone: 'UTC' });

/** «17 al 24 de octubre»: el mes una sola vez si es el mismo (en español) */
export const dayRangeText = (from: string, to: string, lang: string) =>
    from.slice(0, 7) === to.slice(0, 7) && !lang.startsWith('en') ? { from: formatDayNumber(from), to: dayMonth(to, lang) } : { from: dayMonth(from, lang), to: dayMonth(to, lang) };
