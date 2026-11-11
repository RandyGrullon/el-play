// La guía de la primera vez (igual que la web): mientras no tengas equipo hoy y no la hayas cerrado, tres pasos cortos
// arriba del Fantasy: escoger 5 bateadores y 1 lanzador, nombrar el capitán y hacer los pronósticos. Cada paso tiene
// «Siguiente» y «Ver cómo se juega» (la ayuda en esa parte); al cerrarla no vuelve a salir en este teléfono.
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { BookOpen, Crown, Target, Users, X } from 'lucide-react-native';
import { rulesOf, type DayEntry, type FantasyDay } from '../../lib/fantasy';
import { dismissGuide, guideDismissed, showGuide } from '../../lib/fantasyQuick';
import { useColors } from '../../theme/theme';
import { alpha, radius } from '../../theme/tokens';
import { Row, Txt } from '../ui';
import { useOpenHelp } from './Help';
import { formatCredits } from './shared';

export const FirstGuide: React.FC<{ day: FantasyDay; entry: DayEntry; isToday: boolean }> = ({ day, entry, isToday }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const [dismissed, setDismissed] = useState(guideDismissed);
    const [step, setStep] = useState(0);
    const openHelp = useOpenHelp(day.date);
    if (!day.games.length || !showGuide(dismissed, isToday, entry)) return null;
    const rules = rulesOf(day);
    const x = formatCredits(rules.captain, i18n.language);
    const steps = [
        { Icon: Users, title: t('fantasyGuide.s1Title', { batters: rules.roster.batters, count: rules.roster.pitchers }), body: t('fantasyGuide.s1Body') },
        { Icon: Crown, title: t('fantasyGuide.s2Title', { x }), body: t('fantasyGuide.s2Body', { x }) },
        { Icon: Target, title: t('fantasyGuide.s3Title'), body: t('fantasyGuide.s3Body', { pts: formatCredits(rules.picks.points, i18n.language) }) }
    ];
    const current = steps[Math.min(step, steps.length - 1)];
    const last = step >= steps.length - 1;
    const Icon = current.Icon;
    const close = () => {
        dismissGuide();
        setDismissed(true);
    };
    return (
        <View accessibilityLabel={t('fantasyGuide.label')} style={{ borderRadius: radius.card, backgroundColor: alpha(colors.accent, 0.1), padding: 16, gap: 12, borderWidth: 1, borderColor: alpha(colors.accent, 0.2) }}>
            <Row justify="space-between" gap={8}>
                <Txt eyebrow color={colors.accentInk} style={{ flexShrink: 1 }}>
                    {`${t('fantasyGuide.label')} · ${t('fantasyGuide.step', { n: step + 1, total: steps.length })}`}
                </Txt>
                <Pressable onPress={close} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('fantasyGuide.dismiss')}>
                    <X size={18} color={colors.muted} />
                </Pressable>
            </Row>
            <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                <View style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent }}>
                    <Icon size={20} color="#fff" />
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Txt size={16} weight="extrabold" accessibilityRole="header">
                        {current.title}
                    </Txt>
                    <Txt size={14} tone="muted">
                        {current.body}
                    </Txt>
                </View>
            </View>
            <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {steps.map((_, index) => (
                    <View key={index} style={{ width: index === step ? 20 : 6, height: 6, borderRadius: radius.pill, backgroundColor: index === step ? colors.accent : alpha(colors.accent, 0.3) }} />
                ))}
            </View>
            <Row gap={8} wrap>
                <Pressable
                    onPress={() => (last ? close() : setStep((value) => value + 1))}
                    accessibilityRole="button"
                    style={({ pressed }) => ({ height: 40, justifyContent: 'center', borderRadius: radius.pill, paddingHorizontal: 18, backgroundColor: colors.accent, opacity: pressed ? 0.85 : 1 })}
                >
                    <Txt size={14} weight="extrabold" color="#fff">
                        {last ? t('fantasyGuide.done') : t('fantasyGuide.next')}
                    </Txt>
                </Pressable>
                <Pressable
                    onPress={() => openHelp()}
                    accessibilityRole="button"
                    style={({ pressed }) => ({ height: 40, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.pill, paddingHorizontal: 14, backgroundColor: colors.raised, opacity: pressed ? 0.85 : 1 })}
                >
                    <BookOpen size={16} color={colors.ink} />
                    <Txt size={14} weight="bold">
                        {t('fantasyGuide.how')}
                    </Txt>
                </Pressable>
            </Row>
        </View>
    );
};
