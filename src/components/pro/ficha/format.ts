// Formatos de la ficha PRO: promedios sin el cero, efectividad, fechas cortas y rangos de fechas (como la web).
import { localeFor } from '../../../lib/format';

/** .316 · 1.039 · — */
export const rate = (value: number | null | undefined) => (value === null || value === undefined || !Number.isFinite(value) ? '—' : value.toFixed(3).replace(/^(-?)0(?=\.)/, '$1'));
/** 3.81 · — */
export const era = (value: number | null | undefined) => (value === null || value === undefined || !Number.isFinite(value) ? '—' : value.toFixed(2));
/** 17.2 % (en inglés 17.2%) de una fracción */
export const pct = (value: number | null | undefined, lang: string, digits = 1) =>
    value === null || value === undefined || !Number.isFinite(value) ? '—' : `${(value * 100).toFixed(digits)}${lang.startsWith('en') ? '%' : ' %'}`;

const noon = (day: string) => new Date(`${day.slice(0, 10)}T12:00:00Z`);
// Hermes y la web escriben «dic.» o «dic»: sin el punto
const clean = (text: string) => text.replace(/\./g, '').replace(/ de /g, ' ');

/** «23 dic» */
export const shortDate = (day: string, lang: string) => clean(noon(day).toLocaleDateString(localeFor(lang), { day: 'numeric', month: 'short', timeZone: 'UTC' }));

/** «9–23 dic 2025» o «28 nov – 12 dic 2025» */
export const dateRange = (from: string, to: string, lang: string) => {
    const locale = localeFor(lang);
    const a = noon(from);
    const b = noon(to);
    const year = b.getUTCFullYear();
    const full = (date: Date) => clean(date.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }));
    if (from === to) return full(b);
    if (a.getUTCMonth() === b.getUTCMonth() && a.getUTCFullYear() === year) return lang.startsWith('en') ? `${clean(a.toLocaleDateString(locale, { month: 'short', timeZone: 'UTC' }))} ${a.getUTCDate()}–${b.getUTCDate()}, ${year}` : `${a.getUTCDate()}–${full(b)}`;
    return `${clean(a.toLocaleDateString(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }))} – ${full(b)}`;
};

/** Nombre corto del mes («oct») */
export const monthName = (month: number, lang: string) => clean(new Date(Date.UTC(2020, month - 1, 15)).toLocaleDateString(localeFor(lang), { month: 'short', timeZone: 'UTC' }));

/** «Santo Domingo, Dominican Republic» → «Santo Domingo, RD» en español (MLB manda el país en inglés) */
export const placeText = (place: string | null | undefined, lang: string) => {
    if (!place) return null;
    if (lang.startsWith('en')) return place;
    return place.replace(/Dominican Republic$/, 'RD').replace(/United States$/, 'EE. UU.').replace(/USA$/, 'EE. UU.');
};

/** «6' 0"» → «6′ 0″» */
export const heightText = (height: string | null | undefined) => (height ? height.replace("'", '′').replace('"', '″') : null);
