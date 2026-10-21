import React, { useEffect, useState } from 'react';
import { Platform, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { ArrowUp, CloudSun, Footprints, Gavel, MapPin, ShieldCheck, Trophy } from 'lucide-react-native';
import type { GameDetail, TopPerformer } from '../../../types';
import type { GamePro, WinProb } from '../../../lib/pro/juego';
import { isNotPlayed } from '../../../lib/baseball';
import { useGamePro, useWinProb } from '../../../lib/pro/juego';
import { useColors } from '../../../theme/theme';
import { alpha } from '../../../theme/tokens';
import { Sheet, Txt } from '../../ui';
import { LiveProPanel } from '../LiveProPanel';
import { Chip, ChipRow, MOTION_EASE, MOTION_MS, ModuleHeader, ProSegmented, UpdatedAgo, shortName, toCelsius, useChipInk, useMotion, useNow } from '../kit';
import { KitDemo } from '../kit/__demo__/KitDemo';
import { ProLive } from './vivo/ProLive';
import { ContactTab } from './vivo/ContactTab';
import { FieldTab } from './vivo/FieldTab';
import { scoreBarBottom } from './vivo/ScoreBar';
import { useProScroll } from './vivo/scroll';
import { ProZone } from './zona/ProZone';
import { ProPlays } from './jugadas/ProPlays';
import { ProBox } from './box/ProBox';
import { ProPreview } from './previa/ProPreview';
import { ProFinal } from './final/ProFinal';

// Juego en modo PRO (armazón). La pantalla del juego pinta la cabecera de siempre (GameHero) y, con useIsPro(), esto
// debajo: franja de datos del juego → bloques del estado (previa / en vivo / final) → pestañas de detalle (se quedan
// pegadas arriba al bajar) → hojas. Cada estado vive en su carpeta (previa, vivo, final, jugadas, box, zona).

export interface ProGameProps {
    game: GameDetail;
    onShare: () => void;
    onSharePerformer: (performer: TopPerformer) => void;
    /** Cuándo llegó la última lectura (dataUpdatedAt de react-query): «Actualizado hace 3 s» */
    fetchedAt?: number;
    /** En vivo: el botón «Seguir en segundo plano» de la pantalla del juego (trae su propio margen) */
    follow?: React.ReactNode;
}

export type ProGameSheet = 'zone' | 'plays' | null;
export type ProGameTab = 'plays' | 'pitchers' | 'contact' | 'box' | 'field';
type PlaysView = 'plays' | 'box';

// Pestañas del detalle: en vivo con Jugadas y En el terreno; en el final la jugada a jugada está en la hoja
const TABS: Record<'live' | 'final', ProGameTab[]> = {
    live: ['plays', 'pitchers', 'contact', 'box', 'field'],
    final: ['pitchers', 'contact', 'box']
};

// Cada cuánto relee el juego en vivo (gameInterval: ~5 s): el anillo de «Actualizado» se vacía en ese tiempo
const LIVE_READ_MS = 5000;

// Banco de pruebas del kit (solo en desarrollo y en la web): localStorage 'el-play-kit-demo' = '1'
const kitDemo = () => {
    if (!__DEV__ || Platform.OS !== 'web' || typeof window === 'undefined') return false;
    try {
        return window.localStorage?.getItem('el-play-kit-demo') === '1';
    } catch {
        return false;
    }
};

/** Fase o serie del juego en palabras: «Serie final · juego 6 de 7 · AGU lidera 3-2», «Round Robin» */
const usePhase = (game: GameDetail) => {
    const { t } = useTranslation();
    const series = game.series;
    if (series?.name) {
        const parts = [series.game && series.total ? t('pro.kit.game.series', { name: series.name, game: series.game, total: series.total }) : series.game ? t('pro.kit.game.seriesGame', { name: series.name, game: series.game }) : series.name];
        const leader = series.leaderId === game.away.id ? game.away : series.leaderId === game.home.id ? game.home : null;
        if (series.over && leader) parts.push(t('pro.kit.game.seriesWon', { team: leader.abbrev, wins: series.wins, losses: series.losses }));
        else if (series.tied && (series.wins || series.losses)) parts.push(t('pro.kit.game.seriesTied', { wins: series.wins, losses: series.losses }));
        else if (leader) parts.push(t('pro.kit.game.seriesLead', { team: leader.abbrev, wins: series.wins, losses: series.losses }));
        return parts.join(' · ');
    }
    if (game.league === 'lidom' && game.gameType && ['R', 'L', 'W'].includes(game.gameType)) return t(`pro.kit.game.phase.${game.gameType}`);
    return null;
};

/** Anillo que se vacía hasta la próxima lectura (cada ~5 s en vivo). Decorativo: el texto de al lado dice la hora. */
const ReadRing: React.FC<{ at: number | undefined }> = ({ at }) => {
    const colors = useColors();
    const now = useNow(1000);
    const left = at ? Math.max(0, 1 - (now - at) / LIVE_READ_MS) : 0;
    const length = 2 * Math.PI * 4.5;
    return (
        <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={{ transform: [{ rotate: '-90deg' }] }}>
            <Svg width={12} height={12} viewBox="0 0 12 12">
                <Circle cx={6} cy={6} r={4.5} fill="none" stroke={alpha(colors.line, 0.2)} strokeWidth={2} />
                <Circle cx={6} cy={6} r={4.5} fill="none" stroke={colors.ball} strokeWidth={2} strokeDasharray={[length * left, length]} />
            </Svg>
        </View>
    );
};

/** Viento de MLB en palabras: «viento 16 km/h hacia el jardín izquierdo», con la flecha hacia donde sopla */
const useWind = (pro?: GamePro) => {
    const { t } = useTranslation();
    const wind = pro?.game.weather?.wind;
    if (!wind || wind.mph === null) return null;
    const kmh = Math.round(wind.mph * 1.609);
    const field = wind.field ? t(`pro.vivo.strip.field.${wind.field}`) : null;
    const text =
        wind.dir === 'calm' || wind.mph === 0
            ? t('pro.vivo.strip.windCalm')
            : wind.dir === 'out' && field
              ? t('pro.vivo.strip.windOut', { kmh, field })
              : wind.dir === 'in' && field
                ? t('pro.vivo.strip.windIn', { kmh, field })
                : wind.dir === 'cross'
                  ? t('pro.vivo.strip.windCross', { kmh })
                  : t('pro.vivo.strip.windOther', { kmh });
    return { text, deg: wind.dir === 'calm' || wind.mph === 0 ? null : wind.deg };
};

// Franja bajo la cabecera: fase o serie, demora, estadio, clima en °C con el viento, árbitro de home, retos ABS,
// visitas al montículo y «Actualizado hace…» con el anillo de la próxima lectura (solo datos reales: lo que MLB no
// manda no sale)
const ProGameStrip: React.FC<{ game: GameDetail; pro?: GamePro; fetchedAt?: number; onLayout?: (event: LayoutChangeEvent) => void }> = ({ game, pro, fetchedAt, onLayout }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const muted = useChipInk('neutral');
    const accent = useChipInk('accent');
    const phase = usePhase(game);
    const celsius = pro?.game.weather?.tempC ?? toCelsius(game.weather?.temp);
    const condition = game.weather?.condition ? t(`pro.vivo.strip.sky.${game.weather.condition.replace(/[^A-Za-z]/g, '')}`, { defaultValue: game.weather.condition }) : null;
    const wind = useWind(pro);
    const home = pro?.game.officials.find((official) => official.type === 'Home Plate');
    const abs = pro?.abs;
    const visits = pro?.moundVisits;
    const pair = (side: 'away' | 'home', used: number, left: number | null) => `${game[side].abbrev} ${used}/${left === null ? '—' : used + left}`;
    const weather = [celsius !== null && celsius !== undefined ? `${celsius} °C` : null, condition].filter(Boolean).join(' · ');
    return (
        <View onLayout={onLayout}>
            <ChipRow label={t('pro.kit.game.info')} bleed={false} inset={16} style={{ paddingTop: 12 }}>
                {phase ? (
                    <Chip tone="accent" icon={game.series?.championship ? <Trophy size={14} color={accent} /> : undefined}>
                        {phase}
                    </Chip>
                ) : null}
                {game.reason ? <Chip tone="warn">{t('pro.kit.game.delay', { reason: game.reason })}</Chip> : null}
                {game.venue ? <Chip icon={<MapPin size={14} color={muted} />}>{game.venue}</Chip> : null}
                {weather || wind ? (
                    <Chip icon={<CloudSun size={14} color={muted} />} accessibilityLabel={[weather, wind?.text].filter(Boolean).join(' · ')}>
                        <Txt size={12} weight="bold" numberOfLines={1}>
                            {weather}
                            {wind ? (
                                <Txt size={12} weight="bold" color={colors.accentInk}>
                                    {weather ? ' · ' : ''}
                                    {wind.text}
                                </Txt>
                            ) : null}
                        </Txt>
                        {wind && typeof wind.deg === 'number' ? <ArrowUp size={14} color={colors.accentInk} style={{ transform: [{ rotate: `${wind.deg}deg` }] }} /> : null}
                    </Chip>
                ) : null}
                {home ? <Chip icon={<Gavel size={14} color={muted} />}>{t('pro.vivo.strip.umpire', { name: shortName(home.name) })}</Chip> : null}
                {abs ? (
                    <Chip
                        icon={<ShieldCheck size={14} color={muted} />}
                        accessibilityLabel={t('pro.vivo.strip.absAria', { away: game.away.abbrev, awayOk: abs.away.ok, awayFail: abs.away.fail, home: game.home.abbrev, homeOk: abs.home.ok, homeFail: abs.home.fail })}
                    >
                        {t('pro.vivo.strip.abs', { away: `${game.away.abbrev} ${abs.away.ok}/${abs.away.fail}`, home: `${game.home.abbrev} ${abs.home.ok}/${abs.home.fail}` })}
                    </Chip>
                ) : null}
                {visits && (visits.away.used > 0 || visits.home.used > 0) ? (
                    <Chip icon={<Footprints size={14} color={muted} />}>{t('pro.vivo.strip.visits', { away: pair('away', visits.away.used, visits.away.left), home: pair('home', visits.home.used, visits.home.left) })}</Chip>
                ) : null}
                {game.state === 'live' && (
                    <Chip icon={<ReadRing at={fetchedAt} />}>
                        <UpdatedAgo at={fetchedAt || game.updatedAt} />
                    </Chip>
                )}
            </ChipRow>
        </View>
    );
};

/** El contenido de una pestaña entra con un fundido (sin movimiento, cambia de una vez) */
const FadeIn: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const motion = useMotion();
    const shown = useSharedValue(motion.animate ? 0 : 1);
    useEffect(() => {
        if (!motion.animate) {
            shown.set(1);
            return;
        }
        shown.set(withTiming(1, { duration: MOTION_MS.tab, easing: MOTION_EASE }));
        return () => cancelAnimation(shown);
        // Solo al montarse (cada pestaña monta el suyo con su key)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const style = useAnimatedStyle(() => ({ opacity: shown.get() }));
    return <Animated.View style={style}>{children}</Animated.View>;
};

// Pestañas de detalle (segmentado PRO): Jugadas | Lanzadores | Contacto | Box | En el terreno. El selector se queda
// pegado arriba al bajar (debajo de la barra de mando en vivo), el indicador se desliza y el contenido entra con
// un fundido. Va como hijos directos del scroll de la pantalla: así sus posiciones son las del contenido.
const ProGameTabs: React.FC<{ game: GameDetail; pro?: GamePro; winProb?: WinProb; tabs: ProGameTab[]; onOpenPlays: () => void }> = ({ game, pro, winProb, tabs, onOpenPlays }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const insets = useSafeAreaInsets();
    const scroll = useProScroll();
    const [tab, setTab] = useState<ProGameTab>(tabs[0]);
    const current = tabs.includes(tab) ? tab : tabs[0];
    const live = game.state === 'live';
    const stickyTop = live ? scoreBarBottom(insets.top) : insets.top + 4;
    const tabsY = useSharedValue(0);
    const panelEnd = useSharedValue(0);

    const stick = useAnimatedStyle(() => {
        if (!scroll || !tabsY.get()) return { transform: [{ translateY: 0 }] };
        const shift = Math.max(0, scroll.y.get() + stickyTop - tabsY.get());
        return { transform: [{ translateY: Math.min(shift, Math.max(0, panelEnd.get() - tabsY.get() - 60)) }] };
    });

    return (
        <>
            <View style={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: 4 }}>
                <ModuleHeader title={t('pro.kit.game.detail')} aside={game.state === 'final' ? t('pro.kit.game.sameAsLive') : undefined} />
            </View>
            <Animated.View
                onLayout={(event) => tabsY.set(event.nativeEvent.layout.y)}
                style={[{ zIndex: 20, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: alpha(colors.bg, 0.96) }, stick]}
            >
                <ProSegmented value={current} onChange={setTab} label={t('pro.kit.game.detail')} track="surface" fill={tabs.length <= 4} options={tabs.map((value) => ({ value, label: t(`pro.kit.game.tabs.${value}`) }))} />
            </Animated.View>
            <View
                onLayout={(event) => panelEnd.set(event.nativeEvent.layout.y + event.nativeEvent.layout.height)}
                style={{ paddingHorizontal: 16, paddingTop: 4 }}
            >
                <FadeIn key={current}>
                    {current === 'plays' && <ProPlays game={game} pro={pro} winProb={winProb} place="tab" onOpenAll={onOpenPlays} />}
                    {current === 'pitchers' && <LiveProPanel game={game} pro={pro} />}
                    {current === 'contact' && <ContactTab game={game} pro={pro} />}
                    {current === 'box' && <ProBox game={game} pro={pro} place="tab" />}
                    {current === 'field' && <FieldTab game={game} pro={pro} />}
                </FadeIn>
            </View>
        </>
    );
};

export const ProGame: React.FC<ProGameProps> = ({ game, onShare, onSharePerformer, fetchedAt, follow }) => {
    const { t } = useTranslation();
    const scroll = useProScroll();
    const notPlayed = isNotPlayed(game.detailedState);
    const phase: 'preview' | 'live' | 'final' = game.state === 'live' ? 'live' : game.state === 'final' && !notPlayed ? 'final' : 'preview';
    // Los extras PRO se piden una vez aquí y se pasan a cada bloque (llegan undefined mientras cargan o si la ruta
    // todavía no existe en el servidor: cada bloque se ve bien sin ellos)
    const pro = useGamePro(game.gamePk ?? undefined).data;
    const winProb = useWinProb(game.gamePk ?? undefined, game.currentAtBat, phase !== 'preview').data;
    const [sheet, setSheet] = useState<ProGameSheet>(null);
    const [playsView, setPlaysView] = useState<PlaysView>('plays');
    const openPlays = () => {
        setPlaysView('plays');
        setSheet('plays');
    };

    return (
        <>
            {kitDemo() && <KitDemo game={game} />}
            {/* Donde empieza lo PRO (bajo la cabecera): pasado este punto aparece la barra de mando */}
            <ProGameStrip game={game} pro={pro} fetchedAt={fetchedAt} onLayout={(event) => scroll?.top.set(event.nativeEvent.layout.y)} />

            <View style={{ paddingHorizontal: 16, paddingTop: 16, gap: 16 }}>
                {phase === 'preview' && <ProPreview game={game} pro={pro} onShare={onShare} />}
                {phase === 'live' && <ProLive game={game} pro={pro} winProb={winProb} onOpenZone={() => setSheet('zone')} />}
                {phase === 'final' && <ProFinal game={game} pro={pro} winProb={winProb} onShare={onShare} onSharePerformer={onSharePerformer} onOpenPlays={openPlays} />}
            </View>

            {phase === 'live' && follow}

            {phase !== 'preview' && <ProGameTabs game={game} pro={pro} winProb={winProb} tabs={TABS[phase]} onOpenPlays={openPlays} />}

            <Sheet open={sheet === 'zone'} onClose={() => setSheet(null)} title={t('pro.kit.game.zoneSheet')}>
                <ProZone game={game} pro={pro} />
            </Sheet>
            <Sheet open={sheet === 'plays'} onClose={() => setSheet(null)} title={t('pro.kit.game.playsSheet')}>
                <ProSegmented
                    value={playsView}
                    onChange={setPlaysView}
                    label={t('pro.kit.game.playsSwitch')}
                    track="surface"
                    options={[
                        { value: 'plays', label: t('pro.kit.game.playsView') },
                        { value: 'box', label: t('pro.kit.game.boxView') }
                    ]}
                />
                {playsView === 'plays' ? <ProPlays game={game} pro={pro} winProb={winProb} place="sheet" /> : <ProBox game={game} pro={pro} place="sheet" />}
            </Sheet>
        </>
    );
};
