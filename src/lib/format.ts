// Fechas y horas en la zona de la liga (RD por defecto), en el idioma activo.

export const DEFAULT_TZ = 'America/Santo_Domingo';

export const localeFor = (lang: string) => (lang.startsWith('en') ? 'en-US' : 'es-DO');

/** 'YYYY-MM-DD' del instante dado en la zona indicada */
export const dayKey = (value: string | number | Date, timeZone = DEFAULT_TZ) =>
    new Date(value).toLocaleDateString('en-CA', { timeZone });

export const todayKey = (timeZone = DEFAULT_TZ) => dayKey(Date.now(), timeZone);

/** Días entre start y end (incluidos), en formato 'YYYY-MM-DD' */
export const dayRange = (start: string, end: string) => {
    const days: string[] = [];
    const cursor = new Date(`${start}T12:00:00Z`);
    const last = new Date(`${end}T12:00:00Z`);
    while (cursor <= last) {
        days.push(cursor.toISOString().slice(0, 10));
        cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return days;
};

const noon = (key: string) => new Date(`${key}T12:00:00Z`);

export const formatTime = (value: string, lang: string, timeZone = DEFAULT_TZ) =>
    new Date(value).toLocaleTimeString(localeFor(lang), { hour: 'numeric', minute: '2-digit', timeZone });

export const formatWeekday = (key: string, lang: string) =>
    noon(key).toLocaleDateString(localeFor(lang), { weekday: 'short', timeZone: 'UTC' }).replace('.', '');

export const formatDayNumber = (key: string) => String(noon(key).getUTCDate());

export const formatLongDate = (key: string, lang: string) =>
    noon(key).toLocaleDateString(localeFor(lang), { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

export const formatShortDate = (value: string, lang: string, timeZone = DEFAULT_TZ) =>
    new Date(value).toLocaleDateString(localeFor(lang), { weekday: 'short', day: 'numeric', month: 'short', timeZone });

/** "en 2 h 15 min" / "in 2h 15m" */
export const formatCountdown = (ms: number, lang: string) => {
    const minutes = Math.max(0, Math.round(ms / 60000));
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    const es = !lang.startsWith('en');
    if (hours >= 24) {
        const days = Math.round(hours / 24);
        return es ? `en ${days} ${days === 1 ? 'día' : 'días'}` : `in ${days} ${days === 1 ? 'day' : 'days'}`;
    }
    if (hours > 0) return es ? `en ${hours} h ${rest} min` : `in ${hours}h ${rest}m`;
    return es ? `en ${rest} min` : `in ${rest} min`;
};

/** Temporada de invierno: 2025 → "2025-26" */
export const seasonLabel = (season: number, league: string) => (league === 'lidom' ? `${season}-${String(season + 1).slice(2)}` : String(season));
