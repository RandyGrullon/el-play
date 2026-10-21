// «Tu equipo vs el ideal»: con el día terminado, tus puntos contra el mejor equipo posible con las mismas reglas
// (máximo por equipo, créditos del día si los hay y capitán ×1,5), tu mejor bateador con su desglose y lo que te faltó
// por la corona. Las fotos de las dos columnas entran en pares escalonados.
import React, { useMemo } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { Crown } from 'lucide-react-native';
import { RULES, perTeamLimit, pickPoints, playerScore, teamPoints, type DayEntry, type FantasyDay, type FantasyPlayer } from '../../../lib/fantasy';
import { useColors } from '../../../theme/theme';
import { PRO_GRADIENT, PRO_GRADIENT_LINE, alpha, radius, shadow } from '../../../theme/tokens';
import { PlayerPhoto, Txt } from '../../ui';
import { CountUp, Enter, ModuleHeader, shortName, useGrow, useInView, useProColors } from '../kit';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { Num, PartChip, PartChips, fmtPts } from './bits';
import { idealTeam, pointParts, round1, surname } from './logic';

interface IdealDayProps {
    day: FantasyDay;
    entry: DayEntry;
    /** «Ayer · día terminado» o «Día terminado» */
    title: string;
    dateName: string;
    onInfo: (player: FantasyPlayer) => void;
}

const Column: React.FC<{ title: string; players: FantasyPlayer[]; entry: Pick<DayEntry, 'lineup' | 'captain'>; common: Set<number>; day: FantasyDay; onInfo: (player: FantasyPlayer) => void; offset: number }> = ({
    title,
    players,
    entry,
    common,
    day,
    onInfo,
    offset
}) => {
    const { t } = useTranslation();
    const colors = useColors();
    const pro = useProColors();
    const narrow = useWindowDimensions().width < 360;
    return (
        <View style={{ flex: 1, flexBasis: 0, minWidth: 0, gap: 6 }}>
            <Txt size={10} weight="extrabold" tone="muted" numberOfLines={1} style={{ textTransform: 'uppercase', letterSpacing: 1 }}>
                {title}
            </Txt>
            {players.map((player, index) => {
                const team = day.teams[player.teamId];
                const captain = entry.captain === player.id;
                const score = playerScore(entry as DayEntry, player);
                return (
                    <Enter key={player.id} index={offset + index * 2} step={40}>
                        <Pressable
                            onPress={() => onInfo(player)}
                            accessibilityRole="button"
                            accessibilityLabel={`${player.name}${captain ? `, ${t('fantasy.captain')}` : ''}: ${fmtPts(score)} ${t('pro.fantasy.pts')}${common.has(player.id) ? `, ${t('pro.fantasy.ideal.both')}` : ''}`}
                            style={({ pressed }) => ({
                                height: 48,
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 6,
                                borderRadius: radius.tile,
                                paddingHorizontal: 6,
                                backgroundColor: common.has(player.id) ? alpha(pro.up, 0.12) : pressed ? colors.raised : 'transparent'
                            })}
                        >
                            <View>
                                <PlayerPhoto personId={player.id} name={player.name} size={narrow ? 32 : 36} team={team ? { id: team.id, logo: team.logo, color: team.color } : null} />
                                {captain && (
                                    <View style={{ position: 'absolute', left: -4, top: -6 }}>
                                        <Crown size={14} color={colors.gold} />
                                    </View>
                                )}
                            </View>
                            <Txt size={narrow ? 11 : 13} weight="bold" numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
                                {shortName(player.name)}
                            </Txt>
                            <Num size={narrow ? 16 : 18} color={score < 0 ? pro.down : undefined} style={{ flexShrink: 0 }}>
                                {fmtPts(score)}
                            </Num>
                        </Pressable>
                    </Enter>
                );
            })}
        </View>
    );
};

/** Barra de «tu equipo / el ideal» con el degradado, que crece al verse */
const ShareBar: React.FC<{ share: number }> = ({ share }) => {
    const colors = useColors();
    const { setNode, onLayout, seen } = useInView();
    const progress = useGrow(share, seen);
    const fill = useAnimatedStyle(() => ({ width: `${progress.get() * 100}%` }));
    return (
        <View ref={setNode} onLayout={onLayout} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={{ height: 10, borderRadius: 5, overflow: 'hidden', backgroundColor: alpha(colors.line, 0.1) }}>
            <Animated.View style={[{ height: 10, borderRadius: 5, overflow: 'hidden' }, fill]}>
                <LinearGradient colors={PRO_GRADIENT} {...PRO_GRADIENT_LINE} style={{ flex: 1 }} />
            </Animated.View>
        </View>
    );
};

