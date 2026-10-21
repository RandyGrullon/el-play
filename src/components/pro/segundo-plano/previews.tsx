// Vistas previas del segundo plano dentro de la app: pantalla bloqueada, isla dinámica y notificación de Android,
// pintadas con las MISMAS props que reciben la Live Activity y la notificación (src/live/props.ts). El dibujo real lo
// hace el sistema con src/live/LiveGame.tsx y GameNotification.tsx; esto lo copia para que se vea en la app.
// La pantalla bloqueada y la isla son negras en los dos temas (así son en el iPhone); la notificación sigue el tema.
import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { Radio } from 'lucide-react-native';
import type { GameTeam } from '../../../types';
import type { LiveGameProps, LiveTeam } from '../../../live/types';
import { useColors, useTheme } from '../../../theme/theme';
import { PRO_GRADIENT, PRO_GRADIENT_LINE, alpha, radius } from '../../../theme/tokens';
import { TeamLogo, Txt } from '../../ui';
import { LiveDot } from '../kit';

// Colores del sistema (la pantalla bloqueada y la isla son oscuras siempre)
const NIGHT = { ink: '#f1f2f6', soft: '#c3c6d4', bright: '#e3e5ec', muted: '#9a9db0', faint: 'rgba(241,242,246,0.2)', gold: '#f2b84b', ball: '#34c778', strike: '#ff5a5f' };

/** Etiqueta de la jugada por tono (oscuro / claro), igual que la vista nativa */
export const tagColors = (tone: string, dark: boolean): [string, string] => {
    if (tone === 'hit') return dark ? ['rgba(96,152,255,0.2)', '#8fb5ff'] : ['rgba(37,99,235,0.12)', '#1d4ed8'];
    if (tone === 'hr') return dark ? ['rgba(242,184,75,0.2)', '#f2b84b'] : ['rgba(180,120,0,0.14)', '#7a4f00'];
    if (tone === 'k') return dark ? ['rgba(255,90,95,0.2)', '#ff8a8e'] : ['rgba(220,38,38,0.12)', '#b91c1c'];
    if (tone === 'walk') return dark ? ['rgba(52,199,120,0.18)', '#5fd897'] : ['rgba(22,163,74,0.14)', '#15803d'];
    return dark ? ['#343844', '#b4b7c6'] : ['#eceef3', '#4b4f5c'];
};

/** Logo del equipo en un círculo claro (como el PNG que baja el teléfono) */
const Logo: React.FC<{ team: GameTeam; size: number; ring?: string }> = ({ team, size, ring }) => (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#eceef3', alignItems: 'center', justifyContent: 'center', borderWidth: ring ? 2 : 0, borderColor: ring }}>
        <TeamLogo team={team} size={Math.round(size * 0.72)} />
    </View>
);

/** Diamante de bases: llenas en dorado, vacías con borde */
const Diamond: React.FC<{ props: LiveGameProps; width?: number; empty?: string }> = ({ props, width = 40, empty = 'rgba(241,242,246,0.45)' }) => {
    const base = (x: number, y: number, on: boolean, key: string) => (
        <Rect key={key} x={x - 4.5} y={y - 4.5} width={9} height={9} rx={1.5} transform={`rotate(45 ${x} ${y})`} fill={on ? NIGHT.gold : 'none'} stroke={on ? NIGHT.gold : empty} strokeWidth={1.5} />
    );
    return (
        <Svg width={width} height={width * 0.75} viewBox="0 0 40 30">
            {base(20, 8, props.second, 'second')}
            {base(9, 19, props.third, 'third')}
            {base(31, 19, props.first, 'first')}
        </Svg>
    );
};

const Dots: React.FC<{ on: number; total: number; color: string; off: string; size?: number; gap?: number }> = ({ on, total, color, off, size = 6, gap = 3 }) => (
    <View style={{ flexDirection: 'row', gap }}>
        {Array.from({ length: total }, (_, index) => (
            <View key={index} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: index < on ? color : off }} />
        ))}
    </View>
);

