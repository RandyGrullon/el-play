// Live Activity del juego (iPhone): banner de la pantalla bloqueada y regiones de la isla dinámica.
// La función con 'widget' corre aparte, dentro de la extensión: solo componentes de @expo/ui/swift-ui, sin hooks,
// sin imports y sin nada declarado fuera de ella (todo lo que usa va adentro o llega en props).
import { Circle, HStack, Rectangle, Spacer, Text, VStack, ZStack } from '@expo/ui/swift-ui';
import {
    activityBackgroundTint,
    background,
    clipShape,
    font,
    foregroundStyle,
    frame,
    lineLimit,
    minimumScaleFactor,
    monospacedDigit,
    opacity,
    padding,
    rotationEffect,
    shapes
} from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity, type LiveActivityEnvironment } from 'expo-widgets';
import type { LiveGameProps, LiveTeam } from './types';

const LiveGame = (props: LiveGameProps, environment: LiveActivityEnvironment) => {
    'widget';
    const white = '#ffffff';
    const muted = '#9a9db0';
    const faint = 'rgba(255,255,255,0.22)';
    const gold = '#f5b731';
    const green = '#34c778';
    const red = '#ff4d5e';
    const stale = environment.isStale === true;
    const situation = props.live && !props.between;

    // Sigla en el círculo del color del equipo (los logos de MLB son SVG y la extensión no los pinta)
    const badge = (team: LiveTeam, size: number) => (
        <ZStack modifiers={[frame({ width: size, height: size })]}>
            <Circle modifiers={[foregroundStyle(team.color)]} />
            <Text modifiers={[font({ size: Math.round(size * 0.34), weight: 'heavy', design: 'rounded' }), foregroundStyle(team.ink), lineLimit(1), minimumScaleFactor(0.5)]}>{team.abbrev}</Text>
        </ZStack>
    );
    // Sigla en cápsula: se lee sobre el negro de la isla aunque el color del equipo sea oscuro
    const chip = (team: LiveTeam) => (
        <Text modifiers={[font({ size: 11, weight: 'heavy' }), foregroundStyle(team.ink), padding({ horizontal: 5, vertical: 2 }), background(team.color, shapes.capsule())]}>{team.abbrev}</Text>
    );
    const runs = (value: string, size: number) => (
        <Text modifiers={[font({ size, weight: 'black', design: 'rounded' }), monospacedDigit(), foregroundStyle(white)]}>{value}</Text>
    );
    const base = (on: boolean, size: number) => <Rectangle modifiers={[foregroundStyle(on ? gold : faint), frame({ width: size, height: size }), rotationEffect(45)]} />;
    const bases = (size: number) => (
        <VStack spacing={1}>
            {base(props.second, size)}
            <HStack spacing={Math.round(size * 0.8)}>
                {base(props.third, size)}
                {base(props.first, size)}
            </HStack>
        </VStack>
    );
    const dot = (on: boolean, color: string) => <Circle modifiers={[foregroundStyle(on ? color : faint), frame({ width: 6, height: 6 })]} />;
    const outs = (
        <HStack spacing={3}>
            {dot(props.outs > 0, white)}
            {dot(props.outs > 1, white)}
            {dot(props.outs > 2, white)}
        </HStack>
    );
    const letter = (value: string) => <Text modifiers={[font({ size: 10, weight: 'bold' }), foregroundStyle(muted), frame({ width: 9 })]}>{value}</Text>;
    const count = (
        <VStack alignment="leading" spacing={3}>
            <HStack spacing={3}>
                {letter('B')}
                {dot(props.balls > 0, green)}
                {dot(props.balls > 1, green)}
                {dot(props.balls > 2, green)}
            </HStack>
            <HStack spacing={3}>
                {letter('S')}
                {dot(props.strikes > 0, red)}
                {dot(props.strikes > 1, red)}
            </HStack>
        </VStack>
    );
    const duel = (
        <VStack alignment="leading" spacing={1}>
            <Text modifiers={[font({ size: 13, weight: 'semibold' }), foregroundStyle(white), lineLimit(1)]}>{props.batter}</Text>
            <Text modifiers={[font({ size: 12 }), foregroundStyle(muted), lineLimit(1)]}>{props.pitcher}</Text>
        </VStack>
    );
    const lastPlay = (
        <HStack spacing={8}>
            {props.lastLabel ? (
                <Text modifiers={[font({ size: 10, weight: 'heavy' }), foregroundStyle(white), lineLimit(1), padding({ horizontal: 7, vertical: 3 }), background('rgba(255,255,255,0.14)', shapes.capsule())]}>{props.lastLabel}</Text>
            ) : null}
            <Text modifiers={[font({ size: 13 }), foregroundStyle(white), lineLimit(1)]}>{props.lastText}</Text>
            <Spacer />
        </HStack>
    );

    // Marcador partido en los colores de los dos equipos, con la entrada en el medio
    const scoreBar = (
        <ZStack modifiers={[clipShape('roundedRectangle', 14)]}>
            <HStack spacing={0}>
                <HStack spacing={6} modifiers={[padding({ leading: 12, trailing: 36, vertical: 6 }), frame({ maxWidth: 1000 }), background(props.away.color)]}>
                    <Text modifiers={[font({ size: 16, weight: 'heavy' }), foregroundStyle(props.away.ink)]}>{props.away.abbrev}</Text>
                    <Spacer />
                    <Text modifiers={[font({ size: 30, weight: 'black', design: 'rounded' }), monospacedDigit(), foregroundStyle(props.away.ink)]}>{props.away.runs}</Text>
                </HStack>
                <HStack spacing={6} modifiers={[padding({ leading: 36, trailing: 12, vertical: 6 }), frame({ maxWidth: 1000 }), background(props.home.color)]}>
                    <Text modifiers={[font({ size: 30, weight: 'black', design: 'rounded' }), monospacedDigit(), foregroundStyle(props.home.ink)]}>{props.home.runs}</Text>
                    <Spacer />
                    <Text modifiers={[font({ size: 16, weight: 'heavy' }), foregroundStyle(props.home.ink)]}>{props.home.abbrev}</Text>
                </HStack>
            </HStack>
            <VStack spacing={3} modifiers={[padding({ horizontal: 8, vertical: 5 }), background('#14151a', shapes.roundedRectangle({ cornerRadius: 10 }))]}>
                <Text modifiers={[font({ size: 12, weight: 'bold' }), foregroundStyle(white), lineLimit(1)]}>{props.live ? props.inningShort : props.inning}</Text>
                {situation ? outs : null}
            </VStack>
        </ZStack>
    );

    return {
        // Apple corta el banner pasados 160 pt: con todo a la vista mide ~152 (padding 12, espacios de 6)
        banner: (
            <VStack spacing={6} modifiers={[padding({ all: 12 }), activityBackgroundTint('#0b0c10')]}>
                <VStack spacing={6} modifiers={[opacity(stale ? 0.55 : 1)]}>
                    {scoreBar}
                    {situation ? (
                        <HStack spacing={10}>
                            {bases(9)}
                            {count}
                            {duel}
                            <Spacer />
                        </HStack>
                    ) : null}
                    {props.lastText ? lastPlay : null}
                </VStack>
                <HStack>
                    <Text modifiers={[font({ size: 11, weight: 'bold' }), foregroundStyle(muted)]}>{props.live ? props.inning : 'El Play'}</Text>
                    <Spacer />
                    <Text modifiers={[font({ size: 11 }), foregroundStyle(stale ? gold : muted), lineLimit(1)]}>{stale ? props.staleText : props.updated}</Text>
                </HStack>
            </VStack>
        ),
        compactLeading: (
            <HStack spacing={4} modifiers={[padding({ leading: 2 })]}>
                {chip(props.away)}
                {runs(props.away.runs, 15)}
            </HStack>
        ),
        compactTrailing: (
            <HStack spacing={4} modifiers={[padding({ trailing: 2 })]}>
                {runs(props.home.runs, 15)}
                {chip(props.home)}
            </HStack>
        ),
        minimal: <Text modifiers={[font({ size: 12, weight: 'heavy', design: 'rounded' }), monospacedDigit(), foregroundStyle(white), lineLimit(1), minimumScaleFactor(0.5)]}>{props.away.runs + '-' + props.home.runs}</Text>,
        expandedLeading: (
            <HStack spacing={8} modifiers={[padding({ leading: 4, top: 4 })]}>
                {badge(props.away, 32)}
                {runs(props.away.runs, 32)}
            </HStack>
        ),
        expandedTrailing: (
            <HStack spacing={8} modifiers={[padding({ trailing: 4, top: 4 })]}>
                {runs(props.home.runs, 32)}
                {badge(props.home, 32)}
            </HStack>
        ),
        expandedCenter: (
            <VStack spacing={4} modifiers={[padding({ top: 6 })]}>
                <Text modifiers={[font({ size: 13, weight: 'bold' }), foregroundStyle(white), lineLimit(1), minimumScaleFactor(0.7)]}>{props.inning}</Text>
                {situation ? outs : null}
            </VStack>
        ),
        expandedBottom: (
            <VStack alignment="leading" spacing={6} modifiers={[padding({ horizontal: 4, bottom: 4 })]}>
                <VStack alignment="leading" spacing={6} modifiers={[opacity(stale ? 0.55 : 1)]}>
                    {situation ? (
                        <HStack spacing={10}>
                            {bases(8)}
                            {count}
                            {duel}
                            <Spacer />
                        </HStack>
                    ) : null}
                    {props.lastText ? lastPlay : null}
                </VStack>
                {stale ? <Text modifiers={[font({ size: 11 }), foregroundStyle(gold)]}>{props.staleText}</Text> : null}
            </VStack>
        )
    };
};

export const liveGame = createLiveActivity<LiveGameProps>('LiveGame', LiveGame);
