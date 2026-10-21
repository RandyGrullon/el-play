// «Mi equipo» del Fantasy PRO: tarjetas en 2 columnas con banda del color del equipo (hora y rival antes del juego,
// «AL BATE» o «LANZANDO» en vivo con el mini diamante), proyección o puntos reales con su desglose, capitán, «Cambiar»
// y, los días con créditos, el precio de cada uno y la barra de créditos.
import React, { useEffect, useMemo } from 'react';
import { AccessibilityInfo, Pressable, View, useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ArrowLeftRight, Crown, Plus } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { inningName } from '../../../lib/baseball';
import { formatTime } from '../../../lib/format';
import { RULES, creditsLeft, entryCost, gameStarted, perTeamLimit, playerScore, setCaptain, type DayEntry, type FantasyDay, type FantasyGame, type FantasyPlayer } from '../../../lib/fantasy';
import type { PlayerRow } from '../../../lib/stats';
import { useColors } from '../../../theme/theme';
import { alpha, radius, shadow } from '../../../theme/tokens';
import { PlayerPhoto, Txt } from '../../ui';
import { formatCredits, lineText } from '../../fantasy/shared';
import { Chip, Enter, Flash, GrowBar, ModuleHeader, teamInk, useChipInk, useProColors } from '../kit';
import { FloatChip, LockMark, MiniDiamond, Num, PartChip, PartChips, PulseFrame, diamondLabel, fmtPts, fmtSignedPts, useScoreChange, type T } from './bits';
import { partsTotal, pointParts, surname, type Projection } from './logic';

export interface FormItem {
    date: string;
    gamePk: number;
    pts: number;
}

interface TeamGridProps {
    day: FantasyDay;
    entry: DayEntry;
    /** El día anterior (para «Ayer +5» o «Ayer: no jugó») */
    prevDay?: FantasyDay;
    projection: Projection;
    scout: Map<number, PlayerRow>;
    form: Record<string, FormItem[]> | undefined;
    now: number;
    onPick: (role: 'B' | 'P') => void;
    onChange: (player: FantasyPlayer) => void;
    onInfo: (player: FantasyPlayer) => void;
}

const gameOf = (day: FantasyDay, player: Pick<FantasyPlayer, 'gamePk'>) => day.games.find((game) => game.gamePk === player.gamePk);

/** «6:00 p. m. · en AGU» o «7:30 p. m. · vs ESC» (en = de visitante, vs = en casa) */
const matchText = (game: FantasyGame, teamId: number, t: T) => {
    const home = game.home.id === teamId;
    const rival = home ? game.away : game.home;
    return t(home ? 'pro.fantasy.card.vs' : 'pro.fantasy.card.at', { team: rival.abbrev });
};

/** De dos en dos (las filas de la cuadrícula) */
const pairs = <V,>(list: V[]) => Array.from({ length: Math.ceil(list.length / 2) }, (_, index) => list.slice(index * 2, index * 2 + 2));