const CountDots: React.FC<{ props: LiveGameProps; muted: string; off: string }> = ({ props, muted, off }) => (
    <View style={{ gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <Txt size={11} weight="extrabold" color={muted} style={{ width: 10, lineHeight: 12 }}>
                B
            </Txt>
            <Dots on={props.balls} total={3} color={NIGHT.ball} off={off} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <Txt size={11} weight="extrabold" color={muted} style={{ width: 10, lineHeight: 12 }}>
                S
            </Txt>
            <Dots on={props.strikes} total={2} color={NIGHT.strike} off={off} />
        </View>
    </View>
);

/** Probabilidad de ganar en una barra fina partida en los dos colores */
const WinBar: React.FC<{ props: LiveGameProps; height: number }> = ({ props, height }) => (
    <View style={{ flex: 1, height, borderRadius: height / 2, overflow: 'hidden', flexDirection: 'row', backgroundColor: props.home.color }}>
        <View style={{ width: `${props.wpAway}%`, backgroundColor: props.away.color }} />
    </View>
);

const PlayTag: React.FC<{ label: string; tone: string; dark: boolean; height?: number }> = ({ label, tone, dark, height = 18 }) => {
    const [bg, fg] = tagColors(tone, dark);
    return (
        <View style={{ height, paddingHorizontal: 7, borderRadius: radius.pill, backgroundColor: bg, justifyContent: 'center', flexShrink: 0 }}>
            <Txt size={11} weight="extrabold" color={fg} numberOfLines={1} style={{ letterSpacing: 0.5 }}>
                {label}
            </Txt>
        </View>
    );
};

/** Lo que se lee de una vista previa: el resumen del juego y, si hay, la situación y la probabilidad */
const useSummary = (props: LiveGameProps) => {
    const { t } = useTranslation();
    const parts = [props.summary];
    const situation = props.live && !props.between;
    if (situation) {
        const bases = [props.first && t('pro.segundo-plano.a11y.first'), props.second && t('pro.segundo-plano.a11y.second'), props.third && t('pro.segundo-plano.a11y.third')].filter(Boolean);
        parts.push(bases.length ? t('pro.segundo-plano.a11y.bases', { bases: bases.join(', ') }) : t('pro.segundo-plano.a11y.basesEmpty'));
        parts.push(t('pro.segundo-plano.a11y.count', { balls: props.balls, strikes: props.strikes, outs: props.outs }));
        if (props.batterName) parts.push(`${props.batterLabel} ${props.batterName}${props.batterToday ? `, ${props.batterToday}` : ''}`);
        if (props.pitcherName) parts.push(`${props.pitcherLabel} ${props.pitcherName}${props.pitch ? `, ${props.pitch}` : ''}`);
    }
    if (props.lastText) parts.push(`${props.lastLabel}: ${props.lastText}`);
    if (props.wpAway >= 0) parts.push(t('pro.segundo-plano.a11y.winProb', { away: props.wpAwayText, home: props.wpHomeText }));
    return parts.join('. ');
};

interface PreviewProps {
    props: LiveGameProps;
    /** Equipos del detalle (para pintar sus logos) */
    away: GameTeam;
    home: GameTeam;
    style?: StyleProp<ViewStyle>;
}

const teamOf = (side: 'away' | 'home', props: LiveGameProps, away: GameTeam, home: GameTeam): [LiveTeam, GameTeam] => (side === 'away' ? [props.away, away] : [props.home, home]);

// ---------------------------------------------------------------- iPhone: pantalla bloqueada

/** El banner de la Live Activity en la pantalla bloqueada (lo mismo que `banner` de LiveGame.tsx en PRO) */
export const LockBanner: React.FC<PreviewProps> = ({ props, away, home, style }) => {
    const { t } = useTranslation();
    const summary = useSummary(props);
    const situation = props.live && !props.between;
    const lead = props.leader === 'away' ? props.away : props.leader === 'home' ? props.home : null;
    const half = (side: 'away' | 'home') => {
        const [team, detail] = teamOf(side, props, away, home);
        const isHome = side === 'home';
        return (
            <View style={{ flex: 1, flexDirection: isHome ? 'row-reverse' : 'row', alignItems: 'center', gap: 6, backgroundColor: team.color, paddingLeft: isHome ? 34 : 10, paddingRight: isHome ? 10 : 34 }}>
                <Logo team={detail} size={30} />
                <Txt size={13} weight="extrabold" color={team.ink} style={{ letterSpacing: 0.4 }}>
                    {team.abbrev}
                </Txt>
                <View style={{ flex: 1 }} />
                <Txt condensed size={40} color={team.ink} tabular style={{ lineHeight: 42 }}>
                    {team.runs}
                </Txt>
            </View>
        );
    };
    return (
        <View accessible accessibilityRole="image" accessibilityLabel={t('pro.segundo-plano.a11y.lock', { summary })} style={[{ borderRadius: 24, padding: 10, gap: 7, backgroundColor: 'rgba(18,20,26,0.9)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)', overflow: 'hidden' }, style]}>
            <View style={{ height: 50, borderRadius: 16, overflow: 'hidden', flexDirection: 'row' }}>
                {half('away')}
                {half('home')}
                <View style={{ position: 'absolute', left: 0, right: 0, top: 5, bottom: 5, alignItems: 'center' }} pointerEvents="none">
                    <View style={{ height: 40, minWidth: 64, paddingHorizontal: 8, borderRadius: 12, backgroundColor: 'rgba(11,12,16,0.55)', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            {props.live && <LiveDot size={6} color="#ff4d6a" />}
                            <Txt size={13} weight="extrabold" color="#fff" numberOfLines={1}>
                                {props.inningMark}
                            </Txt>
                        </View>
                        {situation && <Dots on={props.outs} total={3} color="#fff" off="rgba(255,255,255,0.3)" />}
                    </View>
                </View>
            </View>
            {situation && (
                <View style={{ height: 32, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 2 }}>
                    <Diamond props={props} />
                    <CountDots props={props} muted={NIGHT.muted} off={NIGHT.faint} />
                    <View style={{ width: 1, height: 26, backgroundColor: 'rgba(226,232,240,0.12)' }} />
                    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                        <Txt size={12} color={NIGHT.soft} numberOfLines={1}>
                            {`${props.batterLabel} `}
                            <Txt size={12} weight="bold" color={NIGHT.ink}>
                                {props.batterName}
                            </Txt>
                            {props.batterToday ? ` · ${props.batterToday}` : ''}
                        </Txt>
                        <Txt size={11} color={NIGHT.muted} numberOfLines={1}>
                            {[`${props.pitcherLabel} ${props.pitcherName}`, props.pitch].filter(Boolean).join(' · ')}
                        </Txt>
                    </View>
                </View>
            )}
            {!!props.lastText && (
                <View style={{ height: 18, flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                    {!!props.lastLabel && <PlayTag label={props.lastLabel} tone={props.lastTone} dark />}
                    <Txt size={12} color={NIGHT.bright} numberOfLines={1} style={{ flex: 1 }}>
                        {props.lastText}
                    </Txt>
                </View>
            )}
            <View style={{ height: 15, flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                {props.wpAway >= 0 ? (
                    <>
                        <Txt size={11} weight="bold" color={lead ? lead.light : NIGHT.soft} tabular>
                            {props.wpLeadText}
                        </Txt>
                        <WinBar props={props} height={4} />
                    </>
                ) : (
                    <Txt size={11} weight="bold" color={NIGHT.muted} numberOfLines={1} style={{ flex: 1 }}>
                        {props.live ? props.inning : 'El Play'}
                    </Txt>
                )}
                <Txt size={11} color={NIGHT.muted} numberOfLines={1}>
                    {props.updated}
                </Txt>
            </View>
            <LinearGradient colors={PRO_GRADIENT} {...PRO_GRADIENT_LINE} style={{ position: 'absolute', left: 18, right: 18, bottom: 3, height: 2, borderRadius: 1, opacity: 0.9 }} />
        </View>
    );
};

// ---------------------------------------------------------------- iPhone: isla dinámica

const ISLAND = '#000';

/** Compacta: logo y marcador a la izquierda; entrada y bases a la derecha */
export const IslandCompact: React.FC<PreviewProps> = ({ props, away, home, style }) => {
    const { t } = useTranslation();
    const summary = useSummary(props);
    const situation = props.live && !props.between;
    return (
        <View
            accessible
            accessibilityRole="image"
            accessibilityLabel={t('pro.segundo-plano.a11y.compact', { summary })}
            style={[{ alignSelf: 'center', width: 252, maxWidth: '100%', height: 37, borderRadius: 999, backgroundColor: ISLAND, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 7, paddingRight: 12 }, style]}
        >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Logo team={away} size={23} />
                <Txt condensed size={19} color="#fff" tabular>
                    {`${props.away.runs}-${props.home.runs}`}
                </Txt>
                {props.live && <LiveDot size={6} color="#ff4d6a" />}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Txt size={11} weight="extrabold" color={NIGHT.soft}>
                    {situation ? props.inningShort.replace(' ', '') : props.inningShort || props.inningMark}
                </Txt>
                {situation && <Diamond props={props} width={26} empty="rgba(241,242,246,0.5)" />}
            </View>
            {/* La cámara del teléfono, en medio */}
            <View style={{ position: 'absolute', left: '50%', top: 12, marginLeft: 22, width: 13, height: 13, borderRadius: 7, backgroundColor: '#0d1018' }} />
        </View>
    );
};

/** Mínima: el logo del que va ganando (empate: el marcador) */
export const IslandMinimal: React.FC<PreviewProps> = ({ props, away, home, style }) => {
    const { t } = useTranslation();
    const leader = props.leader === 'away' ? away : props.leader === 'home' ? home : null;
    const label = leader ? t('pro.segundo-plano.a11y.minimal', { team: leader.name }) : t('pro.segundo-plano.a11y.minimalTie', { score: `${props.away.runs}-${props.home.runs}` });
    return (
        <View accessible accessibilityRole="image" accessibilityLabel={label} style={[{ alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6 }, style]}>
            <View style={{ width: 126, height: 37, borderRadius: 999, backgroundColor: ISLAND }}>
                <View style={{ position: 'absolute', right: 18, top: 12, width: 13, height: 13, borderRadius: 7, backgroundColor: '#0d1018' }} />
            </View>
            <View style={{ width: 37, height: 37, borderRadius: 19, backgroundColor: ISLAND, alignItems: 'center', justifyContent: 'center' }}>
                {leader ? (
                    <Logo team={leader} size={25} />
                ) : (
                    <Txt condensed size={12} color="#fff" tabular>
                        {`${props.away.runs}-${props.home.runs}`}
                    </Txt>
                )}
            </View>
        </View>
    );
};

/** Expandida (al mantener pulsada): dos columnas con los logos, el marcador grande, la situación y la probabilidad */
export const IslandExpanded: React.FC<PreviewProps> = ({ props, away, home, style }) => {
    const { t } = useTranslation();
    const summary = useSummary(props);
    const situation = props.live && !props.between;
    const side = (which: 'away' | 'home') => {
        const [team, detail] = teamOf(which, props, away, home);
        const logo = (
            <View style={{ alignItems: 'center', gap: 3 }}>
                <Logo team={detail} size={36} ring={team.color} />
                <Txt size={11} weight="extrabold" color={NIGHT.soft} style={{ letterSpacing: 0.6 }}>
                    {team.abbrev}
                </Txt>
            </View>
        );
        const runs = (
            <Txt condensed size={48} color="#fff" tabular style={{ lineHeight: 50 }}>
                {team.runs}
            </Txt>
        );
        return (
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                {which === 'away' ? logo : runs}
                {which === 'away' ? runs : logo}
            </View>
        );
    };
    return (
        <View accessible accessibilityRole="image" accessibilityLabel={t('pro.segundo-plano.a11y.expanded', { summary })} style={[{ borderRadius: 44, backgroundColor: ISLAND, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14, gap: 8 }, style]}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6 }}>
                {side('away')}
                <View style={{ alignItems: 'center', gap: 5, paddingBottom: 6, maxWidth: 104 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                        {props.live && <LiveDot size={6} color="#ff4d6a" />}
                        <Txt size={12} weight="extrabold" color="#fff" numberOfLines={1} adjustsFontSizeToFit>
                            {props.inning}
                        </Txt>
                    </View>
                    {situation && <Dots on={props.outs} total={3} color={NIGHT.ink} off="rgba(241,242,246,0.22)" size={7} gap={4} />}
                </View>
                {side('home')}
            </View>
            {situation ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 34 }}>
                    <Diamond props={props} />
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Txt condensed size={26} color="#fff" tabular>
                            {props.count}
                        </Txt>
                        <CountDots props={props} muted={NIGHT.muted} off={NIGHT.faint} />
                    </View>
                    <View style={{ width: 1, height: 26, backgroundColor: 'rgba(226,232,240,0.14)' }} />
                    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                        <Txt size={12} color={NIGHT.muted} numberOfLines={1}>
                            {`${props.batterTag} `}
                            <Txt size={12} weight="bold" color={NIGHT.ink}>
                                {props.batterLast}
                            </Txt>
                            {` · ${props.pitcherTag} `}
                            <Txt size={12} weight="bold" color={NIGHT.ink}>
                                {props.pitcherLast}
                            </Txt>
                        </Txt>
                        {!!props.pitch && (
                            <Txt size={11} color={NIGHT.muted} numberOfLines={1}>
                                {props.pitch}
                            </Txt>
                        )}
                    </View>
                </View>
            ) : props.lastText ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                    {!!props.lastLabel && <PlayTag label={props.lastLabel} tone={props.lastTone} dark />}
                    <Txt size={12} color={NIGHT.bright} numberOfLines={1} style={{ flex: 1 }}>
                        {props.lastText}
                    </Txt>
                </View>
            ) : null}
            {props.wpAway >= 0 && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 15 }}>
                    <Txt size={11} weight="bold" color={props.away.light} tabular>
                        {props.wpAwayText}
                    </Txt>
                    <WinBar props={props} height={3} />
                    <Txt size={11} weight="bold" color={props.home.light} tabular>
                        {props.wpHomeText}
                    </Txt>
                </View>
            )}
        </View>
    );
};

// ---------------------------------------------------------------- Android: notificación fija

const useNotificationColors = () => {
    const colors = useColors();
    const { isDark } = useTheme();
    return { isDark, card: isDark ? '#262932' : colors.surface, ink: colors.ink, soft: isDark ? '#c3c6d4' : '#3d404c', muted: colors.muted, faint: alpha(colors.ink, 0.2), accent: colors.accentInk, line: alpha(colors.line, 0.08) };
};

/** Encabezado que dibuja el sistema: ícono de la app, nombre, la entrada y «ahora» */
const NotificationHeader: React.FC<{ text: string; accent: string; muted: string }> = ({ text, accent, muted }) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: accent, alignItems: 'center', justifyContent: 'center' }}>
            <Radio size={13} color="#fff" />
        </View>
        <Txt size={12} color={muted} numberOfLines={1} style={{ flex: 1 }}>
            {text}
        </Txt>
    </View>
);

