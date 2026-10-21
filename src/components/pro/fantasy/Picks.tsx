// Pronósticos PRO: cómo te fue el día anterior (con confeti en los aciertos) y cada juego cara a cara con récord,
// últimos 10, racha y diferencia de carreras; el % de los fanáticos solo cuando el juego ya empezó (antes no se muestra).
import React from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Check, Info, Lock, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { formatTime } from '../../../lib/format';
import { RULES, gameStarted, pickResult, setPick, type DayEntry, type FantasyDay, type FantasyGame } from '../../../lib/fantasy';
import type { FantasyDayStats } from '../../../types/pro-liga';
import { useColors } from '../../../theme/theme';
import { alpha, radius, shadow } from '../../../theme/tokens';
import { TeamLogo, Txt } from '../../ui';
import { GrowBar, ModuleHeader, ProNote, useInView, useProColors } from '../kit';
import { Confetti, Num, fmtSignedPts, type T } from './bits';
import { formCompare, type TeamForm } from './logic';

interface PicksProps {
    day: FantasyDay;
    entry: DayEntry;
    /** El día anterior con lo que pronosticaste (resultados) */
    prevDay?: FantasyDay;
    prevEntry?: DayEntry;
    prevName?: string;
    forms: Map<number, TeamForm>;
    stats: FantasyDayStats | undefined;
    now: number;
}

const recordText = (form: TeamForm | undefined) => (form ? `${form.wins}-${form.losses}` : '—');
const last10Text = (form: TeamForm | undefined) => (form?.last10 ? `${form.last10.wins}-${form.last10.losses}` : '—');
const streakText = (form: TeamForm | undefined, t: T) => (form?.streak ? `${form.streak.won ? t('pro.fantasy.picks.w') : t('pro.fantasy.picks.l')}${form.streak.n}` : '—');
const diffText = (form: TeamForm | undefined) => (form?.runDiff === null || form?.runDiff === undefined ? '—' : fmtSignedPts(form.runDiff));

export const Picks: React.FC<PicksProps> = ({ day, entry, prevDay, prevEntry, prevName, forms, stats, now }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const pro = useProColors();
    const prevGames = prevDay && prevEntry ? prevDay.games.filter((game) => prevEntry.picks[game.gamePk]) : [];
    const prevWins = prevGames.filter((game) => pickResult(game, prevEntry!) === 'win').length;
    const prevDone = prevGames.filter((game) => game.state === 'final').length;
    const noProbables = day.games.every((game) => !game.away.probable && !game.home.probable);

    return (
        <View style={{ gap: 12 }}>
            <ModuleHeader title={t('fantasy.picks')} aside={t('pro.fantasy.picks.perHit', { pts: RULES.pick })} />
            {prevGames.length > 0 && prevDone > 0 && (
                <View style={[{ gap: 10, borderRadius: radius.tile, backgroundColor: colors.surface, padding: 12 }, shadow('card')]}>
                    <Txt size={12} weight="bold">
                        {`${t('pro.fantasy.picks.yesterday', { won: prevWins, count: prevDone })} · `}
                        <Txt size={12} weight="bold" color={pro.up}>
                            +{prevWins * RULES.pick}
                        </Txt>
                        <Txt size={12} weight="medium" tone="muted">
                            {` · ${t('pro.fantasy.picks.yesterdayOf', { day: prevName })}`}
                        </Txt>
                    </Txt>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                        {prevGames.map((game) => (
                            <PastPick key={game.gamePk} game={game} pick={prevEntry!.picks[game.gamePk]} result={pickResult(game, prevEntry!)} />
                        ))}
                    </View>
                </View>
            )}
            {noProbables && day.games.length > 0 ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Info size={16} color={colors.muted} />
                    <Txt size={12} tone="muted" style={{ flex: 1 }}>
                        {t('pro.fantasy.picks.noProbables', { count: day.games.length })}
                    </Txt>
                </View>
            ) : null}
            {day.games.map((game) => (
                <GameCard key={game.gamePk} day={day} game={game} entry={entry} forms={forms} stats={stats} now={now} />
            ))}
            {!day.games.length && <ProNote tone="neutral">{t('fantasy.noGames')}</ProNote>}
        </View>
    );
};

