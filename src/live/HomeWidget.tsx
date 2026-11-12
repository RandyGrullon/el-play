// Widget de la pantalla de inicio y de la pantalla bloqueada del iPhone: tu juego (o el de en vivo, el próximo o el
// último), los otros del día y accesos directos (En vivo, Mi equipo, Fantasy, Posiciones).
// La función con 'widget' corre aparte, dentro de la extensión: solo componentes de @expo/ui/swift-ui, sin hooks,
// sin imports y sin nada declarado fuera de ella (todo lo que usa va adentro o llega en props, ya armado en
// lib/homeWidget.ts). No busca datos: muestra lo último que la app le pasó (hooks/useHomeWidget.ts).
// En app.json va como initialLayout: así sale en la galería de widgets aunque la app no se haya abierto todavía.
import { Circle, HStack, Image, Link, Rectangle, Spacer, Text, VStack, ZStack } from '@expo/ui/swift-ui';
import {
    background,
    containerBackground,
    font,
    foregroundStyle,
    frame,
    lineLimit,
    minimumScaleFactor,
    monospacedDigit,
    opacity,
    padding,
    rotationEffect,
    shapes,
    widgetURL
} from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';
import type { ReactElement } from 'react';
import type { HomeWidgetProps, WidgetGame, WidgetShortcut, WidgetTeam } from '../lib/homeWidget';

