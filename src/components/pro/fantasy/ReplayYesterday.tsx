// «Repetición de ayer»: mientras no hay juegos en vivo, tus peloteros de ayer jugada a jugada con las jugadas reales
// del juego (los puntos de cada paso salen con la misma regla del box y terminan igual). Así se verá en vivo. Necesita
// /api/v2/game/:pk/pro: si la ruta no existe (producción todavía), el bloque no sale.
import React, { useState } from 'react';
import { AccessibilityInfo, Pressable, View, useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import { History, RotateCcw, SkipForward } from 'lucide-react-native';
import { describePlay, inningName } from '../../../lib/baseball';
import { RULES, type DayEntry, type FantasyDay, type FantasyGame, type FantasyPlayer } from '../../../lib/fantasy';
import { isPermanent } from '../../../lib/pro/http';
import { useGamePro } from '../../../lib/pro/juego';
import { useGame } from '../../../lib/queries';
import { useColors } from '../../../theme/theme';
import { radius, shadow } from '../../../theme/tokens';
import { PlayerPhoto, Skeleton, Txt } from '../../ui';
import { ChipButton, ChipRow, Flash, teamInk } from '../kit';
import { FloatChip, Num, PartChip, PartChips, PulseFrame, fmtPts, fmtSignedPts } from './bits';
import { ScoreStrip } from './LiveNow';
import { replayParts, replaySteps, round1, shortDayName, surname, type ReplayStep } from './logic';

interface ReplayYesterdayProps {
    /** El día anterior, ya terminado */
    day: FantasyDay;
    /** Tu equipo de ese día */
    entry: DayEntry;
}

export const ReplayYesterday: React.FC<ReplayYesterdayProps> = ({ day, entry }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const mine = entry.lineup.map((id) => day.players.find((player) => player.id === id)).filter((player): player is FantasyPlayer => !!player && player.played);
    // Juegos donde jugó alguno de los tuyos (primero el que tiene más)
    const games = day.games
        .filter((game) => game.state === 'final' && mine.some((player) => player.gamePk === game.gamePk))
        .sort((a, b) => mine.filter((p) => p.gamePk === b.gamePk).length - mine.filter((p) => p.gamePk === a.gamePk).length || Date.parse(a.date) - Date.parse(b.date));
    const [picked, setPicked] = useState<number | null>(null);
    const game = games.find((item) => item.gamePk === picked) ?? games[0];
    const detail = useGame(game ? String(game.gamePk) : undefined);
    const pro = useGamePro(game?.gamePk, !!game);
    const players = game ? mine.filter((player) => player.gamePk === game.gamePk) : [];
    const ids = players.map((player) => player.id).join();
    const atBats = detail.data?.atBats;
    const plays = pro.data?.plays;
    const decisions = detail.data?.decisions;
    const steps = atBats && plays ? replaySteps(atBats, plays, decisions, day.scoring, ids ? ids.split(',').map(Number) : []) : [];
    // Jugada que se ve (-1: antes del primer lanzamiento); vuelve a empezar al cambiar de juego
    const [cursor, setCursor] = useState<{ gamePk: number | null; index: number }>({ gamePk: null, index: -1 });
    const index = game && cursor.gamePk === game.gamePk ? cursor.index : -1;
    if (!game) return null;
    // Sin la ruta PRO (o sin el juego) no hay jugadas que repetir: el bloque no sale
    if ((pro.isError && !pro.data && isPermanent(pro.error)) || (detail.isError && !detail.data)) return null;
    const ready = !!atBats && !!plays;
    const done = index >= steps.length - 1;

    const advance = () => {
        const next = done ? -1 : index + 1;
        setCursor({ gamePk: game.gamePk, index: next });
        // El lector oye lo que sumó cada uno en la jugada nueva
        const changes = next >= 0 ? steps[next].changes : [];
        if (changes.length) {
            AccessibilityInfo.announceForAccessibility(
                changes
                    .map((change) => {
                        const player = players.find((item) => item.id === change.id);
                        return `${player ? surname(player.name) : ''} ${fmtSignedPts(entry.captain === change.id ? change.pts * RULES.captain : change.pts)}`;
                    })
                    .join(', ')
            );
        }
    };

    return (
        <View style={[{ gap: 12, borderRadius: radius.card, backgroundColor: colors.surface, padding: 14 }, shadow('card')]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
                    <History size={14} color={colors.muted} />
                    <Txt eyebrow numberOfLines={1} style={{ flexShrink: 1 }}>
                        {t('pro.fantasy.replay.eyebrow')}
                    </Txt>
                </View>
                {ready && steps.length > 0 && (
                    <Pressable
                        onPress={advance}
                        accessibilityRole="button"
                        style={({ pressed }) => ({ height: 44, flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.pill, paddingHorizontal: 14, backgroundColor: colors.raised, opacity: pressed ? 0.85 : 1 })}
                    >
                        {done ? <RotateCcw size={16} color={colors.ink} /> : <SkipForward size={16} color={colors.ink} />}
                        <Txt size={12} weight="bold">
                            {done ? t('pro.fantasy.replay.again') : t('pro.fantasy.replay.next')}
                        </Txt>
                    </Pressable>
                )}
            </View>
            <View style={{ gap: 4 }}>
                <Txt size={17} weight="extrabold" accessibilityRole="header" style={{ letterSpacing: -0.3 }}>
                    {t('pro.fantasy.replay.title')}
                </Txt>
                <Txt size={12} tone="muted" style={{ lineHeight: 17 }}>
                    {t('pro.fantasy.replay.lead', { day: shortDayName(day.date, i18n.language) })}
                </Txt>
            </View>
            {games.length > 1 && (
                <ChipRow label={t('pro.fantasy.replay.games')} bleed={false}>
                    {games.map((item) => (
                        <ChipButton key={item.gamePk} active={item.gamePk === game.gamePk} onPress={() => setPicked(item.gamePk)}>
                            {`${item.away.abbrev} ${t('pro.fantasy.replay.at')} ${item.home.abbrev}`}
                        </ChipButton>
                    ))}
                </ChipRow>
            )}
            {!ready ? (
                <View accessible accessibilityLabel={t('pro.fantasy.replay.loading')}>
                    <Skeleton height={260} round={radius.tile} />
                </View>
            ) : !steps.length ? (
                <Txt size={14} tone="muted">
                    {t('pro.fantasy.replay.none')}
                </Txt>
            ) : (
                <ReplayGame day={day} game={game} entry={entry} players={players} steps={steps} index={index} />
            )}
        </View>
    );
};

interface ReplayGameProps {
    day: FantasyDay;
    game: FantasyGame;
    entry: DayEntry;
    players: FantasyPlayer[];
    steps: ReplayStep[];
    index: number;
}

const ReplayGame: React.FC<ReplayGameProps> = ({ day, game, entry, players, steps, index }) => {
    const { t, i18n } = useTranslation();
    const lang = i18n.language;
    const colors = useColors();
    const narrow = useWindowDimensions().width < 360;
    const step = index >= 0 ? steps[index] : null;
    const atBat = step?.atBat;
    const score = { away: atBat?.away ?? 0, home: atBat?.home ?? 0 };
    const inning = atBat ? inningName({ n: atBat.inning, isTop: atBat.top }, lang) : null;
    const total = (id: number) => {
        const base = step?.totals[id] ?? 0;
        return entry.captain === id ? round1(base * RULES.captain) : base;
    };

    return (
        <View style={{ gap: 12 }}>
            <ScoreStrip
                game={game}
                away={score.away}
                home={score.home}
                label={t('pro.fantasy.live.scoreLabel', { away: game.away.name, awayRuns: score.away, home: game.home.name, homeRuns: score.home, inning: inning ?? t('pro.fantasy.replay.before') })}
                status={atBat ? t('pro.fantasy.live.status', { away: game.away.abbrev, home: game.home.abbrev, inning, count: atBat.outs ?? 0 }) : t('pro.fantasy.replay.before')}
            />
            {atBat && !step?.final ? (
                <View style={{ borderRadius: radius.tile, backgroundColor: colors.raised, paddingHorizontal: 12, paddingVertical: 8 }}>
                    <Txt size={12} style={{ lineHeight: 17 }}>
                        {describePlay(atBat.desc, lang)}
                    </Txt>
                </View>
            ) : null}
            {step?.final ? (
                <View style={{ borderRadius: radius.tile, backgroundColor: colors.raised, paddingHorizontal: 12, paddingVertical: 8 }}>
                    <Txt size={12}>{t('pro.fantasy.replay.decisions')}</Txt>
                </View>
            ) : null}
            <View style={{ gap: 10, paddingTop: 12 }}>
                {Array.from({ length: Math.ceil(players.length / 2) }, (_, row) => players.slice(row * 2, row * 2 + 2)).map((pair, row) => (
                    <View key={row} style={{ flexDirection: 'row', gap: 10, alignItems: 'stretch' }}>
                        {pair.map((player) => {
                            const team = day.teams[player.teamId];
                            const color = team?.color ?? '#64748b';
                            const ink = teamInk(color);
                            const batting = atBat?.batter.id === player.id && !step?.final;
                            const pitching = atBat?.pitcher.id === player.id && !step?.final;
                            const change = step?.changes.find((item) => item.id === player.id);
                            const points = total(player.id);
                            const parts = replayParts(step?.parts[player.id], player.role, day.scoring);
                            const captain = entry.captain === player.id;
                            return (
                                <View key={player.id} accessibilityLabel={player.name} style={{ flex: 1, flexBasis: 0, borderRadius: radius.tile, backgroundColor: colors.raised }}>
                                    {change && (
                                        <FloatChip
                                            key={`${index}-${player.id}`}
                                            value={change.pts}
                                            text={`${fmtSignedPts(captain ? change.pts * RULES.captain : change.pts)} ${change.keys.map((key) => t(`pro.fantasy.parts.${key}`)).join(' · ')} ${surname(player.name)}`}
                                            style={{ top: -12, right: 8 }}
                                        />
                                    )}
                                    <View style={{ overflow: 'hidden', borderTopLeftRadius: radius.tile, borderTopRightRadius: radius.tile }}>
                                        <View style={{ height: 28, justifyContent: 'center', paddingHorizontal: 10, backgroundColor: color }}>
                                            {batting && <PulseFrame color={ink} />}
                                            <Txt size={11} weight="extrabold" color={ink} numberOfLines={1} style={{ letterSpacing: 0.6 }}>
                                                {batting ? t('pro.fantasy.replay.batting') : pitching ? t('pro.fantasy.card.pitching') : player.role === 'P' ? t('pro.fantasy.replay.bench') : t('pro.fantasy.replay.waiting')}
                                            </Txt>
                                        </View>
                                    </View>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingTop: 10 }}>
                                        <PlayerPhoto personId={player.id} name={player.name} size={narrow ? 36 : 44} team={!narrow && team ? { id: team.id, logo: team.logo, color: team.color } : null} />
                                        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                                            <Txt size={narrow ? 12 : 13} weight="bold" style={{ lineHeight: narrow ? 14 : 15 }}>
                                                {player.name}
                                            </Txt>
                                            <Txt size={11} weight="semibold" tone="muted" numberOfLines={1}>
                                                {player.role === 'P' ? t('pro.fantasy.card.posP') : player.pos} · {team?.abbrev}
                                            </Txt>
                                        </View>
                                    </View>
                                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, paddingHorizontal: 10, paddingTop: 8 }}>
                                        <Flash value={points} tone={change && change.pts < 0 ? 'down' : 'up'}>
                                            <Num size={28}>{fmtPts(points)}</Num>
                                        </Flash>
                                        <Txt size={10} weight="extrabold" tone="muted" style={{ letterSpacing: 0.8 }}>
                                            {t('pro.fantasy.card.pts')}
                                        </Txt>
                                        {captain && (
                                            <Txt size={10} weight="extrabold" color={colors.gold}>
                                                ×{RULES.captain}
                                            </Txt>
                                        )}
                                    </View>
                                    <View style={{ minHeight: 22, paddingHorizontal: 10, paddingBottom: 12, paddingTop: 8 }}>
                                        {parts.length ? <PartChips parts={parts} surface={colors.surface} /> : <PartChip text={t('pro.fantasy.card.noPoints')} surface={colors.surface} />}
                                    </View>
                                </View>
                            );
                        })}
                        {pair.length === 1 && <View style={{ flex: 1, flexBasis: 0 }} />}
                    </View>
                ))}
            </View>
            <Txt size={11} weight="semibold" tone="muted" accessibilityLiveRegion="polite">
                {index >= 0 ? t('pro.fantasy.replay.progress', { n: index + 1, count: steps.length }) : t('pro.fantasy.replay.ready', { count: steps.length })}
            </Txt>
        </View>
    );
};
