// Piezas del Fantasy que se repiten en el selector y en las tarjetas, en el Lite y en PRO (iguales que la web): la
// etiqueta de cómo llega al juego, el precio con su flecha, los últimos 5 en barritas, la línea de la temporada, el
// rival, por qué no se puede agregar, lo que falta para completar, la hora de cierre y si el equipo ya se guardó.
import React from 'react';
import { View } from 'react-native';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { CheckCheck, CloudOff, UploadCloud } from 'lucide-react-native';
import { inningName } from '../../lib/baseball';
import { formatTime } from '../../lib/format';
import { gameStarted, isPostponed, lockTime, type DayEntry, type FantasyDay, type FantasyPlayer } from '../../lib/fantasy';
import { matchupOf, slotsLeft, type BadgeStatus, type PickReason } from '../../lib/fantasyPicker';
import type { PlayerRow } from '../../lib/stats';
import { useColors } from '../../theme/theme';
import { alpha, radius } from '../../theme/tokens';
import { Txt } from '../ui';
import { useProColors } from '../pro/kit';
import type { SaveStatus } from '../pro/fantasy/data';
import { formatCredits } from './shared';

/** «+3», «−1», «−2,5» (con el signo menos de verdad y la coma del idioma) */
export const signed = (value: number, lang: string) => (value > 0 ? `+${formatCredits(value, lang)}` : value < 0 ? `−${formatCredits(-value, lang)}` : formatCredits(0, lang));

// ---------------------------------------------------------------- textos

export const reasonText = (reason: PickReason | null, t: TFunction, lang: string) => {
    if (!reason) return '';
    switch (reason.kind) {
        case 'started':
            return t('fantasyHelp.reason.locked');
        case 'postponed':
            return t('fantasyHelp.reason.postponed');
        case 'fullB':
            return t('fantasyHelp.reason.fullB', { n: reason.n });
        case 'fullP':
            return t('fantasyHelp.reason.fullP', { count: reason.count });
        case 'team':
            return t('fantasyHelp.reason.team', { n: reason.n, team: reason.team });
        case 'budget':
            return t('fantasyHelp.reason.budget', { short: formatCredits(reason.short, lang) });
    }
};

/** «Te faltan 2 bateadores · 14,5 créditos» (o «Tu equipo está completo · …»); siempre con los créditos que quedan */
export const needText = (day: FantasyDay, entry: Pick<DayEntry, 'lineup'>, t: TFunction, lang: string) => {
    const slots = slotsLeft(day, entry as DayEntry);
    const parts: string[] = [];
    if (!slots.batters && !slots.pitchers) parts.push(t('fantasyHelp.picker.full'));
    else {
        const b = t('fantasyHelp.picker.needB', { count: slots.batters });
        const p = t('fantasyHelp.picker.needP', { count: slots.pitchers });
        const what = slots.batters && slots.pitchers ? t('fantasyHelp.picker.needBoth', { b, p }) : slots.batters ? b : p;
        parts.push(t('fantasyHelp.picker.need', { count: slots.batters + slots.pitchers, what }));
    }
    if (slots.credits === null) parts.push(t('fantasyHelp.picker.noCap'));
    else if (slots.credits < -1e-9) parts.push(t('fantasyHelp.picker.over', { over: formatCredits(-slots.credits, lang) }));
    else parts.push(t('fantasyHelp.picker.credits', { left: formatCredits(slots.credits, lang) }));
    return parts.join(' · ');
};

/** «LIC vs TOR · 7:30 p. m.», «LIC @ TOR · ▲ 7» o «… · Final» (el pospuesto sin hora: lo dice su etiqueta) */
export const matchupText = (day: FantasyDay, player: FantasyPlayer, t: TFunction, lang: string) => {
    const match = matchupOf(day, player);
    const game = day.games.find((item) => item.gamePk === player.gamePk);
    const head = match ? t(match.home ? 'fantasyHelp.picker.vs' : 'fantasyHelp.picker.at', { team: match.team, opp: match.opp }) : (day.teams[player.teamId]?.abbrev ?? '');
    if (!game || isPostponed(game)) return head;
    const when =
        game.state === 'final'
            ? t('fantasy.final')
            : game.state === 'live' && game.live
              ? inningName({ n: game.live.inning, isTop: game.live.isTop, state: game.live.inningState }, lang, true)
              : formatTime(game.date, lang);
    return when ? `${head} · ${when}` : head;
};

