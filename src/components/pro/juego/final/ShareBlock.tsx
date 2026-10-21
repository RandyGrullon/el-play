import React, { useState } from 'react';
import { PixelRatio, Platform, View } from 'react-native';
import Svg, { ClipPath, Defs, Path, Rect } from 'react-native-svg';
import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import { useTranslation } from 'react-i18next';
import { Download, Link2, Share2 } from 'lucide-react-native';
import type { GameDetail } from '../../../../types';
import type { GamePro, WinProb } from '../../../../lib/pro/juego';
import { WEB_URL } from '../../../../lib/config';
import { formatShortDate } from '../../../../lib/format';
import { showToast } from '../../../../lib/toast';
import { useColors } from '../../../../theme/theme';
import { radius, shadow } from '../../../../theme/tokens';
import { PlayerPhoto, ProBadge, TeamLogo, Txt } from '../../../ui';
import { GradientCard, ModuleHeader, ProButton, shortName, teamInk, useElementWidth, useProColors, useSvgId, withAlpha, type ViewNode } from '../../kit';
import { performerOf } from './Figures';
import { sideOfTeam } from './logica';

// Compartir: vista previa de la imagen PRO (R-H-E, decisiones, dos figuras, serie y probabilidad) y tres botones.
// En el teléfono la imagen ES esa vista previa (se captura con react-native-view-shot y se manda con la lista de
// apps; desde ahí también se guarda). En la web no se puede capturar: «Compartir imagen» abre el compartir de
// siempre y «Guardar» no sale.

interface ShareBlockProps {
    game: GameDetail;
    pro?: GamePro;
    winProb?: WinProb;
    /** «Serie LIC 1-0» (null si no hay) */
    series: string | null;
    /** Compartir de siempre (si la imagen PRO no se puede crear) */
    onShare: () => void;
}

