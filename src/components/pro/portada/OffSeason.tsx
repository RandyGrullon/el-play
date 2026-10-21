// Fuera de temporada: en vez de «No hay juegos», una cuenta regresiva grande (días, horas y minutos) sobre el
// degradado PRO hasta el inicio que MLB publica. Si MLB todavía no tiene la fecha, se dice tal cual.
import React from 'react';
import { View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import type { LeagueId } from '../../../types';
import type { SeasonOverview } from '../../../types/pro-liga';
import { seasonLabel } from '../../../lib/format';
import { PRO_GRADIENT, PRO_GRADIENT_DIAGONAL, radius } from '../../../theme/tokens';
import { Txt } from '../../ui';
import { countdownParts, pad2, useNow } from '../kit';
import { zonedMidnight } from './logic';
import { dayMonth, upperFirst, weekdayDayMonth } from './shared';

interface OffSeasonProps {
    league: LeagueId;
    leagueName: string;
    shortName: string;
    /** Color de la liga para texto sobre blanco (inkLight: #b45309 en el WBC, 4.5:1 como en el diseño) */
    color: string;
    season?: SeasonOverview | null;
    /** El servidor no da el momento de la temporada (producción sin las rutas PRO): no se sabe la fecha */
    unknown?: boolean;
    timeZone: string;
}

const WHITE = '#ffffff';

export const OffSeason: React.FC<OffSeasonProps> = ({ league, leagueName, shortName, color, season, unknown = false, timeZone }) => {
    const { t, i18n } = useTranslation();
    const { width } = useWindowDimensions();
    const lang = i18n.language;
    const dates = season?.dates ?? null;
    // Lo que viene: el inicio de la temporada o, en la pausa, la postemporada
    const target = season?.stage === 'preseason' ? (dates?.seasonStart ?? null) : season?.stage === 'break' ? (dates?.postStart ?? null) : null;
    const until = season?.stage === 'preseason' ? (dates?.seasonEnd ?? null) : season?.stage === 'break' ? (dates?.postEnd ?? null) : null;
    const now = useNow(target ? 30000 : null);
    const ms = target ? zonedMidnight(target, timeZone) - now : 0;
    const { days, hours, minutes } = countdownParts(Math.max(0, ms));
    const year = target ? target.slice(0, 4) : null;
    // «LIDOM 2027-28» o «Serie del Caribe 2027» (el año en que empieza)
    const title = season?.stage === 'preseason' ? (league === 'lidom' ? `${leagueName} ${seasonLabel(season.season, 'lidom')}` : `${leagueName} ${year ?? season.season}`) : leagueName;
    // Como clamp(38px, 13vw, 52px) de la web; a 320 px los tres cuadros miden ~77 px y «107» no cabría en 38
    const narrow = width < 360;
    const big = narrow ? 34 : Math.min(52, Math.max(38, width * 0.13 - 8));

    return (
        <LinearGradient
            colors={PRO_GRADIENT}
            {...PRO_GRADIENT_DIAGONAL}
            accessibilityLabel={target ? t('pro.portada.off.aria', { name: title }) : t('pro.portada.off.ariaNone', { name: leagueName })}
            style={{ gap: 18, borderRadius: radius.card, paddingHorizontal: 20, paddingVertical: 24 }}
        >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={{ width: 56, height: 56, flexShrink: 0, borderRadius: 28, backgroundColor: WHITE, alignItems: 'center', justifyContent: 'center' }}>
                    <Txt size={shortName.length > 4 ? 13 : 15} weight="black" color={color}>
                        {shortName}
                    </Txt>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Txt size={11} weight="extrabold" color={WHITE} style={{ textTransform: 'uppercase', letterSpacing: 1.4 }}>
                        {season?.stage === 'break' ? t('pro.portada.off.break') : t('pro.portada.off.eyebrow')}
                    </Txt>
                    <Txt size={26} weight="black" color={WHITE} accessibilityRole="header" style={{ lineHeight: 30, letterSpacing: -0.5 }}>
                        {season?.stage === 'break' ? t(league === 'lidom' ? 'pro.portada.off.roundRobin' : 'pro.portada.off.postseason') : title}
                    </Txt>
                </View>
            </View>
            {target ? (
                <>
                    <Txt size={15} weight="semibold" color={WHITE}>
                        {upperFirst(until ? t('pro.portada.off.fromTo', { from: weekdayDayMonth(target, lang), to: dayMonth(until, lang) }) : t('pro.portada.off.from', { from: weekdayDayMonth(target, lang) }))}
                    </Txt>
                    <View accessible accessibilityRole="timer" accessibilityLabel={t('pro.portada.off.timerAria', { days, hours, minutes })} style={{ flexDirection: 'row', gap: 8 }}>
                        {[
                            [String(days), t('pro.portada.off.days', { count: days })],
                            [pad2(hours), t('pro.portada.off.hours', { count: hours })],
                            [pad2(minutes), t('pro.portada.off.minutes', { count: minutes })]
                        ].map(([value, unit]) => (
                            <View key={unit} style={{ flex: 1, flexBasis: 0, minWidth: 0, gap: 2, borderRadius: radius.tile, backgroundColor: 'rgba(255,255,255,0.16)', paddingHorizontal: narrow ? 8 : 10, paddingVertical: 12 }}>
                                <Txt condensed size={big} tabular color={WHITE} numberOfLines={1} style={{ lineHeight: big + 2 }}>
                                    {value}
                                </Txt>
                                <Txt size={narrow ? 10 : 11} weight="extrabold" color={WHITE} numberOfLines={1} style={{ textTransform: 'uppercase', letterSpacing: narrow ? 0.3 : 1 }}>
                                    {unit}
                                </Txt>
                            </View>
                        ))}
                    </View>
                    <Txt size={13} weight="semibold" color={WHITE}>
                        {[season?.regularSeasonGames && season.stage === 'preseason' ? t('pro.portada.off.games', { count: season.regularSeasonGames }) : null, t('pro.portada.off.midnight', { date: dayMonth(target, lang) })].filter(Boolean).join(' · ')}
                    </Txt>
                </>
            ) : (
                <View style={{ gap: 6 }}>
                    {dates?.seasonEnd && season?.stage === 'offseason' && (
                        <Txt size={15} weight="semibold" color={WHITE}>
                            {t(league === 'lidom' ? 'pro.portada.off.ended' : 'pro.portada.off.endedEdition', { season: seasonLabel(season.season, league), date: dayMonth(dates.seasonEnd, lang) })}
                        </Txt>
                    )}
                    <Txt size={13} weight="semibold" color={WHITE}>
                        {unknown ? t('pro.portada.off.noGames') : t(league === 'lidom' ? 'pro.portada.off.noDate' : 'pro.portada.off.noDateEdition')}
                    </Txt>
                </View>
            )}
        </LinearGradient>
    );
};
