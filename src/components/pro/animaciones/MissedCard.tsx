import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { ChevronDown, History, X } from 'lucide-react-native';
import type { GameTeam } from '../../../types';
import type { MissedSummary } from '../../../lib/playEvents';
import { describePlay } from '../../../lib/baseball';
import { useColors } from '../../../theme/theme';
import { PRO_GRADIENT, PRO_GRADIENT_DIAGONAL, PRO_GRADIENT_LINE, alpha, radius, shadow } from '../../../theme/tokens';
import { TeamLogo, Txt } from '../../ui';
import { MOTION_EASE, teamInk, useMotion, useProColors } from '../kit';

// «Te lo perdiste»: al volver del segundo plano, una tarjeta desde arriba con lo que pasó mientras no se miraba
// (carreras, jonrones, cambios de lanzador, el final) en vez de repetir las animaciones viejas. Se va sola en 8 s;
// «Ver jugadas» la abre con cada jugada y la deja quieta hasta cerrarla (también mientras se toca).

const STAY_MS = 8000;

const lastName = (name: string) => name.split(' ').slice(-1)[0];

interface MissedCardProps {
    summary: MissedSummary;
    /** El juego como está ahora (los equipos con su color y el marcador) */
    away: GameTeam;
    home: GameTeam;
    onClose: () => void;
}

