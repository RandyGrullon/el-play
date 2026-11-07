// «Cómo se juega» del Fantasy (el mismo contenido y orden que la web): pasos, tabla de puntos, ejemplos y las preguntas
// en acordeón. Todos los números salen de las reglas del día (rules), nunca escritos a mano. Se ve igual en el Lite y en
// PRO; abre en la pregunta que pidió el «?» que la llamó.
import React, { useEffect, useRef, useState, type ComponentRef, type RefObject } from 'react';
import { Pressable, ScrollView, View, type LayoutChangeEvent } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Clock, Coins, Crown, ListChecks, Users } from 'lucide-react-native';
import type { FantasyRules } from '../../lib/fantasy';
import { HELP_QUESTIONS, helpExamples, helpNumbers, scoringRows, type HelpQuestion } from '../../lib/fantasyHelp';
import { useColors } from '../../theme/theme';
import { alpha, radius, shadow } from '../../theme/tokens';
import { Card, Row, Txt } from '../ui';
import { signed } from './PlayerBits';
import { formatCredits } from './shared';

type Section = 'steps' | 'points' | 'examples' | 'faq';
const SECTIONS: Section[] = ['steps', 'points', 'examples', 'faq'];

export const HelpCenter: React.FC<{ rules: FantasyRules; initial?: HelpQuestion | null; scroller: RefObject<ComponentRef<typeof ScrollView> | null> }> = ({ rules, initial, scroller }) => {
    const { t, i18n } = useTranslation();
    const lang = i18n.language;
    const colors = useColors();
    const n = helpNumbers(rules);
    const ex = helpExamples(rules);
    const num = (value: number) => formatCredits(value, lang);
    const [open, setOpen] = useState<Set<HelpQuestion>>(() => new Set(initial ? [initial] : []));

    // Dónde queda cada parte (para saltar a ella) y cada pregunta (para abrir la ayuda en la que se pidió)
    const sectionY = useRef<Partial<Record<Section, number>>>({});
    const rootY = useRef(0);
    const faqY = useRef(0);
    const cardY = useRef(0);
    const questionY = useRef<Partial<Record<HelpQuestion, number>>>({});
    const jumped = useRef(false);
    const go = (y: number | undefined) => {
        if (y !== undefined) scroller.current?.scrollTo({ y: Math.max(0, rootY.current + y - 12), animated: true });
    };
    const jumpToInitial = () => {
        if (!initial || jumped.current) return;
        const y = questionY.current[initial];
        if (y === undefined || !faqY.current || !cardY.current) return;
        jumped.current = true;
        requestAnimationFrame(() => go(faqY.current + cardY.current + y));
    };
    useEffect(() => {
        jumped.current = false;
        if (initial) setOpen((current) => new Set([...current, initial]));
    }, [initial]);

    const toggle = (question: HelpQuestion) =>
        setOpen((current) => {
            const next = new Set(current);
            if (next.has(question)) next.delete(question);
            else next.add(question);
            return next;
        });

    const answer = (question: HelpQuestion) =>
        t(`fantasyHelp.faq.${question}.a`, {
            perTeam: n.perTeam,
            captain: num(n.captain),
            picks: n.picks,
            min: num(n.min),
            max: num(n.max),
            past: n.past,
            code: n.code
        });

    const steps = [
        { Icon: Users, text: t('fantasyHelp.steps.s1', { batters: n.batters, count: n.pitchers }) },
        { Icon: Coins, text: n.budget === null ? t('fantasyHelp.steps.s2NoCap') : t('fantasyHelp.steps.s2', { budget: num(n.budget) }) },
        { Icon: Crown, text: t('fantasyHelp.steps.s3', { captain: num(n.captain) }) },
        { Icon: ListChecks, text: t('fantasyHelp.steps.s4', { picks: n.picks }) },
        { Icon: Clock, text: t('fantasyHelp.steps.s5') }
    ];
    const chips = [
        t('fantasyHelp.rules.roster', { batters: n.batters, count: n.pitchers }),
        t('fantasyHelp.rules.perTeam', { n: n.perTeam }),
        t('fantasyHelp.rules.captain', { x: num(n.captain) }),
        n.budget === null ? t('fantasyHelp.rules.noCap') : t('fantasyHelp.rules.budget', { budget: num(n.budget) })
    ];

    const sectionLayout = (section: Section) => (event: LayoutChangeEvent) => {
        sectionY.current[section] = event.nativeEvent.layout.y;
        if (section === 'faq') {
            faqY.current = event.nativeEvent.layout.y;
            jumpToInitial();
        }
    };
    const title = (section: Section) => (
        <Txt size={20} weight="extrabold" accessibilityRole="header" style={{ letterSpacing: -0.3 }}>
            {t(`fantasyHelp.${section}.title`)}
        </Txt>
    );

    const table = (role: 'batter' | 'pitcher') => (
        <Card style={{ flexGrow: 1, flexBasis: 260, minWidth: 0, gap: 2 }}>
            <Txt eyebrow style={{ marginBottom: 6 }}>
                {t(role === 'batter' ? 'fantasyHelp.points.batters' : 'fantasyHelp.points.pitchers')}
            </Txt>
            {scoringRows(rules, role).map((row, index) => (
                <Row key={row.key} justify="space-between" gap={12} style={{ minHeight: 34, borderTopWidth: index ? 1 : 0, borderTopColor: colors.line }}>
                    <Txt size={14} style={{ flex: 1 }}>
                        {t(`fantasyHelp.points.${role}.${row.label}`)}
                    </Txt>
                    <Txt size={14} weight="extrabold" tabular color={row.points < 0 ? colors.live : undefined}>
                        {signed(row.points, lang)}
                    </Txt>
                </Row>
            ))}
        </Card>
    );

    return (
        <View
            style={{ gap: 20 }}
            onLayout={(event) => {
                rootY.current = event.nativeEvent.layout.y;
            }}
        >
            <Txt size={15} tone="muted" style={{ lineHeight: 21 }}>
                {t('fantasyHelp.lead')}
            </Txt>

            {/* Saltar a cada parte */}
            <View accessibilityLabel={t('fantasyHelp.jump')} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {SECTIONS.map((section) => (
                    <Pressable
                        key={section}
                        onPress={() => go(sectionY.current[section])}
                        accessibilityRole="button"
                        style={({ pressed }) => [{ height: 36, justifyContent: 'center', paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.surface, opacity: pressed ? 0.8 : 1 }, shadow('card')]}
                    >
                        <Txt size={13} weight="bold">
                            {t(`fantasyHelp.${section}.title`)}
                        </Txt>
                    </Pressable>
                ))}
            </View>

            {/* Las reglas del día de un vistazo */}
            <View style={{ gap: 8 }}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {chips.map((chip) => (
                        <View key={chip} style={{ borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: alpha(colors.accent, 0.12) }}>
                            <Txt size={12} weight="bold" tone="accentInk">
                                {chip}
                            </Txt>
                        </View>
                    ))}
                </View>
                <Txt size={13} tone="muted">
                    {t('fantasyHelp.rules.lock')}
                </Txt>
            </View>

            <View onLayout={sectionLayout('steps')} style={{ gap: 12 }}>
                {title('steps')}
                <Card style={{ gap: 14 }}>
                    {steps.map(({ Icon, text }, index) => (
                        <Row key={index} gap={12} align="flex-start">
                            <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: alpha(colors.accent, 0.14) }}>
                                <Txt size={14} weight="extrabold" tone="accentInk">
                                    {index + 1}
                                </Txt>
                            </View>
                            <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', gap: 8, paddingTop: 6 }}>
                                <Icon size={16} color={colors.muted} style={{ marginTop: 2 }} />
                                <Txt size={15} weight="semibold" style={{ flex: 1, lineHeight: 21 }}>
                                    {text}
                                </Txt>
                            </View>
                        </Row>
                    ))}
                </Card>
            </View>

            <View onLayout={sectionLayout('points')} style={{ gap: 12 }}>
                {title('points')}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                    {table('batter')}
                    {table('pitcher')}
                </View>
            </View>

            <View onLayout={sectionLayout('examples')} style={{ gap: 12 }}>
                {title('examples')}
                <Card style={{ gap: 12 }}>
                    {[
                        t('fantasyHelp.examples.soloHr', { hr: num(ex.solo.hr), run: num(ex.solo.run), rbi: num(ex.solo.rbi), total: num(ex.solo.total), captain: num(ex.solo.captain) }),
                        t('fantasyHelp.examples.double', { double: num(ex.double.double), rbi: num(ex.double.rbi), total: num(ex.double.total) }),
                        t('fantasyHelp.examples.pitcher', {
                            ip: ex.pitcher.ip,
                            outs: ex.pitcher.outs,
                            outsPts: num(ex.pitcher.outsPts),
                            k: ex.pitcher.k,
                            kPts: signed(ex.pitcher.kPts, lang),
                            er: ex.pitcher.er,
                            erPts: signed(ex.pitcher.erPts, lang),
                            h: ex.pitcher.h,
                            hPts: signed(ex.pitcher.hPts, lang),
                            bb: ex.pitcher.bb,
                            bbPts: signed(ex.pitcher.bbPts, lang),
                            winPts: signed(ex.pitcher.winPts, lang),
                            total: num(ex.pitcher.total)
                        })
                    ].map((text, index) => (
                        <Row key={index} gap={10} align="flex-start" style={{ borderTopWidth: index ? 1 : 0, borderTopColor: colors.line, paddingTop: index ? 12 : 0 }}>
                            <View style={{ width: 6, height: 6, borderRadius: 3, marginTop: 8, backgroundColor: colors.accent }} />
                            <Txt size={15} style={{ flex: 1, lineHeight: 21 }}>
                                {text}
                            </Txt>
                        </Row>
                    ))}
                </Card>
            </View>

            <View onLayout={sectionLayout('faq')} style={{ gap: 12 }}>
                {title('faq')}
                <View
                    onLayout={(event) => {
                        cardY.current = event.nativeEvent.layout.y;
                        jumpToInitial();
                    }}
                >
                <Card padded={false} style={{ overflow: 'hidden' }}>
                    {HELP_QUESTIONS.map((question, index) => {
                        const expanded = open.has(question);
                        return (
                            <View
                                key={question}
                                onLayout={(event) => {
                                    questionY.current[question] = event.nativeEvent.layout.y;
                                    if (question === initial) jumpToInitial();
                                }}
                                style={{ borderTopWidth: index ? 1 : 0, borderTopColor: colors.line, backgroundColor: expanded && question === initial ? alpha(colors.accent, 0.06) : 'transparent' }}
                            >
                                <Pressable
                                    onPress={() => toggle(question)}
                                    accessibilityRole="button"
                                    accessibilityState={{ expanded }}
                                    style={({ pressed }) => ({ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, opacity: pressed ? 0.7 : 1 })}
                                >
                                    <Txt size={15} weight="bold" style={{ flex: 1, lineHeight: 20 }}>
                                        {t(`fantasyHelp.faq.${question}.q`)}
                                    </Txt>
                                    <View style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }}>
                                        <ChevronDown size={20} color={colors.muted} />
                                    </View>
                                </Pressable>
                                {expanded && (
                                    <Txt size={14} tone="muted" style={{ paddingHorizontal: 16, paddingBottom: 16, marginTop: -4, lineHeight: 20 }}>
                                        {answer(question)}
                                    </Txt>
                                )}
                            </View>
                        );
                    })}
                </Card>
                </View>
            </View>
        </View>
    );
};
