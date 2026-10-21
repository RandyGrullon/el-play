// Live Activity del juego (iPhone): banner de la pantalla bloqueada y regiones de la isla dinámica.
// La función con 'widget' corre aparte, dentro de la extensión: solo componentes de @expo/ui/swift-ui, sin hooks,
// sin imports y sin nada declarado fuera de ella (todo lo que usa va adentro o llega en props).
// En PRO (props.pro) cambia el diseño: logos, entrada con el punto en vivo, duelo con el último pitcheo, la última
// jugada con su etiqueta de color, la probabilidad de ganar y la franja del degradado; el Lite sigue igual.
import { Circle, HStack, Image, Rectangle, Spacer, Text, VStack, ZStack } from '@expo/ui/swift-ui';
import {
    accessibilityElement,
    accessibilityLabel,
    activityBackgroundTint,
    background,
    clipShape,
    contentTransition,
    font,
    foregroundStyle,
    frame,
    lineLimit,
    minimumScaleFactor,
    monospacedDigit,
    opacity,
    padding,
    resizable,
    rotationEffect,
    shapes,
    symbolEffect
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

    // ---------------------------------------------------------------- PRO
    if (props.pro) {
        const soft = '#c3c6d4';
        const bright = '#e3e5ec';
        const liveRed = '#ff4d6a';
        const lead = props.leader === 'away' ? props.away : props.leader === 'home' ? props.home : null;
        const hasWp = props.wpAway >= 0;

        // Logo PNG (bajado por la app a la carpeta compartida) o, si no hay, la sigla en el círculo del equipo
        const logo = (team: LiveTeam, size: number) =>
            team.logo ? <Image uiImage={team.logo} modifiers={[resizable(), frame({ width: size, height: size }), clipShape('circle')]} /> : badge(team, size);
        // Con un aro del color del equipo (isla expandida)
        const ringed = (team: LiveTeam, size: number) => <ZStack modifiers={[frame({ width: size + 4, height: size + 4 }), background(team.color, shapes.circle())]}>{logo(team, size)}</ZStack>;
        // Las cifras cambian con la transición numérica del sistema
        const score = (value: string, size: number, color: string) => (
            <Text modifiers={[font({ size, weight: 'black', design: 'rounded' }), monospacedDigit(), contentTransition('numericText'), foregroundStyle(color), lineLimit(1), minimumScaleFactor(0.6)]}>{value}</Text>
        );
        // Punto «en vivo» que late (efecto del símbolo; si el sistema no lo anima, queda fijo)
        const liveDot = props.live ? <Image systemName="circle.fill" size={6} color={liveRed} modifiers={[symbolEffect({ effect: 'pulse' })]} /> : null;
        const outsDots = (size: number) => (
            <HStack spacing={size > 6 ? 4 : 3}>
                {[0, 1, 2].map((index) => (
                    <Circle key={index} modifiers={[foregroundStyle(props.outs > index ? white : 'rgba(255,255,255,0.3)'), frame({ width: size, height: size })]} />
                ))}
            </HStack>
        );
        // Etiqueta de la jugada: sencillo azul, jonrón dorado, ponche rojo, boleto verde, outs en gris
        const tagColors = (tone: string) => {
            if (tone === 'hit') return ['rgba(96,152,255,0.2)', '#8fb5ff'];
            if (tone === 'hr') return ['rgba(242,184,75,0.2)', '#f2b84b'];
            if (tone === 'k') return ['rgba(255,90,95,0.2)', '#ff8a8e'];
            if (tone === 'walk') return ['rgba(52,199,120,0.18)', '#5fd897'];
            return ['#343844', '#b4b7c6'];
        };
        const playTag = (label: string, tone: string) => (
            <Text modifiers={[font({ size: 11, weight: 'heavy' }), foregroundStyle(tagColors(tone)[1]), lineLimit(1), padding({ horizontal: 7, vertical: 2 }), background(tagColors(tone)[0], shapes.capsule())]}>{label}</Text>
        );
        // Probabilidad de ganar: 40 tramos iguales (2,5 % cada uno) con los colores de los dos equipos
        const wpBar = (height: number) => (
            <HStack spacing={0} modifiers={[frame({ maxWidth: 1000 }), clipShape('capsule')]}>
                {Array.from({ length: 40 }, (_, index) => (
                    <Rectangle key={index} modifiers={[foregroundStyle(index < Math.round(props.wpAway / 2.5) ? props.away.color : props.home.color), frame({ maxWidth: 1000, minHeight: height, maxHeight: height })]} />
                ))}
            </HStack>
        );
        const duelTop = (
            <HStack spacing={4}>
                <Text modifiers={[font({ size: 12 }), foregroundStyle(soft), lineLimit(1)]}>{props.batterLabel}</Text>
                <Text modifiers={[font({ size: 12, weight: 'bold' }), foregroundStyle(white), lineLimit(1)]}>{props.batterName}</Text>
                {props.batterToday ? <Text modifiers={[font({ size: 12 }), foregroundStyle(soft), lineLimit(1)]}>{'· ' + props.batterToday}</Text> : null}
            </HStack>
        );
        const pitcherLine = [props.pitcherLabel + ' ' + props.pitcherName, props.pitch].filter((part) => part.trim()).join(' · ');

        // Marcador partido en los colores de los dos equipos: logo, sigla y carreras; en el medio la entrada y los outs
        const proScore = (
            <ZStack modifiers={[clipShape('roundedRectangle', 16), accessibilityElement('ignore'), accessibilityLabel(props.summary)]}>
                <HStack spacing={0}>
                    <HStack spacing={6} modifiers={[padding({ leading: 10, trailing: 38 }), frame({ maxWidth: 1000, minHeight: 50, maxHeight: 50 }), background(props.away.color)]}>
                        {logo(props.away, 30)}
                        <Text modifiers={[font({ size: 13, weight: 'heavy' }), foregroundStyle(props.away.ink), lineLimit(1)]}>{props.away.abbrev}</Text>
                        <Spacer />
                        {score(props.away.runs, 40, props.away.ink)}
                    </HStack>
                    <HStack spacing={6} modifiers={[padding({ leading: 38, trailing: 10 }), frame({ maxWidth: 1000, minHeight: 50, maxHeight: 50 }), background(props.home.color)]}>
                        {score(props.home.runs, 40, props.home.ink)}
                        <Spacer />
                        <Text modifiers={[font({ size: 13, weight: 'heavy' }), foregroundStyle(props.home.ink), lineLimit(1)]}>{props.home.abbrev}</Text>
                        {logo(props.home, 30)}
                    </HStack>
                </HStack>
                <VStack spacing={4} modifiers={[padding({ horizontal: 8, vertical: 5 }), background('rgba(11,12,16,0.55)', shapes.roundedRectangle({ cornerRadius: 12 }))]}>
                    <HStack spacing={4}>
                        {liveDot}
                        <Text modifiers={[font({ size: 13, weight: 'heavy' }), foregroundStyle(white), lineLimit(1), minimumScaleFactor(0.7)]}>{props.inningMark}</Text>
                    </HStack>
                    {situation ? outsDots(6) : null}
                </VStack>
            </ZStack>
        );
        const proSituation = (
            <HStack spacing={10} modifiers={[frame({ maxWidth: 1000, minHeight: 32, maxHeight: 32 })]}>
                {bases(9)}
                {count}
                <Rectangle modifiers={[foregroundStyle('rgba(226,232,240,0.12)'), frame({ width: 1, height: 26 })]} />
                <VStack alignment="leading" spacing={2}>
                    {duelTop}
                    <Text modifiers={[font({ size: 11 }), foregroundStyle(muted), lineLimit(1)]}>{pitcherLine}</Text>
                </VStack>
                <Spacer />
            </HStack>
        );
        const proLast = (
            <HStack spacing={7}>
                {props.lastLabel ? playTag(props.lastLabel, props.lastTone) : null}
                <Text modifiers={[font({ size: 12 }), foregroundStyle(bright), lineLimit(1)]}>{props.lastText}</Text>
                <Spacer />
            </HStack>
        );
        const proFooter = (
            <HStack spacing={7}>
                {hasWp ? (
                    <Text modifiers={[font({ size: 11, weight: 'bold' }), monospacedDigit(), foregroundStyle(lead ? lead.light : soft), lineLimit(1)]}>{props.wpLeadText}</Text>
                ) : (
                    <Text modifiers={[font({ size: 11, weight: 'bold' }), foregroundStyle(muted), lineLimit(1)]}>{props.live ? props.inning : 'El Play'}</Text>
                )}
                {hasWp ? wpBar(4) : <Spacer />}
                <Text modifiers={[font({ size: 11 }), foregroundStyle(stale ? gold : muted), lineLimit(1)]}>{stale ? props.staleText : props.updated}</Text>
            </HStack>
        );
        // La franja del degradado PRO, abajo del banner
        const stripe = (
            <Rectangle
                modifiers={[
                    foregroundStyle({ type: 'linearGradient', colors: ['#1e4fd8', '#6d28d9', '#e11d48'], startPoint: { x: 0, y: 0.5 }, endPoint: { x: 1, y: 0.5 } }),
                    frame({ maxWidth: 1000, minHeight: 2, maxHeight: 2 }),
                    padding({ horizontal: 18, bottom: 3 }),
                    opacity(0.9)
                ]}
            />
        );

        return {
            // Apple corta el banner pasados 160 pt: padding 10 + 50 + 32 + 18 + 15 y espacios de 7 = 156
            banner: (
                <ZStack alignment="bottom" modifiers={[activityBackgroundTint('#12141a')]}>
                    <VStack spacing={7} modifiers={[padding({ all: 10 })]}>
                        <VStack spacing={7} modifiers={[opacity(stale ? 0.55 : 1)]}>
                            {proScore}
                            {situation ? proSituation : null}
                            {props.lastText ? proLast : null}
                        </VStack>
                        {proFooter}
                    </VStack>
                    {stripe}
                </ZStack>
            ),
            // Compacta: logo del visitante y el marcador a la izquierda; entrada y bases a la derecha
            compactLeading: (
                <HStack spacing={6} modifiers={[padding({ leading: 2 }), accessibilityElement('ignore'), accessibilityLabel(props.summary)]}>
                    {logo(props.away, 22)}
                    {score(props.away.runs + '-' + props.home.runs, 17, white)}
                    {liveDot}
                </HStack>
            ),
            compactTrailing: (
                <HStack spacing={5} modifiers={[padding({ trailing: 2 })]}>
                    <Text modifiers={[font({ size: 11, weight: 'heavy' }), foregroundStyle(soft), lineLimit(1)]}>{props.live && !props.between ? props.inningShort.replace(' ', '') : props.inningShort}</Text>
                    {situation ? bases(6) : null}
                </HStack>
            ),
            // Mínima: el logo del que va ganando (empate: el marcador)
            minimal: lead ? logo(lead, 22) : score(props.away.runs + '-' + props.home.runs, 12, white),
            expandedLeading: (
                <HStack spacing={8} modifiers={[padding({ leading: 4, top: 4 })]}>
                    <VStack spacing={3}>
                        {ringed(props.away, 34)}
                        <Text modifiers={[font({ size: 11, weight: 'heavy' }), foregroundStyle(soft), lineLimit(1)]}>{props.away.abbrev}</Text>
                    </VStack>
                    {score(props.away.runs, 48, white)}
                </HStack>
            ),
            expandedTrailing: (
                <HStack spacing={8} modifiers={[padding({ trailing: 4, top: 4 })]}>
                    {score(props.home.runs, 48, white)}
                    <VStack spacing={3}>
                        {ringed(props.home, 34)}
                        <Text modifiers={[font({ size: 11, weight: 'heavy' }), foregroundStyle(soft), lineLimit(1)]}>{props.home.abbrev}</Text>
                    </VStack>
                </HStack>
            ),
            expandedCenter: (
                <VStack spacing={5} modifiers={[padding({ top: 14 })]}>
                    <HStack spacing={5}>
                        {liveDot}
                        <Text modifiers={[font({ size: 12, weight: 'heavy' }), foregroundStyle(white), lineLimit(1), minimumScaleFactor(0.7)]}>{props.inning}</Text>
                    </HStack>
                    {situation ? outsDots(7) : null}
                </VStack>
            ),
            expandedBottom: (
                <VStack alignment="leading" spacing={8} modifiers={[padding({ horizontal: 4, bottom: 4 })]}>
                    <VStack alignment="leading" spacing={8} modifiers={[opacity(stale ? 0.55 : 1)]}>
                        {situation ? (
                            <HStack spacing={10}>
                                {bases(9)}
                                <HStack spacing={6}>
                                    {score(props.count, 26, white)}
                                    {count}
                                </HStack>
                                <Rectangle modifiers={[foregroundStyle('rgba(226,232,240,0.14)'), frame({ width: 1, height: 26 })]} />
                                <VStack alignment="leading" spacing={2}>
                                    <HStack spacing={3}>
                                        <Text modifiers={[font({ size: 12 }), foregroundStyle(muted)]}>{props.batterTag}</Text>
                                        <Text modifiers={[font({ size: 12, weight: 'bold' }), foregroundStyle(white), lineLimit(1)]}>{props.batterLast}</Text>
                                        <Text modifiers={[font({ size: 12 }), foregroundStyle(muted)]}>{'· ' + props.pitcherTag}</Text>
                                        <Text modifiers={[font({ size: 12, weight: 'bold' }), foregroundStyle(white), lineLimit(1)]}>{props.pitcherLast}</Text>
                                    </HStack>
                                    {props.pitch ? <Text modifiers={[font({ size: 11 }), foregroundStyle(muted), lineLimit(1)]}>{props.pitch}</Text> : null}
                                </VStack>
                                <Spacer />
                            </HStack>
                        ) : props.lastText ? (
                            proLast
                        ) : null}
                        {hasWp ? (
                            <HStack spacing={8}>
                                <Text modifiers={[font({ size: 11, weight: 'bold' }), monospacedDigit(), foregroundStyle(props.away.light), lineLimit(1)]}>{props.wpAwayText}</Text>
                                {wpBar(3)}
                                <Text modifiers={[font({ size: 11, weight: 'bold' }), monospacedDigit(), foregroundStyle(props.home.light), lineLimit(1)]}>{props.wpHomeText}</Text>
                            </HStack>
                        ) : null}
                    </VStack>
                    {stale ? <Text modifiers={[font({ size: 11 }), foregroundStyle(gold)]}>{props.staleText}</Text> : null}
                </VStack>
            )
        };
    }

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
