import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import type { LeagueId } from '../../../types';
import type { PlayerDetail } from '../../../lib/stats';
import { numOf } from '../../../lib/advanced';
import { todayKey } from '../../../lib/format';
import { fonts, radius } from '../../../theme/tokens';
import type { PlayerPro } from '../../../types/pro-liga';
import { PlayerPhoto, Txt, type LogoTeam } from '../../ui';
import { DrawPath, FadeG, linePath, polylineLength, teamInk, useChartBox, type Point } from '../kit';
import { chronological, ipOf, rollingValues, seasonAge, sumHitting, sumPitching, valueOfGames, windowGames } from '../estadisticas/logic';
import { dateRange, era, heightText, placeText, rate } from './format';

interface FichaHeaderProps {
    id: number;
    name: string;
    /** El equipo que pasó la pantalla (para pintar mientras llega la ficha) */
    team?: LogoTeam | null;
    player?: PlayerDetail;
    pro?: PlayerPro;
    color: string;
    league: LeagueId;
    seasonText: string;
}

// Cabecera de la ficha PRO en el color del equipo: foto, número, nombre, chips de bio (con el debut en MLB y la edad
// en la temporada vista), premios de la liga y su forma reciente (OPS o EFE de los últimos 7 o 15 días).
export const FichaHeader: React.FC<FichaHeaderProps> = ({ id, name, team, player, pro, color, league, seasonText }) => {
    const { t, i18n } = useTranslation();
    const ink = teamInk(color);
    const dark = ink === '#ffffff';
    const number = pro?.number || player?.number || null;
    const side = (code: string | null) => (code ? t(`statsPage.side.${code}`, { defaultValue: code }) : null);
    const age = player ? seasonAge(player.birthDate, player.season, league) : null;
    const debut = pro?.bio.mlbDebut || player?.mlbDebut;
    const chips = player
        ? ([
              player.bats && player.throws ? t('statsPage.batsThrows', { bats: side(player.bats), throws: side(player.throws) }) : null,
              age ? t('pro.ficha.header.age', { age, season: seasonText }) : null,
              debut ? t('pro.ficha.header.debut', { year: debut.slice(0, 4) }) : null,
              placeText(player.birthPlace, i18n.language),
              player.height && player.weight ? `${heightText(player.height)} · ${player.weight} lb` : null,
              pro?.bio.draft?.year ? t('pro.ficha.header.draft', { year: pro.bio.draft.year, round: pro.bio.draft.round ?? '—' }) : null
          ].filter(Boolean) as string[])
        : [];
    const awards = (pro?.awards ?? []).filter((award) => award.season);
    const teamName = player?.team?.name || pro?.team?.name || ' ';
    const teamForPhoto = player?.team ? { id: player.team.id, logo: player.team.logo, color: player.team.color } : team;
    const abbrev = player?.team?.abbrev || pro?.team?.abbrev;

    return (
        <View accessibilityLabel={t('pro.ficha.header.aria', { name })} style={{ borderRadius: 28, padding: 16, overflow: 'hidden', backgroundColor: color }}>
            <LinearGradient colors={['rgba(0,0,0,0)', dark ? 'rgba(0,0,0,0.28)' : 'rgba(0,0,0,0.06)']} locations={[0.4, 1]} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }} />
            {number ? (
                <Txt
                    importantForAccessibility="no"
                    accessibilityElementsHidden
                    color={ink}
                    style={{ position: 'absolute', right: -6, top: -26, fontFamily: fonts.condensed, fontSize: 150, lineHeight: 160, opacity: 0.16 }}
                >
                    {number}
                </Txt>
            ) : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                <PlayerPhoto personId={id} name={name} size={96} background="rgba(255,255,255,0.25)" team={teamForPhoto} />
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Txt size={13} weight="bold" color={ink} style={{ opacity: 0.85 }}>
                        {[number ? `#${number}` : null, player?.pos, abbrev].filter(Boolean).join(' · ') || ' '}
                    </Txt>
                    <Txt size={26} weight="black" color={ink} accessibilityRole="header" style={{ lineHeight: 28, letterSpacing: -0.5 }}>
                        {name || ' '}
                    </Txt>
                    <Txt size={14} weight="semibold" color={ink} numberOfLines={1} style={{ marginTop: 2, opacity: 0.85 }}>
                        {teamName}
                    </Txt>
                </View>
            </View>
            {chips.length > 0 || awards.length > 0 ? (
                <View accessibilityLabel={t('pro.ficha.header.bio')} style={{ marginTop: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {awards.map((award) => (
                        <View key={`${award.id}-${award.season}`} style={{ borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.92)', paddingHorizontal: 10, paddingVertical: 4 }}>
                            <Txt size={12} weight="extrabold" color="#14151a">
                                {t(`pro.ficha.awards.${award.id}`, { defaultValue: award.name, season: award.season })}
                            </Txt>
                        </View>
                    ))}
                    {chips.map((chip) => (
                        <View key={chip} style={{ borderRadius: radius.pill, backgroundColor: 'rgba(0,0,0,0.15)', paddingHorizontal: 10, paddingVertical: 4 }}>
                            <Txt size={12} weight="semibold" color={ink}>
                                {chip}
                            </Txt>
                        </View>
                    ))}
                </View>
            ) : null}
            {player && <RecentForm player={player} seasonText={seasonText} />}
        </View>
    );
};

const WINDOWS = [7, 15] as const;

/** Forma reciente: OPS (o EFE) de los últimos 7 o 15 días contra su temporada, con el promedio móvil de 5 juegos */
const RecentForm: React.FC<{ player: PlayerDetail; seasonText: string }> = ({ player, seasonText }) => {
    const { t, i18n } = useTranslation();
    const [days, setDays] = useState<(typeof WINDOWS)[number]>(15);
    const pitcher = player.role === 'P';
    const history = useMemo(() => chronological(player.log), [player.log]);
    const ongoing = player.season === player.currentSeason;
    // La temporada vigente mira hasta hoy; una pasada, hasta su último juego (el cierre)
    const [today] = useState(() => todayKey());
    const end = ongoing ? today : history[history.length - 1]?.date;
    const games = useMemo(() => (end ? windowGames(history, days, end) : []), [history, days, end]);
    const rolling = useMemo(() => rollingValues(history, games, player.role), [history, games, player.role]);
    if (history.length < 3 || !end) return null;

    const value = games.length ? valueOfGames(games, player.role) : null;
    const season = numOf(pitcher ? player.pitching?.era : player.hitting?.ops);
    const write = pitcher ? era : rate;
    const metric = t(pitcher ? 'pro.ficha.form.era' : 'pro.ficha.form.ops');
    let detail = '';
    if (games.length) {
        if (pitcher) {
            const total = sumPitching(games.map((game) => game.pitching));
            detail = t('pro.ficha.form.detailP', { count: games.length, ip: ipOf(total.outs), season: write(season) });
        } else {
            const total = sumHitting(games.map((game) => game.hitting));
            detail = t('pro.ficha.form.detailB', { count: games.length, h: total.h, ab: total.ab, season: write(season) });
        }
    }
    const delta = value !== null && season !== null ? value - season : null;
    const range = games.length ? dateRange(games[0].date, games[games.length - 1].date, i18n.language) : '';

    return (
        <View style={{ marginTop: 16, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.45)', padding: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Txt size={11} weight="extrabold" color="#fff" style={{ textTransform: 'uppercase', letterSpacing: 1.2, opacity: 0.8 }}>
                        {ongoing ? t('pro.ficha.form.now', { season: seasonText }) : t('pro.ficha.form.close', { season: seasonText })}
                    </Txt>
                    <Txt size={15} weight="extrabold" color="#fff">
                        {t('pro.ficha.form.title', { metric, days })}
                    </Txt>
                </View>
                <View accessibilityRole="radiogroup" accessibilityLabel={t('pro.ficha.form.windowLabel')} style={{ flexDirection: 'row', borderRadius: radius.pill, backgroundColor: 'rgba(0,0,0,0.3)', padding: 2 }}>
                    {WINDOWS.map((option) => (
                        <Pressable
                            key={option}
                            onPress={() => setDays(option)}
                            accessibilityRole="radio"
                            accessibilityState={{ checked: days === option }}
                            accessibilityLabel={t('pro.ficha.form.windowAria', { count: option })}
                            style={{ height: 44, minWidth: 44, borderRadius: radius.pill, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: days === option ? '#fff' : 'transparent' }}
                        >
                            <Txt size={13} weight="bold" color={days === option ? '#14151a' : 'rgba(255,255,255,0.85)'}>
                                {t('pro.ficha.form.days', { count: option })}
                            </Txt>
                        </Pressable>
                    ))}
                </View>
            </View>
            {games.length ? (
                <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'flex-end', gap: 12 }}>
                    <View style={{ flexShrink: 0, maxWidth: '58%' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Txt color="#fff" accessibilityLabel={`${metric} ${write(value)}`} style={{ fontFamily: fonts.condensed, fontSize: 44, lineHeight: 46, fontVariant: ['tabular-nums'] }}>
                                {write(value)}
                            </Txt>
                            {delta !== null && <FixedDelta value={delta} display={pitcher ? Math.abs(delta).toFixed(2) : rate(Math.abs(delta))} better={pitcher ? 'lower' : 'higher'} />}
                        </View>
                        <Txt size={12} weight="semibold" color="#fff" style={{ marginTop: 4, opacity: 0.85 }}>
                            {range}
                        </Txt>
                        <Txt size={12} color="#fff" style={{ opacity: 0.85 }}>
                            {detail}
                        </Txt>
                    </View>
                    <Sparkline values={rolling} season={season} label={t('pro.ficha.form.sparkAria', { metric, list: rolling.map((item) => write(item)).join(', '), season: write(season) })} />
                </View>
            ) : (
                <Txt size={13} color="#fff" style={{ marginTop: 8, opacity: 0.85 }}>
                    {t('pro.ficha.form.empty', { count: days })}
                </Txt>
            )}
            {games.length > 1 && (
                <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={{ marginTop: 6, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <View style={{ width: 12, height: 2, borderRadius: 1, backgroundColor: '#fff' }} />
                        <Txt size={11} weight="semibold" color="#fff" style={{ opacity: 0.85 }}>
                            {t('pro.ficha.form.rolling')}
                        </Txt>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Svg width={12} height={2}>
                            <Line x1={0} x2={12} y1={1} y2={1} stroke="#fff" strokeDasharray="3 2" />
                        </Svg>
                        <Txt size={11} weight="semibold" color="#fff" style={{ opacity: 0.85 }}>
                            {write(season)}
                        </Txt>
                    </View>
                </View>
            )}
        </View>
    );
};

/** Línea del promedio móvil que se traza de izquierda a derecha, con la de la temporada punteada */
const Sparkline: React.FC<{ values: (number | null)[]; season: number | null; label: string }> = ({ values, season, label }) => {
    const { setNode, onLayout, width, seen } = useChartBox(140);
    const height = 64;
    const numbers = values.filter((value): value is number => value !== null && Number.isFinite(value));
    const empty = values.length < 2 || !numbers.length;
    const all = season !== null ? [...numbers, season] : numbers;
    let low = Math.min(...all);
    let high = Math.max(...all);
    if (high - low < 0.05) {
        low -= 0.05;
        high += 0.05;
    }
    const pad = 6;
    const x = (index: number) => pad + (index / Math.max(1, values.length - 1)) * (width - pad * 2);
    const y = (value: number) => pad + (1 - (value - low) / (high - low)) * (height - pad * 2);
    const points = values.map((value, index): Point | null => (value === null || !Number.isFinite(value) ? null : [x(index), y(value)]));
    const last = [...points].reverse().find(Boolean) ?? null;
    return (
        <View ref={setNode} onLayout={onLayout} style={{ flex: 1, minWidth: 0, height }}>
            {!empty && (
                <View accessible accessibilityRole="image" accessibilityLabel={label}>
                    <Svg width={width} height={height}>
                        {season !== null && <Line x1={pad} x2={width - pad} y1={y(season)} y2={y(season)} stroke="#fff" strokeOpacity={0.7} strokeDasharray="3 3" />}
                        <DrawPath d={linePath(points)} length={polylineLength(points)} seen={seen} fill="none" stroke="#fff" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
                        {last && (
                            <FadeG seen={seen} index={12} step={60}>
                                <Circle cx={last[0]} cy={last[1]} r={4} fill="#fff" />
                            </FadeG>
                        )}
                    </Svg>
                </View>
            )}
        </View>
    );
};

/**
 * Variación sobre el color del equipo: colores fijos (no del tema) porque el fondo de la cabecera es siempre el del
 * equipo con un velo oscuro; verde si es para bien, rojo si es para mal. El lector oye «sube .057» o «baja .057».
 */
const FixedDelta: React.FC<{ value: number; display: string; better: 'higher' | 'lower' }> = ({ value, display, better }) => {
    const { t } = useTranslation();
    if (!Number.isFinite(value) || value === 0) return null;
    const up = value > 0;
    const good = up === (better === 'higher');
    const fg = good ? '#166534' : '#b91c1c';
    return (
        <View
            accessible
            accessibilityLabel={t(up ? 'pro.kit.delta.up' : 'pro.kit.delta.down', { value: display })}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: good ? '#dcfce7' : '#fee2e2' }}
        >
            <Svg width={8} height={8} viewBox="0 0 10 10">
                <Path d={up ? 'M5 1 L9.5 8.5 H0.5 Z' : 'M5 9 L9.5 1.5 H0.5 Z'} fill={fg} />
            </Svg>
            <Txt size={12} weight="extrabold" color={fg} tabular>
                {display}
            </Txt>
        </View>
    );
};
