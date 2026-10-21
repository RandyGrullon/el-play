import { localeFor } from './format';
import { nationalTeamName } from './nationalTeams';

// Selecciones nacionales (Clásico, Serie del Caribe): MLB manda el nombre en inglés ("Dominican Republic").
// Con la sigla se busca el código de país y el navegador da el nombre en el idioma activo.
const COUNTRY_BY_ABBREV: Record<string, string> = {
    DOM: 'DO', USA: 'US', PUR: 'PR', VEN: 'VE', MEX: 'MX', CUB: 'CU', PAN: 'PA', COL: 'CO', NCA: 'NI', NIC: 'NI',
    CAN: 'CA', JPN: 'JP', KOR: 'KR', TPE: 'TW', CHN: 'CN', AUS: 'AU', NED: 'NL', ITA: 'IT', ISR: 'IL', GBR: 'GB',
    CZE: 'CZ', BRA: 'BR', ESP: 'ES', GER: 'DE', FRA: 'FR', ARG: 'AR', RSA: 'ZA', PHI: 'PH', PAK: 'PK', NZL: 'NZ',
    CUR: 'CW', CRC: 'CR', HON: 'HN', GUA: 'GT', ECU: 'EC', PER: 'PE', CHI: 'CL', URU: 'UY', SLV: 'SV'
};

const displayNames = new Map<string, Intl.DisplayNames | null>();

const regionNames = (lang: string) => {
    const locale = localeFor(lang);
    if (!displayNames.has(locale)) {
        try {
            displayNames.set(locale, new Intl.DisplayNames([locale], { type: 'region' }));
        } catch {
            displayNames.set(locale, null);
        }
    }
    return displayNames.get(locale);
};

/** Nombre a mostrar: el país traducido si es una selección; si no, el nombre del equipo tal cual. */
export const teamDisplayName = (team: { name: string; abbrev: string; flag?: string | null }, lang: string) => {
    const region = team.flag ? COUNTRY_BY_ABBREV[team.abbrev] : undefined;
    if (!region) return team.name;
    // Hermes (el motor de la app en el teléfono) no trae Intl.DisplayNames: ahí van los nombres propios
    return regionNames(lang)?.of(region) || nationalTeamName(team.abbrev, lang) || team.name;
};
