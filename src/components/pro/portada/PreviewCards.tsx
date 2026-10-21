// Tarjetas PRO de los juegos por empezar: la «cara a cara» (la primera del día: récord, posición, racha, últimos 10,
// gira y casa, carreras por juego, pitagórico, último juego, abridores, serie particular y cuenta regresiva) y la
// compacta (récord, diferencia y racha de los dos). Datos: posiciones (PRO o las del Lite) y la forma de cada equipo.
import React from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Bell, BellRing } from 'lucide-react-native';
import type { ScheduleGame, ScheduleTeam, StandingRow } from '../../../types';
import type { FormGame } from '../../../types/pro-liga';
import { formatTime } from '../../../lib/format';
import { isNotPlayed, stateName } from '../../../lib/baseball';
import { pythagorean } from '../../../lib/advanced';
import { useGame, usePrefetchGame } from '../../../lib/queries';
import { teamDisplayName } from '../../../lib/teams';
import { usePreferences } from '../../../state/preferences';
import { useColors } from '../../../theme/theme';
import { alpha, radius, shadow } from '../../../theme/tokens';
import { TeamLogo, Txt } from '../../ui';
import { useAlertToggle } from '../../feed/alerts';
import { GrowBar, ProNote, countdownParts, fmtAvg, pad2, useInView, useNow, useProColors } from '../kit';
import { runDiffOf, shiftDay, teamFill, type ThermoRow } from './logic';
import { MoreLink, StreakChip, ordinal, signed, streakText, teamShort, useDiffColor, useInk } from './shared';

export type RowsById = Map<number, ThermoRow>;

/** Forma de un equipo (del calendario PRO o, si no hay, de la semana del Lite) */
export type LastOf = (teamId: number) => FormGame | undefined;

interface PreviewProps {
    game: ScheduleGame;
    rows: RowsById;
    timeZone: string;
}

interface PreviewFullProps extends PreviewProps {
    today: string;
    /** «2026-27» */
    season: string;
    lastOf: LastOf;
    /** Serie particular de la temporada; null si no se puede saber */
    h2h: { aWins: number; bWins: number; played: number } | null;
    abbrevOf: (teamId: number) => string;
}

