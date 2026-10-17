// Textos de lo nuevo del Fantasy (fanáticos y formas de entrar). No están en src/locales todavía, así que van
// aquí en es/en; si llegan a los JSON con las mismas claves, se usan los de los JSON.
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import i18next from '../../i18n';

const ES = {
    'fans.tab': 'Fanáticos',
    'fans.search': 'Buscar fanático por nombre',
    'fans.clear': 'Borrar búsqueda',
    'fans.minChars': 'Escribe al menos {{n}} letras',
    'fans.results': 'Resultados',
    'fans.noResults': 'No encontramos a nadie con «{{q}}».',
    'fans.noResultsHint': 'Busca por el nombre que cada uno se puso para la tabla.',
    'fans.topSeason': 'Los que más suman en la temporada',
    'fans.rankDetail_one': '#{{rank}} de la temporada · {{count}} día',
    'fans.rankDetail_other': '#{{rank}} de la temporada · {{count}} días',
    'fans.noSeason': 'Sin puntos esta temporada todavía',
    'fans.anonymous': 'Fanático',
    'fans.viewProfile': 'Ver el perfil de {{name}}',
    'fans.days_one': '{{count}} día jugado',
    'fans.days_other': '{{count}} días jugados',
    'fans.emptySeason': 'Todavía nadie suma puntos esta temporada.',
    'fans.emptyLeague': 'Nadie de esta liga suma puntos todavía.',
    'fans.yourRank': 'Vas de #{{rank}} con {{pts}} puntos',
    'fans.seeMore': 'Ver más',
    'fans.updated': 'Actualizada a las {{time}}',
    'fans.partial': 'faltan días por contar',
    'fans.season': 'Temporada',
    'fans.yourProfile': 'Tu perfil',
    'fans.eyebrow': 'Fanático de El Play',
    'fans.rank': '#{{rank}} de la temporada {{season}}',
    'fans.unranked': 'Todavía sin puesto en la temporada',
    'fans.seasonPoints': 'Puntos',
    'fans.daysPlayed': 'Días',
    'fans.bestDay': 'Mejor día',
    'fans.lastDays': 'Últimos {{count}} días',
    'fans.yourTeamToday': 'Tu equipo de hoy',
    'fans.teamToday': 'Su equipo de hoy',
    'fans.pastDays': 'Días anteriores',
    'fans.noPastDaysOwn': 'Todavía no tienes días terminados.',
    'fans.noPastDays': 'Todavía no tiene días terminados.',
    'fans.noTeamTodayOwn': 'Todavía no has armado tu equipo de hoy.',
    'fans.noTeamToday': 'Todavía no ha armado su equipo de hoy.',
    'fans.noTeamDay': 'Ese día no jugó.',
    'fans.hidden': 'Se revela cuando empiece su juego',
    'fans.pts': 'pts',
    'fans.notFound': 'No encontramos ese perfil.',
    'methods.title': 'Formas de entrar',
    'methods.email': 'Correo',
    'methods.active': 'Activa',
    'methods.linkedBadge': 'Vinculada',
    'methods.notLinked': 'Sin vincular',
    'methods.link': 'Vincular',
    'methods.linkGoogle': 'Vincular Google',
    'methods.unlink': 'Desvincular',
    'methods.unlinkConfirm': '¿Desvincular Google? Podrás seguir entrando con el código que llega a tu correo.',
    'methods.unlinkYes': 'Sí, desvincular',
    'methods.unlinked': 'Google quedó desvinculada.',
    'methods.linked': '¡Listo! Google quedó vinculada a tu cuenta.',
    'methods.sameEmail': 'Si entras con Google usando este mismo correo, es la misma cuenta. Vincula Google si tu Gmail es otro.',
    'methods.errors.session_expired': 'Tu sesión venció. Sal y vuelve a entrar.',
    'methods.errors.linking_disabled': 'Todavía no se puede vincular un Google con otro correo. Si tu Google usa este mismo correo, entra con Google y se une solo.',
    'methods.errors.identity_taken': 'Esa cuenta de Google ya está unida a otra cuenta de El Play.',
    'methods.errors.last_identity': 'No puedes quitar tu única forma de entrar.',
    'methods.errors.rate_limit': 'Espera un minuto e intenta de nuevo.',
    'methods.errors.network': 'No hay conexión. Intenta de nuevo.',
    'methods.errors.link_other_account': 'Google volvió con otra cuenta. No cambiamos nada; intenta vincular de nuevo.',
    'methods.errors.unknown': 'Algo salió mal. Intenta de nuevo.',
    'methods.linkFailed': 'No se pudo vincular Google. Intenta de nuevo.',
    googleFailed: 'No se pudo entrar con Google. Intenta de nuevo.'
};