const HomeWidgetView = (props: HomeWidgetProps, environment: WidgetEnvironment) => {
    'widget';
    const dark = environment.colorScheme !== 'light';
    const bg = dark ? '#14151a' : '#ffffff';
    const ink = dark ? '#ffffff' : '#14151a';
    const muted = dark ? '#9a9db0' : '#6b6f80';
    const faint = dark ? 'rgba(255,255,255,0.12)' : 'rgba(20,21,26,0.08)';
    const liveRed = '#ff4d5e';
    const gold = '#f5b731';
    const family = environment.widgetFamily ?? 'systemSmall';
    const home = 'elplay://';
    const game = props.featured;

    // ------------------------------------------------------------ Pantalla bloqueada (monocromo)
    if (family === 'accessoryInline') {
        const line = game ? `${game.away.abbrev} ${game.away.runs || ''}${game.away.runs ? '-' : 'vs'}${game.home.runs || ''} ${game.home.abbrev} · ${game.status}` : props.emptyText;
        return <Text modifiers={[widgetURL(game?.url ?? home)]}>{line}</Text>;
    }
    if (family === 'accessoryRectangular') {
        if (!game) {
            return (
                <VStack alignment="leading" spacing={1} modifiers={[containerBackground('clear', 'widget'), widgetURL(home)]}>
                    <Text modifiers={[font({ size: 15, weight: 'bold' })]}>El Play</Text>
                    <Text modifiers={[font({ size: 13 }), lineLimit(2)]}>{props.emptyText}</Text>
                </VStack>
            );
        }
        const score = game.away.runs ? `${game.away.abbrev} ${game.away.runs} - ${game.home.runs} ${game.home.abbrev}` : `${game.away.abbrev} vs ${game.home.abbrev}`;
        return (
            <VStack alignment="leading" spacing={1} modifiers={[containerBackground('clear', 'widget'), widgetURL(game.url)]}>
                <Text modifiers={[font({ size: 12, weight: 'semibold' }), opacity(0.8), lineLimit(1)]}>{props.title || 'El Play'}</Text>
                <Text modifiers={[font({ size: 17, weight: 'heavy', design: 'rounded' }), monospacedDigit(), lineLimit(1), minimumScaleFactor(0.7)]}>{score}</Text>
                <Text modifiers={[font({ size: 13 }), lineLimit(1)]}>{props.stale ? `${game.status} · ${props.staleText}` : [game.status, game.detail].filter(Boolean).join(' · ')}</Text>
            </VStack>
        );
    }

    // ------------------------------------------------------------ Piezas
    const badge = (team: WidgetTeam, size: number) => (
        <ZStack modifiers={[frame({ width: size, height: size })]}>
            <Circle modifiers={[foregroundStyle(team.color)]} />
            <Text modifiers={[font({ size: Math.round(size * 0.36), weight: 'heavy', design: 'rounded' }), foregroundStyle(team.ink), lineLimit(1), minimumScaleFactor(0.5)]}>{team.abbrev}</Text>
        </ZStack>
    );
    const winnerDim = (item: WidgetGame, team: WidgetTeam, other: WidgetTeam) =>
        item.phase === 'final' && team.runs !== '' && Number(team.runs) < Number(other.runs) ? 0.55 : 1;
    const teamRow = (item: WidgetGame, team: WidgetTeam, other: WidgetTeam, size: number) => (
        <HStack spacing={7} modifiers={[opacity(winnerDim(item, team, other))]}>
            <Circle modifiers={[foregroundStyle(team.color), frame({ width: Math.round(size * 0.42), height: Math.round(size * 0.42) })]} />
            <Text modifiers={[font({ size: Math.round(size * 0.62), weight: 'heavy' }), foregroundStyle(ink), lineLimit(1)]}>{team.abbrev}</Text>
            <Spacer />
            {team.runs ? (
                <Text modifiers={[font({ size: Math.round(size * 0.85), weight: 'black', design: 'rounded' }), monospacedDigit(), foregroundStyle(ink)]}>{team.runs}</Text>
            ) : (
                <Text modifiers={[font({ size: Math.round(size * 0.46), weight: 'semibold' }), monospacedDigit(), foregroundStyle(muted)]}>{team.record}</Text>
            )}
        </HStack>
    );
    const liveDot = <Circle modifiers={[foregroundStyle(liveRed), frame({ width: 6, height: 6 })]} />;
    const statusLine = (item: WidgetGame, size: number) => (
        <HStack spacing={5}>
            {item.phase === 'live' ? liveDot : null}
            <Text modifiers={[font({ size, weight: 'bold' }), foregroundStyle(item.phase === 'live' ? liveRed : muted), lineLimit(1)]}>{item.status}</Text>
            {item.detail && !props.stale ? <Text modifiers={[font({ size }), foregroundStyle(muted), lineLimit(1)]}>{`· ${item.detail}`}</Text> : null}
            <Spacer />
        </HStack>
    );
    const base = (on: boolean, size: number) => <Rectangle modifiers={[foregroundStyle(on ? gold : faint), frame({ width: size, height: size }), rotationEffect(45)]} />;
    const bases = (item: WidgetGame, size: number) => (
        <VStack spacing={1}>
            {base(item.second, size)}
            <HStack spacing={Math.round(size * 0.8)}>
                {base(item.third, size)}
                {base(item.first, size)}
            </HStack>
        </VStack>
    );
    const header = (
        <HStack spacing={4}>
            <Text modifiers={[font({ size: 11, weight: 'heavy' }), foregroundStyle(muted), lineLimit(1)]}>{(props.title || 'El Play').toUpperCase()}</Text>
            <Spacer />
            {game?.mine ? <Image systemName="star.fill" size={10} color={gold} /> : null}
        </HStack>
    );
    const footer = props.stale ? (
        <Text modifiers={[font({ size: 11, weight: 'semibold' }), foregroundStyle(gold), lineLimit(1)]}>{props.staleText}</Text>
    ) : (
        <Text modifiers={[font({ size: 10 }), foregroundStyle(muted), lineLimit(1)]}>{props.updated}</Text>
    );
    const featuredBlock = (item: WidgetGame, size: number) => (
        <VStack alignment="leading" spacing={6}>
            {teamRow(item, item.away, item.home, size)}
            {teamRow(item, item.home, item.away, size)}
            <HStack spacing={8}>
                {statusLine(item, Math.round(size * 0.48))}
                {item.phase === 'live' && !props.stale ? bases(item, Math.round(size * 0.3)) : null}
            </HStack>
        </VStack>
    );
    const empty = (
        <VStack alignment="leading" spacing={4}>
            <Text modifiers={[font({ size: 17, weight: 'heavy' }), foregroundStyle(ink)]}>El Play</Text>
            <Text modifiers={[font({ size: 13 }), foregroundStyle(muted), lineLimit(3)]}>{props.emptyText}</Text>
        </VStack>
    );
    const shortcut = (item: WidgetShortcut) => (
        <Link destination={item.url} modifiers={[frame({ maxWidth: 1000 })]}>
            <VStack spacing={3} modifiers={[frame({ maxWidth: 1000, maxHeight: 1000 }), padding({ vertical: 6 }), background(faint, shapes.roundedRectangle({ cornerRadius: 12 }))]}>
                <Image systemName={item.icon} size={15} color={ink} />
                <Text modifiers={[font({ size: 10, weight: 'semibold' }), foregroundStyle(ink), lineLimit(1), minimumScaleFactor(0.7)]}>{item.label}</Text>
            </VStack>
        </Link>
    );
    const card = (padded: ReactElement, url: string) => (
        <VStack modifiers={[containerBackground(bg, 'widget'), widgetURL(url)]}>{padded}</VStack>
    );

    // ------------------------------------------------------------ Pequeño: el juego (todo el widget lo abre)
    if (family === 'systemSmall') {
        return card(
            <VStack alignment="leading" spacing={6}>
                {header}
                {game ? featuredBlock(game, 26) : empty}
                <Spacer />
                {footer}
            </VStack>,
            game?.url ?? home
        );
    }

    // ------------------------------------------------------------ Mediano: el juego y los cuatro accesos
    const grid = (
        <VStack spacing={6} modifiers={[frame({ width: 132 })]}>
            <HStack spacing={6}>
                {props.shortcuts[0] ? shortcut(props.shortcuts[0]) : null}
                {props.shortcuts[1] ? shortcut(props.shortcuts[1]) : null}
            </HStack>
            <HStack spacing={6}>
                {props.shortcuts[2] ? shortcut(props.shortcuts[2]) : null}
                {props.shortcuts[3] ? shortcut(props.shortcuts[3]) : null}
            </HStack>
        </VStack>
    );
    if (family === 'systemMedium') {
        return card(
            <HStack spacing={12}>
                <VStack alignment="leading" spacing={6}>
                    {header}
                    {game ? featuredBlock(game, 24) : empty}
                    <Spacer />
                    {footer}
                </VStack>
                {grid}
            </HStack>,
            game?.url ?? home
        );
    }

    // ------------------------------------------------------------ Grande: el juego, los otros del día y los accesos
    const otherRow = (item: WidgetGame) => (
        <Link destination={item.url}>
            <HStack spacing={6} modifiers={[padding({ vertical: 3 })]}>
                {badge(item.away, 20)}
                <Text modifiers={[font({ size: 15, weight: 'heavy', design: 'rounded' }), monospacedDigit(), foregroundStyle(ink), frame({ width: 22 })]}>{item.away.runs}</Text>
                <Text modifiers={[font({ size: 12 }), foregroundStyle(muted)]}>-</Text>
                <Text modifiers={[font({ size: 15, weight: 'heavy', design: 'rounded' }), monospacedDigit(), foregroundStyle(ink), frame({ width: 22 })]}>{item.home.runs}</Text>
                {badge(item.home, 20)}
                <Spacer />
                {item.phase === 'live' ? liveDot : null}
                <Text modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle(item.phase === 'live' ? liveRed : muted), lineLimit(1)]}>{item.status}</Text>
            </HStack>
        </Link>
    );
    return card(
        <VStack alignment="leading" spacing={8}>
            <HStack spacing={6}>
                <Text modifiers={[font({ size: 13, weight: 'heavy' }), foregroundStyle(ink)]}>El Play</Text>
                {props.liveCount ? (
                    <Text modifiers={[font({ size: 11, weight: 'bold' }), foregroundStyle('#ffffff'), padding({ horizontal: 6, vertical: 2 }), background(liveRed, shapes.capsule())]}>{props.liveCount}</Text>
                ) : null}
                <Spacer />
                {footer}
            </HStack>
            {header}
            {game ? featuredBlock(game, 30) : empty}
            {props.others.length ? <Rectangle modifiers={[foregroundStyle(faint), frame({ height: 1 })]} /> : null}
            {props.others[0] ? otherRow(props.others[0]) : null}
            {props.others[1] ? otherRow(props.others[1]) : null}
            {props.others[2] ? otherRow(props.others[2]) : null}
            <Spacer />
            <HStack spacing={6} modifiers={[frame({ height: 52 })]}>
                {props.shortcuts[0] ? shortcut(props.shortcuts[0]) : null}
                {props.shortcuts[1] ? shortcut(props.shortcuts[1]) : null}
                {props.shortcuts[2] ? shortcut(props.shortcuts[2]) : null}
                {props.shortcuts[3] ? shortcut(props.shortcuts[3]) : null}
            </HStack>
        </VStack>,
        game?.url ?? home
    );
};

// Lo que sale antes de que la app le pase datos (recién instalado). Va escrito aquí y no con emptyHomeWidgetProps:
// este archivo se evalúa también al compilar la extensión, donde solo existe expo-widgets.
const firstProps: HomeWidgetProps = {
    ready: false,
    title: '',
    featured: null,
    others: [],
    liveCount: '',
    emptyText: 'Abre El Play para ver tus juegos aquí.',
    updated: '',
    stale: false,
    staleText: '',
    startedText: '',
    shortcuts: [
        { label: 'En vivo', url: 'elplay://en-vivo', icon: 'dot.radiowaves.left.and.right' },
        { label: 'Hoy', url: 'elplay://', icon: 'calendar' },
        { label: 'Fantasy', url: 'elplay://fantasy', icon: 'trophy.fill' },
        { label: 'Posiciones', url: 'elplay://posiciones', icon: 'list.number' }
    ]
};

/** Debe llamarse igual que en app.json (plugins → expo-widgets → widgets[].name) */
export const HomeWidget = createWidget<HomeWidgetProps>('ElPlayJuegos', HomeWidgetView, firstProps);