/** Botón «Avisarme»: completo (con texto) o solo campana de 44 px */
export const AlertButton: React.FC<{ game: ScheduleGame; compact?: boolean }> = ({ game, compact = false }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const pro = useProColors();
    const ink = useInk();
    const { subscribedGames } = usePreferences();
    const toggle = useAlertToggle();
    if (game.state !== 'preview' || isNotPlayed(game.detailedState)) return null;
    const on = subscribedGames.includes(game.gamePk);
    const Icon = on ? BellRing : Bell;
    const label = t('pro.portada.preview.alertFor', { away: teamDisplayName(game.away, i18n.language), home: teamDisplayName(game.home, i18n.language) });
    const color = on ? ink.tone('up') : compact ? colors.ink : colors.bg;
    const background = on ? alpha(pro.up, 0.18) : compact ? colors.raised : colors.ink;
    return (
        <Pressable
            onPress={() => {
                toggle(game).catch(() => undefined);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={label}
            style={({ pressed }) => ({
                height: 44,
                minWidth: 44,
                flexShrink: 0,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 7,
                borderRadius: radius.pill,
                paddingHorizontal: compact ? 0 : 16,
                backgroundColor: background,
                opacity: pressed ? 0.85 : 1
            })}
        >
            <Icon size={18} color={color} />
            {!compact && (
                <Txt size={14} weight="extrabold" color={color} numberOfLines={1}>
                    {on ? t('pro.portada.preview.alertOn') : t('pro.portada.preview.alert')}
                </Txt>
            )}
        </Pressable>
    );
};

const TimePill: React.FC<{ game: ScheduleGame; timeZone: string }> = ({ game, timeZone }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const ink = useInk();
    const notPlayed = isNotPlayed(game.detailedState);
    return (
        <View style={{ height: 30, flexShrink: 0, justifyContent: 'center', borderRadius: radius.pill, paddingHorizontal: 12, backgroundColor: notPlayed ? alpha(colors.live, 0.15) : colors.raised }}>
            <Txt size={13} weight="extrabold" color={notPlayed ? ink.tone('live') : colors.ink} numberOfLines={1}>
                {notPlayed ? stateName(game.detailedState, i18n.language) : game.startTimeTBD ? t('pro.portada.preview.tbd') : formatTime(game.date, i18n.language, timeZone)}
            </Txt>
        </View>
    );
};

// Cuenta regresiva por segundo hasta la hora del juego (H:MM:SS; con días, «2 d 4 h»)
const Countdown: React.FC<{ date: string }> = ({ date }) => {
    const { t } = useTranslation();
    const pro = useProColors();
    const now = useNow(1000);
    const ms = Date.parse(date) - now;
    if (!Number.isFinite(ms)) return null;
    if (ms <= 0) {
        return (
            <Txt size={14} weight="extrabold" color={pro.live}>
                {t('pro.portada.preview.aboutToStart')}
            </Txt>
        );
    }
    const { days, hours, minutes, seconds } = countdownParts(ms);
    const text = days > 0 ? t('pro.portada.preview.daysHours', { days, hours }) : `${hours}:${pad2(minutes)}:${pad2(seconds)}`;
    return (
        // El lector oye horas y minutos (no cada segundo)
        <View accessible accessibilityRole="timer" accessibilityLabel={t('pro.portada.preview.startsInAria', { hours: hours + days * 24, minutes })}>
            <Txt condensed size={36} tabular style={{ lineHeight: 38 }}>
                {text}
            </Txt>
        </View>
    );
};

interface MirrorProps {
    label: string;
    /** Lo que oye el lector: «Récord: Gigantes 1-0, Tigres 1-0» */
    aria: string;
    left: React.ReactNode;
    right: React.ReactNode;
    bars?: { left: number; right: number; leftColor: string; rightColor: string };
}

/** Valor en Barlow 17 px; con texto chico al lado («gira», «1-0») */
const Value: React.FC<{ children: React.ReactNode; small?: string; smallFirst?: boolean; align: 'left' | 'right' }> = ({ children, small, smallFirst = false, align }) => {
    const parts = [
        <Txt key="v" condensed size={17} tabular>
            {children}
        </Txt>,
        small ? (
            <Txt key="s" size={12} weight="semibold" tone="muted">
                {small}
            </Txt>
        ) : null
    ];
    return <View style={{ flexShrink: 1, minWidth: 0, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: align === 'right' ? 'flex-end' : 'flex-start', columnGap: 4 }}>{smallFirst ? parts.reverse() : parts}</View>;
};

// Fila en espejo: valor del visitante, qué se compara, valor del local; las barras crecen desde el centro
const Mirror: React.FC<MirrorProps & { index: number; seen: boolean }> = ({ label, aria, left, right, bars, index, seen }) => {
    const colors = useColors();
    return (
        <View accessible accessibilityLabel={aria} style={{ minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: alpha(colors.line, 0.1) }}>
            <View style={{ flex: 1, flexBasis: 0, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {left}
                {bars && <GrowBar value={bars.left} color={bars.leftColor} origin="right" index={index} seen={seen} style={{ flex: 1, minWidth: 8 }} />}
            </View>
            <Txt size={10.5} weight="extrabold" tone="muted" center style={{ width: 92, textTransform: 'uppercase', letterSpacing: 0.3, lineHeight: 13 }}>
                {label}
            </Txt>
            <View style={{ flex: 1, flexBasis: 0, minWidth: 0, flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
                {right}
                {bars && <GrowBar value={bars.right} color={bars.rightColor} origin="left" index={index} seen={seen} style={{ flex: 1, minWidth: 8 }} />}
            </View>
        </View>
    );
};

const record = (row: StandingRow | undefined, team: ScheduleTeam) => (row ? `${row.wins}-${row.losses}` : team.record ? `${team.record.wins}-${team.record.losses}` : '—');

/** Tarjeta cara a cara del primer juego por empezar */
export const PreviewCardFull: React.FC<PreviewFullProps> = ({ game, rows, timeZone, today, season, lastOf, h2h, abbrevOf }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const prefetch = usePrefetchGame();
    const { setNode, onLayout, seen } = useInView();
    const lang = i18n.language;
    const away = rows.get(game.away.id);
    const home = rows.get(game.home.id);
    const awayName = teamDisplayName(game.away, lang);
    const homeName = teamDisplayName(game.home, lang);
    const name = (team: ScheduleTeam) => teamShort(team, game.league, lang);
    const both = (label: string, a: string, b: string) => `${label}: ${awayName} ${a}, ${homeName} ${b}`;
    const perGame = (value: number | null | undefined, row?: StandingRow) => (row && typeof value === 'number' && row.gamesPlayed > 0 ? value / row.gamesPlayed : null);
    const rsA = perGame(away?.runsScored, away);
    const rsH = perGame(home?.runsScored, home);
    const raA = perGame(away?.runsAllowed, away);
    const raH = perGame(home?.runsAllowed, home);
    const pyA = away ? pythagorean(away.runsScored, away.runsAllowed, away.gamesPlayed) : null;
    const pyH = home ? pythagorean(home.runsScored, home.runsAllowed, home.gamesPlayed) : null;
    const lastA = lastOf(game.away.id);
    const lastH = lastOf(game.home.id);
    const win = t('pro.portada.streak.win');
    const loss = t('pro.portada.streak.loss');
    const lastScore = (form: FormGame) => `${form.isWin ? win : loss} ${form.runs}-${form.runsAllowed}`;
    const lastWhere = (form: FormGame) => t(form.isHome ? 'pro.portada.vs' : 'pro.portada.at', { team: abbrevOf(form.opponentId) });
    const yesterday = shiftDay(today, -1);
    const lastLabel = lastA?.day === yesterday && lastH?.day === yesterday ? t('pro.portada.preview.yesterday') : t('pro.portada.preview.lastGame');
    const max = (a: number | null, b: number | null) => Math.max(a ?? 0, b ?? 0) || 1;
    const teamColors = { leftColor: game.away.color, rightColor: game.home.color };
    const streakA = away?.streak ? streakText(away.streak, t) : null;
    const streakH = home?.streak ? streakText(home.streak, t) : null;

    const candidates: (MirrorProps | null)[] = [
        (() => {
            const label = t('pro.portada.preview.record');
            const a = record(away, game.away);
            const b = record(home, game.home);
            return { label, aria: both(label, a, b), left: <Value align="left">{a}</Value>, right: <Value align="right">{b}</Value> };
        })(),
        away && home
            ? (() => {
                  const label = t('pro.portada.preview.position');
                  const a = ordinal(away.rank, lang);
                  const b = ordinal(home.rank, lang);
                  return { label, aria: both(label, a, b), left: <Value align="left">{a}</Value>, right: <Value align="right">{b}</Value> };
              })()
            : null,
        streakA || streakH
            ? (() => {
                  const label = t('pro.portada.preview.streak');
                  return { label, aria: both(label, streakA ?? '—', streakH ?? '—'), left: away?.streak ? <StreakChip code={away.streak} /> : <Value align="left">—</Value>, right: home?.streak ? <StreakChip code={home.streak} /> : <Value align="right">—</Value> };
              })()
            : null,
        away?.lastTen || home?.lastTen
            ? (() => {
                  const label = t('pro.portada.preview.lastTen');
                  const a = away?.lastTen ? `${away.lastTen.wins}-${away.lastTen.losses}` : '—';
                  const b = home?.lastTen ? `${home.lastTen.wins}-${home.lastTen.losses}` : '—';
                  return { label, aria: both(label, a, b), left: <Value align="left">{a}</Value>, right: <Value align="right">{b}</Value> };
              })()
            : null,
        away?.away || home?.home
            ? (() => {
                  const label = t('pro.portada.preview.awayHome');
                  const a = away?.away ? `${away.away.wins}-${away.away.losses}` : '—';
                  const b = home?.home ? `${home.home.wins}-${home.home.losses}` : '—';
                  return {
                      label,
                      aria: both(label, `${a} ${t('pro.portada.preview.road')}`, `${b} ${t('pro.portada.preview.home')}`),
                      left: (
                          <Value align="left" small={away?.away ? t('pro.portada.preview.road') : undefined}>
                              {a}
                          </Value>
                      ),
                      right: (
                          <Value align="right" small={home?.home ? t('pro.portada.preview.home') : undefined} smallFirst>
                              {b}
                          </Value>
                      )
                  };
              })()
            : null,
        rsA !== null && rsH !== null
            ? (() => {
                  const label = t('pro.portada.preview.runsFor');
                  return { label, aria: both(label, rsA.toFixed(1), rsH.toFixed(1)), left: <Value align="left">{rsA.toFixed(1)}</Value>, right: <Value align="right">{rsH.toFixed(1)}</Value>, bars: { left: rsA / max(rsA, rsH), right: rsH / max(rsA, rsH), ...teamColors } };
              })()
            : null,
        raA !== null && raH !== null
            ? (() => {
                  const label = t('pro.portada.preview.runsAgainst');
                  return { label, aria: both(label, raA.toFixed(1), raH.toFixed(1)), left: <Value align="left">{raA.toFixed(1)}</Value>, right: <Value align="right">{raH.toFixed(1)}</Value>, bars: { left: raA / max(raA, raH), right: raH / max(raA, raH), ...teamColors } };
              })()
            : null,
        pyA && pyH
            ? (() => {
                  const label = t('pro.portada.preview.pythagorean');
                  return {
                      label,
                      aria: both(label, `${fmtAvg(pyA.pct)} (${pyA.wins}-${pyA.losses})`, `${fmtAvg(pyH.pct)} (${pyH.wins}-${pyH.losses})`),
                      left: (
                          <Value align="left" small={`${pyA.wins}-${pyA.losses}`}>
                              {fmtAvg(pyA.pct)}
                          </Value>
                      ),
                      right: (
                          <Value align="right" small={`${pyH.wins}-${pyH.losses}`} smallFirst>
                              {fmtAvg(pyH.pct)}
                          </Value>
                      ),
                      bars: { left: pyA.pct, right: pyH.pct, ...teamColors }
                  };
              })()
            : null,
        lastA || lastH
            ? {
                  label: lastLabel,
                  aria: both(lastLabel, lastA ? `${lastScore(lastA)} ${lastWhere(lastA)}` : '—', lastH ? `${lastScore(lastH)} ${lastWhere(lastH)}` : '—'),
                  left: lastA ? (
                      <Value align="left" small={lastWhere(lastA)}>
                          {lastScore(lastA)}
                      </Value>
                  ) : (
                      <Value align="left">—</Value>
                  ),
                  right: lastH ? (
                      <Value align="right" small={lastWhere(lastH)}>
                          {lastScore(lastH)}
                      </Value>
                  ) : (
                      <Value align="right">—</Value>
                  )
              }
            : null
    ];
    const mirrors = candidates.filter((row): row is MirrorProps => !!row);

    // Abridores: MLB los publica en el Clásico y la Serie del Caribe (en LIDOM, 0 de 374); con G-P y EFE del detalle del juego
    const probable = game.away.probable || game.home.probable;
    const detail = useGame(probable ? String(game.gamePk) : undefined);
    const starter = (side: 'away' | 'home') => {
        const person = detail.data?.probables[side] ?? null;
        const who = person?.name ?? game[side].probable?.name;
        if (!who) return t('pro.portada.preview.tbdShort');
        const stats = [person && person.wins !== null && person.losses !== null ? `${person.wins}-${person.losses}` : null, person?.era ? t('pro.portada.final.era', { era: person.era }) : null].filter(Boolean).join(', ');
        return stats ? `${who} (${stats})` : who;
    };
    const notPlayed = isNotPlayed(game.detailedState);
    const open = () => router.push(`/juego/${game.gamePk}`);
    const warm = () => {
        prefetch(game.gamePk).catch(() => undefined);
    };
    const label = t('pro.portada.preview.aria', { away: awayName, home: homeName, time: game.startTimeTBD ? t('pro.portada.preview.tbd') : formatTime(game.date, lang, timeZone), venue: game.venue });

    return (
        <View accessibilityLabel={label} style={[{ borderRadius: radius.card, backgroundColor: colors.surface, overflow: 'hidden' }, shadow('card')]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 }}>
                <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <TimePill game={game} timeZone={timeZone} />
                    <Txt size={12} weight="semibold" tone="muted" numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
                        {game.venue}
                    </Txt>
                </View>
                <AlertButton game={game} />
            </View>
            {!game.startTimeTBD && !notPlayed && (
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, paddingHorizontal: 16, paddingBottom: 14 }}>
                    <Txt eyebrow>{t('pro.portada.preview.startsIn')}</Txt>
                    <Countdown date={game.date} />
                </View>
            )}
            <View style={{ flexDirection: 'row' }}>
                {(['away', 'home'] as const).map((side) => {
                    const team = game[side];
                    const fill = teamFill(team.color);
                    const end = side === 'home';
                    return (
                        <View key={side} style={{ flex: 1, flexBasis: 0, minWidth: 0, flexDirection: end ? 'row-reverse' : 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 12, backgroundColor: fill.bg }}>
                            <View style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 20, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.9)' }}>
                                <TeamLogo team={team} size={30} />
                            </View>
                            <View style={{ flex: 1, minWidth: 0, alignItems: end ? 'flex-end' : 'flex-start' }}>
                                <Txt size={11} weight="extrabold" color={fill.ink} numberOfLines={1} style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>
                                    {end ? t('pro.portada.preview.local') : t('pro.portada.preview.visitor')}
                                </Txt>
                                <Txt size={17} weight="black" color={fill.ink} numberOfLines={1} style={{ letterSpacing: -0.3, maxWidth: '100%' }}>
                                    {name(team)}
                                </Txt>
                            </View>
                        </View>
                    );
                })}
            </View>
            {mirrors.length > 0 && (
                <View ref={setNode} onLayout={onLayout} style={{ paddingHorizontal: 16, paddingTop: 4 }}>
                    {mirrors.map((mirror, index) => (
                        <Mirror key={mirror.label} index={index} seen={seen} {...mirror} />
                    ))}
                </View>
            )}
            <View style={{ gap: 12, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 }}>
                {probable ? (
                    <ProNote tone="neutral" title={t('pro.portada.preview.probables')}>
                        {`${starter('away')} vs ${starter('home')}`}
                    </ProNote>
                ) : (
                    <ProNote tone="neutral" title={t('pro.portada.preview.noProbables')}>
                        {game.league === 'lidom' ? t('pro.portada.preview.noProbablesLidom') : t('pro.portada.preview.noProbablesYet')}
                    </ProNote>
                )}
                {h2h && (
                    <View
                        accessible
                        accessibilityLabel={`${t('pro.portada.preview.h2h', { season })}: ${h2h.played === 0 ? t('pro.portada.preview.h2hFirst') : h2h.aWins === h2h.bWins ? t('pro.portada.preview.h2hTied') : h2h.aWins > h2h.bWins ? awayName : homeName} ${Math.max(h2h.aWins, h2h.bWins)}-${Math.min(h2h.aWins, h2h.bWins)}`}
                        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', columnGap: 8, rowGap: 4 }}
                    >
                        <Txt eyebrow>{t('pro.portada.preview.h2h', { season })}</Txt>
                        <Txt size={13} weight="bold" numberOfLines={1}>
                            {`${h2h.played === 0 ? t('pro.portada.preview.h2hFirst') : h2h.aWins === h2h.bWins ? t('pro.portada.preview.h2hTied') : h2h.aWins > h2h.bWins ? game.away.abbrev : game.home.abbrev} · `}
                            <Txt condensed size={16} tabular>{`${Math.max(h2h.aWins, h2h.bWins)}-${Math.min(h2h.aWins, h2h.bWins)}`}</Txt>
                        </Txt>
                    </View>
                )}
                <Pressable onPress={open} onPressIn={warm} accessibilityRole="link" accessibilityLabel={t('pro.portada.preview.openAria', { away: awayName, home: homeName })} style={{ alignSelf: 'flex-start' }}>
                    <MoreLink>{t('pro.portada.preview.open')}</MoreLink>
                </Pressable>
            </View>
        </View>
    );
};

/** Tarjeta compacta de un juego por empezar: récord, diferencia de carreras y racha de cada uno */
export const PreviewCardCompact: React.FC<PreviewProps> = ({ game, rows, timeZone }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const diffColor = useDiffColor();
    const prefetch = usePrefetchGame();
    const lang = i18n.language;
    const label = t('pro.portada.preview.aria', {
        away: teamDisplayName(game.away, lang),
        home: teamDisplayName(game.home, lang),
        time: game.startTimeTBD ? t('pro.portada.preview.tbd') : formatTime(game.date, lang, timeZone),
        venue: game.venue
    });
    const summary = (team: ScheduleTeam) => {
        const row = rows.get(team.id);
        const diff = row ? runDiffOf(row) : null;
        const streak = row?.streak ? streakText(row.streak, t) : null;
        return [teamDisplayName(team, lang), record(row, team), diff === null ? null : t('pro.portada.preview.diffAria', { diff: signed(diff) }), streak].filter(Boolean).join(', ');
    };
    const head = (text: string, width?: number) => (
        <Txt size={11} weight="extrabold" tone="muted" numberOfLines={1} style={[{ textTransform: 'uppercase', letterSpacing: 0.5 }, width ? { width, textAlign: 'right' } : { flex: 1, minWidth: 0 }]}>
            {text}
        </Txt>
    );
    const line = (team: ScheduleTeam) => {
        const row = rows.get(team.id);
        const diff = row ? runDiffOf(row) : null;
        return (
            <View key={team.id} style={{ minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <TeamLogo team={team} size={28} />
                    <Txt size={15} weight="extrabold" numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
                        {teamDisplayName(team, lang)}
                    </Txt>
                </View>
                <Txt condensed size={17} tabular style={{ width: 40, textAlign: 'right' }}>
                    {record(row, team)}
                </Txt>
                <Txt condensed size={17} tabular color={diffColor(diff)} style={{ width: 40, textAlign: 'right' }}>
                    {diff === null ? '—' : signed(diff)}
                </Txt>
                <View style={{ width: 44, alignItems: 'flex-end' }}>{row?.streak ? <StreakChip code={row.streak} /> : <Txt tone="muted">—</Txt>}</View>
            </View>
        );
    };
    return (
        <View accessibilityLabel={label} style={[{ borderRadius: radius.card, backgroundColor: colors.surface, overflow: 'hidden' }, shadow('card')]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 }}>
                <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <TimePill game={game} timeZone={timeZone} />
                    <Txt size={12} weight="semibold" tone="muted" numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
                        {game.venue}
                    </Txt>
                </View>
                <AlertButton game={game} compact />
            </View>
            <Pressable
                onPress={() => router.push(`/juego/${game.gamePk}`)}
                onPressIn={() => {
                    prefetch(game.gamePk).catch(() => undefined);
                }}
                accessibilityRole="link"
                accessibilityLabel={t('pro.portada.preview.openAria', { away: summary(game.away), home: summary(game.home) })}
                style={({ pressed }) => ({ paddingHorizontal: 16, paddingBottom: 14, opacity: pressed ? 0.85 : 1 })}
            >
                <View style={{ flexDirection: 'row', gap: 4, paddingBottom: 4 }}>
                    {head(t('pro.portada.preview.upcoming'))}
                    {head(t('pro.portada.preview.recShort'), 40)}
                    {head(t('pro.portada.preview.diffShort'), 40)}
                    {head(t('pro.portada.preview.streakShort'), 44)}
                </View>
                {line(game.away)}
                {line(game.home)}
            </Pressable>
        </View>
    );
};