const SITE = WEB_URL.replace(/^https?:\/\//, '');

/** Mini gráfica de probabilidad para la vista previa (visitante arriba) */
const MiniProb: React.FC<{ points: number[]; away: string; home: string }> = ({ points, away, home }) => {
    const colors = useColors();
    const { width, onLayout } = useElementWidth(280);
    const top = useSvgId('share-top');
    const bottom = useSvgId('share-bottom');
    const height = 64;
    const path = points.map((value, index) => `${index ? 'L' : 'M'}${((index / (points.length - 1)) * width).toFixed(1)} ${(height - (value / 100) * height).toFixed(1)}`).join(' ');
    return (
        <View onLayout={onLayout} style={{ width: '100%', height }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            <Svg width={width} height={height}>
                <Defs>
                    <ClipPath id={top}>
                        <Rect x={0} y={0} width={width} height={height / 2} />
                    </ClipPath>
                    <ClipPath id={bottom}>
                        <Rect x={0} y={height / 2} width={width} height={height / 2} />
                    </ClipPath>
                </Defs>
                <Path d={`${path} L${width} ${height / 2} L0 ${height / 2} Z`} fill={withAlpha(away, 0.75)} clipPath={`url(#${top})`} />
                <Path d={`${path} L${width} ${height / 2} L0 ${height / 2} Z`} fill={withAlpha(home, 0.75)} clipPath={`url(#${bottom})`} />
                <Path d={path} fill="none" stroke={colors.ink} strokeWidth={1.5} />
            </Svg>
        </View>
    );
};

export const ShareBlock: React.FC<ShareBlockProps> = ({ game, pro, winProb, series, onShare }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const proColors = useProColors();
    const [busy, setBusy] = useState(false);
    const [card, setCard] = useState<ViewNode | null>(null);
    const lang = i18n.language;
    const native = Platform.OS !== 'web';
    const venue = (pro?.game.venue.name ?? game.venue).replace(/^Estadio\s+/i, '').split(' ')[0];
    const meta = [t('pro.final.share.final'), game.date ? formatShortDate(game.date, lang) : null, venue].filter(Boolean).join(' · ').toUpperCase();
    const { winner, loser, save } = game.decisions;
    const surname = (name: string) => shortName(name).replace(/^\S+\s/, '');
    const decisions = [
        winner ? { tag: t('summary.win'), color: proColors.up, text: `${surname(winner.name)} (${winner.wins ?? 0}-${winner.losses ?? 0}${winner.era ? `, ${winner.era}` : ''})` } : null,
        loser ? { tag: t('summary.loss'), color: proColors.down, text: `${surname(loser.name)} (${loser.wins ?? 0}-${loser.losses ?? 0}${loser.era ? `, ${loser.era}` : ''})` } : null,
        save ? { tag: 'SV', color: colors.ink, text: surname(save.name) } : null
    ].filter((item): item is { tag: string; color: string; text: string } => item !== null);
    const figures = (pro?.topPerformers ?? []).slice(0, 2).map((item) => {
        const side = sideOfTeam(game, item.teamId) ?? 'away';
        const performer = performerOf(game, item.id, item.teamId, item.type === 'hitter' ? 'hitter' : 'pitcher');
        const stat = performer ? (performer.kind === 'pitcher' ? `${performer.k} K` : performer.hr ? (performer.hr > 1 ? `${performer.hr} HR` : 'HR') : `${performer.h}-${performer.ab}`) : '';
        return { id: item.id, name: shortName(item.name), stat, gs: item.gameScore, side };
    });
    const points = (winProb?.plays ?? []).map((play) => 100 - play.home);
    const url = game.gamePk ? `${WEB_URL}/juego/${game.gamePk}` : WEB_URL;
    const fileName = `el-play-pro-${game.away.abbrev}-${game.home.abbrev}`.toLowerCase();

    // Captura la vista previa (1080 px de ancho) y la manda con la lista de apps; si no se puede, el compartir de siempre
    const shareImage = async (title: string) => {
        if (!native || !card) return onShare();
        setBusy(true);
        try {
            if (!(await Sharing.isAvailableAsync())) throw new Error('sin compartir archivos');
            const ratio = PixelRatio.get();
            const uri = await captureRef(card as unknown as Parameters<typeof captureRef>[0], { format: 'png', quality: 1, result: 'tmpfile', width: 1080 / ratio, fileName });
            await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: title });
        } catch {
            onShare();
        } finally {
            setBusy(false);
        }
    };
    const copy = async () => {
        try {
            await Clipboard.setStringAsync(url);
            showToast(t('pro.final.share.copied'), undefined, 3000);
        } catch {
            showToast(t('pro.final.share.copyFailed'), undefined, 3000);
        }
    };

    const half = (side: 'away' | 'home') => {
        const team = game[side];
        const ink = teamInk(team.color);
        const right = side === 'home';
        return (
            <View style={{ flex: 1, flexBasis: 0, minWidth: 0, gap: 4, padding: 12, alignItems: right ? 'flex-end' : 'flex-start', backgroundColor: team.color }}>
                <View style={{ flexDirection: right ? 'row-reverse' : 'row', alignItems: 'center', gap: 6 }}>
                    <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
                        <TeamLogo team={team} size={18} />
                    </View>
                    <Txt size={14} weight="extrabold" color={ink}>
                        {team.abbrev}
                    </Txt>
                </View>
                <View style={{ flexDirection: right ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: 8 }}>
                    <Txt condensed size={54} tabular color={ink} style={{ lineHeight: 50, opacity: team.isWinner ? 1 : 0.8 }}>
                        {team.runs}
                    </Txt>
                    <Txt condensed size={15} tabular color={ink} numberOfLines={1} style={{ paddingBottom: 4, flexShrink: 1 }}>{`${team.hits} ${t('lineScore.hits')} · ${team.errors} ${t('lineScore.errors')}`}</Txt>
                </View>
            </View>
        );
    };

    return (
        <View style={[{ borderRadius: radius.card, backgroundColor: colors.surface, padding: 16 }, shadow('card')]}>
            <ModuleHeader title={t('pro.final.share.title')} aside={t('pro.final.share.aside')} style={{ marginBottom: 14 }} />
            <View ref={setCard} collapsable={false} style={{ borderRadius: radius.card, backgroundColor: colors.surface }}>
                <GradientCard
                    surface="bg"
                    innerStyle={{ padding: 0, overflow: 'hidden' }}
                    accessible
                    accessibilityRole="image"
                    accessibilityLabel={t('pro.final.share.previewAria', { away: game.away.name, awayRuns: game.away.runs, home: game.home.name, homeRuns: game.home.runs })}
                >
                    <View style={{ flexDirection: 'row', borderTopLeftRadius: radius.card - 1, borderTopRightRadius: radius.card - 1, overflow: 'hidden' }}>
                        {half('away')}
                        {half('home')}
                    </View>
                    <View style={{ gap: 10, padding: 12 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                            <Txt size={11} weight="bold" tone="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
                                {meta}
                            </Txt>
                            {series ? (
                                <Txt size={11} weight="bold" tone="muted">
                                    {series}
                                </Txt>
                            ) : null}
                        </View>
                        {decisions.length > 0 ? (
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 4 }}>
                                {decisions.map((decision) => (
                                    <Txt key={decision.tag} size={12} weight="bold">
                                        <Txt size={12} weight="extrabold" color={decision.color}>
                                            {decision.tag}
                                        </Txt>
                                        {` ${decision.text}`}
                                    </Txt>
                                ))}
                            </View>
                        ) : null}
                        {figures.length > 0 ? (
                            <View style={{ flexDirection: 'row', gap: 8 }}>
                                {figures.map((figure) => (
                                    <View key={figure.id} style={{ flex: 1, flexBasis: 0, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, backgroundColor: colors.raised, padding: 8 }}>
                                        <PlayerPhoto personId={figure.id} name={figure.name} size={34} background={withAlpha(game[figure.side].color, 0.2)} team={game[figure.side]} />
                                        <View style={{ flex: 1, minWidth: 0 }}>
                                            <Txt size={12} weight="extrabold" numberOfLines={1}>
                                                {figure.name}
                                            </Txt>
                                            <Txt size={11} tone="muted" numberOfLines={1}>
                                                {figure.stat}
                                                {figure.gs !== null ? (
                                                    <Txt size={11} weight="extrabold" color={colors.accentInk}>
                                                        {` · GS ${figure.gs}`}
                                                    </Txt>
                                                ) : null}
                                            </Txt>
                                        </View>
                                    </View>
                                ))}
                            </View>
                        ) : null}
                        {points.length > 1 ? <MiniProb points={points} away={game.away.color} home={game.home.color} /> : null}
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <Txt size={13} weight="black" style={{ letterSpacing: -0.3 }}>
                                    El Play
                                </Txt>
                                <ProBadge />
                            </View>
                            <Txt size={11} weight="semibold" tone="muted">
                                {SITE}
                            </Txt>
                        </View>
                    </View>
                </GradientCard>
            </View>
            <ProButton
                variant="gradient"
                size="lg"
                block
                style={{ marginTop: 12 }}
                label={t('pro.final.share.image')}
                icon={(color) => <Share2 size={16} color={color} />}
                onPress={() => shareImage(t('pro.final.share.image'))}
                disabled={busy}
            />
            <View style={{ marginTop: 8, flexDirection: 'row', gap: 8 }}>
                <ProButton block style={{ flex: 1 }} label={t('pro.final.share.copy')} icon={(color) => <Link2 size={16} color={color} />} onPress={copy} />
                {native ? (
                    <ProButton
                        block
                        style={{ flex: 1 }}
                        label={t('pro.final.share.save')}
                        accessibilityLabel={t('pro.final.share.saveAria')}
                        icon={(color) => <Download size={16} color={color} />}
                        onPress={() => shareImage(t('pro.final.share.saveTitle'))}
                        disabled={busy}
                    />
                ) : null}
            </View>
        </View>
    );
};