const EN: typeof ES = {
    'fans.tab': 'Fans',
    'fans.search': 'Search fans by name',
    'fans.clear': 'Clear search',
    'fans.minChars': 'Type at least {{n}} letters',
    'fans.results': 'Results',
    'fans.noResults': 'No one found for “{{q}}”.',
    'fans.noResultsHint': 'Search by the name each fan uses in the standings.',
    'fans.topSeason': 'Top of the season',
    'fans.rankDetail_one': '#{{rank}} this season · {{count}} day',
    'fans.rankDetail_other': '#{{rank}} this season · {{count}} days',
    'fans.noSeason': 'No points this season yet',
    'fans.anonymous': 'Fan',
    'fans.viewProfile': "View {{name}}'s profile",
    'fans.days_one': '{{count}} day played',
    'fans.days_other': '{{count}} days played',
    'fans.emptySeason': 'No one has points this season yet.',
    'fans.emptyLeague': 'No one in this league has points yet.',
    'fans.yourRank': "You're #{{rank}} with {{pts}} points",
    'fans.seeMore': 'See more',
    'fans.updated': 'Updated at {{time}}',
    'fans.partial': 'still counting some days',
    'fans.season': 'Season',
    'fans.yourProfile': 'Your profile',
    'fans.eyebrow': 'El Play fan',
    'fans.rank': '#{{rank}} in the {{season}} season',
    'fans.unranked': 'Not ranked this season yet',
    'fans.seasonPoints': 'Points',
    'fans.daysPlayed': 'Days',
    'fans.bestDay': 'Best day',
    'fans.lastDays': 'Last {{count}} days',
    'fans.yourTeamToday': 'Your team today',
    'fans.teamToday': 'Their team today',
    'fans.pastDays': 'Previous days',
    'fans.noPastDaysOwn': "You don't have finished days yet.",
    'fans.noPastDays': 'No finished days yet.',
    'fans.noTeamTodayOwn': "You haven't picked today's team yet.",
    'fans.noTeamToday': "Hasn't picked today's team yet.",
    'fans.noTeamDay': "Didn't play that day.",
    'fans.hidden': 'Revealed when their game starts',
    'fans.pts': 'pts',
    'fans.notFound': "We couldn't find that profile.",
    'methods.title': 'Ways to sign in',
    'methods.email': 'Email',
    'methods.active': 'Active',
    'methods.linkedBadge': 'Linked',
    'methods.notLinked': 'Not linked',
    'methods.link': 'Link',
    'methods.linkGoogle': 'Link Google',
    'methods.unlink': 'Unlink',
    'methods.unlinkConfirm': 'Unlink Google? You can still sign in with the code sent to your email.',
    'methods.unlinkYes': 'Yes, unlink',
    'methods.unlinked': 'Google was unlinked.',
    'methods.linked': 'Done! Google is now linked to your account.',
    'methods.sameEmail': "If you sign in with Google using this same email, it's the same account. Link Google if your Gmail is a different one.",
    'methods.errors.session_expired': 'Your session expired. Sign out and sign in again.',
    'methods.errors.linking_disabled': "Linking a Google account with a different email isn't available yet. If your Google uses this same email, just sign in with Google and it joins automatically.",
    'methods.errors.identity_taken': 'That Google account is already joined to another El Play account.',
    'methods.errors.last_identity': "You can't remove your only way to sign in.",
    'methods.errors.rate_limit': 'Wait a minute and try again.',
    'methods.errors.network': 'No connection. Try again.',
    'methods.errors.link_other_account': 'Google came back with a different account. Nothing changed; try linking again.',
    'methods.errors.unknown': 'Something went wrong. Try again.',
    'methods.linkFailed': "Couldn't link Google. Try again.",
    googleFailed: "Couldn't sign in with Google. Try again."
};

export type TextKey = keyof typeof ES extends infer K ? (K extends `${infer Base}_one` ? Base : K extends `${string}_other` ? never : K) : never;

const fill = (text: string, vars: Record<string, string | number> = {}) => text.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(vars[name] ?? ''));

const translate = (t: TFunction, language: string, key: TextKey, vars: Record<string, string | number> = {}) => {
    const table: Record<string, string> = language.startsWith('en') ? EN : ES;
    const plural = typeof vars.count === 'number' ? `${key}_${vars.count === 1 ? 'one' : 'other'}` : key;
    const local = table[plural] ?? table[key] ?? key;
    const shared = `${key.startsWith('fans.') ? 'fantasy' : 'account'}.${key}`;
    return t(shared, { ...vars, defaultValue: fill(local, vars) });
};

/** `L('fans.days', { count: 3 })`: plural con `count`; si el JSON del idioma ya tiene `fantasy.<clave>` o `account.<clave>`, gana el JSON */
export const useLocalText = () => {
    const { t, i18n } = useTranslation();
    return (key: TextKey, vars: Record<string, string | number> = {}) => translate(t, i18n.language, key, vars);
};

/** Lo mismo fuera de un componente (en el idioma de ese momento) */
export const localText = (key: TextKey, vars: Record<string, string | number> = {}) => translate(i18next.t, i18next.language, key, vars);