/** Línea corta de la temporada: «.287 · .812 OPS · 4 HR» o «3.12 EFE · 1.10 WHIP · 41 K» (del día o de las estadísticas) */
export const seasonText = (player: FantasyPlayer, row: PlayerRow | undefined, t: TFunction) => {
    const season = player.season;
    if (player.role === 'P') {
        const era = season?.era ?? row?.pitching?.era;
        const whip = season?.whip ?? row?.pitching?.whip;
        const k = season?.k ?? row?.pitching?.k;
        return era || whip || k !== undefined ? t('fantasyHelp.picker.seasonPitcher', { era: era ?? '—', whip: whip ?? '—', k: k ?? '—' }) : null;
    }
    const avg = season?.avg ?? row?.hitting?.avg;
    const ops = season?.ops ?? row?.hitting?.ops;
    const hr = season?.hr ?? row?.hitting?.hr;
    return avg || ops || hr !== undefined ? t('fantasyHelp.picker.seasonBatter', { avg: avg ?? '—', ops: ops ?? '—', hr: hr ?? '—' }) : null;
};

/** «Cierra 7:30 p. m.» (o «Cierra al empezar su juego» con la hora por definir); null si ya se cerró o es pospuesto */
export const lockText = (day: FantasyDay, player: FantasyPlayer, t: TFunction, lang: string, now = Date.now()) => {
    const game = day.games.find((item) => item.gamePk === player.gamePk);
    if (!game || isPostponed(game) || gameStarted(game, now)) return null;
    const at = lockTime(game);
    return Number.isFinite(at) ? t('fantasyHelp.card.locksAt', { time: formatTime(new Date(at).toISOString(), lang) }) : t('fantasyHelp.card.locksTbd');
};

// ---------------------------------------------------------------- piezas

type Tone = 'up' | 'accent' | 'muted' | 'warn' | 'down';
const TONES: Record<BadgeStatus, Tone> = { confirmed: 'up', probable: 'up', rotation: 'accent', expected: 'accent', bench: 'muted', bullpen: 'muted', resting: 'warn', postponed: 'down', dnp: 'muted', started: 'muted' };

const useTone = (tone: Tone) => {
    const colors = useColors();
    const pro = useProColors();
    if (tone === 'up') return { ink: pro.up, bg: alpha(pro.up, 0.14) };
    if (tone === 'accent') return { ink: colors.accentInk, bg: alpha(colors.accent, 0.12) };
    if (tone === 'warn') return { ink: pro.warn, bg: alpha(pro.warn, 0.14) };
    if (tone === 'down') return { ink: pro.down, bg: alpha(pro.down, 0.14) };
    return { ink: colors.muted, bg: colors.raised };
};

/** Confirmado, Esperado, Banca, Abridor probable, Bullpen, Descansando, Pospuesto, No jugó o Ya empezó */
export const StatusBadge: React.FC<{ status: BadgeStatus | null }> = ({ status }) => {
    const { t } = useTranslation();
    const tone = useTone(status ? TONES[status] : 'muted');
    if (!status) return null;
    return (
        <View style={{ alignSelf: 'flex-start', flexShrink: 0, height: 18, justifyContent: 'center', borderRadius: radius.pill, paddingHorizontal: 6, backgroundColor: tone.bg }}>
            <Txt size={10} weight="bold" color={tone.ink} numberOfLines={1}>
                {t(`fantasyHelp.status.${status}`)}
            </Txt>
        </View>
    );
};

/** Aviso pequeño de una tarjeta: «Pospuesto: cámbialo», «No jugó», «No cuenta: …» */
export const CardWarning: React.FC<{ text: string; tone?: 'down' | 'muted' | 'warn' }> = ({ text, tone = 'down' }) => {
    const ink = useTone(tone);
    return (
        <View accessibilityRole="text" style={{ alignSelf: 'flex-start', maxWidth: '100%', borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: ink.bg }}>
            <Txt size={11} weight="bold" color={ink.ink}>
                {text}
            </Txt>
        </View>
    );
};

