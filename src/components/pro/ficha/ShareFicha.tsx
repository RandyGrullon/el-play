import React from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ImageDown } from 'lucide-react-native';
import { numOf } from '../../../lib/advanced';
import type { PlayerDetail, PlayerRow, StatContext } from '../../../lib/stats';
import { fonts, radius } from '../../../theme/tokens';
import type { LeagueAverages, PlayerPro } from '../../../types/pro-liga';
import { PlayerPhoto, ProBadge, Txt } from '../../ui';
import { SHARE_SITE } from '../../share/ShareCard';
import { GradientCard, ProButton, heatColor, initials, teamInk } from '../kit';
import { ShareImageSheet, type CardNode } from '../estadisticas/share';
import { percentileRowsOf } from './model';
import { rate } from './format';

// Tarjeta del final de la ficha: «Comparte su ficha» con la imagen PRO (percentiles, situaciones y fantasy)
export const ShareFichaCard: React.FC<{ player: PlayerDetail; color: string; onShare: () => void }> = ({ player, color, onShare }) => {
    const { t } = useTranslation();
    return (
        <GradientCard accessibilityLabel={t('pro.ficha.share.title')}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
                    <Txt size={15} weight="black" color={teamInk(color)}>
                        {initials(player.name)}
                    </Txt>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                        <Txt size={17} weight="extrabold">
                            {t('pro.ficha.share.title')}
                        </Txt>
                        <ProBadge />
                    </View>
                    <Txt size={13} tone="muted">
                        {t('pro.ficha.share.sub')}
                    </Txt>
                </View>
            </View>
            <ProButton style={{ marginTop: 12 }} variant="solid" size="lg" block label={t('pro.ficha.share.button')} icon={(c) => <ImageDown size={16} color={c} />} onPress={onShare} />
        </GradientCard>
    );
};

interface ShareSheetProps {
    open: boolean;
    onClose: () => void;
    player: PlayerDetail;
    pro?: PlayerPro;
    pool: PlayerRow[];
    ctx: StatContext | null;
    averages: LeagueAverages | null;
    seasonText: string;
    color: string;
    league: string;
}

// La hoja con la imagen de la ficha PRO (la usan el botón de arriba y la tarjeta del final)
export const ShareFichaSheet: React.FC<ShareSheetProps> = ({ open, onClose, player, pro, pool, ctx, averages, seasonText, color, league }) => {
    const { t } = useTranslation();
    const pitcher = player.role === 'P';
    const main = pitcher ? { value: player.pitching?.era ?? '—', label: t('pro.estadisticas.cols.era.short') } : { value: player.hitting?.ops ?? '—', label: 'OPS' };
    const percentiles = open ? percentileRowsOf(player, pool, ctx, averages).rows : [];
    const splits = pro?.splits;
    const pair = (key: string, left?: { ops?: string | null } | null, right?: { ops?: string | null } | null) =>
        left && right && numOf(left.ops) !== null && numOf(right.ops) !== null
            ? { key, label: t(`pro.ficha.situations.${key}.${pitcher && key === 'hand' ? 'titleP' : 'title'}`), left: `${t(`pro.ficha.share.${key}Left`)} ${rate(numOf(left.ops))}`, right: `${t(`pro.ficha.share.${key}Right`)} ${rate(numOf(right.ops))}` }
            : null;
    const situations = [pair('hand', splits?.vl, splits?.vr), pair('home', splits?.h, splits?.a), pair('dayNight', splits?.d, splits?.n)].filter((item): item is NonNullable<typeof item> => item !== null);
    return (
        <ShareImageSheet
            open={open}
            onClose={onClose}
            title={t('pro.ficha.share.sheetTitle')}
            fileName={`ficha-${player.id}`}
            text={t('pro.ficha.share.text', { name: player.name, season: seasonText, value: `${main.value} ${main.label}` })}
            path={`/estadisticas?jugador=${player.id}`}
            width={320}
            renderCard={(ref) => (
                <FichaImage
                    ref={ref}
                    player={player}
                    color={color}
                    line={[player.number ? `#${player.number}` : null, player.pos, player.team?.name].filter(Boolean).join(' · ')}
                    season={`${league} · ${seasonText}`}
                    main={main}
                    percentilesTitle={t('pro.ficha.percentiles.title')}
                    percentiles={percentiles.map((row) => ({ key: row.key, label: t(`pro.estadisticas.cols.${row.key}.short`), value: row.value, pct: row.standing.pct }))}
                    situationsTitle={t(pitcher ? 'pro.ficha.share.situationsP' : 'pro.ficha.share.situationsB')}
                    situations={situations}
                    fantasy={player.g ? { label: t('pro.ficha.fantasy.title', { season: seasonText }), value: String(player.pts), sub: t('pro.ficha.share.ppg', { ppg: player.ppg }) } : null}
                    footer={t('pro.ficha.share.footer')}
                />
            )}
        />
    );
};

