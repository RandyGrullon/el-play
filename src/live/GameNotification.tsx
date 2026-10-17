// Notificación fija del juego (Android). Igual que la Live Activity: la función con 'widget' corre aparte,
// solo con componentes de @expo/ui/jetpack-compose, sin hooks, sin imports y sin nada de fuera.
// Tocar la notificación abre el juego (url); el botón «Dejar de seguir» devuelve { stopped: true }.
import { Box, Column, Row, Spacer, Text, TextButton } from '@expo/ui/jetpack-compose';
import { background, cornerRadius, fillMaxWidth, padding, size, width } from '@expo/ui/jetpack-compose/modifiers';
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
