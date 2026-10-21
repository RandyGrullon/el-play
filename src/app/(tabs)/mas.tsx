// «Más»: cuenta, modo Lite/PRO, liga, tema, idioma, animaciones, pasarle El Play a alguien (los pasos de la web para
// instalarla según el navegador) y privacidad (igual que MorePage de la web).
import React, { useId, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { useTranslation } from 'react-i18next';
import { Check, ChevronRight, Share2 } from 'lucide-react-native';
import Svg, { Circle, Defs, G, LinearGradient, Path, Stop } from 'react-native-svg';
import { Screen } from '../../components/layout';
import { Card, Row, Segmented, Title, Txt } from '../../components/ui';
import { AccountCard } from '../../components/account/AccountCard';
import { ModeCard } from '../../components/pro/ModeCard';
import { InstallGuide } from '../../components/install/InstallGuide';
import { useLeague } from '../../state/league';
import { usePreferences, type AnimationMode } from '../../state/preferences';
import { useColors, useTheme, type ThemePreference } from '../../theme/theme';

// Textos que no están en los JSON compartidos
const LOCAL = {
    es: { version: 'Versión {{v}}' },
    en: { version: 'Version {{v}}' }
};

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <View style={{ gap: 8 }}>
        <Txt eyebrow accessibilityRole="header">
            {title}
        </Txt>
        {children}
    </View>
);

export default function MoreScreen() {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const router = useRouter();
    const { leagues, activeLeague, setActiveLeague } = useLeague();
    const { preference, setPreference } = useTheme();
    const { animationMode, setAnimationMode } = usePreferences();
    const lang = i18n.language.startsWith('en') ? 'en' : 'es';
    const version = Constants.expoConfig?.version ?? '1.0.0';
    const [invite, setInvite] = useState(false);

    return (
        <Screen contentStyle={{ gap: 24 }}>
            <Title>{t('more.title')}</Title>

            <Section title={t('more.account')}>
                <AccountCard />
            </Section>

            <Section title={t('pro.section')}>
                <ModeCard />
            </Section>

            <Section title={t('leagues.choose')}>
                <Card padded={false} style={{ overflow: 'hidden' }}>
                    {leagues.map((league, index) => {
                        const active = league.id === activeLeague;
                        return (
                            <Pressable
                                key={league.id}
                                onPress={() => setActiveLeague(league.id)}
                                accessibilityRole="button"
                                accessibilityState={{ selected: active }}
                                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: index ? 1 : 0, borderTopColor: colors.line, backgroundColor: pressed ? colors.raised : 'transparent' })}
                            >
                                <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: league.color }} />
                                <View style={{ flex: 1 }}>
                                    <Txt weight="bold">{t(`leagues.${league.id}.name`)}</Txt>
                                    <Txt size={14} tone="muted">
                                        {t(`leagues.${league.id}.fullName`)}
                                    </Txt>
                                </View>
                                {active && <Check size={20} color={colors.accentInk} />}
                            </Pressable>
                        );
                    })}
                </Card>
            </Section>

            <Section title={t('more.look')}>
                <View style={{ gap: 12 }}>
                    <Card>
                        <Row justify="space-between" gap={12} wrap>
                            <Txt weight="semibold">{t('more.theme')}</Txt>
                            <Segmented<ThemePreference>
                                small
                                value={preference}
                                onChange={setPreference}
                                options={[
                                    { value: 'system', label: capitalize(t('theme.system')) },
                                    { value: 'light', label: capitalize(t('theme.light')) },
                                    { value: 'dark', label: capitalize(t('theme.dark')) }
                                ]}
                            />
                        </Row>
                    </Card>
                    <Card>
                        <Row justify="space-between" gap={12} wrap>
                            <Txt weight="semibold">{t('more.language')}</Txt>
                            <Segmented<'es' | 'en'>
                                small
                                value={lang}
                                onChange={(value) => i18n.changeLanguage(value)}
                                options={[
                                    { value: 'es', label: 'Español' },
                                    { value: 'en', label: 'English' }
                                ]}
                            />
                        </Row>
                    </Card>
                    <Card style={{ gap: 12 }}>
                        <View>
                            <Txt weight="semibold">{t('more.playAnimations')}</Txt>
                            <Txt size={14} tone="muted">
                                {t(`more.animationHint.${animationMode}`)}
                            </Txt>
                        </View>
                        <Segmented<AnimationMode>
                            small
                            value={animationMode}
                            onChange={setAnimationMode}
                            options={[
                                { value: 'smart', label: t('more.animationMode.smart') },
                                { value: 'all', label: t('more.animationMode.all') },
                                { value: 'off', label: t('more.animationMode.off') }
                            ]}
                        />
                    </Card>
                </View>
            </Section>

            <Card padded={false} style={{ overflow: 'hidden' }}>
                <Pressable onPress={() => setInvite(true)} accessibilityRole="button" style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, opacity: pressed ? 0.7 : 1 })}>
                    <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.raised }}>
                        <Share2 size={18} color={colors.ink} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                        <Txt weight="semibold">{t('install.invite.row')}</Txt>
                        <Txt size={14} tone="muted">
                            {t('install.invite.rowHint')}
                        </Txt>
                    </View>
                    <ChevronRight size={18} color={colors.muted} />
                </Pressable>
            </Card>
            {invite && <InstallGuide onClose={() => setInvite(false)} />}

            <Card style={{ gap: 12 }}>
                <Row gap={12}>
                    <LogoMark size={44} />
                    <View style={{ flex: 1 }}>
                        <Txt weight="extrabold">El Play</Txt>
                        <Txt size={14} tone="muted">
                            {t('more.tagline')}
                        </Txt>
                        <Txt size={12} weight="semibold" tone="faint" tabular>
                            {LOCAL[lang].version.replace('{{v}}', version)}
                        </Txt>
                    </View>
                </Row>
                <Pressable
                    onPress={() => router.push('/privacidad')}
                    accessibilityRole="link"
                    style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 12, opacity: pressed ? 0.7 : 1 })}
                >
                    <Txt size={14} weight="semibold" tone="accentInk">
                        {t('privacy.title')}
                    </Txt>
                    <ChevronRight size={18} color={colors.accentInk} />
                </Pressable>
            </Card>
        </Screen>
    );
}