const PastPick: React.FC<{ game: FantasyGame; pick: number; result: ReturnType<typeof pickResult> }> = ({ game, pick, result }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const { setNode, onLayout, seen } = useInView();
    const side = game.away.id === pick ? game.away : game.home;
    const rival = game.away.id === pick ? game.home : game.away;
    const win = result === 'win';
    const score = `${side.score ?? 0}-${rival.score ?? 0}`;
    const label =
        result === 'win' ? t('pro.fantasy.picks.hit', { team: side.abbrev, rival: rival.abbrev }) : result === 'loss' ? t('pro.fantasy.picks.miss', { team: side.abbrev, rival: rival.abbrev }) : `${side.abbrev}: ${t('pro.fantasy.picks.pending')}`;
    return (
        <View
            ref={setNode}
            onLayout={onLayout}
            accessible
            accessibilityLabel={result !== 'pending' ? `${label}, ${score}` : label}
            style={[
                { flex: 1, flexBasis: 0, minWidth: 0, alignItems: 'center', gap: 4, borderRadius: radius.tile, paddingHorizontal: 6, paddingTop: 12, paddingBottom: 10 },
                win ? { backgroundColor: alpha(side.color, 0.16), borderWidth: 1.5, borderColor: side.color } : { backgroundColor: colors.raised }
            ]}
        >
            <TeamLogo team={side} size={30} />
            <Txt size={13} weight="extrabold">
                {side.abbrev}
            </Txt>
            <Txt size={11} tone="muted" numberOfLines={1}>
                {result === 'pending' ? t('pro.fantasy.picks.pending') : win ? t('pro.fantasy.picks.won') : t('pro.fantasy.picks.lost')}
                {result !== 'pending' ? (
                    <Txt condensed size={13} tabular>
                        {` ${score}`}
                    </Txt>
                ) : null}
            </Txt>
            {result !== 'pending' && result !== null && (
                <View style={{ position: 'absolute', right: 6, top: 6, width: 22, height: 22 }}>
                    {win && <Confetti color={side.color} seen={seen} />}
                    <View style={{ width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: win ? 'rgb(52,199,120)' : 'rgb(255,90,95)' }}>
                        {win ? <Check size={14} strokeWidth={3} color="#0b0c10" /> : <X size={14} strokeWidth={3} color="#0b0c10" />}
                    </View>
                </View>
            )}
        </View>
    );
};

const FormRow: React.FC<{ label: string; away: string; home: string; best: 'away' | 'home' | null; awayColor: string; homeColor: string }> = ({ label, away, home, best, awayColor, homeColor }) => {
    const colors = useColors();
    const cell = (text: string, side: 'away' | 'home', color: string) => (
        <View style={{ flex: 1, flexDirection: 'row', justifyContent: side === 'away' ? 'flex-start' : 'flex-end' }}>
            {best === side ? (
                <View style={{ height: 24, justifyContent: 'center', borderRadius: radius.pill, paddingHorizontal: 8, backgroundColor: alpha(color, 0.18), borderWidth: 1, borderColor: alpha(color, 0.6) }}>
                    <Num size={17} color={colors.ink}>
                        {text}
                    </Num>
                </View>
            ) : (
                <Num size={17} style={{ paddingHorizontal: 8 }}>
                    {text}
                </Num>
            )}
        </View>
    );
    return (
        <View accessible accessibilityLabel={`${label}: ${away}, ${home}`} style={{ height: 28, flexDirection: 'row', alignItems: 'center' }}>
            {cell(away, 'away', awayColor)}
            <Txt size={10} weight="extrabold" tone="muted" center style={{ width: 72, textTransform: 'uppercase', letterSpacing: 1 }}>
                {label}
            </Txt>
            {cell(home, 'home', homeColor)}
        </View>
    );
};

