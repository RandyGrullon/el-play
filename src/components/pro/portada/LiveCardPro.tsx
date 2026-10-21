// Tarjeta PRO de un juego en vivo: las dos mitades de color con el marcador grande (odómetro, destello y «+1» al
// anotar), la situación (entrada, bases, outs, conteo), chapas que aplican (momento clave, no-hit, demora),
// la probabilidad de ganar de MLB, la mini pizarra, el duelo con la línea de hoy y quiénes siguen.
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { CloudRain, ShieldCheck, Zap } from 'lucide-react-native';
import type { ScheduleTeam } from '../../../types';
import type { ScheduleGamePro } from '../../../types/pro-juego';
import type { PortadaGame } from '../../../lib/pro/pantallas';
import { inningName, stateName } from '../../../lib/baseball';
import { usePrefetchGame } from '../../../lib/queries';
import { teamDisplayName } from '../../../lib/teams';
import { useColors } from '../../../theme/theme';
import { PRO_GRADIENT, PRO_GRADIENT_LINE, alpha, radius, shadow } from '../../../theme/tokens';
import { Skeleton, Txt } from '../../ui';
import { Gauge, LiveDot, MOTION_EASE, MOTION_MS, Odometer, PlusOne, lastName, shortName, useMotion, useProColors } from '../kit';
import { Linescore } from './Linescore';
import { ProbBar, ProbStrip } from './ProbCharts';
import { teamFill } from './logic';
import { MoreLink, PhotoWithLogo, useInk, useLineText } from './shared';

interface LiveCardProps {
    game: ScheduleGamePro;
    summary?: PortadaGame | null;
    /** El resumen PRO todavía no llega (primera lectura) */
    loading?: boolean;
}

// Mitad de un equipo: nombre y carreras; al anotar el dígito rueda, la mitad destella y salta «+1». El destello y el
// «+1» salen solo cuando el marcador pasa del más alto que ya se vio: una misma carrera nunca se celebra dos veces.
const Half: React.FC<{ team: ScheduleTeam; align: 'start' | 'end'; big: number }> = ({ team, align, big }) => {
    const { i18n } = useTranslation();
    const motion = useMotion();
    const score = team.score ?? 0;
    const [jump, setJump] = useState({ best: score, count: 0, runs: 0 });
    // Estado derivado en el render (sin efecto): solo cuando el marcador supera lo ya visto
    if (score > jump.best) setJump({ best: score, count: jump.count + 1, runs: score - jump.best });
    const glow = useSharedValue(0);
    useEffect(() => {
        if (jump.count === 0 || !motion.animate) return;
        glow.set(withSequence(withTiming(0.32, { duration: MOTION_MS.fade }), withTiming(0, { duration: 750, easing: MOTION_EASE })));
        return () => cancelAnimation(glow);
    }, [jump.count, motion.animate, glow]);
    const flash = useAnimatedStyle(() => ({ opacity: glow.get() }));
    const { bg, ink } = teamFill(team.color);
    const end = align === 'end';
    const name = teamDisplayName(team, i18n.language);
    return (
        <View style={{ flex: 1, flexBasis: 0, minWidth: 0, overflow: 'hidden', backgroundColor: bg, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12, gap: 4, alignItems: end ? 'flex-end' : 'flex-start' }}>
            <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: '#ffffff' }, flash]} />
            <Txt size={15} weight="extrabold" color={ink} numberOfLines={1} style={{ maxWidth: '100%', letterSpacing: -0.2, textAlign: end ? 'right' : 'left' }}>
                {name}
            </Txt>
            <Odometer value={score} size={big} color={ink} label={`${name} ${score}`} />
            <PlusOne trigger={jump.count} style={[{ top: 48, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.25)', paddingHorizontal: 8 }, end ? { left: 16 } : { right: 16 }]}>
                <Txt condensed size={20} color={ink}>
                    {`+${jump.runs}`}
                </Txt>
            </PlusOne>
        </View>
    );
};

