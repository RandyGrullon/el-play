// Ayudas del Fantasy (igual que la web, src/pages/FantasyPage.tsx): aviso del próximo cierre, proyección del equipo,
// «Completar con los mejores», equipo sugerido, equipo ideal del día y % elegido después del cierre.
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Clock, Crown, Sparkles, Trophy, Wand2 } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { accountEnabled } from '../../lib/account';
import { RULES, applyLineup, gameStarted, isLocked, nextLockAt, teamPoints, type DayEntry, type FantasyDay, type FantasyPlayer } from '../../lib/fantasy';
import { bestLineup, projectedPoints } from '../../lib/fantasyBest';
import { formatTime } from '../../lib/format';
import { showToast } from '../../lib/toast';
import { useColors } from '../../theme/theme';
import { alpha, radius } from '../../theme/tokens';
import { Button, Card, PlayerPhoto, Row, Sheet, Txt } from '../ui';
import { useFantasyOwners, type FantasyOwners } from './fans';
import { formatCredits, teamOf } from './shared';

const valueFormats = new Map<string, Intl.NumberFormat>();

/** Valor (puntos por crédito) con dos decimales: con uno, todos los estelares salían «0,7» */
export const formatValue = (value: number, lang: string) => {
    try {
        let format = valueFormats.get(lang);
        if (!format) {
            format = new Intl.NumberFormat(lang, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            valueFormats.set(lang, format);
        }
        return format.format(value);
    } catch {
        const text = value.toFixed(2);
        return lang.startsWith('en') ? text : text.replace('.', ',');
    }
};

/** «45 min» o «3 h 20 min» */
const untilText = (ms: number, t: TFunction) => {
    const minutes = Math.max(1, Math.round(ms / 60000));
    return minutes < 60 ? t('fantasy.smart.min', { n: minutes }) : t('fantasy.smart.hours', { h: Math.floor(minutes / 60), m: minutes % 60 });
};

/** % de elección del día: solo cuando hay juegos empezados (antes no se muestra para que nadie copie) */
export const useOwners = (day: FantasyDay): { players: Map<number, FantasyOwners['players'][number]>; data: FantasyOwners | undefined } => {
    const started = day.games.some((game) => gameStarted(game));
    const owners = useFantasyOwners(day.league, day.date, accountEnabled() && started);
    const players = useMemo(() => new Map((owners.data?.players ?? []).map((row) => [row.id, row])), [owners.data]);
    return { players, data: owners.data };
};

/** Próximo cierre (cuenta regresiva al minuto) y cuántos peloteros faltan */
export const LockNotice: React.FC<{ day: FantasyDay; entry: DayEntry }> = ({ day, entry }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 30000);
        return () => clearInterval(timer);
    }, []);
    const next = nextLockAt(day, now);
    if (next === null) return null;
    const missing = Math.max(0, RULES.batters + RULES.pitchers - entry.lineup.length);
    const game = day.games.find((g) => !g.startTimeTBD && Date.parse(g.date) === next);
    return (
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12, borderRadius: 16, backgroundColor: missing ? alpha(colors.live, 0.1) : colors.raised }}>
            <Clock size={16} color={colors.ink} style={{ marginTop: 2 }} />
            <View style={{ flex: 1, minWidth: 0 }}>
                <Txt size={14}>
                    <Txt size={14} weight="bold">
                        {t('fantasy.smart.nextLock', { time: untilText(next - now, t) })}
                    </Txt>
                    {game && (
                        <Txt size={14} tone="muted">
                            {` · ${game.away.abbrev}–${game.home.abbrev}, ${formatTime(game.date, i18n.language).replace(/ /g, ' ')}`}
                        </Txt>
                    )}
                </Txt>
                {missing > 0 && (
                    <Txt size={14} weight="semibold" tone="live">
                        {t('fantasy.smart.missing', { count: missing })}
                    </Txt>
                )}
            </View>
        </View>
    );
};

