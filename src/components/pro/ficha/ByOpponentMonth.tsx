import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { PlayerDetail } from '../../../lib/stats';
import { numOf } from '../../../lib/advanced';
import { useColors } from '../../../theme/theme';
import { alpha, radius, shadow } from '../../../theme/tokens';
import type { PlayerPro } from '../../../types/pro-liga';
import { TeamLogo, Txt } from '../../ui';
import { HBarChart, ModuleHeader, ProSegmented, type HBarRow } from '../kit';
import { eraOf, slashOf, vsTeamsOf } from '../estadisticas/logic';
import { era, monthName, rate } from './format';

// Por rival (del juego a juego de la temporada) y mes a mes (MLB byMonth): su OPS (o EFE) contra cada equipo y en
// cada mes, en barras que salen de su cifra de la temporada: a la derecha, mejor que su promedio. No está en el
// diseño: es lo que MLB manda de LIDOM y la ficha no tenía.
export const ByOpponentMonth: React.FC<{ player: PlayerDetail; pro?: PlayerPro }> = ({ player, pro }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const [view, setView] = useState<'rival' | 'month'>('rival');
    const pitcher = player.role === 'P';
    const season = numOf(pitcher ? player.pitching?.era : player.hitting?.ops);
    const write = pitcher ? era : rate;

    const rivals = useMemo((): HBarRow[] => {
        const list = vsTeamsOf(player.log, player.role);
        const teams = new Map(player.log.filter((game) => game.opponent).map((game) => [game.opponent!.id, game.opponent!]));
        return list
            .map((row) => {
                const value = pitcher ? (row.pitching ? eraOf(row.pitching) : null) : row.hitting ? slashOf(row.hitting).ops : null;
                const team = teams.get(row.opponentId)!;
                const outs = row.pitching?.outs ?? 0;
                const sample = pitcher ? t('pro.ficha.byRival.ip', { count: row.g, ip: `${Math.floor(outs / 3)}.${outs % 3}` }) : t('pro.ficha.byRival.pa', { count: row.g, pa: row.hitting?.pa ?? 0 });
                return {
                    id: String(row.opponentId),
                    name: `${team.name} (${sample})`,
                    label: (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
                            <TeamLogo team={team} size={20} />
                            <View style={{ minWidth: 0, flex: 1 }}>
                                <Txt size={12} weight="extrabold" style={{ lineHeight: 15 }}>
                                    {team.abbrev}
                                </Txt>
                                <Txt size={10} weight="semibold" tone="muted" numberOfLines={1} style={{ lineHeight: 13 }}>
                                    {sample}
                                </Txt>
                            </View>
                        </View>
                    ),
                    value,
                    display: write(value),
                    color: team.color
                };
            })
            .filter((row) => row.value !== null)
            .sort((a, b) => (pitcher ? a.value! - b.value! : b.value! - a.value!));
    }, [player.log, player.role, pitcher, t, write]);

    const months = useMemo((): HBarRow[] => {
        return (pro?.byMonth ?? [])
            .map((item) => {
                const line = item.line as unknown as Record<string, unknown>;
                const value = pitcher ? numOf(line.era as string) : numOf(line.ops as string);
                const sample = pitcher ? t('pro.ficha.byMonth.ip', { ip: (line.ip as string) ?? '—' }) : t('pro.ficha.byMonth.pa', { pa: (line.pa as number) ?? 0 });
                const label = `${monthName(item.month, i18n.language)} ${String(item.year).slice(2)}`;
                return {
                    id: `${item.year}-${item.month}`,
                    name: `${label} (${sample})`,
                    label: (
                        <View style={{ minWidth: 0, flex: 1 }}>
                            <Txt size={12} weight="extrabold" style={{ lineHeight: 15, textTransform: 'capitalize' }}>
                                {label}
                            </Txt>
                            <Txt size={10} weight="semibold" tone="muted" numberOfLines={1} style={{ lineHeight: 13 }}>
                                {sample}
                            </Txt>
                        </View>
                    ),
                    value,
                    display: write(value),
                    color: colors.accent
                };
            })
            .filter((row) => row.value !== null);
    }, [pro?.byMonth, pitcher, t, i18n.language, write, colors.accent]);

    const hasRivals = rivals.length >= 2;
    const hasMonths = months.length >= 2;
    if (!hasRivals && !hasMonths) return null;
    const current = view === 'month' && hasMonths ? 'month' : hasRivals ? 'rival' : 'month';
    const rows = current === 'rival' ? rivals : months;

    return (
        <View style={{ gap: 12 }}>
            <ModuleHeader title={t('pro.ficha.byRival.title')} aside={t(pitcher ? 'pro.ficha.byRival.asideP' : 'pro.ficha.byRival.asideB', { season: write(season) })} />
            <View style={[{ borderRadius: radius.card, backgroundColor: colors.surface, borderWidth: 1, borderColor: alpha(colors.line, 0.06), padding: 16 }, shadow('card')]}>
                {hasRivals && hasMonths && (
                    <ProSegmented
                        style={{ marginBottom: 12 }}
                        value={current}
                        onChange={setView}
                        label={t('pro.ficha.byRival.switch')}
                        options={[
                            { value: 'rival', label: t('pro.ficha.byRival.rival') },
                            { value: 'month', label: t('pro.ficha.byRival.month') }
                        ]}
                    />
                )}
                <HBarChart
                    key={current}
                    rows={rows}
                    label={t(current === 'rival' ? 'pro.ficha.byRival.ariaRival' : 'pro.ficha.byRival.ariaMonth', { metric: t(pitcher ? 'pro.ficha.byRival.era' : 'pro.ficha.byRival.ops') })}
                    center={season ?? undefined}
                    lowerIsBetter={pitcher}
                    labelWidth={80}
                />
                <Txt size={11} tone="muted" style={{ marginTop: 12, lineHeight: 15 }}>
                    {t(current === 'rival' ? 'pro.ficha.byRival.noteRival' : 'pro.ficha.byRival.noteMonth')}
                </Txt>
            </View>
        </View>
    );
};
