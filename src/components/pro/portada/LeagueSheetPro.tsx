// Hoja de ligas PRO: cada liga con su momento («2 en vivo · 3 hoy», «Regular hasta 16 dic», «Empieza 1 feb 2027 ·
// faltan 107 días», «Terminó el 17 mar 2026») y una chapa roja que late si tiene juegos en vivo. Solo pide datos abierta.
// Si el servidor todavía no da el estado de las ligas, sale el nombre completo de cada una (como en el Lite).
import React from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react-native';
import { formatTime } from '../../../lib/format';
import { useLiveSlate } from '../../../lib/pro/juego';
import { useProSeasons } from '../../../lib/pro/liga';
import { useLeague } from '../../../state/league';
import { useColors } from '../../../theme/theme';
import { alpha, radius, shadow } from '../../../theme/tokens';
import { Sheet, Txt } from '../../ui';
import { LiveDot, readableInk } from '../kit';
import { leagueStatus, type LeagueStatus } from './logic';
import { shortDate, shortDateYear, useInk } from './shared';

const useStatusText = () => {
    const { t, i18n } = useTranslation();
    const lang = i18n.language;
    return (status: LeagueStatus, timeZone: string) => {
        const date = status.date ? (status.stage === 'preseason' || status.stage === 'offseason' ? shortDateYear(status.date, lang) : shortDate(status.date, lang)) : null;
        const parts: string[] = [];
        if (status.stage === 'regular' && date) parts.push(t('pro.portada.leagues.regularUntil', { date }));
        else if (status.stage === 'postseason' && date) parts.push(t('pro.portada.leagues.postUntil', { date }));
        else if (status.stage === 'break' && date) parts.push(t('pro.portada.leagues.postFrom', { date }));
        else if (status.stage === 'preseason' && date) {
            parts.push(t('pro.portada.leagues.startsOn', { date }));
            if (status.daysToStart !== null) parts.push(t('pro.portada.leagues.daysLeft', { count: status.daysToStart }));
        } else if (status.stage === 'offseason' && date) parts.push(t('pro.portada.leagues.ended', { date }));
        if (status.today > 0) parts.push(t('pro.portada.leagues.today', { count: status.today }));
        if (status.firstAt) parts.push(t('pro.portada.leagues.firstAt', { time: formatTime(status.firstAt, lang, timeZone) }));
        return parts.join(' · ');
    };
};

export const LeagueSheetPro: React.FC<{ open: boolean; onClose: () => void; now: number }> = ({ open, onClose, now }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const ink = useInk();
    const { leagues, activeLeague, setActiveLeague } = useLeague();
    const seasons = useProSeasons(open);
    const lidom = useLiveSlate('lidom', open);
    const wbc = useLiveSlate('wbc', open);
    const sdc = useLiveSlate('sdc', open);
    const slates = { lidom: lidom.data, wbc: wbc.data, sdc: sdc.data };
    const statusText = useStatusText();

    return (
        <Sheet open={open} onClose={onClose} title={t('leagues.choose')}>
            <View style={{ gap: 8 }}>
                {leagues.map((league) => {
                    const season = seasons.data?.leagues.find((item) => item.league === league.id);
                    const status = leagueStatus(season, slates[league.id], now);
                    const text = statusText(status, league.timeZone) || t(`leagues.${league.id}.fullName`);
                    const active = league.id === activeLeague;
                    const name = t(`leagues.${league.id}.name`);
                    return (
                        <Pressable
                            key={league.id}
                            onPress={() => {
                                setActiveLeague(league.id);
                                onClose();
                            }}
                            accessibilityRole="button"
                            accessibilityState={{ selected: active }}
                            accessibilityLabel={[name, status.live > 0 ? t('pro.portada.leagues.live', { count: status.live }) : null, text].filter(Boolean).join('. ')}
                            style={({ pressed }) => [{ minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: radius.tile, backgroundColor: colors.surface, padding: 14, opacity: pressed ? 0.85 : 1 }, shadow('card')]}
                        >
                            {/* La sigla en el color de la liga con la tinta que más contrasta (oscura sobre el ámbar del WBC) */}
                            <View style={{ width: 44, height: 44, flexShrink: 0, borderRadius: 22, backgroundColor: league.color, alignItems: 'center', justifyContent: 'center' }}>
                                <Txt size={11} weight="black" color={readableInk(league.color)}>
                                    {league.shortName}
                                </Txt>
                            </View>
                            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 8, rowGap: 4 }}>
                                    <Txt weight="extrabold">{name}</Txt>
                                    {status.live > 0 && (
                                        <View style={{ height: 24, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.pill, backgroundColor: alpha(colors.live, 0.15), paddingHorizontal: 8 }}>
                                            <LiveDot size={6} />
                                            <Txt size={11} weight="extrabold" color={ink.tone('live')}>
                                                {t('pro.portada.leagues.live', { count: status.live })}
                                            </Txt>
                                        </View>
                                    )}
                                </View>
                                <Txt size={14} tone="muted">
                                    {text}
                                </Txt>
                            </View>
                            {active && <Check size={20} color={colors.accentInk} />}
                        </Pressable>
                    );
                })}
            </View>
        </Sheet>
    );
};