/** Proyección del equipo y las ayudas: completar con los mejores y ver el equipo sugerido (mientras quede alguien abierto) */
export const SmartActions: React.FC<{ day: FantasyDay; entry: DayEntry }> = ({ day, entry }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const [open, setOpen] = useState(false);
    const hasProj = day.players.some((player) => player.proj !== undefined);
    const anyOpen = day.players.some((player) => !isLocked(day, player));
    if (!hasProj || !anyOpen) return null;
    const missing = RULES.batters + RULES.pitchers - entry.lineup.length;
    const projected = projectedPoints(day, entry.lineup, entry.captain);
    const locked = entry.lineup.filter((id) => {
        const player = day.players.find((p) => p.id === id);
        return !!player && isLocked(day, player);
    });
    const lockedCaptain = entry.captain !== null && locked.includes(entry.captain) ? entry.captain : null;
    const fill = () => {
        const best = bestLineup(day, { metric: 'proj', keep: entry.lineup, captain: entry.captain });
        if (best) {
            applyLineup(day, best.lineup, best.captain);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
        } else showToast(t('fantasy.smart.none'));
    };
    const pill = { flexDirection: 'row', alignItems: 'center', gap: 6, height: 44, paddingHorizontal: 16, borderRadius: radius.pill } as const;
    return (
        <>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                <Txt size={14} style={{ marginRight: 'auto' }}>
                    <Txt size={14} tone="muted">
                        {t('fantasy.smart.teamProj')}{' '}
                    </Txt>
                    <Txt size={14} weight="bold" tabular>
                        {t('fantasy.smart.pts', { pts: formatCredits(projected, i18n.language) })}
                    </Txt>
                </Txt>
                {missing > 0 && (
                    <Pressable onPress={fill} accessibilityRole="button" style={({ pressed }) => [pill, { backgroundColor: colors.accent, opacity: pressed ? 0.85 : 1 }]}>
                        <Sparkles size={16} color="#fff" />
                        <Txt size={12} weight="extrabold" color="#fff">
                            {t('fantasy.smart.fill')}
                        </Txt>
                    </Pressable>
                )}
                <Pressable onPress={() => setOpen(true)} accessibilityRole="button" style={({ pressed }) => [pill, { backgroundColor: colors.raised, opacity: pressed ? 0.85 : 1 }]}>
                    <Wand2 size={16} color={colors.ink} />
                    <Txt size={12} weight="extrabold">
                        {t('fantasy.smart.suggest')}
                    </Txt>
                </Pressable>
            </View>
            {open && <SuggestSheet day={day} keep={locked} captain={lockedCaptain} onClose={() => setOpen(false)} />}
        </>
    );
};

/** El equipo sugerido (el mejor según las proyecciones, con los créditos y las reglas): se ve antes de usarlo */
const SuggestSheet: React.FC<{ day: FantasyDay; keep: number[]; captain: number | null; onClose: () => void }> = ({ day, keep, captain, onClose }) => {
    const { t, i18n } = useTranslation();
    const best = useMemo(() => bestLineup(day, { metric: 'proj', keep, captain }), [day, keep, captain]);
    const lang = i18n.language;
    return (
        <Sheet open onClose={onClose} title={t('fantasy.smart.suggestTitle')}>
            <View style={{ gap: 12, paddingBottom: 8 }}>
                <Txt size={14} tone="muted">
                    {t('fantasy.smart.suggestHint')}
                </Txt>
                {best ? (
                    <>
                        <LineupList day={day} lineup={best.lineup} captain={best.captain} metric="proj" />
                        <Txt size={14} weight="bold">
                            {t('fantasy.smart.suggestTotal', { pts: formatCredits(best.total, lang), cost: formatCredits(best.cost, lang), budget: formatCredits(day.credits?.budget ?? 0, lang) })}
                        </Txt>
                        <Button
                            label={t('fantasy.smart.use')}
                            icon={<Wand2 size={16} color="#fff" />}
                            onPress={() => {
                                applyLineup(day, best.lineup, best.captain);
                                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
                                onClose();
                            }}
                        />
                    </>
                ) : (
                    <Card style={{ padding: 16 }}>
                        <Txt size={14} tone="muted">
                            {t('fantasy.smart.none')}
                        </Txt>
                    </Card>
                )}
            </View>
        </Sheet>
    );
};

