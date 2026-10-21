// Tarjetas PRO de los juegos terminados. La destacada lleva la pizarra con C-H-E, el vaivén de la probabilidad de
// ganar con la jugada del juego (la de mayor WPA según MLB), G/P/SV con récord y EFE, chapas de serie y compartir.
// Las compactas: marcador con C-H-E, G y P con récord y EFE, y la minigráfica del vaivén.
import React from 'react';
import { Pressable, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Share2, Zap } from 'lucide-react-native';
import type { ScheduleGame, ScheduleTeam } from '../../../types';
import type { ScheduleGamePro } from '../../../types/pro-juego';
import type { PortadaDecision, PortadaGame } from '../../../lib/pro/pantallas';
import { eventName, finalLabel, isNotPlayed, stateName } from '../../../lib/baseball';
import { formatTime } from '../../../lib/format';
import { usePrefetchGame } from '../../../lib/queries';
import { teamDisplayName } from '../../../lib/teams';
import { useColors } from '../../../theme/theme';
import { PRO_GRADIENT, PRO_GRADIENT_DIAGONAL, alpha, radius, shadow } from '../../../theme/tokens';
import { Skeleton, TeamLogo, Txt } from '../../ui';
import { ProButton, fmtPercent, shortName, useProColors } from '../kit';
import { Linescore } from './Linescore';
import { ProbSpark, ProbSwing } from './ProbCharts';
import { gameInfoParts, joinNames, keyPlayEffect, seriesBadges, teamFill, type SeriesBadge } from './logic';
import { MoreLink, PhotoWithLogo, useInk } from './shared';

interface FinalProps {
    game: ScheduleGamePro;
    summary?: PortadaGame | null;
    loading?: boolean;
    /** Zona de la liga (hora del primer lanzamiento) */
    timeZone: string;
}

const sideOf = (game: ScheduleGame, lang: string) => ({
    away: { abbrev: game.away.abbrev, color: game.away.color, name: teamDisplayName(game.away, lang) },
    home: { abbrev: game.home.abbrev, color: game.home.color, name: teamDisplayName(game.home, lang) }
});

const useOpen = (game: ScheduleGame) => {
    const prefetch = usePrefetchGame();
    return {
        open: () => router.push(`/juego/${game.gamePk}`),
        warm: () => {
            prefetch(game.gamePk).catch(() => undefined);
        }
    };
};

/** Chapa de serie, doble juego o «si es necesario» */
const Badge: React.FC<{ badge: SeriesBadge; game: ScheduleGame }> = ({ badge, game }) => {
    const { t } = useTranslation();
    const colors = useColors();
    let text: string;
    let fill: { bg: string; ink: string } = { bg: colors.raised, ink: colors.ink };
    if (badge.kind === 'series') {
        const leader = badge.leaderId === game.away.id ? game.away : badge.leaderId === game.home.id ? game.home : null;
        const high = Math.max(badge.wins, badge.losses);
        const low = Math.min(badge.wins, badge.losses);
        text = leader ? t('pro.portada.final.series', { score: `${high}-${low}`, team: leader.abbrev }) : t('pro.portada.final.seriesTied', { score: `${high}-${low}` });
        if (leader) fill = teamFill(leader.color);
    } else text = badge.kind === 'double' ? t('pro.portada.final.double', { n: badge.game }) : t('pro.portada.final.ifNecessary');
    return (
        <View style={{ height: 26, justifyContent: 'center', borderRadius: radius.pill, paddingHorizontal: 10, backgroundColor: fill.bg }}>
            <Txt size={12} weight="extrabold" color={fill.ink} numberOfLines={1}>
                {text}
            </Txt>
        </View>
    );
};

const FinalPill: React.FC<{ game: ScheduleGame }> = ({ game }) => {
    const { i18n } = useTranslation();
    const colors = useColors();
    return (
        <View style={{ height: 26, flexShrink: 0, justifyContent: 'center', borderRadius: radius.pill, paddingHorizontal: 10, backgroundColor: colors.raised }}>
            <Txt size={11} weight="extrabold" style={{ textTransform: 'uppercase', letterSpacing: 1 }}>
                {finalLabel(game.inningsPlayed ?? 0, game.scheduledInnings, i18n.language)}
            </Txt>
        </View>
    );
};

type DecisionKind = 'W' | 'L' | 'SV';

/**
 * G, P y SV: los de la lectura PRO (con récord y EFE) o, si no llega, los nombres que ya trae el calendario del Lite
 * (sin cifras). El equipo sale del resultado: el ganador y el salvado son del que ganó; el perdedor, del otro.
 */