// Una base: el rombo vacío siempre y, encima, el relleno que entra con escala y opacidad cuando hay corredor
const Base: React.FC<{ on: boolean; x: number; y: number; index: number }> = ({ on, x, y, index }) => {
    const colors = useColors();
    const motion = useMotion();
    const fill = useSharedValue(on && !motion.animate ? 1 : 0);
    useEffect(() => {
        const target = on ? 1 : 0;
        if (!motion.animate) {
            fill.set(target);
            return;
        }
        fill.set(withDelay(on ? motion.delay(index, 120) : 0, withTiming(target, { duration: on ? MOTION_MS.flip : MOTION_MS.fade, easing: MOTION_EASE })));
        return () => cancelAnimation(fill);
    }, [on, index, motion, fill]);
    const pop = useAnimatedStyle(() => ({ opacity: fill.get(), transform: [{ rotate: '45deg' }, { scale: 0.4 + 0.6 * fill.get() }] }));
    const size = 9;
    return (
        <>
            <View style={{ position: 'absolute', left: x - size / 2, top: y - size / 2, width: size, height: size, borderWidth: 1.6, borderColor: colors.muted, borderRadius: 1.5, transform: [{ rotate: '45deg' }] }} />
            <Animated.View style={[{ position: 'absolute', left: x - size / 2, top: y - size / 2, width: size, height: size, borderRadius: 1.5, backgroundColor: colors.gold }, pop]} />
        </>
    );
};

// Diamante: las bases ocupadas se llenan con escala (en el color de las bases de la app)
const Diamond: React.FC<{ runners: { first: boolean; second: boolean; third: boolean } }> = ({ runners }) => {
    const { t } = useTranslation();
    const occupied = [runners.first && t('pro.portada.live.first'), runners.second && t('pro.portada.live.second'), runners.third && t('pro.portada.live.third')].filter(Boolean) as string[];
    return (
        <View
            accessible
            accessibilityRole="image"
            accessibilityLabel={occupied.length ? t('pro.portada.live.runners', { bases: occupied.join(', ') }) : t('pro.portada.live.empty')}
            style={{ width: 38, height: 28, flexShrink: 0 }}
        >
            <Base on={runners.second} x={19} y={8} index={1} />
            <Base on={runners.first} x={29} y={18} index={0} />
            <Base on={runners.third} x={9} y={18} index={2} />
        </View>
    );
};

// Un out: se enciende con escala, en secuencia (150 ms entre uno y otro)
const OutDot: React.FC<{ on: boolean; index: number }> = ({ on, index }) => {
    const colors = useColors();
    const motion = useMotion();
    const lit = useSharedValue(on && !motion.animate ? 1 : 0);
    useEffect(() => {
        const target = on ? 1 : 0;
        if (!motion.animate) {
            lit.set(target);
            return;
        }
        lit.set(withDelay(on ? motion.delay(index, 150) : 0, withTiming(target, { duration: MOTION_MS.flip, easing: MOTION_EASE })));
        return () => cancelAnimation(lit);
    }, [on, index, motion, lit]);
    const dot = useAnimatedStyle(() => ({ opacity: lit.get(), transform: [{ scale: 0.4 + 0.6 * lit.get() }] }));
    return (
        <View style={{ width: 9, height: 9, borderRadius: 4.5, backgroundColor: alpha(colors.line, 0.2) }}>
            <Animated.View style={[{ width: 9, height: 9, borderRadius: 4.5, backgroundColor: colors.ink }, dot]} />
        </View>
    );
};

const Outs: React.FC<{ outs: number }> = ({ outs }) => {
    const { t } = useTranslation();
    return (
        <View accessible accessibilityRole="image" accessibilityLabel={t('pro.portada.live.outs', { count: outs })} style={{ flexDirection: 'row', gap: 4, flexShrink: 0 }}>
            {[0, 1, 2].map((index) => (
                <OutDot key={index} on={index < outs} index={index} />
            ))}
        </View>
    );
};