export const TeamGrid: React.FC<TeamGridProps> = ({ day, entry, prevDay, projection, scout, form, now, onPick, onChange, onInfo }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const goldInk = colors.gold;
    const chosen = entry.lineup.map((id) => day.players.find((player) => player.id === id)).filter((player): player is FantasyPlayer => !!player);
    const batters = chosen.filter((player) => player.role === 'B');
    const pitchers = chosen.filter((player) => player.role === 'P');
    const slots: (FantasyPlayer | 'B' | 'P')[] = [
        ...batters,
        ...Array.from({ length: Math.max(0, RULES.batters - batters.length) }, () => 'B' as const),
        ...pitchers,
        ...Array.from({ length: Math.max(0, RULES.pitchers - pitchers.length) }, () => 'P' as const)
    ];

    return (
        <View style={{ gap: 12 }} accessibilityLabel={t('pro.fantasy.team.title')}>
            <ModuleHeader title={t('pro.fantasy.team.title')} aside={projection.known ? t('pro.fantasy.team.proj', { pts: fmtPts(projection.total) }) : undefined} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                <Chip>{t('pro.fantasy.team.rule1', { batters: RULES.batters })}</Chip>
                <Chip>{t('pro.fantasy.team.rule2', { n: perTeamLimit(day) })}</Chip>
                {day.credits ? <Chip tone="accent">{t('pro.fantasy.credits.chip', { budget: day.credits.budget })}</Chip> : null}
                <Chip icon={<Crown size={12} color={goldInk} />} style={{ backgroundColor: alpha(goldInk, 0.14) }}>
                    <Txt size={12} weight="bold" color={goldInk} numberOfLines={1}>
                        {t('pro.fantasy.team.rule3', { x: RULES.captain })}
                    </Txt>
                </Chip>
            </View>
            {day.credits ? <CreditsBar day={day} entry={entry} /> : null}
            <View style={{ gap: 10 }}>
                {pairs(slots).map((row, rowIndex) => (
                    <View key={rowIndex} style={{ flexDirection: 'row', gap: 10, alignItems: 'stretch' }}>
                        {row.map((slot, column) => {
                            const index = rowIndex * 2 + column;
                            return typeof slot === 'string' ? (
                                <Enter key={`empty-${index}`} index={index} style={{ flex: 1, flexBasis: 0 }}>
                                    <EmptySlot role={slot} onPress={() => onPick(slot)} />
                                </Enter>
                            ) : (
                                <Enter key={slot.id} index={index} style={{ flex: 1, flexBasis: 0 }}>
                                    <PlayerCard day={day} entry={entry} player={slot} prevDay={prevDay} projected={projection.byId[slot.id] ?? null} row={scout.get(slot.id)} form={form?.[slot.id]} now={now} onChange={onChange} onInfo={onInfo} />
                                </Enter>
                            );
                        })}
                        {row.length === 1 && <View style={{ flex: 1, flexBasis: 0 }} />}
                    </View>
                ))}
            </View>
        </View>
    );
};

const EmptySlot: React.FC<{ role: 'B' | 'P'; onPress: () => void }> = ({ role, onPress }) => {
    const { t } = useTranslation();
    const colors = useColors();
    return (
        <Pressable
            onPress={onPress}
            accessibilityRole="button"
            style={({ pressed }) => ({
                flex: 1,
                minHeight: 148,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                borderRadius: radius.tile,
                borderWidth: 2,
                borderStyle: 'dashed',
                borderColor: alpha(colors.line, 0.2),
                paddingHorizontal: 12,
                backgroundColor: pressed ? colors.surface : 'transparent'
            })}
        >
            <View style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.raised }}>
                <Plus size={20} color={colors.ink} />
            </View>
            <Txt size={13} weight="bold" tone="muted" center>
                {role === 'P' ? t('fantasy.addPitcher') : t('fantasy.addBatter')}
            </Txt>
        </Pressable>
    );
};

/** Créditos del equipo en PRO: barra que crece, lo gastado y lo que queda (o por cuánto se pasó) */
export const CreditsBar: React.FC<{ day: FantasyDay; entry: DayEntry }> = ({ day, entry }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const pro = useProColors();
    if (!day.credits) return null;
    const lang = i18n.language;
    const budget = day.credits.budget;
    const spent = entryCost(day, entry);
    const left = creditsLeft(day, entry) ?? 0;
    const over = left < -1e-9;
    // Le faltan peloteros y lo que queda no alcanza ni para los más baratos: tiene que cambiar a alguien caro
    const missing = Math.max(0, RULES.batters + RULES.pitchers - entry.lineup.length);
    const short = !over && missing > 0 && left + 1e-9 < missing * day.credits.min;
    const spentText = t('fantasy.credits.spent', { spent: formatCredits(spent, lang), budget: formatCredits(budget, lang) });
    const message = over
        ? t('fantasy.credits.over', { over: formatCredits(-left, lang) })
        : short
          ? t('fantasy.credits.short', { left: formatCredits(left, lang), count: missing, min: formatCredits(day.credits.min, lang) })
          : t('fantasy.credits.left', { left: formatCredits(left, lang) });
    return (
        <View style={[{ gap: 8, borderRadius: radius.tile, backgroundColor: colors.surface, paddingHorizontal: 14, paddingVertical: 12 }, shadow('card')]}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
                <Txt eyebrow>{t('fantasy.credits.label')}</Txt>
                <Txt size={14} weight="bold" tabular>
                    {spentText}
                </Txt>
            </View>
            {/* accessibilityValue pide enteros: el número exacto va en el texto del valor */}
            <View accessible accessibilityRole="progressbar" accessibilityLabel={t('fantasy.credits.label')} accessibilityValue={{ min: 0, max: budget, now: Math.min(budget, Math.round(spent)), text: spentText }}>
                <GrowBar value={budget > 0 ? spent / budget : 0} color={over ? colors.live : colors.accent} height={8} />
            </View>
            <Txt size={12} weight="semibold" color={over || short ? pro.down : colors.muted}>
                {message}
            </Txt>
        </View>
    );
};