const decisionsOf = (game: ScheduleGame, summary: PortadaGame | null | undefined): NonNullable<PortadaGame['decisions']> | null => {
    if (summary?.decisions) return summary.decisions;
    const lite = game.decisions;
    if (!lite) return null;
    const winner = game.away.isWinner ? game.away : game.home.isWinner ? game.home : null;
    const loser = winner ? (winner === game.away ? game.home : game.away) : null;
    const make = (person: { id: number; name: string } | null, team: ScheduleTeam | null): PortadaDecision | null =>
        person ? { id: person.id, name: person.name, teamId: team?.id ?? null, wins: null, losses: null, saves: null, era: null } : null;
    return { winner: make(lite.winner, winner), loser: make(lite.loser, loser), save: make(lite.save, winner) };
};

/** «1-0 · EFE 1.80», «1 SV · EFE 0.00» */
const decisionLine = (decision: PortadaDecision, kind: DecisionKind, t: (key: string, options?: Record<string, unknown>) => string) => {
    const parts: string[] = [];
    if (kind === 'SV' && decision.saves !== null) parts.push(t('pro.portada.final.saves', { count: decision.saves }));
    else if (kind !== 'SV' && decision.wins !== null && decision.losses !== null) parts.push(`${decision.wins}-${decision.losses}`);
    if (decision.era) parts.push(t('pro.portada.final.era', { era: decision.era }));
    return parts.join(' · ');
};

/**
 * Primer lanzamiento, duración y demora (gameInfo de MLB), lo que llegue: «1.er lanzamiento 8:13 p. m. · Duración
 * 2 h 56 min · Demora 1 h 13 min». La compacta no lleva la hora.
 */
const GameInfoLine: React.FC<{ game: ScheduleGamePro; timeZone: string; compact?: boolean }> = ({ game, timeZone, compact = false }) => {
    const { t, i18n } = useTranslation();
    const info = gameInfoParts(game.gameInfo);
    if (!info) return null;
    const span = (value: { hours: number; minutes: number }) =>
        value.hours ? t('pro.portada.final.info.hoursMinutes', { hours: value.hours, minutes: value.minutes }) : t('pro.portada.final.info.minutes', { count: value.minutes });
    const parts = [
        !compact && info.firstPitch ? t('pro.portada.final.info.firstPitch', { time: formatTime(info.firstPitch, i18n.language, timeZone) }) : null,
        info.duration ? t('pro.portada.final.info.duration', { value: span(info.duration) }) : null,
        info.delay ? t('pro.portada.final.info.delay', { value: span(info.delay) }) : null
    ].filter((part): part is string => !!part);
    if (!parts.length) return null;
    return (
        <Txt size={12} weight="semibold" tone="muted">
            {parts.join(' · ')}
        </Txt>
    );
};