// La imagen va siempre en noche (no depende del tema de quien la comparte)
const NIGHT = { bg: '#0b0c10', panel: '#16171d', ink: '#f1f2f6', muted: '#9a9db0', line: 'rgba(255,255,255,0.1)', fantasy: '#a78bfa' };

interface FichaImageProps {
    ref?: React.Ref<CardNode>;
    player: PlayerDetail;
    color: string;
    line: string;
    season: string;
    main: { value: string; label: string };
    percentilesTitle: string;
    percentiles: { key: string; label: string; value: string; pct: number }[];
    situationsTitle: string;
    situations: { key: string; label: string; left: string; right: string }[];
    fantasy: { label: string; value: string; sub: string } | null;
    footer: string;
}

const FichaImage: React.FC<FichaImageProps> = ({ ref, player, color, line, season, main, percentilesTitle, percentiles, situationsTitle, situations, fantasy, footer }) => {
    const ink = teamInk(color);
    const team = player.team ? { id: player.team.id, logo: player.team.logo, color: player.team.color } : null;
    return (
        <View ref={ref} collapsable={false} style={{ backgroundColor: NIGHT.bg, padding: 14, gap: 10 }}>
            <View style={{ borderRadius: 18, backgroundColor: color, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <PlayerPhoto personId={player.id} name={player.name} size={64} background="rgba(255,255,255,0.25)" team={team} />
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Txt size={11} weight="bold" color={ink} numberOfLines={1} style={{ opacity: 0.85 }}>
                        {line}
                    </Txt>
                    <Txt size={20} weight="black" color={ink} numberOfLines={2} style={{ lineHeight: 22 }}>
                        {player.name}
                    </Txt>
                    <Txt size={11} weight="semibold" color={ink} style={{ opacity: 0.85 }}>
                        {season}
                    </Txt>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                    <Txt color={ink} style={{ fontFamily: fonts.condensed, fontSize: 34, lineHeight: 36 }}>
                        {main.value}
                    </Txt>
                    <Txt size={11} weight="extrabold" color={ink} style={{ opacity: 0.85 }}>
                        {main.label}
                    </Txt>
                </View>
            </View>
            {percentiles.length > 0 && (
                <View style={{ borderRadius: 14, backgroundColor: NIGHT.panel, padding: 12, gap: 6 }}>
                    <Txt size={10} weight="extrabold" color={NIGHT.muted} style={{ textTransform: 'uppercase', letterSpacing: 1.2 }}>
                        {percentilesTitle}
                    </Txt>
                    {percentiles.map((row) => (
                        <View key={row.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Txt size={11} weight="extrabold" color={NIGHT.muted} style={{ width: 40 }}>
                                {row.label}
                            </Txt>
                            <Txt size={13} weight="extrabold" color={NIGHT.ink} style={{ width: 50 }}>
                                {row.value}
                            </Txt>
                            <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: NIGHT.line, overflow: 'hidden' }}>
                                <View style={{ width: `${Math.max(3, row.pct)}%`, height: 6, borderRadius: 3, backgroundColor: heatColor(row.pct / 100, 'heat') }} />
                            </View>
                            <Txt size={13} weight="extrabold" color={NIGHT.ink} style={{ width: 28, textAlign: 'right' }}>
                                {row.pct}
                            </Txt>
                        </View>
                    ))}
                </View>
            )}
            {situations.length > 0 && (
                <View style={{ borderRadius: 14, backgroundColor: NIGHT.panel, padding: 12, gap: 6 }}>
                    <Txt size={10} weight="extrabold" color={NIGHT.muted} style={{ textTransform: 'uppercase', letterSpacing: 1.2 }}>
                        {situationsTitle}
                    </Txt>
                    {situations.map((item) => (
                        <View key={item.key} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                            <Txt size={12} weight="bold" color={NIGHT.ink}>
                                {item.left}
                            </Txt>
                            <Txt size={12} weight="bold" color={NIGHT.ink}>
                                {item.right}
                            </Txt>
                        </View>
                    ))}
                </View>
            )}
            {fantasy && (
                <View style={{ borderRadius: 14, borderWidth: 1, borderColor: 'rgba(167,139,250,0.4)', padding: 12, flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                    <Txt size={11} weight="extrabold" color={NIGHT.muted} style={{ flex: 1, textTransform: 'uppercase', letterSpacing: 1.2 }}>
                        {fantasy.label}
                    </Txt>
                    <Txt color={NIGHT.fantasy} style={{ fontFamily: fonts.condensed, fontSize: 28, lineHeight: 30 }}>
                        {fantasy.value}
                    </Txt>
                    <Txt size={11} color={NIGHT.muted}>
                        {fantasy.sub}
                    </Txt>
                </View>
            )}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderRadius: radius.pill }}>
                <Txt size={10} color={NIGHT.muted}>
                    {footer}
                </Txt>
                <Txt size={10} weight="extrabold" color={NIGHT.ink}>
                    {SHARE_SITE}
                </Txt>
            </View>
        </View>
    );
};
