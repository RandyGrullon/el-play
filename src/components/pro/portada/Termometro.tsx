// Termómetro de la liga: un círculo por equipo en el orden de las posiciones, con el arco del % de ganados (rojo y
// latiendo si juega en vivo), récord, racha y diferencia de carreras. Tocar uno abre su mini panel (últimos 5 y
// próximos 3) y filtra el feed a sus juegos; tocarlo otra vez o cerrar el panel quita el filtro.
import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { Filter, X } from 'lucide-react-native';
import type { CalendarGame, FormGame } from '../../../types/pro-liga';
import { formatTime } from '../../../lib/format';
import { teamDisplayName } from '../../../lib/teams';
import { useColors } from '../../../theme/theme';
import { alpha, radius, shadow } from '../../../theme/tokens';
import { TeamLogo, Txt } from '../../ui';
import { DrawPath, Enter, MOTION_MS, ModuleHeader, arcLength, arcPath, useInView, useMotion, useProColors } from '../kit';
import { dayIn, runDiffOf, winFraction, type ThermoRow } from './logic';
import { StreakChip, ordinal, signed, useDiffColor, weekdayShort } from './shared';

/** Equipo del calendario (logo y sigla de los rivales) */
export interface ThermoTeam {
    id: number;
    abbrev: string;
    logo: string | null;
    color: string | null;
}

interface TermometroProps {
    rows: ThermoRow[];
    /** Equipos que juegan en vivo ahora */
    live: Set<number>;
    selected: number | null;
    onSelect: (teamId: number | null) => void;
    /** Últimos y próximos del equipo elegido (del calendario PRO o, si no hay, del calendario del Lite) */
    formOf: (teamId: number) => { last: FormGame[]; next: CalendarGame[]; complete: boolean } | null;
    teamOf: (teamId: number) => ThermoTeam | undefined;
    today: string;
    timeZone: string;
}

const SIZE = 54;
const STROKE = 3.5;

// Anillo del % de ganados: se dibuja de 0 al % en cascada (40 ms entre equipos); en vivo es rojo y late
const Ring: React.FC<{ fraction: number; color: string; live: boolean; index: number; seen: boolean; size: number }> = ({ fraction, color, live, index, seen, size }) => {
    const colors = useColors();
    const motion = useMotion();
    const beat = useSharedValue(1);
    const pulsing = live && motion.animate;
    useEffect(() => {
        if (!pulsing) {
            beat.set(1);
            return;
        }
        beat.set(withRepeat(withSequence(withTiming(0.35, { duration: 800 }), withTiming(1, { duration: 800 })), -1, false));
        return () => cancelAnimation(beat);
    }, [pulsing, beat]);
    const pulse = useAnimatedStyle(() => ({ opacity: beat.get() }));
    const r = (size - STROKE) / 2;
    const c = size / 2;
    // Arco desde las 12 en sentido de las agujas; en vivo el anillo entero
    const track = arcPath(c, c, r, 0, 360);
    return (
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: 0, width: size, height: size }, pulse]}>
            <Svg width={size} height={size}>
                <Circle cx={c} cy={c} r={r} fill="none" stroke={colors.raised} strokeWidth={STROKE} />
                {live ? (
                    <Circle cx={c} cy={c} r={r} fill="none" stroke={colors.live} strokeWidth={STROKE} />
                ) : fraction > 0 ? (
                    <DrawPath d={track} length={arcLength(r, 360)} share={fraction} seen={seen} index={index} duration={MOTION_MS.count + 200} fill="none" stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
                ) : null}
            </Svg>
        </Animated.View>
    );
};