/** La final destacada del día */
export const FinalCardFull: React.FC<FinalProps & { onShare: (game: ScheduleGame) => void }> = ({ game, summary, loading = false, timeZone, onShare }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const pro = useProColors();
    const ink = useInk();
    const { open, warm } = useOpen(game);
    const lang = i18n.language;
    const sides = sideOf(game, lang);
    const winProb = summary?.winProb ?? null;
    const keyPlay = summary?.keyPlay ?? null;
    const decisions = decisionsOf(game, summary);
    const teamOf = (id: number | null | undefined) => (id === game.away.id ? game.away : id === game.home.id ? game.home : null);
    const awayName = sides.away.name;
    const homeName = sides.home.name;
    const winner = game.away.isWinner ? game.away : game.home.isWinner ? game.home : null;
    const loserTeam = winner === game.away ? game.home : game.away;
    const label = winner
        ? t('pro.portada.final.aria', { winner: teamDisplayName(winner, lang), winnerRuns: winner.score ?? 0, loser: teamDisplayName(loserTeam, lang), loserRuns: loserTeam.score ?? 0 })
        : t('pro.portada.final.ariaTie', { away: awayName, home: homeName, awayRuns: game.away.score ?? 0, homeRuns: game.home.score ?? 0 });

    let swingLabel = '';
    if (winProb?.home.length) {
        const maxAway = Math.max(...winProb.home.map((home) => 100 - home));
        const maxHome = Math.max(...winProb.home);
        swingLabel = t('pro.portada.final.swingAria', {
            away: awayName,
            home: homeName,
            maxAway: fmtPercent(maxAway, 0, lang, true),
            maxHome: fmtPercent(maxHome, 0, lang, true),
            winner: winner ? teamDisplayName(winner, lang) : '—'
        });
    }

    let play: { title: string; headline: string; scored: string | null; wpa: string; pressure: string | null; color: string } | null = null;
    if (keyPlay) {
        const { effect, batting, score, helped } = keyPlayEffect(keyPlay);
        const event = eventName({ eventLabel: keyPlay.label, event: keyPlay.event }, lang) || t('pro.portada.final.play');
        const battingTeam = game[batting];
        const helpedTeam = game[helped];
        play = {
            title: t('pro.portada.final.keyPlay', { half: t(keyPlay.top ? 'pro.portada.final.top' : 'pro.portada.final.bottom', { n: keyPlay.inning ?? '' }) }),
            headline: t(`pro.portada.final.effect.${effect}`, { name: keyPlay.batter?.name ?? '', event: event.toLowerCase(), score, team: battingTeam.abbrev }),
            scored: keyPlay.scored.length ? t('pro.portada.final.scored', { count: keyPlay.scored.length, names: joinNames(keyPlay.scored, lang) }) : null,
            wpa: `+${Math.abs(keyPlay.wpa).toFixed(1)}${lang.startsWith('en') ? '%' : ' %'} ${helpedTeam.abbrev}`,
            pressure: keyPlay.li !== null ? t('pro.portada.final.pressure', { li: keyPlay.li.toFixed(2) }) : null,
            color: helpedTeam.color
        };
    }

    const rows = decisions
        ? (
              [
                  ['W', decisions.winner],
                  ['L', decisions.loser],
                  ['SV', decisions.save]
              ] as const
          ).filter((entry): entry is readonly [DecisionKind, PortadaDecision] => !!entry[1])
        : [];
    const badges = seriesBadges(game);
    // Chapas G/P/SV: el verde y el rojo se mezclan con la tinta para pasar 4.5:1 sobre su chapa en los dos temas
    const decisionTone = {
        W: { bg: alpha(pro.up, 0.16), ink: ink.tone('up') },
        L: { bg: alpha(pro.down, 0.16), ink: ink.tone('down') },
        SV: { bg: alpha(colors.accent, 0.15), ink: colors.accentInk }
    };

    return (
        <View accessibilityLabel={label} style={[{ gap: 14, borderRadius: radius.card, backgroundColor: colors.surface, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12 }, shadow('card')]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <FinalPill game={game} />
                    <Txt size={12} weight="semibold" tone="muted" numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
                        {game.venue}
                    </Txt>
                </View>
                {badges.length > 0 && (
                    <View style={{ flexShrink: 0, flexDirection: 'row', gap: 6 }}>
                        {badges.map((badge, index) => (
                            <Badge key={index} badge={badge} game={game} />
                        ))}
                    </View>
                )}
            </View>
            {(game.innings?.length ?? 0) > 0 ? <Linescore game={game} variant="final" label={t('pro.portada.linescore.label', { away: awayName, home: homeName })} /> : <CompactScore game={game} />}
            <GameInfoLine game={game} timeZone={timeZone} />
            {winProb?.home.length ? (
                <View style={{ gap: 6 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', columnGap: 8 }}>
                        <Txt eyebrow>{t('pro.portada.final.swing')}</Txt>
                        <Txt size={11} weight="bold" tone="muted">
                            {t('pro.portada.final.swingSource')}
                        </Txt>
                    </View>
                    <ProbSwing winProb={winProb} away={sides.away} home={sides.home} keyAt={keyPlay?.at ?? null} markerColor={play?.color} label={swingLabel} />
                </View>
            ) : loading ? (
                <Skeleton height={96} round={radius.tile} />
            ) : null}
            {play && (
                <View accessible accessibilityLabel={[play.title, play.headline, play.scored, play.wpa, play.pressure].filter(Boolean).join('. ')} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: radius.tile, backgroundColor: colors.raised, paddingHorizontal: 12, paddingVertical: 10 }}>
                    <LinearGradient colors={PRO_GRADIENT} {...PRO_GRADIENT_DIAGONAL} style={{ width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }}>
                        <Zap size={16} color="#ffffff" />
                    </LinearGradient>
                    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                        <Txt size={11} weight="extrabold" color={ink.mutedStrong} style={{ textTransform: 'uppercase', letterSpacing: 1.4 }}>
                            {play.title}
                        </Txt>
                        <Txt size={14} weight="bold" style={{ lineHeight: 19 }}>
                            {play.headline}
                        </Txt>
                        <Txt size={12} weight="semibold" color={ink.mutedStrong}>
                            {play.scored ? `${play.scored} · ` : ''}
                            <Txt size={12} weight="extrabold" color={ink.tone('up')}>
                                {play.wpa}
                            </Txt>
                            {play.pressure ? ` · ${play.pressure}` : ''}
                        </Txt>
                    </View>
                </View>
            )}
            {rows.length > 0 && (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                    {rows.map(([kind, decision]) => {
                        const team = teamOf(decision.teamId);
                        const tone = decisionTone[kind];
                        const line = decisionLine(decision, kind, t);
                        return (
                            <Pressable
                                key={kind}
                                onPress={() => router.push(`/jugador/${decision.id}`)}
                                accessibilityRole="link"
                                accessibilityLabel={[t(`pro.portada.final.${kind}Long`), decision.name, line].filter(Boolean).join(', ')}
                                style={({ pressed }) => ({ flex: 1, flexBasis: 0, minWidth: 0, gap: 7, borderRadius: radius.tile, backgroundColor: colors.raised, padding: 10, opacity: pressed ? 0.85 : 1 })}
                            >
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                    <PhotoWithLogo id={decision.id} name={decision.name} team={team} size={36} logo={15} />
                                    <View style={{ height: 20, justifyContent: 'center', borderRadius: radius.pill, paddingHorizontal: 6, backgroundColor: tone.bg }}>
                                        <Txt size={11} weight="extrabold" color={tone.ink}>
                                            {t(`pro.portada.final.${kind}`)}
                                        </Txt>
                                    </View>
                                </View>
                                <Txt size={13} weight="extrabold" numberOfLines={2} style={{ lineHeight: 16 }}>
                                    {decision.name}
                                </Txt>
                                {line ? (
                                    <Txt size={11.5} weight="semibold" color={ink.mutedStrong}>
                                        {line}
                                    </Txt>
                                ) : null}
                            </Pressable>
                        );
                    })}
                </View>
            )}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <Pressable onPress={open} onPressIn={warm} accessibilityRole="link" accessibilityLabel={t('pro.portada.final.openAria', { away: awayName, home: homeName })}>
                    <MoreLink>{t('pro.portada.final.open')}</MoreLink>
                </Pressable>
                <ProButton label={t('pro.portada.final.share')} accessibilityLabel={t('share.shareResult')} icon={(color) => <Share2 size={16} color={color} />} onPress={() => onShare(game)} />
            </View>
        </View>
    );
};

const CompactScore: React.FC<{ game: ScheduleGamePro }> = ({ game }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const notPlayed = isNotPlayed(game.detailedState);
    const row = (team: ScheduleTeam, side: 'away' | 'home') => {
        const dim = game.state === 'final' && !team.isWinner && !notPlayed;
        return (
            <View key={team.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <TeamLogo team={team} size={28} />
                    <Txt size={15} weight="extrabold" tone={dim ? 'muted' : 'ink'} numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
                        {teamDisplayName(team, i18n.language)}
                    </Txt>
                </View>
                {!notPlayed && (
                    <>
                        <Txt condensed size={24} tabular color={dim ? colors.muted : colors.ink} style={{ width: 34, textAlign: 'right' }}>
                            {String(team.score ?? 0)}
                        </Txt>
                        {game.totals && (
                            <>
                                <Txt condensed size={15} tabular tone="muted" style={{ width: 26, textAlign: 'right' }}>
                                    {String(game.totals[side].h ?? '—')}
                                </Txt>
                                <Txt condensed size={15} tabular tone="muted" style={{ width: 26, textAlign: 'right' }}>
                                    {String(game.totals[side].e ?? '—')}
                                </Txt>
                            </>
                        )}
                    </>
                )}
            </View>
        );
    };
    return (
        <View
            accessible
            accessibilityLabel={
                notPlayed
                    ? `${teamDisplayName(game.away, i18n.language)}, ${teamDisplayName(game.home, i18n.language)}: ${stateName(game.detailedState, i18n.language)}`
                    : t('pro.portada.final.scoreAria', { away: teamDisplayName(game.away, i18n.language), awayRuns: game.away.score ?? 0, home: teamDisplayName(game.home, i18n.language), homeRuns: game.home.score ?? 0 })
            }
            style={{ gap: 8 }}
        >
            {row(game.away, 'away')}
            {row(game.home, 'home')}
        </View>
    );
};

/** Final compacta (las demás del día) y los juegos pospuestos o cancelados */
export const FinalCardCompact: React.FC<FinalProps> = ({ game, summary, timeZone }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const ink = useInk();
    const { open, warm } = useOpen(game);
    const lang = i18n.language;
    const notPlayed = isNotPlayed(game.detailedState);
    const sides = sideOf(game, lang);
    const awayName = sides.away.name;
    const homeName = sides.home.name;
    const decisions = decisionsOf(game, summary);
    // Sin la pizarra del servidor nuevo (producción hoy) no hay hits ni errores: solo las carreras
    const totals = !!game.totals;
    const winProb = summary?.winProb?.home.length ? summary.winProb : null;
    const reason = game.reason ? (/rain/i.test(game.reason) ? t('pro.portada.reason.rain') : game.reason) : null;
    const decisionText = (decision: PortadaDecision | null, kind: DecisionKind) => {
        if (!decision) return null;
        const stats = [decision.wins !== null && decision.losses !== null && kind !== 'SV' ? `${decision.wins}-${decision.losses}` : kind === 'SV' && decision.saves !== null ? t('pro.portada.final.saves', { count: decision.saves }) : null, decision.era]
            .filter(Boolean)
            .join(', ');
        return (
            <Txt key={kind} size={12} weight="semibold" tone="muted" numberOfLines={1}>
                {`${t(`pro.portada.final.${kind}`)}: `}
                <Txt size={12} weight="semibold">{`${shortName(decision.name)}${stats ? ` (${stats})` : ''}`}</Txt>
            </Txt>
        );
    };
    const sparkLabel = winProb ? t('pro.portada.final.sparkAria', { away: awayName, home: homeName, winner: game.away.isWinner ? awayName : game.home.isWinner ? homeName : '—' }) : '';
    const headCell = (text: string, width: number) => (
        <Txt size={11} weight="extrabold" tone="muted" style={{ width, textAlign: 'right' }}>
            {text}
        </Txt>
    );
    return (
        <View
            accessibilityLabel={
                notPlayed
                    ? t('pro.portada.final.notPlayedAria', { away: awayName, home: homeName, state: stateName(game.detailedState, lang) })
                    : t('pro.portada.final.ariaTie', { away: awayName, home: homeName, awayRuns: game.away.score ?? 0, homeRuns: game.home.score ?? 0 })
            }
            style={[{ gap: 8, borderRadius: radius.card, backgroundColor: colors.surface, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 }, shadow('card')]}
        >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    {notPlayed ? (
                        <View style={{ height: 24, flexShrink: 1, justifyContent: 'center', borderRadius: radius.pill, paddingHorizontal: 10, backgroundColor: alpha(colors.live, 0.15) }}>
                            <Txt size={11} weight="extrabold" color={ink.tone('live')} numberOfLines={1}>
                                {`${stateName(game.detailedState, lang)}${reason ? ` · ${reason}` : ''}`}
                            </Txt>
                        </View>
                    ) : (
                        <Txt size={11} weight="extrabold" tone="muted" style={{ textTransform: 'uppercase', letterSpacing: 1 }}>
                            {finalLabel(game.inningsPlayed ?? 0, game.scheduledInnings, lang)}
                        </Txt>
                    )}
                    <Txt size={11} weight="semibold" tone="muted" numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
                        {`· ${game.venue}`}
                    </Txt>
                </View>
                {!notPlayed && totals && (
                    <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={{ flexDirection: 'row', gap: 4 }}>
                        {headCell(t('pro.portada.linescore.r'), 34)}
                        {headCell(t('pro.portada.linescore.h'), 26)}
                        {headCell(t('pro.portada.linescore.e'), 26)}
                    </View>
                )}
            </View>
            <CompactScore game={game} />
            {!notPlayed && <GameInfoLine game={game} timeZone={timeZone} compact />}
            {!notPlayed && (decisions || winProb) && (
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderTopWidth: 1, borderTopColor: alpha(colors.line, 0.1), paddingTop: 8 }}>
                    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                        {decisionText(decisions?.winner ?? null, 'W')}
                        {decisionText(decisions?.loser ?? null, 'L')}
                        {decisionText(decisions?.save ?? null, 'SV')}
                    </View>
                    {winProb && <ProbSpark winProb={winProb} away={sides.away} home={sides.home} label={sparkLabel} />}
                </View>
            )}
            <Pressable onPress={open} onPressIn={warm} accessibilityRole="link" accessibilityLabel={t('pro.portada.final.openAria', { away: awayName, home: homeName })} style={{ alignSelf: 'flex-start' }}>
                <MoreLink>{t('pro.portada.final.open')}</MoreLink>
            </Pressable>
        </View>
    );
};
