// Pizarra de la jornada: juegos de hoy, en vivo, carreras del día (y las de ayer) y el próximo inicio con su cuenta
// regresiva, en tiles con el borde del degradado PRO. Debajo, la barra fina del avance de la temporada.
import React from 'react';
import { View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import type { LeagueId, ScheduleGame } from '../../../types';
import { formatTime } from '../../../lib/format';
import { useColors } from '../../../theme/theme';
import { PRO_GRADIENT, PRO_GRADIENT_DIAGONAL, PRO_GRADIENT_LINE, radius } from '../../../theme/tokens';
import { Txt } from '../../ui';
import { CountUp, MOTION_MS, ModuleHeader, countdownParts, pad2, useElementWidth, useGrow, useInView, useNow, useProColors } from '../kit';
import { dayIn, type DaySummary, type SeasonProgress } from './logic';
import { shortDate, useInk, weekdayShort } from './shared';

// Peso de cada tile en la fila (1 · 1 · 1.15 · 1.45, como el diseño)
const WEIGHTS = [1, 1, 1.15, 1.45];

// Los 4 tiles miden 104 px como en el diseño y, si un texto necesita más (otro idioma, letra más grande), la fila
// crece entera en vez de que el texto se salga del borde.
const Tile: React.FC<{ label: string; aria: string; weight: number; children: React.ReactNode; sub?: React.ReactNode; narrow: boolean }> = ({ label, aria, weight, children, sub, narrow }) => {
    const colors = useColors();
    const ink = useInk();
    return (
        <LinearGradient colors={PRO_GRADIENT} {...PRO_GRADIENT_DIAGONAL} style={{ flex: weight, flexBasis: 0, minWidth: 0, borderRadius: radius.tile, padding: 1 }}>
            <View
                accessible
                accessibilityLabel={aria}
                style={{ flexGrow: 1, minHeight: 104, justifyContent: 'space-between', gap: 4, borderRadius: radius.tile - 1, backgroundColor: colors.raised, paddingHorizontal: narrow ? 5 : 8, paddingTop: 10, paddingBottom: 9 }}
            >
                {children}
                <View style={{ gap: 1 }}>
                    <Txt size={narrow ? 10 : 11} weight="extrabold" color={ink.mutedStrong} style={{ textTransform: 'uppercase', letterSpacing: narrow ? 0 : 0.5, lineHeight: narrow ? 12 : 13 }}>
                        {label}
                    </Txt>
                    {sub}
                </View>
            </View>
        </LinearGradient>
    );
};

/** Número grande del tile (Barlow, 34 px) */
const Big: React.FC<{ children: React.ReactNode; color?: string }> = ({ children, color }) => (
    <Txt condensed size={34} tabular color={color} numberOfLines={1} style={{ lineHeight: 36 }}>
        {children}
    </Txt>
);

/** Línea chica debajo de la etiqueta */
const Sub: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const ink = useInk();
    return (
        <Txt size={12} weight="semibold" color={ink.mutedStrong} style={{ lineHeight: 14 }}>
            {children}
        </Txt>
    );
};

// Próximo inicio: cuenta por segundo (solo este tile se vuelve a pintar cada segundo)
const NextTile: React.FC<{ next: ScheduleGame | null; today: string; timeZone: string; narrow: boolean; width: number }> = ({ next, today, timeZone, narrow, width }) => {
    const { t, i18n } = useTranslation();
    const pro = useProColors();
    const ink = useInk();
    const now = useNow(next ? 1000 : null);
    const label = t('pro.portada.tiles.next');
    // Como clamp() de la web: el reloj se achica en pantallas angostas para no salirse del tile
    const big = Math.min(30, Math.max(22, width * 0.074));
    const small = Math.min(18, Math.max(14, width * 0.044));
    if (!next) {
        return (
            <Tile label={label} aria={t('pro.portada.tiles.nextNoneAria')} weight={WEIGHTS[3]} narrow={narrow} sub={<Sub>{t('pro.portada.tiles.nextNone')}</Sub>}>
                <Big>—</Big>
            </Tile>
        );
    }
    const ms = Date.parse(next.date) - now;
    const { days, hours, minutes, seconds } = countdownParts(Math.max(0, ms));
    const day = dayIn(next.date, timeZone);
    const when = next.startTimeTBD ? t('pro.portada.preview.tbd') : formatTime(next.date, i18n.language, timeZone);
    const matchup = t('pro.portada.tiles.matchup', { away: next.away.abbrev, home: next.home.abbrev });
    const unit = (text: string) => (
        <Txt condensed size={small} color={ink.mutedStrong}>
            {text}
        </Txt>
    );
    const clock =
        ms <= 0 ? (
            <Txt condensed size={Math.min(26, Math.max(20, width * 0.064))} color={pro.live} numberOfLines={1}>
                {t('pro.portada.tiles.now')}
            </Txt>
        ) : days > 0 ? (
            <Txt condensed size={big} tabular numberOfLines={1} style={{ lineHeight: big + 4 }}>
                {days}
                {unit(`${t('pro.portada.tiles.d')} `)}
                {hours}
                {unit(t('pro.portada.tiles.h'))}
            </Txt>
        ) : (
            <Txt condensed size={big} tabular numberOfLines={1} style={{ lineHeight: big + 4 }}>
                {`${hours}:${pad2(minutes)}`}
                {unit(`:${pad2(seconds)}`)}
            </Txt>
        );
    return (
        <Tile
            label={label}
            weight={WEIGHTS[3]}
            narrow={narrow}
            aria={t('pro.portada.tiles.nextAria', { away: next.away.name, home: next.home.name, time: day !== today ? `${weekdayShort(day, i18n.language)}, ${when}` : when })}
            sub={
                <>
                    <Sub>{matchup}</Sub>
                    <Sub>{day !== today ? `${weekdayShort(day, i18n.language)} · ${when}` : when}</Sub>
                </>
            }
        >
            {clock}
        </Tile>
    );
};