export const IdealDay: React.FC<IdealDayProps> = ({ day, entry, title, dateName, onInfo }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const pro = useProColors();
    const ideal = useMemo(() => idealTeam(day), [day]);
    const mine = entry.lineup.map((id) => day.players.find((player) => player.id === id)).filter((player): player is FantasyPlayer => !!player);
    if (!ideal || !mine.length) return null;
    const team = teamPoints(day, entry);
    const picks = pickPoints(day, entry);
    const share = ideal.total > 0 ? Math.max(0, Math.min(1, team / ideal.total)) : 0;
    const idealEntry = { lineup: ideal.players.map((player) => player.id), captain: ideal.captain?.id ?? null };
    const common = new Set(mine.filter((player) => idealEntry.lineup.includes(player.id)).map((player) => player.id));
    const ordered = [...mine].sort((a, b) => playerScore(entry, b) - playerScore(entry, a) || a.id - b.id);
    const bestBatter = mine.filter((player) => player.role === 'B').sort((a, b) => b.points - a.points)[0];
    const best = [...mine].sort((a, b) => b.points - a.points)[0];
    const captain = mine.find((player) => player.id === entry.captain) ?? null;
    const lost = best && (!captain || best.points > captain.points) ? round1((best.points - (captain?.points ?? 0)) * (RULES.captain - 1)) : 0;
    const parts = bestBatter ? pointParts(bestBatter, day.scoring) : [];
    const how = day.credits
        ? t('pro.fantasy.credits.idealHow', { count: ideal.pool, n: perTeamLimit(day), budget: day.credits.budget, x: RULES.captain })
        : t('pro.fantasy.ideal.how', { count: ideal.pool, n: perTeamLimit(day), x: RULES.captain });

    return (
        <View style={{ gap: 12 }}>
            <ModuleHeader title={title} aside={dateName} />
            <View style={[{ gap: 14, borderRadius: radius.card, backgroundColor: colors.surface, padding: 16 }, shadow('card')]}>
                <View style={{ gap: 4 }}>
                    <Txt size={22} weight="black" accessibilityRole="header" style={{ lineHeight: 26, letterSpacing: -0.5 }}>
                        {t('pro.fantasy.ideal.title')}
                    </Txt>
                    <Txt size={13} tone="muted" style={{ lineHeight: 18 }}>
                        {how}
                    </Txt>
                </View>
                <View style={{ gap: 8 }}>
                    <View accessible accessibilityLabel={`${fmtPts(team)} ${t('pro.fantasy.ideal.of')} ${fmtPts(ideal.total)}: ${Math.round(share * 100)}%`} style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, flexShrink: 1 }}>
                            <Num size={34}>
                                <CountUp value={team} format={(value) => fmtPts(value)} />
                            </Num>
                            <Txt size={14} tone="muted">
                                {t('pro.fantasy.ideal.of')}
                            </Txt>
                            <Num size={26} tone="muted">
                                {fmtPts(ideal.total)}
                            </Num>
                        </View>
                        <Num size={20} tone="muted">{`${Math.round(share * 100)}%`}</Num>
                    </View>
                    <ShareBar share={share} />
                </View>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                    <Column title={t('pro.fantasy.ideal.yours', { pts: fmtPts(team) })} players={ordered} entry={entry} common={common} day={day} onInfo={onInfo} offset={0} />
                    <Column title={t('pro.fantasy.ideal.ideal', { pts: fmtPts(ideal.total) })} players={ideal.players} entry={idealEntry} common={common} day={day} onInfo={onInfo} offset={1} />
                </View>
                {bestBatter && parts.length > 0 && (
                    <View style={{ gap: 8, borderRadius: radius.tile, backgroundColor: colors.raised, padding: 12 }}>
                        <Txt size={13} weight="bold">
                            {t('pro.fantasy.ideal.bestBatter', { name: surname(bestBatter.name) })}
                        </Txt>
                        <PartChips parts={parts} surface={colors.surface} extra={<PartChip text={`= ${fmtPts(bestBatter.points)}`} tone="up" />} />
                    </View>
                )}
                <Txt size={13} tone="muted" style={{ lineHeight: 18 }}>
                    {best && lost > 0 ? (
                        <>
                            {captain ? t('pro.fantasy.ideal.captainSwap', { best: surname(best.name), captain: surname(captain.name) }) : t('pro.fantasy.ideal.noCaptain', { best: surname(best.name) })}{' '}
                            <Txt size={13} weight="bold" color={pro.warn}>
                                {t('pro.fantasy.ideal.more', { pts: fmtPts(lost) })}
                            </Txt>
                            {'. '}
                        </>
                    ) : captain ? (
                        `${t('pro.fantasy.ideal.captainBest', { captain: surname(captain.name) })} `
                    ) : null}
                    {`${t('pro.fantasy.ideal.picks', { pts: fmtPts(picks) })} ${t('pro.fantasy.ideal.day')} `}
                    <Txt size={13} weight="bold">
                        {`${fmtPts(team + picks)} ${t('pro.fantasy.pts')}`}
                    </Txt>
                    .
                </Txt>
            </View>
        </View>
    );
};
