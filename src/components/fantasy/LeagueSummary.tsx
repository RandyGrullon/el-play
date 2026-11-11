// Una liga privada del Fantasy (igual que LeagueSummary de la web): su código para invitar, el campeón de la semana,
// la racha actual más larga, compartir el resumen del día y salir de la liga.
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import * as Clipboard from 'expo-clipboard';
import { Copy, Flame, LogOut, Share2, Trophy } from 'lucide-react-native';
import type { LeagueId } from '../../types';
import type { PrivateLeague } from '../../lib/account';
import { showToast } from '../../lib/toast';
import { useColors } from '../../theme/theme';
import { alpha, radius } from '../../theme/tokens';
import { Card, Row, Txt } from '../ui';
import { shareLink } from '../share/ShareSheet';
import { leaveLeague } from '../pro/fantasy/data';
import { useFanLabel } from './FanSearch';
import { useSeasonRanking } from './fans';
import { LeagueOwnerTools } from './LeagueWeeks';

const round = (value: number) => Math.round(value * 10) / 10;

/** Campeón de la semana o racha actual (días seguidos hasta hoy) */
const Box: React.FC<{ tint: string; icon: React.ReactNode; title: string; name: string; detail?: string }> = ({ tint, icon, title, name, detail }) => (
    <View style={{ flex: 1, minWidth: 0, borderRadius: radius.tile, padding: 12, backgroundColor: alpha(tint, 0.13) }}>
        <Row gap={6}>
            {icon}
            <Txt size={11} weight="extrabold" color={tint} numberOfLines={1} style={{ flexShrink: 1, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {title}
            </Txt>
        </Row>
        <Txt weight="extrabold" numberOfLines={1} style={{ marginTop: 4 }}>
            {name}
        </Txt>
        {detail ? (
            <Txt size={12} weight="semibold" tone="muted" numberOfLines={1}>
                {detail}
            </Txt>
        ) : null}
    </View>
);

export const LeagueSummary: React.FC<{
    league: PrivateLeague;
    fantasyLeague: LeagueId;
    dayName: string;
    ownId: string;
    /** La tabla del día dentro de la liga (ya ordenada, con los puestos compartidos en los empates) */
    day: { userId: string; name: string | null; points: number; rank?: number }[];
    onLeft: () => void;
    /** El dueño la renombró, sacó a alguien o la borró */
    onChanged?: (change: 'renamed' | 'removed' | 'deleted') => void;
}> = ({ league, fantasyLeague, dayName, ownId, day, onLeft, onChanged }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const fanLabel = useFanLabel();
    const season = useSeasonRanking(fantasyLeague, true, league.members);
    const [leaving, setLeaving] = useState(false);
    const [busy, setBusy] = useState(false);
    // Solo los de la liga (por si el servidor no entiende `users` y manda la tabla general)
    const rows = (season.data?.ranking ?? []).filter((row) => league.members.includes(row.userId));
    const champion = rows.filter((row) => (row.week ?? 0) > 0).sort((a, b) => (b.week ?? 0) - (a.week ?? 0))[0];
    const streaker = rows.filter((row) => (row.streak ?? 0) > 1).sort((a, b) => (b.streak ?? 0) - (a.streak ?? 0))[0];
    const label = (userId: string, name: string | null | undefined) => fanLabel(name, userId === ownId);

    const copy = async () => {
        try {
            await Clipboard.setStringAsync(league.code);
            showToast(t('leagueSummary.codeCopied'), undefined, 3000);
        } catch {
            // Sin portapapeles: el código en el aviso, para copiarlo a mano
            showToast(league.code, undefined, 8000);
        }
    };

    const share = () => {
        const lines = day.slice(0, 10).map((row, index) => `${row.rank ?? index + 1}. ${label(row.userId, row.name)} · ${round(row.points)}`);
        const text = [
            t('leagueSummary.shareTitle', { league: league.name, day: dayName }),
            ...lines,
            champion ? t('leagueSummary.shareChampion', { name: label(champion.userId, champion.name), pts: round(champion.week ?? 0) }) : null,
            t('leagueSummary.shareJoin', { code: league.code })
        ]
            .filter(Boolean)
            .join('\n');
        shareLink(text, '/fantasy', i18n.language);
    };

    const leave = async () => {
        if (busy) return;
        setBusy(true);
        const ok = await leaveLeague(league.id, ownId)
            .then(() => true)
            .catch(() => false);
        setBusy(false);
        setLeaving(false);
        showToast(ok ? t('leagueSummary.left', { league: league.name }) : t('account.errors.unknown'));
        if (ok) onLeft();
    };

    return (
        <Card style={{ gap: 12 }}>
            <Row justify="space-between" gap={8}>
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Txt size={18} weight="extrabold" numberOfLines={1} accessibilityRole="header">
                        {league.name}
                    </Txt>
                    <Txt size={12} tone="muted">
                        {t('leagueSummary.members', { count: league.members.length })}
                    </Txt>
                </View>
                <Pressable
                    onPress={copy}
                    accessibilityRole="button"
                    accessibilityLabel={t('leagueSummary.copyCode', { code: league.code })}
                    style={({ pressed }) => ({ height: 40, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: colors.raised, opacity: pressed ? 0.7 : 1 })}
                >
                    <Txt size={14} weight="extrabold" style={{ letterSpacing: 2 }}>
                        {league.code}
                    </Txt>
                    <Copy size={14} color={colors.ink} />
                </Pressable>
            </Row>

            <Row gap={8} align="stretch">
                <Box
                    tint={colors.gold}
                    icon={<Trophy size={14} color={colors.gold} />}
                    title={t('leagueSummary.week')}
                    name={champion ? label(champion.userId, champion.name) : '—'}
                    detail={champion ? t('leagueSummary.pts', { pts: round(champion.week ?? 0) }) : undefined}
                />
                <Box
                    tint={colors.live}
                    icon={<Flame size={14} color={colors.live} />}
                    title={t('leagueSummary.streak')}
                    name={streaker ? label(streaker.userId, streaker.name) : '—'}
                    detail={streaker ? t('leagueSummary.days', { count: streaker.streak }) : undefined}
                />
            </Row>

            <Row gap={8}>
                <Pressable
                    onPress={share}
                    accessibilityRole="button"
                    style={({ pressed }) => ({ flex: 1, height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: radius.pill, backgroundColor: colors.ink, opacity: pressed ? 0.85 : 1 })}
                >
                    <Share2 size={16} color={colors.bg} />
                    <Txt size={14} weight="bold" color={colors.bg}>
                        {t('leagueSummary.share')}
                    </Txt>
                </Pressable>
                {leaving ? (
                    <Pressable
                        onPress={leave}
                        disabled={busy}
                        accessibilityRole="button"
                        style={({ pressed }) => ({ height: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: colors.live, opacity: busy ? 0.6 : pressed ? 0.85 : 1 })}
                    >
                        <Txt size={14} weight="bold" tone="white">
                            {t('leagueSummary.confirmLeave')}
                        </Txt>
                    </Pressable>
                ) : (
                    <Pressable
                        onPress={() => setLeaving(true)}
                        accessibilityRole="button"
                        accessibilityLabel={t('leagueSummary.leave')}
                        style={({ pressed }) => ({ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: colors.raised, opacity: pressed ? 0.7 : 1 })}
                    >
                        <LogOut size={16} color={colors.ink} />
                    </Pressable>
                )}
            </Row>

            {/* Fantasy v3: renombrar, sacar a alguien y borrar (solo el dueño, si la base ya tiene esas funciones) */}
            <LeagueOwnerTools league={league} fantasyLeague={fantasyLeague} ownId={ownId} onChanged={(change) => onChanged?.(change)} />
        </Card>
    );
};
