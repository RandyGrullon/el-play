// Mini pizarra 1-9 + C H E de las tarjetas PRO (en vivo resalta la entrada actual; terminada pone «x» en la baja
// que no se jugó). RN no tiene tablas: para el lector es UN elemento que dice cada fila entera.
import React from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { ScheduleTeam } from '../../../types';
import type { LineHalf, ScheduleGamePro } from '../../../types/pro-juego';
import { useColors } from '../../../theme/theme';
import { alpha } from '../../../theme/tokens';
import { TeamLogo, Txt } from '../../ui';
import { teamText } from './logic';
import { useInk } from './shared';

interface LinescoreProps {
    game: ScheduleGamePro;
    variant: 'live' | 'final';
    label: string;
}

type Side = 'away' | 'home';

// Sin la entrada (no se ha jugado o el juego se acortó): «·». Terminado y con la entrada, la mitad sin carreras
// registradas es la baja que no hizo falta jugar: «x».
const cell = (inning: { away: LineHalf; home: LineHalf } | undefined, side: Side, future: boolean, final: boolean) => {
    const half = inning?.[side];
    if (!inning || future) return '·';
    if (!half || half.r === null || half.r === undefined) return final ? 'x' : '·';
    return String(half.r);
};

const ROW = 26;
const HEAD = 20;

export const Linescore: React.FC<LinescoreProps> = ({ game, variant, label }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const ink = useInk();
    const innings = game.innings ?? [];
    const count = Math.max(game.scheduledInnings || 9, innings.length);
    const live = variant === 'live';
    const current = live ? (game.live?.inning ?? null) : null;
    const totals = game.totals;
    const columns = Array.from({ length: count }, (_, index) => index + 1);
    // Con entradas extra las columnas se achican: la letra baja un poco para no tocarse a 320 px
    const font = count > 10 ? 14 : 16;

    const text = (n: number, side: Side) => {
        const inning = innings.find((item) => item.n === n);
        const future = live && (current === null || n > current || (n === current && side === 'home' && !!game.live?.isTop));
        return cell(inning, side, future, !live);
    };
    const runs = (side: Side) => totals?.[side].r ?? game[side].score ?? 0;

    // Lo que oye el lector: «LIC: 1, 2, 3, 0, 1, 3, 1, sin jugar…; C 11, H 15, E 1»
    const rowText = (side: Side) => {
        const team = game[side];
        const values = columns.map((n) => {
            const value = text(n, side);
            return value === '·' ? t('pro.portada.linescore.notPlayed') : value;
        });
        return `${team.abbrev}: ${values.join(', ')}; ${t('pro.portada.linescore.runs')} ${runs(side)}, ${t('pro.portada.linescore.hits')} ${totals?.[side].h ?? '—'}, ${t('pro.portada.linescore.errors')} ${totals?.[side].e ?? '—'}`;
    };

    const teamCell = (team: ScheduleTeam) =>
        live ? (
            <Txt size={12} weight="extrabold" numberOfLines={1} color={teamText(team.color, colors.ink)}>
                {team.abbrev}
            </Txt>
        ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <TeamLogo team={team} size={22} />
                <Txt size={12} weight="extrabold" numberOfLines={1} tone={team.isWinner ? 'ink' : 'muted'}>
                    {team.abbrev}
                </Txt>
            </View>
        );

    const head = (children: React.ReactNode, strong = false) => (
        <View style={{ height: HEAD, alignItems: 'center', justifyContent: 'center' }}>
            <Txt size={11} weight="bold" color={strong ? colors.ink : colors.muted}>
                {children}
            </Txt>
        </View>
    );

    return (
        <View accessible accessibilityLabel={`${label}. ${rowText('away')}. ${rowText('home')}`} style={{ flexDirection: 'row' }}>
            {/* Columna de los equipos */}
            <View style={{ width: live ? 38 : 58 }}>
                <View style={{ height: HEAD }} />
                <View style={{ height: ROW, justifyContent: 'center' }}>{teamCell(game.away)}</View>
                <View style={{ height: ROW, justifyContent: 'center' }}>{teamCell(game.home)}</View>
            </View>
            {/* Una columna por entrada: la actual va resaltada de arriba abajo */}
            {columns.map((n) => {
                const now = live && n === current;
                return (
                    <View key={n} style={{ flex: 1, flexBasis: 0, minWidth: 0, borderRadius: 8, backgroundColor: now ? alpha(colors.accent, 0.16) : undefined }}>
                        {head(n, now)}
                        {(['away', 'home'] as const).map((side) => {
                            const value = text(n, side);
                            const muted = value === '·' || value === '0' || value === 'x';
                            return (
                                <View key={side} style={{ height: ROW, alignItems: 'center', justifyContent: 'center' }}>
                                    {/* Sobre el resaltado de la entrada actual el gris se refuerza para pasar 4.5:1 */}
                                    <Txt condensed size={font} tabular color={muted ? (now ? ink.mutedStrong : colors.muted) : colors.ink}>
                                        {value}
                                    </Txt>
                                </View>
                            );
                        })}
                    </View>
                );
            })}
            <View style={{ width: 4 }} />
            {(['r', 'h', 'e'] as const).map((key) => (
                <View key={key} style={{ flex: key === 'r' ? 1.2 : 1, flexBasis: 0, minWidth: 0 }}>
                    {head(t(`pro.portada.linescore.${key}`))}
                    {(['away', 'home'] as const).map((side) => {
                        const team = game[side];
                        const value = key === 'r' ? runs(side) : (totals?.[side][key] ?? '—');
                        const strong = key === 'r' && (live || team.isWinner);
                        return (
                            <View key={side} style={{ height: ROW, alignItems: 'center', justifyContent: 'center' }}>
                                <Txt condensed size={key === 'r' && !live ? font + 4 : font} tabular color={strong ? colors.ink : colors.muted}>
                                    {String(value)}
                                </Txt>
                            </View>
                        );
                    })}
                </View>
            ))}
        </View>
    );
};