export const Termometro: React.FC<TermometroProps> = ({ rows, live, selected, onSelect, formOf, teamOf, today, timeZone }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const diffColor = useDiffColor();
    const { setNode, onLayout, seen } = useInView();
    const lang = i18n.language;
    if (!rows.length) return null;
    const chosen = rows.find((row) => row.team.id === selected) ?? null;

    return (
        <View style={{ gap: 12 }}>
            <ModuleHeader title={t('pro.portada.thermo.title')} aside={t('pro.portada.thermo.byRank')} />
            <View ref={setNode} onLayout={onLayout} style={{ flexDirection: 'row', gap: 6 }}>
                {rows.slice(0, 6).map((row, index) => {
                    const diff = runDiffOf(row);
                    const playing = live.has(row.team.id);
                    const active = selected === row.team.id;
                    const name = teamDisplayName(row.team, lang);
                    const record = `${row.wins}-${row.losses}`;
                    return (
                        <Pressable
                            key={row.team.id}
                            onPress={() => onSelect(active ? null : row.team.id)}
                            accessibilityRole="button"
                            accessibilityState={{ selected: active }}
                            accessibilityLabel={t('pro.portada.thermo.aria', {
                                name,
                                rank: ordinal(row.rank, lang),
                                record,
                                streak: row.streak || '—',
                                diff: diff === null ? '—' : signed(diff),
                                live: playing ? t('pro.portada.thermo.liveNow') : ''
                            })}
                            style={({ pressed }) => ({ flex: 1, flexBasis: 0, minWidth: 0, minHeight: 44, alignItems: 'center', gap: 4, opacity: pressed ? 0.8 : 1 })}
                        >
                            <View
                                style={{
                                    width: '100%',
                                    maxWidth: SIZE,
                                    aspectRatio: 1,
                                    borderRadius: SIZE,
                                    // Elegido: un aro de la tinta separado por el fondo (como la web)
                                    borderWidth: 2,
                                    borderColor: active ? colors.ink : 'transparent',
                                    padding: 2
                                }}
                            >
                                <ThermoCircle row={row} live={playing} index={index} seen={seen} />
                            </View>
                            <Txt size={12} weight="extrabold" numberOfLines={1} style={{ letterSpacing: 0.3 }}>
                                {row.team.abbrev}
                            </Txt>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                                <Txt condensed size={14} tabular style={{ lineHeight: 16 }}>
                                    {record}
                                </Txt>
                                <StreakChip code={row.streak} />
                            </View>
                            {diff !== null && (
                                <Txt condensed size={13} tabular center color={diffColor(diff)} style={{ lineHeight: 15 }}>
                                    {t('pro.portada.thermo.diff', { diff: signed(diff) })}
                                </Txt>
                            )}
                        </Pressable>
                    );
                })}
            </View>
            {chosen && <TeamPanel key={chosen.team.id} row={chosen} form={formOf(chosen.team.id)} teamOf={teamOf} today={today} timeZone={timeZone} onClose={() => onSelect(null)} />}
        </View>
    );
};

