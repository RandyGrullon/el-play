// Posiciones (igual que StandingsPage de la web): fases de LIDOM, líder en tarjeta con el color del equipo,
// filas con rango, logo, G-P, JD y estrella de favorito; Clásico por grupos y Serie del Caribe. En PRO, la tabla ancha.
import React, { useState } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Share2, Star } from 'lucide-react-native';
import type { StandingRow } from '../../types';
import { useStandings } from '../../lib/queries';
import { seasonLabel } from '../../lib/format';
import { teamDisplayName } from '../../lib/teams';
import { useIsPro } from '../../lib/pro';
import { useLeague } from '../../state/league';
import { usePreferences } from '../../state/preferences';
import { useColors } from '../../theme/theme';
import { alpha, inkOn, radius, shadow } from '../../theme/tokens';
import { Screen } from '../layout';
import { Card, ErrorState, OfflineState, Pill, Row, Skeleton, TeamLogo, Txt, useErrorText } from '../ui';
import { StandingsTable } from '../pro/StandingsTable';
import { ChipRow, HeaderButton, Notice, SectionHeader, poolTitle, shareText, waitingForNetwork } from './common';

type Phase = 'regular' | 'roundRobin' | 'final';

const streakLabel = (code: string, t: (key: string) => string) => {
    const match = code.match(/^([WL])(\d+)$/);
    return match ? `${match[1] === 'W' ? t('standings.wonShort') : t('standings.lostShort')}${match[2]}` : '';
};

const FavoriteButton: React.FC<{ row: StandingRow; color?: string }> = ({ row, color }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const { favoriteTeamId, toggleFavoriteTeam } = usePreferences();
    const favorite = favoriteTeamId === row.team.id;
    return (
        <Pressable
            onPress={() => toggleFavoriteTeam(row.team.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: favorite }}
            accessibilityLabel={favorite ? t('teams.removeFavorite', { name: row.team.name }) : t('teams.addFavorite', { name: row.team.name })}
            hitSlop={4}
            style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }}
        >
            <Star size={16} color={favorite ? colors.gold : color ?? colors.ink} fill={favorite ? colors.gold : 'transparent'} style={{ opacity: favorite ? 1 : 0.4 }} />
        </Pressable>
    );
};

// Tarjetas de equipo: el primero grande con su color, el resto en filas
const StandingCards: React.FC<{ rows: StandingRow[]; cutoff?: number; cutoffLabel?: string }> = ({ rows, cutoff, cutoffLabel }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    // Teléfonos angostos (320 px): menos aire para que quepa el nombre del equipo
    const compact = useWindowDimensions().width < 360;
    if (!rows.length) {
        return (
            <Card style={{ paddingVertical: 32 }}>
                <Txt size={14} tone="muted" center>
                    {t('standings.noData')}
                </Txt>
            </Card>
        );
    }
    const [leader, ...rest] = rows;
    const ink = inkOn(leader.team.color);
    const streak = streakLabel(leader.streak, t);

    return (
        <View style={{ gap: 8 }}>
            <Row gap={compact ? 12 : 16} style={[{ backgroundColor: leader.team.color, borderRadius: 26, padding: compact ? 16 : 20 }, shadow('float')]}>
                <Txt size={56} weight="extrabold" color={ink} style={{ lineHeight: 58 }}>
                    {leader.rank}
                </Txt>
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Txt size={22} weight="extrabold" color={ink} numberOfLines={1}>
                        {teamDisplayName(leader.team, i18n.language)}
                    </Txt>
                    <Txt size={14} weight="semibold" color={ink} tabular style={{ opacity: 0.8 }}>
                        {leader.wins}-{leader.losses} · {leader.pct}
                    </Txt>
                </View>
                {streak ? (
                    <View style={{ backgroundColor: 'rgba(0,0,0,0.1)', borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 4 }}>
                        <Txt size={12} weight="bold" color={ink}>
                            {streak}
                        </Txt>
                    </View>
                ) : null}
                <FavoriteButton row={leader} color={ink} />
            </Row>
            {rest.map((row, index) => {
                const below = cutoff !== undefined && index + 1 >= cutoff;
                return (
                    <React.Fragment key={row.team.id}>
                        {cutoff !== undefined && index + 1 === cutoff && (
                            <Row gap={8} style={{ paddingHorizontal: 8, paddingVertical: 2 }}>
                                <View style={{ height: 2, flex: 1, borderRadius: 1, backgroundColor: alpha(colors.accent, 0.25) }} />
                                <Txt size={12} weight="bold" color={colors.accentInk}>
                                    {cutoffLabel}
                                </Txt>
                                <View style={{ height: 2, flex: 1, borderRadius: 1, backgroundColor: alpha(colors.accent, 0.25) }} />
                            </Row>
                        )}
                        <Row gap={compact ? 8 : 12} style={[{ borderRadius: radius.chip, paddingHorizontal: compact ? 12 : 14, paddingVertical: 12, backgroundColor: below ? colors.raised : colors.surface }, !below && shadow('card')]}>
                            <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: row.team.color, alignItems: 'center', justifyContent: 'center' }}>
                                <Txt weight="extrabold" color={inkOn(row.team.color)}>
                                    {row.rank}
                                </Txt>
                            </View>
                            <TeamLogo team={row.team} size={26} />
                            <Txt size={compact ? 14 : 15} weight="bold" tone={below ? 'muted' : 'ink'} numberOfLines={2} style={{ flex: 1, minWidth: 0, lineHeight: 18 }}>
                                {teamDisplayName(row.team, i18n.language)}
                            </Txt>
                            <Txt weight="bold" tabular>
                                {row.wins}-{row.losses}
                            </Txt>
                            <Txt size={14} weight="semibold" tone="muted" tabular style={{ width: compact ? 26 : 36, textAlign: 'right' }}>
                                {row.gamesBack === '-' ? '—' : row.gamesBack}
                            </Txt>
                            <FavoriteButton row={row} />
                        </Row>
                    </React.Fragment>
                );
            })}
        </View>
    );
};

