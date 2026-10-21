// Ayudas del Fantasy compartidas por sus pestañas: textos cortos del pelotero, estado del juego, créditos, días y la ficha.
import React, { useCallback } from 'react';
import { Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { Info } from 'lucide-react-native';
import { inningName } from '../../lib/baseball';
import { formatTime } from '../../lib/format';
import type { FantasyDay, FantasyPlayer } from '../../lib/fantasy';
import { useColors } from '../../theme/theme';
import { Txt, type LogoTeam } from '../ui';

const DAY_MS = 86400000;

/** 'YYYY-MM-DD' movido `days` días */
export const shift = (day: string, days: number) => new Date(Date.parse(`${day}T12:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

/** «2-4, 1 HR, 2 CI» o «6 IP, 7 K, 1 CL» */
export const lineText = (player: FantasyPlayer, t: TFunction) => {
    const line = player.line;
    if (!line || !player.played) return null;
    if (player.role === 'P') return t('fantasy.pitchLine', { ip: line.ip, k: line.k, er: line.er });
    const extras = [Number(line.hr) ? `${line.hr} HR` : '', Number(line.d) ? `${line.d} 2B` : '', Number(line.t) ? `${line.t} 3B` : '', Number(line.rbi) ? `${line.rbi} CI` : '', Number(line.sb) ? `${line.sb} BR` : '']
        .filter(Boolean)
        .join(', ');
    return `${line.h}-${line.ab}${extras ? `, ${extras}` : ''}`;
};

/** «Final», «▲ 7» o la hora del juego */
export const gameStatus = (day: FantasyDay, gamePk: number, lang: string, t: TFunction) => {
    const game = day.games.find((g) => g.gamePk === gamePk);
    if (!game) return '';
    if (game.state === 'final') return t('fantasy.final');
    if (game.state === 'live' && game.live) return inningName({ n: game.live.inning, isTop: game.live.isTop, state: game.live.inningState }, lang, true);
    return formatTime(game.date, lang);
};

const creditFormats = new Map<string, Intl.NumberFormat>();

/** Créditos con la coma o el punto del idioma (8,5 / 8.5), como la web: con el idioma de la app, no con el locale de fechas */
export const formatCredits = (value: number, lang: string) => {
    try {
        let format = creditFormats.get(lang);
        if (!format) {
            format = new Intl.NumberFormat(lang, { maximumFractionDigits: 1 });
            creditFormats.set(lang, format);
        }
        return format.format(value);
    } catch {
        // Sin Intl.NumberFormat para ese idioma: el mismo redondeo y el separador a mano
        const text = String(Math.round(value * 10) / 10);
        return lang.startsWith('en') ? text : text.replace('.', ',');
    }
};

export const teamOf = (day: FantasyDay | undefined, player: FantasyPlayer): LogoTeam | null => {
    const team = day?.teams[player.teamId];
    return team ? { id: team.id, abbrev: team.abbrev, logo: team.logo, color: team.color } : null;
};

/** Abre la ficha del pelotero (la pantalla /jugador/[id]) */
export const useOpenPlayer = () => {
    const router = useRouter();
    return useCallback((id: number) => router.push(`/jugador/${id}`), [router]);
};

/** «Cómo se cuentan los puntos» (abre o cierra la tabla de puntos) */
export const RulesToggle: React.FC<{ open: boolean; onToggle: () => void }> = ({ open, onToggle }) => {
    const { t } = useTranslation();
    const colors = useColors();
    return (
        <Pressable onPress={onToggle} accessibilityRole="button" accessibilityState={{ expanded: open }} hitSlop={6} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start' }}>
            <Info size={16} color={colors.accentInk} />
            <Txt size={14} weight="semibold" tone="accentInk">
                {t('fantasy.howPoints')}
            </Txt>
        </Pressable>
    );
};
