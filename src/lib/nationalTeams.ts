// Nombres de las selecciones nacionales (por la sigla de MLB) en español e inglés.
// Respaldo de teamDisplayName: Hermes, el motor de la app en el teléfono, no trae Intl.DisplayNames
// y sin él quedaría el nombre de MLB en inglés («Dominican Republic»). Son los que da Intl con es-DO / en-US.
const NAMES: Record<string, [es: string, en: string]> = {
    DOM: ['República Dominicana', 'Dominican Republic'],
    USA: ['Estados Unidos', 'United States'],
    PUR: ['Puerto Rico', 'Puerto Rico'],
    VEN: ['Venezuela', 'Venezuela'],
    MEX: ['México', 'Mexico'],
    CUB: ['Cuba', 'Cuba'],
    PAN: ['Panamá', 'Panama'],
    COL: ['Colombia', 'Colombia'],
    NCA: ['Nicaragua', 'Nicaragua'],
    NIC: ['Nicaragua', 'Nicaragua'],
    CAN: ['Canadá', 'Canada'],
    JPN: ['Japón', 'Japan'],
    KOR: ['Corea del Sur', 'South Korea'],
    TPE: ['Taiwán', 'Taiwan'],
    CHN: ['China', 'China'],
    AUS: ['Australia', 'Australia'],
    NED: ['Países Bajos', 'Netherlands'],
    ITA: ['Italia', 'Italy'],
    ISR: ['Israel', 'Israel'],
    GBR: ['Reino Unido', 'United Kingdom'],
    CZE: ['Chequia', 'Czechia'],
    BRA: ['Brasil', 'Brazil'],
    ESP: ['España', 'Spain'],
    GER: ['Alemania', 'Germany'],
    FRA: ['Francia', 'France'],
    ARG: ['Argentina', 'Argentina'],
    RSA: ['Sudáfrica', 'South Africa'],
    PHI: ['Filipinas', 'Philippines'],
    PAK: ['Pakistán', 'Pakistan'],
    NZL: ['Nueva Zelanda', 'New Zealand'],
    CUR: ['Curazao', 'Curaçao'],
    CRC: ['Costa Rica', 'Costa Rica'],
    HON: ['Honduras', 'Honduras'],
    GUA: ['Guatemala', 'Guatemala'],
    ECU: ['Ecuador', 'Ecuador'],
    PER: ['Perú', 'Peru'],
    CHI: ['Chile', 'Chile'],
    URU: ['Uruguay', 'Uruguay'],
    SLV: ['El Salvador', 'El Salvador']
};

/** El país en el idioma de la app; undefined si la sigla no es de una selección conocida (ojo: COL también es Colorado) */
export const nationalTeamName = (abbrev: string, lang: string) => NAMES[abbrev]?.[lang.startsWith('en') ? 1 : 0];