const GameCard: React.FC<{ day: FantasyDay; game: FantasyGame; entry: DayEntry; forms: Map<number, TeamForm>; stats: FantasyDayStats | undefined; now: number }> = ({ day, game, entry, forms, stats, now }) => {
    const { t, i18n } = useTranslation();
    const lang = i18n.language;
    const colors = useColors();
    const pro = useProColors();
    const { setNode, onLayout, seen } = useInView();
    const pick = entry.picks[game.gamePk];
    const locked = gameStarted(game, now);
    const result = pickResult(game, entry);
    const away = forms.get(game.away.id);
    const home = forms.get(game.home.id);
    const best = formCompare(away, home);
    const fans = stats?.games.find((item) => item.gamePk === game.gamePk);
    const awayPct = fans?.picks?.[game.away.id]?.pct ?? null;
    const homePct = fans?.picks?.[game.home.id]?.pct ?? null;
    const picked = pick === game.away.id ? game.away : pick === game.home.id ? game.home : null;
    const status =
        game.state === 'final' ? t('fantasy.final') : game.state === 'live' ? t('fantasy.liveNow') : picked ? t('pro.fantasy.picks.yourPick', { team: picked.abbrev }) : locked ? t('fantasy.noPick') : t('pro.fantasy.picks.tap');
    const hasForms = !!away || !!home;

    return (
        <View
            ref={setNode}
            onLayout={onLayout}
            accessibilityLabel={t('pro.fantasy.picks.gameLabel', { away: game.away.name, home: game.home.name, time: formatTime(game.date, lang) })}
            style={[{ gap: 12, borderRadius: radius.card, backgroundColor: colors.surface, padding: 14 }, shadow('card')]}
        >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <Txt size={12} weight="bold" numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
                    {formatTime(game.date, lang)}
                    <Txt size={12} weight="medium" tone="muted">
                        {` · ${game.venue}`}
                    </Txt>
                </Txt>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                    {result === 'win' && (
                        <Txt size={11} weight="bold" color={pro.up}>
                            +{RULES.pick}
                        </Txt>
                    )}
                    {result === 'loss' && (
                        <Txt size={11} weight="bold" color={pro.down}>
                            0
                        </Txt>
                    )}
                    <Txt size={11} weight="bold" tone="muted" numberOfLines={1}>
                        {status}
                    </Txt>
                </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
                {[game.away, game.home].map((side, index) => {
                    const chosen = pick === side.id;
                    const won = chosen && result === 'win';
                    return (
                        <Pressable
                            key={side.id}
                            disabled={locked}
                            onPress={() => {
                                if (setPick(day, game, side.id)) Haptics.selectionAsync().catch(() => undefined);
                            }}
                            accessibilityRole="button"
                            accessibilityState={{ selected: chosen, disabled: locked }}
                            accessibilityLabel={`${side.name}${game.state === 'preview' ? `, ${index === 0 ? t('pro.fantasy.picks.away') : t('pro.fantasy.picks.home')} · ${t('pro.fantasy.picks.wins', { pts: RULES.pick })}` : ''}`}
                            style={({ pressed }) => [
                                { flex: 1, flexBasis: 0, minWidth: 0, minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: radius.tile, borderWidth: 2, paddingHorizontal: 10, paddingVertical: 8, opacity: locked && !chosen ? 0.6 : pressed ? 0.85 : 1 },
                                chosen ? { borderColor: side.color, backgroundColor: alpha(side.color, 0.16) } : { borderColor: 'transparent', backgroundColor: colors.raised }
                            ]}
                        >
                            <TeamLogo team={side} size={36} />
                            <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                                <Txt size={18} weight="black" style={{ lineHeight: 20, letterSpacing: -0.5 }}>
                                    {side.abbrev}
                                </Txt>
                                <Txt size={11} tone="muted" style={{ lineHeight: 14 }}>
                                    {game.state === 'preview' ? `${index === 0 ? t('pro.fantasy.picks.away') : t('pro.fantasy.picks.home')} · ${t('pro.fantasy.picks.wins', { pts: RULES.pick })}` : t('pro.fantasy.picks.runs', { count: side.score ?? 0 })}
                                </Txt>
                            </View>
                            {locked && chosen && (
                                <View style={{ position: 'absolute', right: 8, top: 8 }}>
                                    <Lock size={14} color={colors.muted} />
                                </View>
                            )}
                            {won && <Confetti color={side.color} seen={seen} />}
                        </Pressable>
                    );
                })}
            </View>
            {hasForms ? (
                <View accessibilityLabel={t('pro.fantasy.picks.faceOff')} style={{ gap: 2 }}>
                    <FormRow label={t('pro.fantasy.picks.record')} away={recordText(away)} home={recordText(home)} best={best.record} awayColor={game.away.color} homeColor={game.home.color} />
                    <FormRow label={t('pro.fantasy.picks.last10')} away={last10Text(away)} home={last10Text(home)} best={best.last10} awayColor={game.away.color} homeColor={game.home.color} />
                    <FormRow label={t('pro.fantasy.picks.streak')} away={streakText(away, t)} home={streakText(home, t)} best={best.streak} awayColor={game.away.color} homeColor={game.home.color} />
                    <FormRow label={t('pro.fantasy.picks.diff')} away={diffText(away)} home={diffText(home)} best={best.runDiff} awayColor={game.away.color} homeColor={game.home.color} />
                </View>
            ) : game.away.record && game.home.record ? (
                // Sin las posiciones PRO: el récord que trae el día
                <View accessibilityLabel={t('pro.fantasy.picks.faceOff')}>
                    <FormRow
                        label={t('pro.fantasy.picks.record')}
                        away={`${game.away.record.wins}-${game.away.record.losses}`}
                        home={`${game.home.record.wins}-${game.home.record.losses}`}
                        best={null}
                        awayColor={game.away.color}
                        homeColor={game.home.color}
                    />
                </View>
            ) : null}
            {(game.away.probable || game.home.probable) && (
                <Txt size={11} tone="muted">
                    {t('pro.fantasy.picks.probables', { away: game.away.probable?.name ?? t('pro.fantasy.picks.tbd'), home: game.home.probable?.name ?? t('pro.fantasy.picks.tbd') })}
                </Txt>
            )}
            {awayPct !== null && homePct !== null && fans && fans.picksMade ? (
                <View style={{ gap: 6 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                        <Txt size={11} tone="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
                            <Txt size={11} weight="bold">{`${Math.round(awayPct)}%`}</Txt>
                            {` ${t('pro.fantasy.picks.with', { team: game.away.abbrev })}`}
                        </Txt>
                        <Txt size={10} weight="bold" tone="muted" numberOfLines={1} style={{ letterSpacing: 0.6, flexShrink: 1 }}>
                            {t('pro.fantasy.picks.fansPct')}
                        </Txt>
                        <Txt size={11} tone="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
                            {`${t('pro.fantasy.picks.with', { team: game.home.abbrev })} `}
                            <Txt size={11} weight="bold">{`${Math.round(homePct)}%`}</Txt>
                        </Txt>
                    </View>
                    <View
                        accessible
                        accessibilityRole="image"
                        accessibilityLabel={t('pro.fantasy.picks.fansLabel', { away: game.away.abbrev, awayPct: Math.round(awayPct), home: game.home.abbrev, homePct: Math.round(homePct), count: fans.picksMade })}
                        style={{ height: 8, flexDirection: 'row', gap: 3 }}
                    >
                        {awayPct > 0 && (
                            <View style={{ width: `${awayPct}%`, minWidth: 3 }}>
                                <GrowBar value={1} color={game.away.color} track={false} height={8} seen={seen} />
                            </View>
                        )}
                        {homePct > 0 && (
                            <View style={{ flex: 1, minWidth: 3 }}>
                                <GrowBar value={1} color={game.home.color} origin="right" track={false} height={8} seen={seen} />
                            </View>
                        )}
                    </View>
                </View>
            ) : !locked ? (
                <Txt size={11} tone="muted">
                    {t('pro.fantasy.picks.fansLater')}
                </Txt>
            ) : stats ? (
                // «Nadie pronosticó» solo si el servidor lo dijo (sin la ruta PRO no se sabe)
                <Txt size={11} tone="muted">
                    {t('pro.fantasy.picks.fansNone')}
                </Txt>
            ) : null}
        </View>
    );
};