export const MissedCard: React.FC<MissedCardProps> = ({ summary, away, home, onClose }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const pro = useProColors();
    const motion = useMotion();
    const insets = useSafeAreaInsets();
    const [open, setOpen] = useState(false);
    const [held, setHeld] = useState(false);
    const enter = useSharedValue(motion.animate ? 0 : 1);
    const fade = useSharedValue(motion.animate ? 1 : 0);
    const left = useSharedValue(1);
    const closing = useRef(false);
    const done = useRef(onClose);
    useEffect(() => {
        done.current = onClose;
    });

    const close = useCallback(() => {
        if (closing.current) return;
        closing.current = true;
        const ms = motion.animate ? 300 : 150;
        if (motion.animate) enter.set(withTiming(0, { duration: ms, easing: Easing.in(Easing.quad) }));
        else fade.set(withTiming(0, { duration: ms }));
        setTimeout(() => done.current(), ms + 20);
    }, [motion.animate, enter, fade]);

    useEffect(() => {
        if (motion.animate) enter.set(withTiming(1, { duration: 300, easing: MOTION_EASE }));
        else fade.set(withTiming(1, { duration: 150 }));
    }, [motion.animate, enter, fade]);

    // Se va sola a los 8 s, salvo si está abierta o con el dedo encima
    useEffect(() => {
        if (open || held) return;
        left.set(1);
        if (motion.animate) left.set(withTiming(0, { duration: STAY_MS, easing: Easing.linear }));
        const timer = setTimeout(close, STAY_MS);
        return () => {
            clearTimeout(timer);
            cancelAnimation(left);
        };
    }, [open, held, motion.animate, left, close]);

    const animate = motion.animate;
    const cardStyle = useAnimatedStyle(() => ({ opacity: animate ? enter.get() : fade.get(), transform: [{ translateY: (1 - enter.get()) * -160 }] }));
    const barStyle = useAnimatedStyle(() => ({ width: `${left.get() * 100}%` }));

    const pill = (key: string, text: string, tone: 'raised' | 'live' = 'raised') => (
        <View key={key} style={{ height: 28, borderRadius: radius.pill, paddingHorizontal: 10, justifyContent: 'center', backgroundColor: tone === 'live' ? alpha(colors.live, 0.15) : colors.raised }}>
            <Txt size={13} weight="bold" color={tone === 'live' ? pro.live : colors.ink} numberOfLines={1}>
                {text}
            </Txt>
        </View>
    );
    const items: React.ReactNode[] = [];
    ([['away', away], ['home', home]] as const).forEach(([side, team]) => {
        const runs = summary.runs[side];
        if (!runs) return;
        items.push(
            <View key={side} style={{ height: 28, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.pill, paddingLeft: 4, paddingRight: 10, backgroundColor: team.color }}>
                <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
                    <TeamLogo team={team} size={16} />
                </View>
                <Txt size={13} weight="extrabold" color={teamInk(team.color)}>
                    {t('pro.animaciones.missed.runs', { count: runs, team: team.abbrev })}
                </Txt>
            </View>
        );
    });
    summary.homers.forEach((homer, index) =>
        items.push(pill(`hr${index}`, homer.dist ? t('pro.animaciones.missed.homerFt', { name: lastName(homer.batter), ft: homer.dist }) : t('pro.animaciones.missed.homer', { name: lastName(homer.batter) })))
    );
    if (summary.pitchingChanges) items.push(pill('change', t('pro.animaciones.missed.changes', { count: summary.pitchingChanges })));
    if (summary.final) items.push(pill('final', t('pro.animaciones.missed.final', { away: away.abbrev, home: home.abbrev, a: away.runs, h: home.runs }), 'live'));
    if (!items.length) items.push(pill('plays', t('pro.animaciones.missed.plays', { count: summary.plays.length })));

    // Lo que oye el lector de pantalla al aparecer
    const spoken = [
        t('pro.animaciones.missed.title'),
        summary.runs.away ? t('pro.animaciones.missed.runs', { count: summary.runs.away, team: away.name }) : null,
        summary.runs.home ? t('pro.animaciones.missed.runs', { count: summary.runs.home, team: home.name }) : null,
        ...summary.homers.map((homer) => (homer.dist ? t('pro.animaciones.missed.homerFt', { name: homer.batter, ft: homer.dist }) : t('pro.animaciones.missed.homer', { name: homer.batter }))),
        summary.pitchingChanges ? t('pro.animaciones.missed.changes', { count: summary.pitchingChanges }) : null,
        summary.final ? t('pro.animaciones.missed.final', { away: away.abbrev, home: home.abbrev, a: away.runs, h: home.runs }) : null
    ]
        .filter(Boolean)
        .join('. ');

    return (
        <View pointerEvents="box-none" style={[styles.root, { paddingTop: insets.top + 10 }]}>
            <Animated.View
                onTouchStart={() => setHeld(true)}
                onTouchEnd={() => setHeld(false)}
                onTouchCancel={() => setHeld(false)}
                style={[{ width: '100%', maxWidth: 440, borderRadius: radius.card, overflow: 'hidden', backgroundColor: colors.surface, borderWidth: 1, borderColor: alpha(colors.line, 0.1) }, shadow('float'), cardStyle]}
            >
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 12, paddingBottom: 8 }}>
                    <LinearGradient colors={PRO_GRADIENT} {...PRO_GRADIENT_DIAGONAL} style={{ marginTop: 4, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }}>
                        <History size={18} color="#fff" />
                    </LinearGradient>
                    <View style={{ flex: 1, minWidth: 0 }} accessible accessibilityRole="alert" accessibilityLabel={spoken} accessibilityLiveRegion="polite">
                        <Txt eyebrow>{t('pro.animaciones.missed.title')}</Txt>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>{items}</View>
                    </View>
                    <Pressable onPress={close} accessibilityRole="button" accessibilityLabel={t('pro.animaciones.missed.close')} style={{ width: 44, height: 44, marginTop: -6, marginRight: -6, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }}>
                        <X size={20} color={colors.muted} />
                    </Pressable>
                </View>
                {summary.plays.length > 0 && (
                    <View style={{ paddingHorizontal: 12, paddingBottom: 12 }}>
                        <Pressable
                            onPress={() => setOpen((value) => !value)}
                            accessibilityRole="button"
                            accessibilityState={{ expanded: open }}
                            style={({ pressed }) => ({ height: 44, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: pressed ? alpha(colors.line, 0.2) : colors.raised })}
                        >
                            <Txt size={14} weight="bold">
                                {open ? t('pro.animaciones.missed.hide') : t('pro.animaciones.missed.see', { count: summary.plays.length })}
                            </Txt>
                            <ChevronDown size={16} color={colors.ink} style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }} />
                        </Pressable>
                        {open && (
                            <ScrollView style={{ maxHeight: 320, marginTop: 8 }} contentContainerStyle={{ gap: 6 }}>
                                {summary.plays.map((play) => {
                                    const team = play.top ? away : home;
                                    return (
                                        <View key={play.i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: radius.tile, backgroundColor: colors.raised, paddingHorizontal: 12, paddingVertical: 8 }}>
                                            <Txt size={13} weight="bold" tone="muted" tabular>
                                                {play.top ? '▲' : '▼'}
                                                {play.inning}
                                            </Txt>
                                            <Txt size={13} style={{ flex: 1, lineHeight: 18 }}>
                                                {describePlay(play.desc, i18n.language) || play.eventLabel}
                                            </Txt>
                                            <Txt size={11} weight="extrabold" tone="muted">
                                                {team.abbrev}
                                            </Txt>
                                        </View>
                                    );
                                })}
                            </ScrollView>
                        )}
                    </View>
                )}
                {!open && !held && (
                    <Animated.View style={[{ height: 3, overflow: 'hidden' }, barStyle]}>
                        <LinearGradient colors={PRO_GRADIENT} {...PRO_GRADIENT_LINE} style={{ flex: 1 }} />
                    </Animated.View>
                )}
            </Animated.View>
        </View>
    );
};

const styles = StyleSheet.create({
    root: { position: 'absolute', left: 0, right: 0, top: 0, zIndex: 46, elevation: 46, alignItems: 'center', paddingHorizontal: 12 }
});
