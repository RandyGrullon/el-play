// Piezas comunes de la portada PRO: fechas cortas, ordinal, racha, flecha de enlace, foto con logo y los grises y
// tonos de texto reforzados para que pasen 4.5:1 sobre `raised` y sobre las chapas suaves en los dos temas.
import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react-native';
import { localeFor } from '../../../lib/format';
import { teamDisplayName } from '../../../lib/teams';
import type { PortadaPerformer } from '../../../lib/pro/pantallas';
import { useColors } from '../../../theme/theme';
import { alpha, radius } from '../../../theme/tokens';
import { PlayerPhoto, TeamLogo, Txt } from '../../ui';
import { fmtSigned, mix, useProColors } from '../kit';
import { lineParts, parseStreak, type LinePart } from './logic';

const noon = (key: string) => new Date(`${key}T12:00:00Z`);

/** «18 dic» / «Dec 18» */
export const shortDate = (key: string, lang: string) => noon(key).toLocaleDateString(localeFor(lang), { day: 'numeric', month: 'short', timeZone: 'UTC' }).replace('.', '');

/** «1 feb 2027» / «Feb 1, 2027» */
export const shortDateYear = (key: string, lang: string) =>
    noon(key)
        .toLocaleDateString(localeFor(lang), { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
        .replace('.', '')
        .replace(/ de (\d{4})$/, ' $1');

/** Nombre corto de un equipo: en LIDOM la primera palabra («Águilas», «Toros»); selecciones y otras ligas, el nombre */
export const teamShort = (team: { name: string; abbrev: string; flag?: string | null }, league: string, lang: string) =>
    team.flag || league !== 'lidom' ? teamDisplayName(team, lang) : team.name.split(/\s+/)[0] || team.name;

/** «1 de febrero» / «February 1» */
export const dayMonth = (key: string, lang: string) => noon(key).toLocaleDateString(localeFor(lang), { day: 'numeric', month: 'long', timeZone: 'UTC' });

/** «lunes 1 de febrero» / «Monday, February 1» */
export const weekdayDayMonth = (key: string, lang: string) => {
    const text = noon(key).toLocaleDateString(localeFor(lang), { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
    return lang.startsWith('en') ? text : text.replace(',', '');
};

/** «sábado 17» / «Saturday 17» (para los encabezados de sección) */
export const weekdayDay = (key: string, lang: string) => `${noon(key).toLocaleDateString(localeFor(lang), { weekday: 'long', timeZone: 'UTC' })} ${noon(key).getUTCDate()}`;

/** «Dom 18» (chips y próximos juegos) */
export const weekdayShort = (key: string, lang: string) => {
    const text = noon(key).toLocaleDateString(localeFor(lang), { weekday: 'short', timeZone: 'UTC' }).replace('.', '');
    return `${text.charAt(0).toUpperCase()}${text.slice(1)} ${noon(key).getUTCDate()}`;
};

/** La primera letra en mayúscula */
export const upperFirst = (text: string) => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;

/** 1.º / 1st */
export const ordinal = (n: number, lang: string) => {
    if (!lang.startsWith('en')) return `${n}.º`;
    const tens = n % 100;
    const suffix = tens >= 11 && tens <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
    return `${n}${suffix}`;
};

/** «+11» / «−3» con el menos tipográfico; 0 sin signo */
export const signed = (n: number) => (n === 0 ? '0' : fmtSigned(n));

export type TextTone = 'up' | 'down' | 'warn' | 'live' | 'inplay';

/**
 * Colores de texto chico legibles en los dos temas: el gris y los tonos pasan 4.5:1 sobre `surface`, pero no siempre
 * sobre `raised` ni sobre su chapa al 16 %. Mezclados con la tinta del tema salen un poco más oscuros en claro y un poco
 * más claros en oscuro (como MUTED_STRONG y toneText de la web).
 */
export const useInk = () => {
    const colors = useColors();
    const pro = useProColors();
    const base: Record<TextTone, string> = { up: pro.up, down: pro.down, warn: pro.warn, live: pro.live, inplay: colors.inplay };
    return {
        /** Gris sobre `raised` o sobre el acento suave */
        mutedStrong: mix(colors.muted, colors.ink, 0.2),
        /** Texto en un tono para chapas y cifras chicas */
        tone: (tone: TextTone) => mix(base[tone], colors.ink, 0.25)
    };
};

/** «G1» / «P2» (W/L en inglés); null si MLB no manda racha */
export const streakText = (code: string | null | undefined, t: (key: string) => string) => {
    const streak = parseStreak(code);
    return streak ? `${streak.win ? t('pro.portada.streak.win') : t('pro.portada.streak.loss')}${streak.count}` : null;
};

/** Racha «G1» / «P2» (W/L en inglés) en una pastilla verde o roja */
export const StreakChip: React.FC<{ code: string | null | undefined; style?: StyleProp<ViewStyle> }> = ({ code, style }) => {
    const { t } = useTranslation();
    const pro = useProColors();
    const ink = useInk();
    const streak = parseStreak(code);
    const text = streakText(code, t);
    if (!streak || !text) return null;
    return (
        <View
            accessible
            accessibilityLabel={t(streak.win ? 'pro.portada.streak.winLong' : 'pro.portada.streak.lossLong', { count: streak.count })}
            style={[{ flexShrink: 0, borderRadius: radius.pill, paddingHorizontal: 5, backgroundColor: alpha(streak.win ? pro.up : pro.down, 0.16) }, style]}
        >
            <Txt size={10} weight="extrabold" color={ink.tone(streak.win ? 'up' : 'down')} style={{ lineHeight: 14 }}>
                {text}
            </Txt>
        </View>
    );
};

/** Color de una diferencia de carreras */
export const useDiffColor = () => {
    const colors = useColors();
    const pro = useProColors();
    return (n: number | null) => (n === null || n === 0 ? colors.muted : n > 0 ? pro.up : pro.down);
};

/** «Ver juego ›» en el color de acento (lo de adentro de un Pressable de 44 px) */
export const MoreLink: React.FC<{ children: string }> = ({ children }) => {
    const colors = useColors();
    return (
        <View style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 2 }}>
            <Txt size={13} weight="extrabold" color={colors.accentInk} numberOfLines={1}>
                {children}
            </Txt>
            <ChevronRight size={16} color={colors.accentInk} />
        </View>
    );
};

/** Escribe la línea del pelotero en el idioma activo: «3-4 · HR · 2B · 3 CI · BB», «5.0 IP · 3 H · 1 CL · 9 K» */
export const useLineText = () => {
    const { t } = useTranslation();
    return (source: LinePart[] | Pick<PortadaPerformer, 'hitting' | 'pitching'>) => {
        const parts = Array.isArray(source) ? source : lineParts(source);
        return parts.map((part) => t(`pro.portada.line.${part.key}`, { count: part.count, value: part.value ?? String(part.count) })).join(' · ');
    };
};

interface TeamRef {
    id: number;
    abbrev: string;
    logo: string;
    color: string;
}

/** Foto del pelotero en círculo con el logo chico de su equipo abajo a la derecha (tarjetas compactas) */
export const PhotoWithLogo: React.FC<{ id: number | null | undefined; name: string; team: TeamRef | null | undefined; size: number; logo?: number; ring?: string }> = ({ id, name, team, size, logo = 14, ring }) => {
    const colors = useColors();
    return (
        <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={{ width: size, height: size }}>
            {/* Sin foto salen las iniciales; la foto va sobre blanco, legible en los dos temas y sobre cualquier color de equipo */}
            <PlayerPhoto personId={id} name={name} size={size} team={team ? { id: team.id, color: team.color } : null} background="#ffffff" />
            {team && (
                <View
                    style={{
                        position: 'absolute',
                        right: -3,
                        bottom: -3,
                        width: logo + 4,
                        height: logo + 4,
                        borderRadius: (logo + 4) / 2,
                        backgroundColor: '#ffffff',
                        borderWidth: 2,
                        borderColor: ring ?? colors.raised,
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}
                >
                    <TeamLogo team={team} size={logo - 2} />
                </View>
            )}
        </View>
    );
};