// ---------------------------------------------------------------- marca

// Home plate con los colores de la bandera y la pelota con sus costuras (las mismas formas de Logo.tsx de la web)
const PLATE_PATH = 'M14 5h36a6 6 0 0 1 6 6v21.6a6 6 0 0 1-1.76 4.24L36.24 54.84a6 6 0 0 1-8.48 0L9.76 36.84A6 6 0 0 1 8 32.6V11a6 6 0 0 1 6-6z';
const SEAM_LEFT = 'M23.4 17.4c3.1 2.6 4.8 5.8 4.8 9.3s-1.7 6.7-4.8 9.3';
const SEAM_RIGHT = 'M40.6 17.4c-3.1 2.6-4.8 5.8-4.8 9.3s1.7 6.7 4.8 9.3';

const LogoMark: React.FC<{ size?: number }> = ({ size = 28 }) => {
    const id = `plate-${useId().replace(/[^A-Za-z0-9]/g, '')}`;
    return (
        <Svg width={size} height={size} viewBox="0 0 64 64">
            <Defs>
                <LinearGradient id={id} x1="8" y1="5" x2="56" y2="57" gradientUnits="userSpaceOnUse">
                    <Stop offset="0" stopColor="#1e4fd8" />
                    <Stop offset="0.55" stopColor="#1e3a8a" />
                    <Stop offset="1" stopColor="#d61f3a" />
                </LinearGradient>
            </Defs>
            <Path d={PLATE_PATH} fill={`url(#${id})`} />
            <Path d={PLATE_PATH} fill="none" stroke="#fff" strokeOpacity={0.18} strokeWidth={1.2} />
            <Circle cx={32} cy={26.7} r={13} fill="#fff" />
            <Circle cx={32} cy={26.7} r={13} fill="none" stroke="#0b1220" strokeOpacity={0.12} strokeWidth={1} />
            {[SEAM_LEFT, SEAM_RIGHT].map((d) => (
                <G key={d} fill="none" stroke="#e11d2e" strokeLinecap="round">
                    <Path d={d} strokeWidth={1.3} />
                    <Path d={d} strokeWidth={1.7} strokeDasharray="0.01 2.3" transform={`translate(${d === SEAM_LEFT ? -1.1 : 1.1} 0)`} />
                </G>
            ))}
        </Svg>
    );
};