/** El precio con la flecha de cuánto cambió desde el día de juego anterior («8,5 cr ↑0,5») */
export const PriceChip: React.FC<{ price: number; delta?: number | null; surface?: string }> = ({ price, delta, surface }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const pro = useProColors();
    const lang = i18n.language;
    const text = formatCredits(price, lang);
    const moved = typeof delta === 'number' && Number.isFinite(delta) && Math.abs(delta) > 1e-9 ? delta : null;
    const label = [t('fantasy.credits.priceLong', { price: text }), moved !== null ? t(moved > 0 ? 'fantasyHelp.picker.priceUp' : 'fantasyHelp.picker.priceDown', { delta: formatCredits(Math.abs(moved), lang) }) : ''].filter(Boolean).join('. ');
    return (
        <View accessible accessibilityLabel={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: radius.pill, backgroundColor: surface ?? colors.raised, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Txt size={12} weight="extrabold" tabular>
                {t('fantasy.credits.price', { price: text })}
            </Txt>
            {moved !== null && (
                <Txt size={10} weight="extrabold" tabular color={moved > 0 ? pro.down : pro.up}>
                    {`${moved > 0 ? '↑' : '↓'}${formatCredits(Math.abs(moved), lang)}`}
                </Txt>
            )}
        </View>
    );
};

/** Los últimos 5 juegos en barritas (del más viejo al más nuevo; lo negativo hacia abajo y en rojo) */
export const Last5Bars: React.FC<{ values: number[]; width?: number }> = ({ values, width = 34 }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const pro = useProColors();
    const shown = values.slice(-5);
    const max = Math.max(10, ...shown.map((value) => Math.abs(value)));
    const bar = Math.max(3, Math.floor((width - 4 * 2) / 5));
    const up = 16;
    const down = 5;
    const label = shown.length ? t('fantasyHelp.picker.last5', { list: shown.map((value) => formatCredits(value, i18n.language)).join(', ') }) : t('fantasyHelp.picker.last5None');
    return (
        <View accessible accessibilityRole="image" accessibilityLabel={label} style={{ width, height: up + down + 1, flexDirection: 'row', gap: 2 }}>
            {Array.from({ length: 5 }, (_, index) => {
                const value = shown[index - (5 - shown.length)];
                const empty = value === undefined;
                const h = empty ? 0 : Math.max(2, (Math.abs(value) / max) * (value >= 0 ? up : down));
                return (
                    <View key={index} style={{ width: bar, height: '100%' }}>
                        <View style={{ height: up, justifyContent: 'flex-end' }}>
                            {empty ? (
                                <View style={{ height: 6, borderRadius: 1.5, borderWidth: 1, borderStyle: 'dashed', borderColor: alpha(colors.line, 0.3) }} />
                            ) : value >= 0 ? (
                                <View style={{ height: h, borderRadius: 1.5, backgroundColor: pro.up }} />
                            ) : null}
                        </View>
                        <View style={{ height: 1, backgroundColor: alpha(colors.line, 0.25) }} />
                        {!empty && value < 0 ? <View style={{ height: h, borderRadius: 1.5, backgroundColor: pro.down }} /> : null}
                    </View>
                );
            })}
        </View>
    );
};

/** Si tu equipo ya está en la cuenta: Guardando… / Guardado / Sin conexión: se guarda al volver */
export const SaveLine: React.FC<{ status: SaveStatus; light?: boolean }> = ({ status, light }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const pro = useProColors();
    if (status === 'empty' || status === 'closed') return null;
    const shown = status === 'pending' ? 'saving' : status;
    const Icon = shown === 'saved' ? CheckCheck : shown === 'offline' ? CloudOff : UploadCloud;
    const color = light ? '#fff' : shown === 'saved' ? pro.up : shown === 'offline' ? pro.warn : colors.muted;
    return (
        <View accessible accessibilityRole="text" accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1, minWidth: 0 }}>
            <Icon size={14} color={color} />
            <Txt size={12} weight="semibold" color={color} style={{ flexShrink: 1 }}>
                {t(`fantasyHelp.save.${shown}`)}
            </Txt>
        </View>
    );
};