interface PlayerCardProps {
    day: FantasyDay;
    entry: DayEntry;
    player: FantasyPlayer;
    prevDay?: FantasyDay;
    projected: number | null;
    row?: PlayerRow;
    form?: FormItem[];
    now: number;
    onChange: (player: FantasyPlayer) => void;
    onInfo: (player: FantasyPlayer) => void;
    /** Equipo de otro (perfil de un fanático): sin corona ni «Cambiar» */
    readOnly?: boolean;
}

export const PlayerCard: React.FC<PlayerCardProps> = ({ day, entry, player, prevDay, projected, row, form, now, onChange, onInfo, readOnly = false }) => {
    const { t, i18n } = useTranslation();
    const lang = i18n.language;
    const colors = useColors();
    const pro = useProColors();
    const narrow = useWindowDimensions().width < 360;
    const team = day.teams[player.teamId];
    const game = gameOf(day, player);
    const started = !!game && gameStarted(game, now);
    const captain = entry.captain === player.id;
    const score = playerScore(entry, player);
    const parts = useMemo(() => pointParts(player, day.scoring), [player, day.scoring]);
    const line = lineText(player, t);
    const color = team?.color ?? '#64748b';
    const ink = teamInk(color);
    const live = game?.state === 'live' ? game.live : null;
    const batting = !!live && live.batter?.id === player.id;
    const pitching = !!live && live.pitcher?.id === player.id;
    const price = day.credits && player.price !== undefined ? formatCredits(player.price, lang) : null;
    const upChip = useChipInk('up');

    // Chip flotante cuando suben (o bajan) sus puntos entre lecturas; el lector lo oye una vez
    const change = useScoreChange(score, parts, day.date, t);
    const changeKey = change?.key ?? 0;
    const announce = change ? t('pro.fantasy.card.announce', { name: surname(player.name), pts: fmtSignedPts(change.delta), what: change.what }) : '';
    useEffect(() => {
        if (changeKey && announce) AccessibilityInfo.announceForAccessibility(announce);
        // Solo cuando llega un cambio nuevo
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [changeKey]);

    // Banda: hora y rival antes del juego; en vivo, al bate, lanzando o la entrada; al final, el marcador
    let band = '';
    let bandLabel = '';
    if (game && !started) {
        band = `${formatTime(game.date, lang)} · ${matchText(game, player.teamId, t)}`;
        bandLabel = t('pro.fantasy.card.openUntil', { time: formatTime(game.date, lang) });
    } else if (game && live) {
        band = batting
            ? t('pro.fantasy.card.batting', { balls: `${live.balls}-${live.strikes}` })
            : pitching
              ? t('pro.fantasy.card.pitching')
              : inningName({ n: live.inning, isTop: live.isTop, state: live.inningState }, lang, true);
        bandLabel = t('pro.fantasy.card.lockedLive');
    } else if (game) {
        const mine = game.home.id === player.teamId ? game.home : game.away;
        const rival = game.home.id === player.teamId ? game.away : game.home;
        band = game.state === 'final' ? t('pro.fantasy.card.final', { score: `${mine.score ?? 0}-${rival.score ?? 0}` }) : `${t('pro.fantasy.card.closed')} · ${matchText(game, player.teamId, t)}`;
        bandLabel = t('pro.fantasy.card.locked');
    }

    // Lo de ayer: sus puntos si jugó, «no jugó» si su equipo jugó sin él; si no, su último juego del fantasy
    const yesterday = prevDay?.players.find((item) => item.id === player.id);
    const last = form?.[0];
    const yesterdayText: { text: string; tone: 'up' | 'down' | 'muted' } | null =
        yesterday && prevDay?.games.some((g) => g.gamePk === yesterday.gamePk && g.state === 'final')
            ? yesterday.played
                ? { text: t('pro.fantasy.card.yesterday', { pts: fmtSignedPts(yesterday.points) }), tone: yesterday.points >= 0 ? 'up' : 'down' }
                : { text: player.role === 'P' ? t('pro.fantasy.card.yesterdayNoPitch') : t('pro.fantasy.card.yesterdayNoPlay'), tone: 'muted' }
            : last
              ? { text: t('pro.fantasy.card.lastGame', { pts: fmtSignedPts(last.pts) }), tone: last.pts >= 0 ? 'up' : 'down' }
              : null;
    const yesterdayColor = yesterdayText?.tone === 'up' ? upChip : yesterdayText?.tone === 'down' ? pro.down : colors.muted;

    return (
        <View
            accessibilityLabel={captain ? t('pro.fantasy.card.captainLabel', { name: player.name }) : player.name}
            style={[{ flex: 1, borderRadius: radius.tile, backgroundColor: colors.surface, borderWidth: 2, borderColor: captain ? colors.gold : 'transparent' }, shadow('card')]}
        >
            {change && <FloatChip key={change.key} value={change.delta} text={`${fmtSignedPts(change.delta)}${change.what ? ` ${change.what}` : ''} ${surname(player.name)}`} style={{ top: -12, right: 8 }} />}
            <View style={{ overflow: 'hidden', borderTopLeftRadius: radius.tile - 2, borderTopRightRadius: radius.tile - 2 }}>
                <View style={{ height: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, paddingHorizontal: 10, backgroundColor: color }}>
                    {batting && <PulseFrame color={ink} />}
                    <Txt size={narrow ? 10 : 11} weight="extrabold" color={ink} numberOfLines={1} style={{ flexShrink: 1, letterSpacing: narrow ? 0 : 0.3 }}>
                        {band}
                    </Txt>
                    {live ? <MiniDiamond runners={live.runners} outs={live.outs} label={diamondLabel(live.runners, live.outs, t)} color={ink} /> : <LockMark locked={started} label={bandLabel} color={ink} />}
                </View>
            </View>

            <Pressable
                onPress={() => onInfo(player)}
                accessibilityRole="button"
                accessibilityLabel={price === null ? t('statsPage.viewPlayer', { name: player.name }) : `${t('statsPage.viewPlayer', { name: player.name })}, ${t('fantasy.credits.priceLong', { price })}`}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingTop: 10, opacity: pressed ? 0.7 : 1 })}
            >
                <PlayerPhoto personId={player.id} name={player.name} size={narrow ? 40 : 48} team={team ? { id: team.id, logo: team.logo, color: team.color } : null} />
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Txt size={narrow ? 13 : 14} weight="bold" style={{ lineHeight: narrow ? 15 : 16, letterSpacing: -0.2 }}>
                        {player.name}
                    </Txt>
                    <Txt size={11} weight="semibold" tone="muted" numberOfLines={1}>
                        {player.role === 'P' ? t('pro.fantasy.card.posP') : player.pos || t('fantasy.batter')} · {team?.abbrev}
                        {price !== null ? ` · ${t('fantasy.credits.price', { price })}` : ''}
                    </Txt>
                </View>
            </Pressable>

            {started ? (
                <View style={{ flex: 1, paddingHorizontal: 10, paddingTop: 10, paddingBottom: 12, gap: 6 }}>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 6 }}>
                        <Flash value={score} tone={score >= 0 ? 'up' : 'down'}>
                            <Num size={28}>{fmtPts(score)}</Num>
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
                    <Txt size={11} tone="muted">
                        {line ?? (game?.state === 'final' ? (player.role === 'P' ? t('pro.fantasy.card.noPitch') : t('pro.fantasy.card.noPlay')) : t('pro.fantasy.card.waiting'))}
                    </Txt>
                    {parts.length ? <PartChips parts={parts} /> : <PartChip text={t('pro.fantasy.card.noPoints')} />}
                    {captain && parts.length > 0 && partsTotal(parts) !== score && (
                        <Txt size={10} weight="semibold" color={colors.gold}>
                            {t('pro.fantasy.card.captainMath', { base: fmtPts(player.points), x: RULES.captain, total: fmtPts(score) })}
                        </Txt>
                    )}
                </View>
            ) : readOnly ? (
                <Txt size={11} tone="muted" style={{ marginHorizontal: 10, marginTop: 8, marginBottom: 12 }}>
                    {game ? t('pro.fantasy.card.startsAt', { time: formatTime(game.date, lang) }) : ''}
                </Txt>
            ) : (
                <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 6, paddingHorizontal: 10, paddingTop: 10 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4 }}>
                            <Num size={28}>{projected !== null ? fmtPts(projected) : '—'}</Num>
                            <View style={{ paddingBottom: 3 }}>
                                <Txt size={10} weight="extrabold" color={captain ? colors.gold : colors.muted} style={{ letterSpacing: 0.8, lineHeight: 12 }}>
                                    {t('pro.fantasy.card.proj')}
                                </Txt>
                                {captain && (
                                    <Txt size={10} weight="extrabold" color={colors.gold} style={{ lineHeight: 12 }}>
                                        ×{RULES.captain}
                                    </Txt>
                                )}
                            </View>
                        </View>
                        {yesterdayText && (
                            <View style={{ height: 22, justifyContent: 'center', borderRadius: radius.pill, paddingHorizontal: 8, backgroundColor: yesterdayText.tone === 'muted' ? colors.raised : alpha(yesterdayColor, 0.14) }}>
                                <Txt size={10} weight="bold" color={yesterdayColor} numberOfLines={1}>
                                    {yesterdayText.text}
                                </Txt>
                            </View>
                        )}
                    </View>
                    <Txt size={11} tone="muted" style={{ marginHorizontal: 10, marginTop: 4 }}>
                        {row ? t('pro.fantasy.card.avg', { ppg: fmtPts(row.ppg), g: row.g }) : t('pro.fantasy.card.noAvg')}
                    </Txt>
                    <View style={{ marginTop: 'auto', flexDirection: 'row', gap: 6, padding: 10 }}>
                        <Pressable
                            onPress={() => {
                                if (setCaptain(day, entry, player)) Haptics.selectionAsync().catch(() => undefined);
                            }}
                            accessibilityRole="button"
                            accessibilityState={{ selected: captain }}
                            accessibilityLabel={captain ? t('pro.fantasy.card.isCaptain', { name: player.name }) : t('pro.fantasy.card.makeCaptain', { name: player.name })}
                            style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: captain ? alpha(colors.gold, 0.18) : colors.raised, opacity: pressed ? 0.8 : 1 })}
                        >
                            <Crown size={20} color={captain ? colors.gold : colors.muted} />
                        </Pressable>
                        <Pressable
                            onPress={() => onChange(player)}
                            accessibilityRole="button"
                            accessibilityLabel={t('pro.fantasy.card.changeLabel', { name: player.name })}
                            style={({ pressed }) => ({ flex: 1, minWidth: 0, height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: radius.tile, paddingHorizontal: 8, backgroundColor: pressed ? alpha(colors.line, 0.2) : colors.raised })}
                        >
                            <ArrowLeftRight size={16} color={colors.ink} />
                            {!narrow && (
                                <Txt size={12} weight="bold" numberOfLines={1}>
                                    {t('pro.fantasy.card.change')}
                                </Txt>
                            )}
                        </Pressable>
                    </View>
                </View>
            )}
        </View>
    );
};