// Barra fina del avance de la temporada: se llena con el degradado (600 ms) al entrar en pantalla
const SeasonBar: React.FC<{ fraction: number; label: string }> = ({ fraction, label }) => {
    const colors = useColors();
    const { width, onLayout } = useElementWidth(326);
    const { setNode, onLayout: look, seen } = useInView();
    const grow = useGrow(fraction, seen, 0, MOTION_MS.count);
    const fill = useAnimatedStyle(() => ({ width: `${grow.get() * 100}%` }));
    return (
        <View
            ref={setNode}
            onLayout={(event) => {
                onLayout(event);
                look();
            }}
            accessible
            accessibilityRole="image"
            accessibilityLabel={label}
            style={{ height: 6, borderRadius: radius.pill, overflow: 'hidden', backgroundColor: colors.raised }}
        >
            {fraction > 0 && (
                <Animated.View style={[{ position: 'absolute', left: 0, top: 0, bottom: 0, overflow: 'hidden', borderRadius: radius.pill }, fill]}>
                    {/* El degradado mide la barra entera: lo lleno muestra su parte (azul → violeta → rojo al final) */}
                    <LinearGradient colors={PRO_GRADIENT} {...PRO_GRADIENT_LINE} style={{ width, height: 6 }} />
                </Animated.View>
            )}
        </View>
    );
};

interface PizarraProps {
    summary: DaySummary;
    progress: SeasonProgress | null;
    league: LeagueId;
    today: string;
    timeZone: string;
}

export const Pizarra: React.FC<PizarraProps> = ({ summary, progress, league, today, timeZone }) => {
    const { t, i18n } = useTranslation();
    const pro = useProColors();
    const { width } = useWindowDimensions();
    const { setNode, onLayout, seen } = useInView();
    const narrow = width < 360;
    const lang = i18n.language;
    const phase = league === 'lidom' ? 'regular' : 'tournament';
    let left = '';
    let right = '';
    if (progress) {
        const date = progress.nextDate ? shortDate(progress.nextDate, lang) : '';
        if (progress.stage === 'regular') left = t(`pro.portada.season.${phase}Day`, { day: progress.day, total: progress.total });
        else if (progress.stage === 'postseason') left = t('pro.portada.season.postDay', { day: progress.day, total: progress.total });
        else if (progress.stage === 'break') left = t(`pro.portada.season.${phase}Over`);
        else left = t('pro.portada.season.preseason');
        if (progress.nextKind === 'post') right = t(league === 'lidom' ? 'pro.portada.season.roundRobinFrom' : 'pro.portada.season.postFrom', { date });
        else if (progress.nextKind === 'end') right = t('pro.portada.season.endsOn', { date });
        else if (progress.nextKind === 'start') right = t('pro.portada.season.startsOn', { date });
    }
    const fraction = progress ? Math.min(1, Math.max(0, progress.fraction)) : 0;

    return (
        <View style={{ gap: 12 }}>
            <ModuleHeader title={t('pro.portada.tiles.title')} />
            <View ref={setNode} onLayout={onLayout} style={{ flexDirection: 'row', gap: 8 }}>
                <Tile label={t('pro.portada.tiles.games')} aria={t('pro.portada.tiles.gamesAria', { count: summary.games })} weight={WEIGHTS[0]} narrow={narrow}>
                    <Big>
                        <CountUp value={summary.games} seen={seen} />
                    </Big>
                </Tile>
                <Tile label={t('pro.portada.tiles.live')} aria={summary.live ? t('pro.portada.tiles.liveAria', { count: summary.live }) : t('pro.portada.tiles.liveNone')} weight={WEIGHTS[1]} narrow={narrow}>
                    <Big color={summary.live ? pro.live : undefined}>
                        <CountUp value={summary.live} seen={seen} />
                    </Big>
                </Tile>
                <Tile
                    label={t('pro.portada.tiles.runs')}
                    weight={WEIGHTS[2]}
                    narrow={narrow}
                    aria={summary.runsYesterday !== null ? t('pro.portada.tiles.runsAriaYesterday', { count: summary.runs, yesterday: summary.runsYesterday }) : t('pro.portada.tiles.runsAria', { count: summary.runs })}
                    sub={summary.runsYesterday !== null ? <Sub>{t('pro.portada.tiles.yesterday', { count: summary.runsYesterday })}</Sub> : undefined}
                >
                    <Big>
                        <CountUp value={summary.runs} seen={seen} />
                    </Big>
                </Tile>
                <NextTile next={summary.next} today={today} timeZone={timeZone} narrow={narrow} width={width} />
            </View>
            {progress && (
                <View style={{ gap: 7 }}>
                    <SeasonBar fraction={fraction} label={[left, right].filter(Boolean).join('. ')} />
                    {/* Sin recortar: si no caben en una línea, la derecha baja a la siguiente */}
                    <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', columnGap: 8, rowGap: 2 }}>
                        <Txt size={12} weight="semibold" tone="muted">
                            {left}
                        </Txt>
                        <Txt size={12} weight="semibold" tone="muted" style={{ marginLeft: 'auto', textAlign: 'right' }}>
                            {right}
                        </Txt>
                    </View>
                </View>
            )}
        </View>
    );
};