/** Plegada (64 dp): logos, siglas y marcador; arriba la entrada y los outs */
export const NotificationCollapsed: React.FC<PreviewProps> = ({ props, away, home, style }) => {
    const { t } = useTranslation();
    const look = useNotificationColors();
    const colors = useColors();
    const summary = useSummary(props);
    const situation = props.live && !props.between;
    const status = situation ? `${props.inningMark} · ${props.outsText}` : props.inning;
    return (
        <View
            accessible
            accessibilityRole="image"
            accessibilityLabel={t('pro.segundo-plano.a11y.collapsed', { summary })}
            style={[{ minHeight: 64, borderRadius: 20, backgroundColor: look.card, paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 12 }, style]}
        >
            <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
                <Radio size={15} color="#fff" />
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                <Txt size={11} color={look.muted} numberOfLines={1}>
                    {`El Play · ${t('pro.segundo-plano.android.now')} · ${status}`}
                </Txt>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Logo team={away} size={18} />
                    <Txt size={15} weight="extrabold">
                        {props.away.abbrev}
                    </Txt>
                    <Txt condensed size={20} tabular>
                        {`${props.away.runs} – ${props.home.runs}`}
                    </Txt>
                    <Txt size={15} weight="extrabold">
                        {props.home.abbrev}
                    </Txt>
                    <Logo team={home} size={18} />
                </View>
            </View>
        </View>
    );
};

