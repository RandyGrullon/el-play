// Notificación fija del juego (Android). Igual que la Live Activity: la función con 'widget' corre aparte,
// solo con componentes de @expo/ui/jetpack-compose, sin hooks, sin imports y sin nada de fuera.
// Tocar la notificación abre el juego (url); el botón «Dejar de seguir» devuelve { stopped: true }.
// En PRO (props.pro): logos, corredores por nombre, conteo con puntos de bola/strike/out, duelo, las 3 últimas
// jugadas con su etiqueta de color y la probabilidad de ganar turno a turno. La notificación de Android solo entiende
// tamaños fijos (sin pesos): por eso las columnas tienen ancho fijo y el lado derecho va en una capa alineada al final.
import { Box, Column, Image, LinearProgressIndicator, Row, Spacer, Text, TextButton } from '@expo/ui/jetpack-compose';
import { background, cornerRadius, fillMaxWidth, height, padding, size, width } from '@expo/ui/jetpack-compose/modifiers';
import { createCustomNotification, type CustomNotificationEnvironment } from 'expo-widgets';
import type { LiveGameProps, LiveTeam } from './types';

const GameNotification = (props: LiveGameProps, environment: CustomNotificationEnvironment) => {
    'widget';
    const dark = environment.colorScheme === 'dark';
    const ink = dark ? '#f1f2f6' : '#14151a';
    const muted = dark ? '#9a9db0' : '#5f6273';
    const faint = dark ? '#3a3d4a' : '#d5d7e0';
    const gold = '#f5b731';
    const accent = dark ? '#7aa7ff' : '#2563eb';
    const situation = props.live && !props.between && !props.stopped;

    const chip = (team: LiveTeam) => (
        <Box modifiers={[background(team.color), cornerRadius(6), padding(6, 2, 6, 2)]}>
            <Text color={team.ink} style={{ fontSize: 12, fontWeight: 'bold' }}>
                {team.abbrev}
            </Text>
        </Box>
    );
    const teamRow = (team: LiveTeam) => (
        <Row verticalAlignment="center" modifiers={[padding(0, 2, 0, 2)]}>
            <Box modifiers={[size(4, 20), background(team.color), cornerRadius(2)]} />
            <Text color={ink} style={{ fontSize: 20, fontWeight: 'bold' }} modifiers={[width(44), padding(10, 0, 0, 0)]}>
                {team.runs}
            </Text>
            <Text color={ink} maxLines={1} style={{ fontSize: 15, fontWeight: 'bold' }}>
                {team.name}
            </Text>
        </Row>
    );
    const base = (on: boolean) => <Box modifiers={[size(9, 9), background(on ? gold : faint), cornerRadius(2)]} />;
    const bases = (
        <Column horizontalAlignment="center" modifiers={[width(34)]}>
            {base(props.second)}
            <Row>
                {base(props.third)}
                <Spacer modifiers={[width(8)]} />
                {base(props.first)}
            </Row>
        </Column>
    );
    let status = props.inning;
    if (props.stopped) status = props.stoppedText;
    else if (situation) status = props.inning + ' · ' + props.outsText + ' · ' + props.count;

    // ---------------------------------------------------------------- PRO
    if (props.pro) {
        const soft = dark ? '#c3c6d4' : '#3d404c';
        const band = dark ? '#2b2e38' : '#eceef3';
        const ball = dark ? '#34c778' : '#16a34a';
        const strike = dark ? '#ff5a5f' : '#dc2626';
        const lead = props.leader === 'away' ? props.away : props.leader === 'home' ? props.home : null;
        const hasWp = props.wpAway >= 0 && !props.stopped;
        // Etiqueta de cada jugada (colores opacos: la notificación no mezcla transparencias)
        const tagColors = (tone: string) => {
            if (tone === 'hit') return dark ? ['#2b3a5c', '#8fb5ff'] : ['#dbe6fd', '#1d4ed8'];
            if (tone === 'hr') return dark ? ['#4a3d22', '#f2b84b'] : ['#f6e8c8', '#7a4f00'];
            if (tone === 'k') return dark ? ['#4d2a30', '#ff8a8e'] : ['#fbdada', '#b91c1c'];
            if (tone === 'walk') return dark ? ['#22403a', '#5fd897'] : ['#d6f2e0', '#15803d'];
            return dark ? ['#343844', '#b4b7c6'] : ['#eceef3', '#4b4f5c'];
        };
        const logo = (team: LiveTeam, side: number) =>
            team.logo ? <Image source={{ uri: team.logo }} contentScale="fit" contentDescription={null} modifiers={[size(side, side)]} /> : chip(team);
        const gap = (dp: number) => <Spacer modifiers={[width(dp)]} />;
        const teamLine = (team: LiveTeam, behind: boolean) => (
            <Row verticalAlignment="center" modifiers={[height(30)]}>
                <Box modifiers={[size(4, 24), background(team.color), cornerRadius(2)]} />
                {gap(8)}
                {logo(team, 24)}
                {gap(8)}
                <Text color={behind ? soft : ink} maxLines={1} style={{ fontSize: 15, fontWeight: 'bold' }} modifiers={[width(76)]}>
                    {team.short}
                </Text>
                <Box contentAlignment="centerEnd" modifiers={[width(34)]}>
                    <Text color={behind ? soft : ink} maxLines={1} style={{ fontSize: 26, fontWeight: 'bold' }}>
                        {team.runs}
                    </Text>
                </Box>
            </Row>
        );
        const base = (on: boolean) => <Box modifiers={[size(9, 9), background(on ? gold : faint), cornerRadius(2)]} />;
        const diamond = (
            <Column horizontalAlignment="center" modifiers={[width(30)]}>
                {base(props.second)}
                <Row>
                    {base(props.third)}
                    {gap(8)}
                    {base(props.first)}
                </Row>
            </Column>
        );
        const runnerLine = (label: string, name: string) =>
            name ? (
                <Text color={soft} maxLines={1} style={{ fontSize: 10, fontWeight: 'bold' }}>
                    {label + ' ' + name}
                </Text>
            ) : null;
        const dots = (letter: string, on: number, total: number, color: string) => (
            <Row verticalAlignment="center">
                <Text color={muted} style={{ fontSize: 10, fontWeight: 'bold' }}>
                    {letter}
                </Text>
                {[0, 1, 2].slice(0, total).map((index) => [
                    <Spacer key={'g' + index} modifiers={[width(2)]} />,
                    <Box key={'d' + index} modifiers={[size(6, 6), background(on > index ? color : faint), cornerRadius(3)]} />
                ])}
                {gap(4)}
            </Row>
        );
        // Equipos a la izquierda (ancho fijo); bases, corredores y conteo en una capa alineada a la derecha
        const scoreBlock = (
            <Box modifiers={[fillMaxWidth(), height(62)]}>
                <Column>
                    {teamLine(props.away, props.leader === 'home')}
                    {teamLine(props.home, props.leader === 'away')}
                </Column>
                {situation ? (
                    <Box contentAlignment="centerEnd" modifiers={[fillMaxWidth(), height(62)]}>
                        <Column modifiers={[width(100)]}>
                            <Row verticalAlignment="center">
                                {diamond}
                                {gap(6)}
                                <Column modifiers={[width(64)]}>
                                    {runnerLine('3.ª', props.thirdName)}
                                    {runnerLine('2.ª', props.secondName)}
                                    {runnerLine('1.ª', props.firstName)}
                                </Column>
                            </Row>
                            <Spacer modifiers={[height(4)]} />
                            <Row verticalAlignment="center">
                                {dots('B', props.balls, 3, ball)}
                                {dots('S', props.strikes, 2, strike)}
                                {dots('O', props.outs, 3, ink)}
                            </Row>
                        </Column>
                    </Box>
                ) : null}
            </Box>
        );
        const duelLine = (label: string, name: string, extra: string) => (
            <Row verticalAlignment="center" modifiers={[height(15)]}>
                <Text color={muted} maxLines={1} style={{ fontSize: 12 }}>
                    {label + ' '}
                </Text>
                <Text color={ink} maxLines={1} style={{ fontSize: 12, fontWeight: 'bold' }}>
                    {name}
                </Text>
                {extra ? (
                    <Text color={muted} maxLines={1} style={{ fontSize: 12 }}>
                        {' · ' + extra}
                    </Text>
                ) : null}
            </Row>
        );
        const playLine = (label: string, text: string, tone: string, index: number) => (
            <Row key={index} verticalAlignment="center" modifiers={[height(19)]}>
                <Box modifiers={[background(tagColors(tone)[0]), cornerRadius(9), padding(7, 1, 7, 1)]}>
                    <Text color={tagColors(tone)[1]} maxLines={1} style={{ fontSize: 10, fontWeight: 'bold' }}>
                        {label}
                    </Text>
                </Box>
                {gap(8)}
                <Text color={index === 0 ? ink : soft} maxLines={1} style={{ fontSize: 12 }}>
                    {text}
                </Text>
            </Row>
        );
        // Probabilidad turno a turno: barras desde el 50 % (arriba el visitante, abajo el local)
        const chartBar = (value: number, index: number) => (
            <Row key={index}>
                <Column>
                    <Box contentAlignment="bottomCenter" modifiers={[size(5, 14), background(band)]}>
                        {value > 50.5 ? <Box modifiers={[size(5, Math.max(1, Math.round(((value - 50) / 50) * 14))), background(props.away.color)]} /> : null}
                    </Box>
                    <Box contentAlignment="topCenter" modifiers={[size(5, 14), background(band)]}>
                        {value < 49.5 ? <Box modifiers={[size(5, Math.max(1, Math.round(((50 - value) / 50) * 14))), background(props.home.color)]} /> : null}
                    </Box>
                </Column>
                {gap(2)}
            </Row>
        );
        const wpBlock = hasWp ? (
            <Row verticalAlignment="center" modifiers={[height(32)]}>
                {props.wpSeries.length > 1 ? (
                    <Row>{props.wpSeries.map((value, index) => chartBar(value, index))}</Row>
                ) : (
                    <LinearProgressIndicator progress={props.wpAway / 100} color={props.away.color} trackColor={props.home.color} modifiers={[size(112, 4)]} />
                )}
                {gap(10)}
                <Column>
                    <Text color={muted} maxLines={1} style={{ fontSize: 11 }}>
                        {props.wpLabel}
                    </Text>
                    <Text color={lead ? (dark ? lead.light : lead.dark) : ink} maxLines={1} style={{ fontSize: 11, fontWeight: 'bold' }}>
                        {props.wpLeadText}
                    </Text>
                </Column>
            </Row>
        ) : null;
        const proStatus = props.stopped ? props.stoppedText : situation ? props.inningMark + ' · ' + props.outsText : props.inning;

        return {
            // Plegada (64 dp, para todos): logos, siglas y marcador; arriba la entrada y los outs
            collapsed: (
                <Column modifiers={[fillMaxWidth()]}>
                    <Text color={muted} maxLines={1} style={{ fontSize: 11 }}>
                        {proStatus}
                    </Text>
                    <Row verticalAlignment="center" modifiers={[padding(0, 2, 0, 0)]}>
                        {logo(props.away, 18)}
                        {gap(6)}
                        <Text color={ink} style={{ fontSize: 15, fontWeight: 'bold' }}>
                            {props.away.abbrev}
                        </Text>
                        <Text color={ink} style={{ fontSize: 20, fontWeight: 'bold' }} modifiers={[padding(8, 0, 8, 0)]}>
                            {props.away.runs + ' – ' + props.home.runs}
                        </Text>
                        <Text color={ink} style={{ fontSize: 15, fontWeight: 'bold' }}>
                            {props.home.abbrev}
                        </Text>
                        {gap(6)}
                        {logo(props.home, 18)}
                    </Row>
                </Column>
            ),
            // Expandida (hasta 256 dp): 62 + 30 + 3 × 19 + 32 + 40 y espacios de 5 ≈ 246
            expanded: (
                <Column modifiers={[fillMaxWidth()]}>
                    {scoreBlock}
                    {situation ? (
                        <Column modifiers={[padding(0, 5, 0, 0)]}>
                            {duelLine(props.batterLabel, props.batterName, props.batterToday)}
                            {duelLine(props.pitcherLabel, props.pitcherName, props.pitcherPitches)}
                        </Column>
                    ) : null}
                    {!props.stopped && props.plays.length ? (
                        <Column modifiers={[padding(0, 5, 0, 0)]}>{props.plays.map((play, index) => playLine(play.label, play.text, play.tone, index))}</Column>
                    ) : null}
                    {wpBlock ? <Box modifiers={[padding(0, 5, 0, 0)]}>{wpBlock}</Box> : null}
                    <Row verticalAlignment="center" modifiers={[padding(0, 3, 0, 0)]}>
                        <Text color={muted} maxLines={1} style={{ fontSize: 11 }} modifiers={[width(150)]}>
                            {props.stopped ? props.stoppedText : props.inning + ' · ' + props.updated}
                        </Text>
                        {props.live && !props.stopped ? (
                            <TextButton onClick={() => ({ stopped: true })} colors={{ contentColor: accent }}>
                                <Text>{props.stopText}</Text>
                            </TextButton>
                        ) : null}
                    </Row>
                </Column>
            )
        };
    }

    return {
        collapsed: (
            <Column modifiers={[fillMaxWidth()]}>
                <Row verticalAlignment="center">
                    {chip(props.away)}
                    <Text color={ink} style={{ fontSize: 20, fontWeight: 'bold' }} modifiers={[padding(8, 0, 8, 0)]}>
                        {props.away.runs + ' – ' + props.home.runs}
                    </Text>
                    {chip(props.home)}
                </Row>
                <Text color={muted} maxLines={1} style={{ fontSize: 12 }} modifiers={[padding(0, 4, 0, 0)]}>
                    {status}
                </Text>
            </Column>
        ),
        expanded: (
            <Column modifiers={[fillMaxWidth()]}>
                {teamRow(props.away)}
                {teamRow(props.home)}
                <Text color={muted} maxLines={1} style={{ fontSize: 12, fontWeight: 'bold' }} modifiers={[padding(0, 6, 0, 4)]}>
                    {status}
                </Text>
                {situation ? (
                    <Row verticalAlignment="center" modifiers={[padding(0, 2, 0, 4)]}>
                        {bases}
                        <Column modifiers={[padding(10, 0, 0, 0)]}>
                            <Text color={ink} maxLines={1} style={{ fontSize: 13 }}>
                                {props.batter}
                            </Text>
                            <Text color={muted} maxLines={1} style={{ fontSize: 12 }}>
                                {props.pitcher}
                            </Text>
                        </Column>
                    </Row>
                ) : null}
                {props.lastText && !props.stopped ? (
                    <Row verticalAlignment="center" modifiers={[padding(0, 2, 0, 2)]}>
                        {props.lastLabel ? (
                            <Box modifiers={[background(faint), cornerRadius(8), padding(6, 2, 6, 2)]}>
                                <Text color={ink} style={{ fontSize: 10, fontWeight: 'bold' }}>
                                    {props.lastLabel}
                                </Text>
                            </Box>
                        ) : null}
                        <Text color={ink} maxLines={1} style={{ fontSize: 13 }} modifiers={[padding(8, 0, 0, 0)]}>
                            {props.lastText}
                        </Text>
                    </Row>
                ) : null}
                <Row verticalAlignment="center" modifiers={[padding(0, 4, 0, 0)]}>
                    <Text color={muted} maxLines={1} style={{ fontSize: 11 }}>
                        {props.stopped ? props.openText : props.updated}
                    </Text>
                    {props.live && !props.stopped ? (
                        <TextButton onClick={() => ({ stopped: true })} colors={{ contentColor: accent }} modifiers={[padding(12, 0, 0, 0)]}>
                            <Text>{props.stopText}</Text>
                        </TextButton>
                    ) : null}
                </Row>
            </Column>
        )
    };
};

export const gameNotification = createCustomNotification<LiveGameProps>('GameNotification', GameNotification);
