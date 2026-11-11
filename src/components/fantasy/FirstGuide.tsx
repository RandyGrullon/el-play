// La guía de la primera vez (igual que la web): mientras no tengas equipo hoy y no la hayas cerrado, tres pasos cortos
// arriba del Fantasy: escoger 5 bateadores y 1 lanzador, nombrar el capitán y hacer los pronósticos. Cada paso tiene
// «Siguiente» y «Ver cómo se juega» (la ayuda en esa parte); al cerrarla no vuelve a salir en este teléfono.
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { BookOpen, X } from 'lucide-react-native';
import { rulesOf, type DayEntry, type FantasyDay } from '../../lib/fantasy';
import { HELP_TOPICS } from '../../lib/fantasyHelp';
import { dismissGuide, guideDismissed, showGuide } from '../../lib/fantasyQuick';
import { useColors } from '../../theme/theme';
import { alpha, radius, shadow } from '../../theme/tokens';
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
        { title: t('fantasyGuide.s1Title', { batters: rules.roster.batters, count: rules.roster.pitchers }), body: t('fantasyGuide.s1Body'), help: undefined },
        { title: t('fantasyGuide.s2Title', { x }), body: t('fantasyGuide.s2Body', { x }), help: HELP_TOPICS.captain },
        { title: t('fantasyGuide.s3Title'), body: t('fantasyGuide.s3Body', { pts: rules.picks.points }), help: HELP_TOPICS.picks }
    ];
    const current = steps[Math.min(step, steps.length - 1)];
    const last = step >= steps.length - 1;
    const close = () => {
        dismissGuide();
        setDismissed(true);
    };
    return (
        <View accessibilityLabel={t('fantasyGuide.label')} style={[{ borderRadius: radius.card, backgroundColor: colors.surface, padding: 16, gap: 10, borderWidth: 1, borderColor: alpha(colors.accent, 0.35) }, shadow('card')]}>
            <Row justify="space-between" gap={8}>
                <Txt eyebrow color={colors.accentInk} accessibilityLiveRegion="polite">
                    {`${t('fantasyGuide.label')} · ${t('fantasyGuide.step', { n: step + 1, total: steps.length })}`}
                </Txt>
                <Pressable onPress={close} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('fantasyGuide.dismiss')}>
                    <X size={18} color={colors.muted} />
                </Pressable>
            </Row>
            <Row gap={6}>
                {steps.map((_, index) => (
                    <View key={index} style={{ flex: 1, height: 4, borderRadius: radius.pill, backgroundColor: index <= step ? colors.accent : colors.raised }} />
                ))}
            </Row>
            <View style={{ gap: 2 }}>
                <Txt size={18} weight="extrabold" accessibilityRole="header">
                    {current.title}
                </Txt>
                <Txt size={14} tone="muted">
                    {current.body}
                </Txt>
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
                    onPress={() => openHelp(current.help)}
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
