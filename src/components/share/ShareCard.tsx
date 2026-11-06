import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { fonts, inkOn } from '../../theme/tokens';
import { PlayerPhoto, TeamLogo, Txt } from '../ui';
import { LogoMark } from '../feed/LogoMark';
import type { PlayerPost, PostData, PostTeam, ResultPost, StandingsPost } from './subjects';

// La imagen para compartir (lo que dibuja el <canvas> de la web), hecha con vistas para capturarla con captureRef.
// Historia 9:16 y post 4:5; tres estilos: color del equipo, noche y papel. Se diseña a 360 de ancho y se escala.
// Resultado de un juego, un pelotero o la tabla de posiciones (en el color del líder). Con una foto de fondo (la que
// escoja el usuario) va la foto con un velo oscuro y todo en blanco, como en la web.

export type ShareFormat = 'story' | 'post';
export type ShareStyle = 'color' | 'noche' | 'papel';
export const SHARE_SITE = 'elplay.grullonb.com';

interface Palette {
    bg: string;
    ink: string;
    muted: string;
    panel: string;
    seam: string;
}

const alphaHex = (hex: string, opacity: number) => {
    const value = parseInt(hex.replace('#', '').slice(0, 6), 16);
    return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${opacity})`;
};

const palette = (style: ShareStyle, color: string): Palette => {
    if (style === 'noche') return { bg: '#0b0c10', ink: '#f1f2f6', muted: '#9a9db0', panel: 'rgba(255,255,255,0.06)', seam: alphaHex(color, 0.5) };
    if (style === 'papel') return { bg: '#f2ead8', ink: '#16130e', muted: '#6b6455', panel: 'rgba(22,19,14,0.06)', seam: 'rgba(194,54,43,0.45)' };
    const ink = inkOn(color);
    return {
        bg: color,
        ink,
        muted: ink === '#ffffff' ? 'rgba(255,255,255,0.78)' : 'rgba(20,21,26,0.7)',
        panel: ink === '#ffffff' ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.35)',
        seam: ink === '#ffffff' ? 'rgba(255,255,255,0.22)' : 'rgba(20,21,26,0.16)'
    };
};

/** Costuras de pelota grandes de adorno */
const Seams: React.FC<{ size: number; color: string; left: number; top: number }> = ({ size, color, left, top }) => (
    <Svg width={size} height={size} viewBox="0 0 100 100" style={{ position: 'absolute', left, top }} pointerEvents="none">
        <Path d="M22 8 C40 26 40 74 22 92" fill="none" stroke={color} strokeWidth={1.6} strokeDasharray="3 3" />
        <Path d="M78 8 C60 26 60 74 78 92" fill="none" stroke={color} strokeWidth={1.6} strokeDasharray="3 3" />
    </Svg>
);

export type CardHandle = React.ComponentRef<typeof View>;

interface CardProps {
    ref?: React.Ref<CardHandle>;
    data: PostData;
    format: ShareFormat;
    style: ShareStyle;
    width: number;
    /** Foto de fondo (uri local) */
    photo?: string | null;
}

export const ShareCard: React.FC<CardProps> = ({ ref, data, format, style, width, photo }) => {
    const story = format === 'story';
    const height = width * (story ? 16 / 9 : 5 / 4);
    const s = (value: number) => (value * width) / 360;
    const color = data.kind === 'result' ? winnerOf(data).color : data.kind === 'player' ? data.color : data.rows[0]?.color || '#2563eb';
    const base = palette(style, color);
    const pal = photo ? { ...base, ink: '#ffffff', muted: 'rgba(255,255,255,0.8)', panel: 'rgba(0,0,0,0.35)' } : base;

    const header = (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(8) }}>
            <LogoMark size={s(26)} />
            <Txt size={s(16)} weight="extrabold" color={pal.ink} style={{ letterSpacing: 0.5 }}>
                EL PLAY
            </Txt>
            <Txt size={s(11)} weight="semibold" color={pal.muted} numberOfLines={1} style={{ flex: 1, textAlign: 'right' }}>
                {data.league}
                {data.kind === 'result' && data.dateLabel ? ` · ${data.dateLabel}` : ''}
            </Txt>
        </View>
    );
    const pill = (text: string) => (
        <View style={{ alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: s(12), paddingVertical: s(5), backgroundColor: pal.ink }}>
            <Txt size={s(11)} weight="extrabold" color={style === 'color' && !photo ? pal.bg : style === 'papel' ? '#f2ead8' : '#0b0c10'} style={{ letterSpacing: 0.6 }}>
                {text}
            </Txt>
        </View>
    );

    return (
        <View ref={ref} collapsable={false} style={{ width, height, backgroundColor: pal.bg, overflow: 'hidden', paddingHorizontal: s(28), paddingTop: s(story ? 64 : 36), paddingBottom: s(story ? 56 : 22) }}>
            {photo ? (
                <>
                    <Image source={{ uri: photo }} contentFit="cover" style={StyleSheet.absoluteFill} />
                    <LinearGradient colors={['rgba(0,0,0,0.55)', 'rgba(0,0,0,0.25)', 'rgba(0,0,0,0.85)']} locations={[0, 0.45, 1]} style={StyleSheet.absoluteFill} />
                </>
            ) : (
                <Seams size={s(story ? 300 : 240)} color={pal.seam} left={s(story ? 170 : 190)} top={s(story ? 330 : 200)} />
            )}
            {header}
            <View style={{ flex: 1, justifyContent: story ? 'center' : 'flex-start', paddingTop: s(story ? 0 : 18), gap: s(story ? 22 : 12), overflow: 'hidden' }}>
                {data.kind === 'result' ? (
                    <Result data={data} pal={pal} s={s} story={story} pill={pill} />
                ) : data.kind === 'player' ? (
                    <Player data={data} pal={pal} s={s} story={story} pill={pill} />
                ) : (
                    <Standings data={data} pal={pal} s={s} story={story} pill={pill} onColor={style === 'color' && !photo} />
                )}
            </View>
            <Txt size={s(10)} weight="semibold" color={pal.muted} center>
                {SHARE_SITE}
            </Txt>
        </View>
    );
};

const winnerOf = (data: ResultPost) => {
    const ahead = (data.away.score ?? 0) > (data.home.score ?? 0) ? data.away : data.home;
    return data.home.isWinner ? data.home : data.away.isWinner ? data.away : ahead;
};

interface PartProps<T> {
    data: T;
    pal: Palette;
    s: (value: number) => number;
    story: boolean;
    pill: (text: string) => React.ReactNode;
}

const Result: React.FC<PartProps<ResultPost>> = ({ data, pal, s, story, pill }) => {
    const decided = data.away.isWinner || data.home.isWinner;
    const row = (team: PostTeam) => (
        <View key={team.abbrev} style={{ flexDirection: 'row', alignItems: 'center', gap: s(12), opacity: !decided || team.isWinner ? 1 : 0.6 }}>
            <View style={{ width: s(story ? 54 : 46), height: s(story ? 54 : 46), borderRadius: 999, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
                <TeamLogo team={{ id: null, abbrev: team.abbrev, logo: team.logo, color: team.color }} size={s(story ? 38 : 32)} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
                <Txt size={s(story ? 20 : 17)} weight="extrabold" color={pal.ink} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={{ textTransform: 'uppercase' }}>
                    {team.name}
                </Txt>
                <Txt size={s(11)} weight="semibold" color={pal.muted}>
                    {team.abbrev}
                </Txt>
            </View>
            {team.score !== null && (
                <Txt color={pal.ink} style={{ fontFamily: fonts.condensed, fontSize: s(story ? 84 : 56), lineHeight: s(story ? 86 : 56) }}>
                    {team.score}
                </Txt>
            )}
        </View>
    );
    // Todas las entradas (los extra innings también); pasadas las 12 la letra se achica para que quepan
    const innings = data.linescore ?? [];
    const fit = Math.min(1, 12 / Math.max(innings.length, 1));
    return (
        <>
            {pill(data.status)}
            <View style={{ gap: s(story ? 14 : 4) }}>
                {row(data.away)}
                {row(data.home)}
            </View>
            {innings.length > 0 && (
                <View style={{ gap: s(4) }}>
                    {(['n', 'away', 'home'] as const).map((side) => (
                        <View key={side} style={{ flexDirection: 'row' }}>
                            <Txt size={s(11)} weight="bold" color={pal.muted} style={{ width: s(40) }}>
                                {side === 'n' ? '' : data[side].abbrev}
                            </Txt>
                            {innings.map((inning) => (
                                <Txt key={inning.n} size={s((side === 'n' ? 10 : 12) * fit)} weight={side === 'n' ? 'semibold' : 'bold'} color={side === 'n' ? pal.muted : pal.ink} tabular center style={{ flex: 1 }}>
                                    {side === 'n' ? inning.n : inning[side] === null ? '–' : inning[side]}
                                </Txt>
                            ))}
                        </View>
                    ))}
                </View>
            )}
            {data.keyPlay ? (
                <View style={{ borderRadius: s(16), backgroundColor: pal.panel, padding: s(14), gap: s(4) }}>
                    <Txt size={s(10)} weight="bold" color={pal.muted} style={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>
                        {data.keyPlayLabel}
                    </Txt>
                    <Txt size={s(story ? 19 : 16)} weight="extrabold" color={pal.ink} numberOfLines={2}>
                        {data.keyPlay}
                    </Txt>
                    {data.keyDetail ? (
                        <Txt size={s(11)} weight="semibold" color={pal.muted}>
                            {data.keyDetail}
                        </Txt>
                    ) : null}
                </View>
            ) : null}
            {/* En el post no cabe el estadio (la web lo pone solo si sobra espacio) */}
            {data.venue && (story || !data.keyPlay) ? (
                <Txt size={s(11)} weight="semibold" color={pal.muted}>
                    {data.venue}
                </Txt>
            ) : null}
        </>
    );
};

const Player: React.FC<PartProps<PlayerPost>> = ({ data, pal, s, story, pill }) => (
    <>
        {pill(data.label.toUpperCase())}
        <View style={{ alignItems: 'center', gap: s(10) }}>
            <PlayerPhoto personId={data.personId} name={data.name} size={s(story ? 170 : 130)} background="rgba(255,255,255,0.85)" team={{ id: data.teamId ?? null, logo: data.logo, color: data.color, abbrev: data.teamAbbrev }} />
            <Txt size={s(story ? 30 : 26)} weight="black" color={pal.ink} center numberOfLines={2} style={{ lineHeight: s(story ? 32 : 28) }}>
                {data.name}
            </Txt>
            <Txt size={s(12)} weight="semibold" color={pal.muted} center>
                {data.teamName}
            </Txt>
        </View>
        <View style={{ borderRadius: s(16), backgroundColor: pal.panel, padding: s(14), alignItems: 'center', gap: s(4) }}>
            <Txt color={pal.ink} center style={{ fontFamily: fonts.condensed, fontSize: s(story ? 44 : 36), lineHeight: s(story ? 46 : 38) }}>
                {data.value}
            </Txt>
            <Txt size={s(11)} weight="semibold" color={pal.muted} center>
                {data.context}
            </Txt>
        </View>
        {data.detail ? (
            <Txt size={s(story ? 13 : 11)} weight="semibold" color={pal.muted} center>
                {data.detail}
            </Txt>
        ) : null}
    </>
);

/** La tabla: título grande, la fase o el grupo y hasta 8 equipos; el líder resalta (con un panel claro en su color) */
const Standings: React.FC<PartProps<StandingsPost> & { onColor: boolean }> = ({ data, pal, s, story, onColor }) => {
    const rows = data.rows.slice(0, 8);
    const rowH = s(story ? 42 : 30) * (rows.length > 6 ? 0.9 : 1);
    return (
        <>
            <View style={{ gap: s(4) }}>
                <Txt size={s(story ? 40 : 32)} weight="black" color={pal.ink} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={{ textTransform: 'uppercase', lineHeight: s(story ? 44 : 35) }}>
                    {data.title}
                </Txt>
                <Txt size={s(story ? 12 : 10)} weight="semibold" color={pal.muted} numberOfLines={1}>
                    {data.subtitle}
                </Txt>
            </View>
            <View style={{ gap: s(story ? 6 : 4) }}>
                {rows.map((row, index) => {
                    const leaderOnColor = index === 0 && onColor;
                    const leaderFilled = index === 0 && !leaderOnColor;
                    const ink = leaderFilled ? inkOn(row.color) : pal.ink;
                    const badge = rowH * 0.56;
                    return (
                        <View
                            key={`${row.rank}-${row.abbrev}`}
                            style={{ height: rowH, borderRadius: s(10), paddingHorizontal: s(12), flexDirection: 'row', alignItems: 'center', gap: s(10), backgroundColor: leaderOnColor ? 'rgba(255,255,255,0.22)' : leaderFilled ? row.color : pal.panel }}
                        >
                            <Txt color={ink} tabular style={{ width: s(18), fontFamily: fonts.condensed, fontSize: rowH * 0.48, lineHeight: rowH * 0.56 }}>
                                {row.rank}
                            </Txt>
                            <View style={{ width: badge, height: badge, borderRadius: 999, backgroundColor: row.color, alignItems: 'center', justifyContent: 'center' }}>
                                <Txt size={rowH * 0.17} weight="extrabold" color={inkOn(row.color)} numberOfLines={1}>
                                    {row.abbrev}
                                </Txt>
                            </View>
                            <Txt size={rowH * 0.32} weight="extrabold" color={ink} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={{ flex: 1, minWidth: 0 }}>
                                {row.name}
                            </Txt>
                            <Txt color={ink} tabular style={{ fontFamily: fonts.condensed, fontSize: rowH * 0.4, lineHeight: rowH * 0.48 }}>
                                {row.wins}-{row.losses}
                            </Txt>
                            <Txt size={rowH * 0.22} weight="semibold" color={ink} tabular style={{ width: s(26), textAlign: 'right' }}>
                                {row.gamesBack === '-' ? '—' : row.gamesBack}
                            </Txt>
                        </View>
                    );
                })}
            </View>
        </>
    );
};