/** Lista corta de un equipo (sugerido o ideal): foto, nombre, equipo y sus puntos (proyectados o reales) */
const LineupList: React.FC<{ day: FantasyDay; lineup: number[]; captain: number | null; metric: 'proj' | 'points' }> = ({ day, lineup, captain, metric }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const players = lineup.map((id) => day.players.find((p) => p.id === id)).filter((p): p is FantasyPlayer => !!p);
    return (
        <View>
            {players.map((player, index) => {
                const team = day.teams[player.teamId];
                const points = metric === 'proj' ? player.proj ?? 0 : player.points;
                const shown = captain === player.id ? Math.round(points * RULES.captain * 10) / 10 : points;
                return (
                    <Row key={player.id} gap={12} style={{ paddingVertical: 8, borderTopWidth: index ? 1 : 0, borderTopColor: colors.line }}>
                        <PlayerPhoto personId={player.id} name={player.name} size={40} team={teamOf(day, player)} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                            <Row gap={6}>
                                {captain === player.id && <Crown size={14} color={colors.gold} accessibilityLabel={t('fantasy.captain')} />}
                                <Txt size={14} weight="extrabold" numberOfLines={1} style={{ flexShrink: 1 }}>
                                    {player.name}
                                </Txt>
                            </Row>
                            <Txt size={12} tone="muted" numberOfLines={1}>
                                {team?.abbrev} · {player.role === 'P' ? t('fantasy.pitcher') : player.pos || t('fantasy.batter')}
                                {player.price !== undefined ? ` · ${t('fantasy.credits.price', { price: formatCredits(player.price, i18n.language) })}` : ''}
                            </Txt>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                            <Txt size={18} weight="extrabold" tabular>
                                {formatCredits(shown, i18n.language)}
                            </Txt>
                            <Txt size={10} weight="semibold" tone="muted">
                                {metric === 'proj' ? t('fantasy.smart.projShort') : t('fantasy.smart.pts', { pts: '' }).trim()}
                            </Txt>
                        </View>
                    </Row>
                );
            })}
        </View>
    );
};

/** El equipo ideal del día (lo máximo que se podía sumar con los créditos y las reglas) y cuánto de eso hizo el tuyo */
export const IdealCard: React.FC<{ day: FantasyDay; entry: DayEntry }> = ({ day, entry }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const started = day.games.some((game) => game.state !== 'preview');
    const ideal = useMemo(() => (started ? bestLineup(day, { metric: 'points', ignoreLocks: true }) : null), [day, started]);
    const [open, setOpen] = useState(false);
    if (!ideal || ideal.total <= 0) return null;
    const lang = i18n.language;
    const mine = teamPoints(day, entry);
    const pct = Math.max(0, Math.min(100, Math.round((Math.max(0, mine) / ideal.total) * 100)));
    const live = day.games.some((game) => game.state === 'live');
    return (
        <Card style={{ padding: 16, gap: 12 }}>
            <Row justify="space-between" align="flex-start" gap={12}>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Row gap={6}>
                        <Trophy size={14} color={colors.muted} />
                        <Txt eyebrow>{t('fantasy.smart.ideal')}</Txt>
                    </Row>
                    <Txt size={12} tone="muted">
                        {t(live ? 'fantasy.smart.idealLive' : 'fantasy.smart.idealHint')}
                    </Txt>
                </View>
                <Txt size={30} weight="extrabold" tabular style={{ lineHeight: 32 }}>
                    {formatCredits(ideal.total, lang)}
                </Txt>
            </Row>
            {entry.lineup.length > 0 && (
                <View style={{ gap: 4 }}>
                    <View
                        accessible
                        accessibilityRole="progressbar"
                        accessibilityLabel={t('fantasy.smart.ideal')}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={pct}
                        style={{ height: 8, borderRadius: radius.pill, overflow: 'hidden', backgroundColor: colors.raised }}
                    >
                        <View style={{ height: '100%', width: `${pct}%`, borderRadius: radius.pill, backgroundColor: colors.accent }} />
                    </View>
                    <Txt size={12} weight="semibold" tone="muted">
                        {t('fantasy.smart.idealYou', { pts: formatCredits(mine, lang), ideal: formatCredits(ideal.total, lang), pct })}
                    </Txt>
                </View>
            )}
            <Pressable onPress={() => setOpen((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: open }} hitSlop={6} style={{ alignSelf: 'flex-start' }}>
                <Txt size={14} weight="semibold" tone="accentInk">
                    {open ? t('fantasy.smart.idealHide') : t('fantasy.smart.idealShow')}
                </Txt>
            </Pressable>
            {open && <LineupList day={day} lineup={ideal.lineup} captain={ideal.captain} metric="points" />}
        </Card>
    );
};