// El círculo mide lo que le toque en la columna (54 px como mucho): el anillo y el logo se ajustan a ese tamaño
const ThermoCircle: React.FC<{ row: ThermoRow; live: boolean; index: number; seen: boolean }> = ({ row, live, index, seen }) => {
    const colors = useColors();
    const [size, setSize] = useState(0);
    const fraction = winFraction(row.wins, row.losses) ?? 0;
    return (
        <View onLayout={(event) => setSize(Math.round(event.nativeEvent.layout.width))} style={{ flex: 1, aspectRatio: 1 }}>
            {size > 0 && <Ring fraction={fraction} color={row.team.color} live={live} index={index} seen={seen} size={size} />}
            <View style={{ position: 'absolute', left: '13%', right: '13%', top: '13%', bottom: '13%', borderRadius: SIZE, backgroundColor: colors.surface, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
                {size > 0 && <TeamLogo team={row.team} size={Math.round(size * 0.74 * 0.82)} />}
            </View>
        </View>
    );
};

const TeamPanel: React.FC<{
    row: ThermoRow;
    form: { last: FormGame[]; next: CalendarGame[]; complete: boolean } | null;
    teamOf: (teamId: number) => ThermoTeam | undefined;
    today: string;
    timeZone: string;
    onClose: () => void;
}> = ({ row, form, teamOf, today, timeZone, onClose }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const pro = useProColors();
    const lang = i18n.language;
    const name = teamDisplayName(row.team, lang);
    const diff = runDiffOf(row);
    const last = form?.last ?? [];
    const next = form?.next ?? [];
    const latest = last[0];
    const win = t('pro.portada.streak.win');
    const loss = t('pro.portada.streak.loss');
    const summary = [
        ordinal(row.rank, lang),
        `${row.wins}-${row.losses}`,
        row.streak ? t('pro.portada.thermo.streak', { code: `${row.streak.startsWith('W') ? win : loss}${row.streak.slice(1)}` }) : null,
        diff !== null ? t('pro.portada.thermo.runs', { diff: signed(diff) }) : null
    ]
        .filter(Boolean)
        .join(' · ');
    const wins = last.filter((game) => game.isWin).length;
    const eyebrow = (text: string) => (
        <Txt eyebrow accessibilityRole="header">
            {text}
        </Txt>
    );
    return (
        <Enter
            accessibilityLabel={t('pro.portada.thermo.panelAria', { name })}
            style={[{ gap: 12, borderRadius: radius.card, backgroundColor: colors.surface, padding: 14, borderWidth: 1, borderColor: alpha(colors.line, 0.1) }, shadow('float')]}
        >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <TeamLogo team={row.team} size={36} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                        <Txt size={16} weight="extrabold" numberOfLines={1} style={{ letterSpacing: -0.3 }}>
                            {name}
                        </Txt>
                        <Txt size={12} weight="semibold" tone="muted">
                            {summary}
                        </Txt>
                    </View>
                </View>
                <Pressable
                    onPress={onClose}
                    accessibilityRole="button"
                    accessibilityLabel={t('pro.portada.thermo.close')}
                    style={({ pressed }) => ({ width: 44, height: 44, borderRadius: radius.tile, backgroundColor: colors.raised, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}
                >
                    <X size={18} color={colors.ink} />
                </Pressable>
            </View>
            {form && (
                <View style={{ gap: 8 }}>
                    {eyebrow(t('pro.portada.thermo.last5'))}
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
                        <View accessible accessibilityRole="image" accessibilityLabel={t('pro.portada.thermo.last5Aria', { wins, losses: last.length - wins })} style={{ flexDirection: 'row', gap: 6 }}>
                            {last.map((game) => (
                                <View key={game.gamePk} style={{ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: alpha(game.isWin ? pro.up : pro.down, 0.18) }}>
                                    <Txt size={11} weight="extrabold" color={game.isWin ? pro.up : pro.down}>
                                        {game.isWin ? win : loss}
                                    </Txt>
                                </View>
                            ))}
                            {Array.from({ length: Math.max(0, 5 - last.length) }, (_, index) => (
                                <View key={`e${index}`} style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderStyle: 'dashed', borderColor: alpha(colors.line, 0.2) }} />
                            ))}
                        </View>
                        {latest ? (
                            <Txt size={12} weight="semibold" tone="muted" style={{ marginLeft: 6, flexShrink: 1 }}>
                                {`${latest.isWin ? win : loss} ${latest.runs}-${latest.runsAllowed} ${t(latest.isHome ? 'pro.portada.vs' : 'pro.portada.at', { team: teamOf(latest.opponentId)?.abbrev ?? '' })}`}
                                {last.length < 5 && form.complete ? ` · ${t('pro.portada.thermo.played', { count: last.length })}` : ''}
                            </Txt>
                        ) : (
                            <Txt size={12} weight="semibold" tone="muted">
                                {t('pro.portada.thermo.noGames')}
                            </Txt>
                        )}
                    </View>
                </View>
            )}
            {form && (
                <View style={{ gap: 8 }}>
                    {eyebrow(t('pro.portada.thermo.next3'))}
                    {next.length ? (
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                            {next.map((game) => {
                                const home = game.home.id === row.team.id;
                                const rival = teamOf(home ? game.away.id : game.home.id);
                                const day = dayIn(game.date, timeZone);
                                const when = game.startTimeTBD ? t('pro.portada.preview.tbd') : formatTime(game.date, lang, timeZone);
                                const vs = t(home ? 'pro.portada.vs' : 'pro.portada.at', { team: rival?.abbrev ?? '' });
                                const dayText = day === today ? t('games.today') : weekdayShort(day, lang);
                                return (
                                    <View
                                        key={game.gamePk}
                                        accessible
                                        accessibilityLabel={`${dayText}, ${vs}, ${when}`}
                                        style={{ flex: 1, flexBasis: 0, minWidth: 0, alignItems: 'center', gap: 4, borderRadius: radius.tile, backgroundColor: colors.raised, paddingHorizontal: 6, paddingVertical: 10 }}
                                    >
                                        <Txt size={11} weight="extrabold" color={colors.accentInk} numberOfLines={1} style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>
                                            {dayText}
                                        </Txt>
                                        {rival && <TeamLogo team={{ id: rival.id, abbrev: rival.abbrev, logo: rival.logo, color: rival.color }} size={26} />}
                                        <Txt size={13} weight="extrabold" numberOfLines={1}>
                                            {vs}
                                        </Txt>
                                        <Txt size={11} weight="semibold" tone="muted" numberOfLines={1}>
                                            {when}
                                        </Txt>
                                    </View>
                                );
                            })}
                        </View>
                    ) : (
                        <Txt size={12} weight="semibold" tone="muted">
                            {t('pro.portada.thermo.noNext')}
                        </Txt>
                    )}
                </View>
            )}
            {form && !form.complete && (
                <Txt size={12} weight="semibold" tone="muted">
                    {t('pro.portada.thermo.partial')}
                </Txt>
            )}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Filter size={14} color={colors.muted} />
                <Txt size={12} weight="semibold" tone="muted" style={{ flexShrink: 1 }}>
                    {t('pro.portada.thermo.filtered', { team: row.team.abbrev })}
                </Txt>
            </View>
        </Enter>
    );
};
