// Formatos de cifras del PRO: signo, porcentajes, promedios sin el cero, °C y nombres cortos.
// El signo menos es el tipográfico (−), como en el diseño.

const MINUS = '−';

/** «+12.4», «−3», «0» (lo que redondea a cero no lleva signo) */
export const fmtSigned = (value: number, digits = 0) => {
    if (!Number.isFinite(value)) return '—';
    const text = Math.abs(value).toFixed(digits);
    if (Number(text) === 0) return text;
    return `${value > 0 ? '+' : MINUS}${text}`;
};

/** Promedio de bateo sin el cero de delante: .316, 1.039 */
export const fmtAvg = (value: number | null | undefined, digits = 3) =>
    value === null || value === undefined || !Number.isFinite(value) ? '—' : value.toFixed(digits).replace(/^(-?)0(?=\.)/, '$1');

/**
 * Porcentaje. `value` en fracción (0.999) salvo que se diga `fromPercent`.
 * Español: «99.9 %» (con espacio fino, como el diseño); inglés: «99.9%».
 */
export const fmtPercent = (value: number | null | undefined, digits = 1, lang = 'es', fromPercent = false) => {
    if (value === null || value === undefined || !Number.isFinite(value)) return '—';
    const pct = fromPercent ? value : value * 100;
    const text = pct.toFixed(digits);
    return lang.startsWith('en') ? `${text}%` : `${text} %`;
};

/** Grados Fahrenheit (MLB manda «84») a Celsius redondeado; null si no se entiende */
export const toCelsius = (fahrenheit: number | string | null | undefined) => {
    const value = typeof fahrenheit === 'string' ? Number.parseFloat(fahrenheit) : fahrenheit;
    if (value === null || value === undefined || !Number.isFinite(value)) return null;
    return Math.round(((value - 32) * 5) / 9);
};

/** Iniciales para el círculo de un pelotero sin foto: «Estevan Florial» → «EF» */
export const initials = (name: string) =>
    name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0])
        .join('')
        .toUpperCase();

const SUFFIXES = /^(jr\.?|sr\.?|ii|iii|iv)$/i;

/** «Mel Rojas Jr.» → «M. Rojas Jr.»; con `dropSuffix` → «M. Rojas» (el diamante del diseño no lleva «Jr.») */
export const shortName = (name: string, dropSuffix = false) => {
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length < 2) return name;
    let rest = parts.slice(1);
    if (dropSuffix && rest.length > 1 && SUFFIXES.test(rest[rest.length - 1])) rest = rest.slice(0, -1);
    return `${parts[0][0]}. ${rest.join(' ')}`;
};

/** Apellido (con «Jr.» salvo `dropSuffix`): «Mel Rojas Jr.» → «Rojas Jr.» */
export const lastName = (name: string, dropSuffix = false) => {
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length < 2) return name;
    const last = parts[parts.length - 1];
    if (SUFFIXES.test(last) && parts.length > 2) return dropSuffix ? parts[parts.length - 2] : `${parts[parts.length - 2]} ${last}`;
    return last;
};

/**
 * Hora en ms de lo que mande la API: Date, ms, ISO o el timecode de MLB («20261017_030702», en UTC,
 * que es lo que trae GameDetail.updatedAt). NaN si no se entiende.
 */
export const toTime = (value: string | number | Date | null | undefined) => {
    if (value === null || value === undefined || value === '') return NaN;
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'number') return value;
    const code = value.match(/^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})$/);
    if (code) {
        const [, y, mo, d, h, mi, s] = code.map(Number);
        return Date.UTC(y, mo - 1, d, h, mi, s);
    }
    return new Date(value).getTime();
};

export type AgoUnit = 's' | 'min' | 'h' | 'd';

/** Tiempo transcurrido en la unidad que se lee mejor: 7 s, 3 min, 2 h, 1 d */
export const agoParts = (ms: number): { count: number; unit: AgoUnit } => {
    const seconds = Math.max(0, Math.floor(ms / 1000));
    if (seconds < 60) return { count: seconds, unit: 's' };
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return { count: minutes, unit: 'min' };
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return { count: hours, unit: 'h' };
    return { count: Math.floor(hours / 24), unit: 'd' };
};

/** Cuenta regresiva en horas, minutos y segundos (para el reloj de la previa) */
export const countdownParts = (ms: number) => {
    const total = Math.max(0, Math.floor(ms / 1000));
    return { days: Math.floor(total / 86400), hours: Math.floor((total % 86400) / 3600), minutes: Math.floor((total % 3600) / 60), seconds: total % 60 };
};

/** Dos dígitos: 7 → «07» */
export const pad2 = (value: number) => String(Math.max(0, Math.floor(value))).padStart(2, '0');