/** Chapa de la tarjeta (alto 30) */
const Badge: React.FC<{ icon: React.ReactNode; text: string; color: string; background: string; children?: React.ReactNode }> = ({ icon, text, color, background, children }) => (
    <View style={{ height: 30, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.pill, backgroundColor: background, paddingHorizontal: 11 }}>
        {icon}
        <Txt size={12} weight="extrabold" color={color} numberOfLines={1}>
            {text}
        </Txt>
        {children}
    </View>
);

export const LiveCardPro: React.FC<LiveCardProps> = ({ game, summary, loading = false }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const pro = useProColors();
    const ink = useInk();
    const prefetch = usePrefetchGame();
    const lineText = useLineText();
    const [width, setWidth] = useState(0);
    const live = game.live!;
    const between = live.inningState === 'Middle' || live.inningState === 'End';
    const lang = i18n.language;
    const winProb = summary?.winProb ?? null;
    const duel = summary?.duel ?? null;
    const away = { abbrev: game.away.abbrev, name: teamDisplayName(game.away, lang), color: game.away.color };
    const home = { abbrev: game.home.abbrev, name: teamDisplayName(game.home, lang), color: game.home.color };
    const teamOf = (id: number | null | undefined) => (id === game.away.id ? game.away : id === game.home.id ? game.home : null);
    const li = winProb?.last?.li ?? null;
    const delayed = /delay/i.test(game.detailedState);
    const pitcher = duel?.pitcher ?? (live.pitcher ? { ...live.pitcher, teamId: live.isTop ? game.home.id : game.away.id, hand: null, line: null } : null);
    const batter = duel?.batter ?? (live.batter ? { ...live.batter, teamId: live.isTop ? game.away.id : game.home.id, side: null, line: null } : null);
    const onDeck = duel?.onDeck ?? live.onDeck ?? null;
    const inHole = duel?.inHole ?? live.inHole ?? null;
    const inning = live.inning
        ? between
            ? inningName({ n: live.inning, isTop: live.isTop, state: live.inningState }, lang)
            : `${live.isTop ? '▲' : '▼'} ${t('pro.portada.live.inningShort', { n: live.inning })}`
        : stateName(game.detailedState, lang);
    const open = () => router.push(`/juego/${game.gamePk}`);
    const warm = () => {
        prefetch(game.gamePk).catch(() => undefined);
    };
    const score = `${away.name} ${game.away.score ?? 0}, ${home.name} ${game.home.score ?? 0}`;
    // Marcador grande: 64 px en pantallas angostas, 76 desde 360 (como la web)
    const big = width > 0 && width < 328 ? 64 : 76;
    // En el duelo, a 320 px solo cabe el apellido («Armstrong», como el diseño)
    const duelName = (name: string) => (width > 0 && width < 328 ? lastName(name, true) : shortName(name, true));

    const chips: React.ReactNode[] = [];
    if (li !== null && li > 2) {
        chips.push(
            <LinearGradient key="li" colors={PRO_GRADIENT} {...PRO_GRADIENT_LINE} style={{ borderRadius: radius.pill, padding: 1 }}>
                <View style={{ height: 28, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.pill, backgroundColor: colors.surface, paddingHorizontal: 11 }}>
                    <Zap size={14} color={pro.warn} />
                    <Txt size={12} weight="extrabold" numberOfLines={1}>
                        {t('pro.portada.live.keyMoment')}
                    </Txt>
                    <Txt condensed size={14} tabular color={ink.tone('warn')}>{`×${li.toFixed(2)}`}</Txt>
                </View>
            </LinearGradient>
        );
    }
    if (game.flags?.perfectGame || game.flags?.noHitter) {
        const color = ink.tone('warn');
        chips.push(<Badge key="nohit" icon={<ShieldCheck size={14} color={color} />} text={t(game.flags.perfectGame ? 'pro.portada.live.perfect' : 'pro.portada.live.noHitter')} color={color} background={alpha(pro.warn, 0.16)} />);
    }
    if (delayed) {
        const color = ink.tone('inplay');
        const text = game.reason ? t('pro.portada.live.delayReason', { reason: /rain/i.test(game.reason) ? t('pro.portada.reason.rain') : game.reason }) : stateName(game.detailedState, lang);
        chips.push(<Badge key="delay" icon={<CloudRain size={14} color={color} />} text={text} color={color} background={alpha(colors.inplay, 0.15)} />);
    }
    const temp = summary?.weather?.tempC;

    return (
        <View
            accessibilityLabel={t('pro.portada.live.aria', { score, inning })}
            onLayout={(event) => setWidth(Math.round(event.nativeEvent.layout.width))}
            style={[{ borderRadius: radius.card, backgroundColor: colors.surface, overflow: 'hidden' }, shadow('float')]}
        >
            <Pressable onPress={open} onPressIn={warm} onHoverIn={warm} accessibilityRole="link" accessibilityLabel={t('pro.portada.live.open', { score })} style={({ pressed }) => ({ flexDirection: 'row', opacity: pressed ? 0.92 : 1 })}>
                <Half team={game.away} align="start" big={big} />
                <Half team={game.home} align="end" big={big} />
            </Pressable>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minWidth: 0, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: alpha(colors.line, 0.1) }}>
                <View style={{ height: 30, flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.pill, backgroundColor: alpha(colors.live, 0.15), paddingHorizontal: 11 }}>
                    <LiveDot size={8} />
                    <Txt size={13} weight="extrabold" color={ink.tone('live')} numberOfLines={1}>
                        {inning}
                    </Txt>
                </View>
                {!between && live.inning ? (
                    <>
                        <Diamond runners={live.runners} />
                        <Outs outs={live.outs} />
                        <View accessible accessibilityRole="text" accessibilityLabel={t('pro.portada.live.count', { balls: live.balls, strikes: live.strikes })} style={{ flexShrink: 0 }}>
                            <Txt condensed size={20} tabular>{`${live.balls}-${live.strikes}`}</Txt>
                        </View>
                        {batter && (
                            <Txt size={13} weight="semibold" tone="muted" numberOfLines={1} style={{ flex: 1, minWidth: 0, textAlign: 'right' }}>
                                {t('pro.portada.live.batting', { name: shortName(batter.name) })}
                            </Txt>
                        )}
                    </>
                ) : (
                    <Txt size={13} weight="semibold" tone="muted" numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
                        {t('game.betweenInnings')}
                    </Txt>
                )}
            </View>
            {chips.length > 0 && (
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    accessibilityLabel={t('pro.portada.live.badges')}
                    style={{ flexGrow: 0, borderBottomWidth: 1, borderBottomColor: alpha(colors.line, 0.1) }}
                    contentContainerStyle={{ gap: 6, paddingHorizontal: 16, paddingVertical: 12 }}
                >
                    {chips}
                </ScrollView>
            )}
            <View style={{ gap: 14, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 }}>
                {winProb?.last ? (
                    <View style={{ gap: 7 }}>
                        <ProbBar winProb={winProb} away={away} home={home} />
                        <ProbStrip winProb={winProb} away={away} home={home} scheduled={game.scheduledInnings || 9} />
                    </View>
                ) : loading ? (
                    <Skeleton height={74} round={radius.tile} />
                ) : null}
                {(game.innings?.length ?? 0) > 0 && <Linescore game={game} variant="live" label={t('pro.portada.linescore.label', { away: away.name, home: home.name })} />}
                {(pitcher || batter) && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.tile, backgroundColor: colors.raised, paddingHorizontal: 12, paddingVertical: 10 }}>
                        <View style={{ flex: 1.1, flexBasis: 0, minWidth: 0 }}>
                            {pitcher && (
                                <View accessible accessibilityLabel={[t('pro.portada.live.pitcher'), pitcher.name, pitcher.line?.np != null ? t('pro.portada.live.pitchesAria', { count: pitcher.line.np }) : null, pitcher.line ? t('pro.portada.line.ip', { value: pitcher.line.ip }) : null].filter(Boolean).join(', ')} style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                                    <Gauge value={pitcher.line?.np ?? 0} max={100} size={42} thickness={3} color={colors.hbp} label={pitcher.line?.np != null ? t('pro.portada.live.pitchesAria', { count: pitcher.line.np }) : t('pro.portada.live.pitcher')}>
                                        <PhotoWithLogo id={pitcher.id} name={pitcher.name} team={teamOf(pitcher.teamId)} size={32} logo={12} />
                                    </Gauge>
                                    <View style={{ flex: 1, minWidth: 0 }}>
                                        <Txt size={11} weight="extrabold" color={ink.mutedStrong} style={{ letterSpacing: 0.8 }}>
                                            {t('pro.portada.live.pitcherShort')}
                                        </Txt>
                                        <Txt size={14} weight="extrabold" numberOfLines={1}>
                                            {duelName(pitcher.name)}
                                        </Txt>
                                        {pitcher.line && (
                                            <Txt size={12} weight="semibold" color={ink.mutedStrong}>
                                                {pitcher.line.np !== null && (
                                                    <>
                                                        <Txt condensed size={14} tabular color={ink.tone('warn')}>
                                                            {String(pitcher.line.np)}
                                                        </Txt>
                                                        {` ${t('pro.portada.live.pitches', { count: pitcher.line.np })} · `}
                                                    </>
                                                )}
                                                {t('pro.portada.line.ip', { value: pitcher.line.ip })}
                                            </Txt>
                                        )}
                                    </View>
                                </View>
                            )}
                        </View>
                        <Txt size={11} weight="extrabold" color={ink.mutedStrong} importantForAccessibility="no">
                            vs
                        </Txt>
                        <View style={{ flex: 1, flexBasis: 0, minWidth: 0 }}>
                            {batter && (
                                <View
                                    accessible
                                    accessibilityLabel={[t('pro.portada.live.batterShort'), batter.name, batter.line && batter.line.ab + batter.line.bb > 0 ? t('pro.portada.live.today', { line: lineText({ hitting: batter.line, pitching: null }) }) : null].filter(Boolean).join(', ')}
                                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 7 }}
                                >
                                    <View style={{ flex: 1, minWidth: 0, alignItems: 'flex-end' }}>
                                        <Txt size={11} weight="extrabold" color={ink.mutedStrong} style={{ letterSpacing: 0.8 }}>
                                            {t('pro.portada.live.batterShort')}
                                        </Txt>
                                        <Txt size={14} weight="extrabold" numberOfLines={1} style={{ textAlign: 'right' }}>
                                            {duelName(batter.name)}
                                        </Txt>
                                        <Txt size={12} weight="semibold" color={ink.mutedStrong} style={{ textAlign: 'right' }}>
                                            {batter.line && batter.line.ab + batter.line.bb > 0 ? t('pro.portada.live.today', { line: lineText({ hitting: batter.line, pitching: null }) }) : duel ? t('pro.portada.live.firstToday') : ''}
                                        </Txt>
                                    </View>
                                    <PhotoWithLogo id={batter.id} name={batter.name} team={teamOf(batter.teamId)} size={36} />
                                </View>
                            )}
                        </View>
                    </View>
                )}
                {(onDeck || inHole) && (
                    <Txt size={13} weight="semibold" tone="muted">
                        {`${t('pro.portada.live.next')} `}
                        {[onDeck, inHole]
                            .filter((person): person is NonNullable<typeof person> => !!person)
                            .map((person, index) => (
                                <React.Fragment key={person.id}>
                                    {index > 0 && ', '}
                                    <Txt size={13} weight="bold">
                                        {shortName(person.name)}
                                    </Txt>
                                </React.Fragment>
                            ))}
                    </Txt>
                )}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 16, paddingBottom: 4 }}>
                <Txt size={12} weight="semibold" tone="muted" numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
                    {[game.venue, temp !== null && temp !== undefined ? `${temp} °C` : null].filter(Boolean).join(' · ')}
                </Txt>
                <Pressable onPress={open} onPressIn={warm} accessibilityRole="link" accessibilityLabel={t('pro.portada.live.open', { score })} hitSlop={4}>
                    <MoreLink>{t('pro.portada.live.see')}</MoreLink>
                </Pressable>
            </View>
        </View>
    );
};