/** La tabla en texto para compartir: «1. Estrellas 1-0 · 2. Leones 0-0 …» */
const tableText = (rows: StandingRow[], title: string, lang: string) =>
    [title, ...rows.map((row) => `${row.rank}. ${teamDisplayName(row.team, lang)} ${row.wins}-${row.losses}${row.gamesBack !== '-' ? ` (${row.gamesBack})` : ''}`), '· El Play'].join('\n');

export const StandingsSection: React.FC<{ tabs: React.ReactNode }> = ({ tabs }) => {
    const { t, i18n } = useTranslation();
    const errorText = useErrorText();
    const { activeLeague } = useLeague();
    const standings = useStandings(activeLeague);
    const data = standings.data;
    const [phase, setPhase] = useState<Phase | null>(null);
    const pro = useIsPro();
    // Otra liga: vuelve a la fase activa (se ajusta en el render, sin efecto)
    const [shownLeague, setShownLeague] = useState(activeLeague);
    if (shownLeague !== activeLeague) {
        setShownLeague(activeLeague);
        setPhase(null);
    }

    const leagueName = t(`leagues.${activeLeague}.name`);
    const season = data ? seasonLabel(data.season, activeLeague) : '';
    const activePhase = data?.type === 'lidom' ? phase ?? data.activePhase : null;
    const rows = !data ? [] : data.type === 'lidom' ? data[activePhase!] : data.type === 'sdc' ? data.teams : [];
    const phaseLabel = activePhase ? t(`standings.${activePhase}`) : '';
    const share = (tableRows: StandingRow[], subtitle: string) => shareText(tableText(tableRows, `${t('standings.title')} ${leagueName} · ${subtitle}`, i18n.language));

    const table = (tableRows: StandingRow[], cutoff: number | undefined, cutoffLabel: string) =>
        pro ? <StandingsTable rows={tableRows} cutoff={cutoff} /> : <StandingCards rows={tableRows} cutoff={cutoff} cutoffLabel={cutoffLabel} />;

    return (
        <Screen onRefresh={() => standings.refetch()}>
            {tabs}
            <SectionHeader
                subtitle={`${leagueName}${season ? ` · ${t('common.season', { season })}` : ''}`}
                title={t('standings.title')}
                pro={pro}
                right={
                    rows.length > 0 ? (
                        <HeaderButton label={t('share.shareTable')} onPress={() => share(rows, `${phaseLabel || leagueName} · ${season}`)}>
                            <Share2Icon />
                        </HeaderButton>
                    ) : null
                }
            />

            {data?.isPreviousSeason && <Notice text={t('standings.previousSeason')} />}

            {waitingForNetwork(standings) ? (
                <OfflineState />
            ) : standings.isPending ? (
                <View style={{ gap: 8 }}>
                    <Skeleton height={96} />
                    {[0, 1, 2, 3].map((index) => (
                        <Skeleton key={index} height={56} round={20} />
                    ))}
                </View>
            ) : standings.isError && !data ? (
                <ErrorState message={errorText(standings.error)} onRetry={() => standings.refetch()} />
            ) : data?.type === 'lidom' ? (
                <>
                    <ChipRow label={t('standings.phase')}>
                        {(['regular', 'roundRobin', 'final'] as const).map((value) => (
                            <Pill key={value} label={t(`standings.${value}`)} active={activePhase === value} onPress={() => setPhase(value)} />
                        ))}
                    </ChipRow>
                    {table(
                        rows,
                        activePhase === 'regular' ? 4 : activePhase === 'roundRobin' ? data.roundRobinInfo?.advance ?? 2 : undefined,
                        activePhase === 'regular' ? t('standings.cutRoundRobin') : t('standings.cutFinal')
                    )}
                </>
            ) : data?.type === 'wbc' ? (
                <View style={{ gap: 24 }}>
                    {Object.entries(data.pools).map(([pool, poolRows]) => {
                        const title = poolTitle(pool, i18n.language);
                        return (
                            <View key={pool} style={{ gap: 8 }} accessibilityLabel={title}>
                                <Row justify="space-between">
                                    <Txt size={18} weight="extrabold">
                                        {title}
                                    </Txt>
                                    <HeaderButton size={36} label={t('share.shareTable')} onPress={() => share(poolRows, `${title} · ${season}`)}>
                                        <Share2Icon small />
                                    </HeaderButton>
                                </Row>
                                {table(poolRows, 2, t('standings.cutNext'))}
                            </View>
                        );
                    })}
                </View>
            ) : data?.type === 'sdc' ? (
                table(data.teams, 4, t('standings.cutNext'))
            ) : null}
        </Screen>
    );
};

const Share2Icon: React.FC<{ small?: boolean }> = ({ small }) => {
    const colors = useColors();
    return <Share2 size={small ? 16 : 20} color={colors.ink} />;
};