/** Expandida (hasta 256 dp): equipos, corredores, conteo, duelo, 3 jugadas y la probabilidad turno a turno */
export const NotificationExpanded: React.FC<PreviewProps & { stopText: string }> = ({ props, away, home, stopText, style }) => {
    const { t } = useTranslation();
    const look = useNotificationColors();
    const colors = useColors();
    const summary = useSummary(props);
    const situation = props.live && !props.between;
    const lead = props.leader === 'away' ? props.away : props.leader === 'home' ? props.home : null;
    const teamLine = (which: 'away' | 'home') => {
        const [team, detail] = teamOf(which, props, away, home);
        const behind = props.leader !== '' && props.leader !== which;
        return (
            <View style={{ height: 32, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 4, height: 24, borderRadius: 2, backgroundColor: team.color }} />
                <Logo team={detail} size={24} />
                <Txt size={15} weight="extrabold" color={behind ? look.soft : look.ink} numberOfLines={1} style={{ flex: 1 }}>
                    {team.short}
                </Txt>
                <Txt condensed size={30} color={behind ? look.soft : look.ink} tabular>
                    {team.runs}
                </Txt>
            </View>
        );
    };
    const runner = (label: string, name: string) =>
        name ? (
            <Txt size={11} weight="bold" color={look.soft} numberOfLines={1}>
                {`${label} ${name}`}
            </Txt>
        ) : null;
    const series = props.wpSeries;
    return (
        <View accessible accessibilityRole="image" accessibilityLabel={t('pro.segundo-plano.a11y.notification', { summary })} style={[{ borderRadius: 20, backgroundColor: look.card, overflow: 'hidden' }, style]}>
            <View style={{ paddingHorizontal: 14, paddingTop: 12 }}>
                <NotificationHeader text={`El Play · ${props.inning} · ${t('pro.segundo-plano.android.now')}`} accent={colors.accent} muted={look.muted} />
            </View>
            <View style={{ paddingHorizontal: 14, paddingTop: 8, paddingBottom: 10, gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                        {teamLine('away')}
                        {teamLine('home')}
                    </View>
                    {situation && (
                        <>
                            <View style={{ width: 1, height: 60, backgroundColor: look.line }} />
                            <View style={{ width: 112, gap: 4 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                    <Diamond props={props} width={34} empty={look.faint} />
                                    <View style={{ flex: 1, minWidth: 0 }}>
                                        {runner(t('pro.segundo-plano.a11y.third'), props.thirdName)}
                                        {runner(t('pro.segundo-plano.a11y.second'), props.secondName)}
                                        {runner(t('pro.segundo-plano.a11y.first'), props.firstName)}
                                    </View>
                                </View>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                    {(
                                        [
                                            ['B', props.balls, 3, look.isDark ? NIGHT.ball : colors.ball],
                                            ['S', props.strikes, 2, look.isDark ? NIGHT.strike : colors.strike],
                                            ['O', props.outs, 3, look.ink]
                                        ] as const
                                    ).map(([letter, on, total, color]) => (
                                        <View key={letter} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                                            <Txt size={11} weight="extrabold" color={look.muted}>
                                                {letter}
                                            </Txt>
                                            <Dots on={on} total={total} color={color} off={look.faint} gap={2} />
                                        </View>
                                    ))}
                                </View>
                            </View>
                        </>
                    )}
                </View>
                {situation && (
                    <View style={{ gap: 2 }}>
                        <Txt size={12} color={look.muted} numberOfLines={1}>
                            {`${props.batterLabel} `}
                            <Txt size={12} weight="bold" color={look.ink}>
                                {props.batterName}
                            </Txt>
                            {props.batterToday ? ` · ${props.batterToday}` : ''}
                        </Txt>
                        <Txt size={12} color={look.muted} numberOfLines={1}>
                            {`${props.pitcherLabel} `}
                            <Txt size={12} weight="bold" color={look.ink}>
                                {props.pitcherName}
                            </Txt>
                            {props.pitcherPitches ? ` · ${props.pitcherPitches}` : ''}
                        </Txt>
                    </View>
                )}
                {props.plays.length > 0 && (
                    <View style={{ gap: 4 }}>
                        {props.plays.map((play, index) => (
                            <View key={index} style={{ height: 20, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <PlayTag label={play.label} tone={play.tone} dark={look.isDark} height={20} />
                                <Txt size={12} color={index === 0 ? look.ink : look.soft} numberOfLines={1} style={{ flex: 1 }}>
                                    {play.text}
                                </Txt>
                            </View>
                        ))}
                    </View>
                )}
                {props.wpAway >= 0 && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 32 }}>
                        {series.length > 1 ? (
                            <View style={{ flexDirection: 'row', gap: 2, height: 28, backgroundColor: alpha(colors.ink, 0.05), borderRadius: 4, overflow: 'hidden' }}>
                                {series.map((value, index) => (
                                    <View key={index} style={{ width: 5 }}>
                                        <View style={{ height: 14, justifyContent: 'flex-end' }}>{value > 50.5 && <View style={{ height: Math.max(1, ((value - 50) / 50) * 14), backgroundColor: props.away.color }} />}</View>
                                        <View style={{ height: 14 }}>{value < 49.5 && <View style={{ height: Math.max(1, ((50 - value) / 50) * 14), backgroundColor: props.home.color }} />}</View>
                                    </View>
                                ))}
                            </View>
                        ) : (
                            <View style={{ width: 112, flexDirection: 'row' }}>
                                <WinBar props={props} height={4} />
                            </View>
                        )}
                        <View style={{ flex: 1, minWidth: 0 }}>
                            <Txt size={11} color={look.muted} numberOfLines={1}>
                                {props.wpLabel}
                            </Txt>
                            <Txt size={11} weight="bold" color={lead ? (look.isDark ? lead.light : lead.dark) : look.ink} tabular numberOfLines={1}>
                                {props.wpLeadText}
                            </Txt>
                        </View>
                    </View>
                )}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: look.line, paddingHorizontal: 14, minHeight: 44, gap: 8 }}>
                <Txt size={11} color={look.muted} numberOfLines={1} style={{ flex: 1 }}>
                    {props.updated}
                </Txt>
                {props.live && (
                    <Txt size={14} weight="semibold" color={look.accent}>
                        {stopText}
                    </Txt>
                )}
            </View>
        </View>
    );
};
