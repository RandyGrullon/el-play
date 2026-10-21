import React, { useEffect, useRef, useState, type ComponentRef } from 'react';
import { ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { GameDetail } from '../../../../types';
import type { GamePro } from '../../../../lib/pro/juego';
import { useColors } from '../../../../theme/theme';
import { alpha } from '../../../../theme/tokens';
import { TeamLogo, Txt } from '../../../ui';
import { Flash, ProSection, shortName, teamInk, useProColors } from '../../kit';
import { boardRows, gameErrors, type BoardCell } from './logic';
import { ordinal } from './parts';

// Pizarra por entradas: 1-9 (o las extras) con C H E LOB fijos a la derecha. Debajo de cada carrera van los hits
// y los dejados en base de esa entrada; el fondo se intensifica con los dejados y un punto rojo marca el error de
// ese equipo. La media entrada que se juega va con el color del equipo al bate.

interface LiveBoardProps {
    game: GameDetail;
    pro?: GamePro;
}

type Side = 'away' | 'home';

const CELL_W = 21;
const CELL_H = 44;
// Anchos fijos de C H E LOB: la tira de entradas se desliza por debajo cuando no cabe (320 px, extras)
const TOTAL_W = { r: 28, h: 22, e: 18, lob: 30 };
const TOTALS = ['r', 'h', 'e', 'lob'] as const;

export const LiveBoard: React.FC<LiveBoardProps> = ({ game, pro }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const proColors = useProColors();
    const board = boardRows(game, pro);
    const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
    const [stripWidth, setStripWidth] = useState(0);
    const live = game.state === 'live';
    const current = live && game.inning && (game.inning.state === 'Top' || game.inning.state === 'Bottom') ? { n: game.inning.n, side: (game.inning.isTop ? 'away' : 'home') as Side } : null;
    const currentN = current?.n ?? null;
    const played = Math.max(game.linescore.length, current?.n ?? 0);
    const errors = gameErrors(game.atBats, pro);
    const totals = (side: Side) => ({
        r: game[side].runs,
        h: pro?.totals?.[side].h ?? game[side].hits,
        e: pro?.totals?.[side].e ?? game[side].errors,
        lob: pro?.totals?.[side].lob ?? game[side].lob
    });

    // A 320 px no caben las 9: la tira se desliza sola hasta la entrada que se juega
    useEffect(() => {
        if (!currentN || !stripWidth) return;
        scroller.current?.scrollTo({ x: Math.max(0, (currentN - 0.5) * (CELL_W + 2) - stripWidth / 2), animated: false });
    }, [currentN, stripWidth]);

    const cellText = (cell: BoardCell) =>
        t('pro.vivo.board.cellAria', { n: cell.n, runs: cell.r ?? 0, hits: cell.h ?? '—', lob: cell.lob ?? '—', count: cell.r ?? 0 }) + (cell.e ? ` ${t('pro.vivo.board.errorAria', { count: cell.e })}` : '');

    const renderCell = (side: Side, cell: BoardCell) => {
        const isNow = current?.n === cell.n && current.side === side;
        const future = cell.n > played || (cell.r === null && !isNow);
        const team = game[side];
        const lob = cell.lob ?? 0;
        const background = isNow ? team.color : future ? 'transparent' : board.detailed ? alpha(colors.accent, Math.min(0.28, 0.05 + lob * 0.07)) : colors.raised;
        const ink = isNow ? teamInk(team.color) : colors.ink;
        return (
            <View
                key={cell.n}
                accessible={!future}
                accessibilityLabel={future ? undefined : cellText(cell)}
                style={{ width: CELL_W, height: CELL_H, margin: 1, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: background }}
            >
                {future ? (
                    <Txt size={14} tone="faint">
                        –
                    </Txt>
                ) : (
                    <>
                        <Txt condensed size={18} color={ink} tabular style={{ lineHeight: 19 }}>
                            {cell.r ?? (isNow ? 0 : '–')}
                        </Txt>
                        {board.detailed && cell.h !== null && (
                            <Txt size={9} weight="bold" color={isNow ? ink : colors.muted} tabular style={{ lineHeight: 11, marginTop: 1 }}>
                                {cell.h}·{cell.lob ?? '–'}
                            </Txt>
                        )}
                        {!!cell.e && <View style={{ position: 'absolute', right: 3, top: 3, width: 6, height: 6, borderRadius: 3, backgroundColor: proColors.down }} />}
                    </>
                )}
            </View>
        );
    };

    const headText = (text: string, strong = false) => (
        <Txt size={11} weight="bold" color={strong ? colors.ink : colors.muted} center tabular style={{ height: 18, lineHeight: 16 }}>
            {text}
        </Txt>
    );

    const errorLine = errors
        .map((error) => {
            const player = pro?.players?.[String(error.player)];
            const team = player?.teamId === game.away.id ? game.away : player?.teamId === game.home.id ? game.home : null;
            return t('pro.vivo.board.errorItem', {
                name: player ? shortName(player.name) : '—',
                kind: t(`pro.vivo.board.${error.kind}`),
                team: team?.abbrev ?? '',
                inning: ordinal(error.inning, i18n.language)
            });
        })
        .join(' · ');

    return (
        <ProSection title={t('pro.vivo.board.title')} aside={board.detailed ? t('pro.vivo.board.aside') : undefined} bodyStyle={{ paddingHorizontal: 10 }}>
            <View accessibilityLabel={t('pro.vivo.board.caption')} style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                {/* Equipos (fijos a la izquierda) */}
                <View style={{ width: 28 }}>
                    <View style={{ height: 18 }} />
                    {(['away', 'home'] as const).map((side) => (
                        <View key={side} accessible accessibilityLabel={game[side].name} style={{ height: CELL_H + 2, justifyContent: 'center' }}>
                            <TeamLogo team={game[side]} size={24} />
                        </View>
                    ))}
                </View>
                {/* Entradas: se deslizan de lado si no caben */}
                <ScrollView ref={scroller} horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} onLayout={(event) => setStripWidth(event.nativeEvent.layout.width)}>
                    <View>
                        <View style={{ flexDirection: 'row' }}>
                            {board.away.map((cell) => (
                                <View key={cell.n} style={{ width: CELL_W + 2 }}>
                                    {headText(String(cell.n), current?.n === cell.n)}
                                </View>
                            ))}
                        </View>
                        {(['away', 'home'] as const).map((side) => (
                            <View key={side} style={{ flexDirection: 'row' }}>
                                {board[side].map((cell) => renderCell(side, cell))}
                            </View>
                        ))}
                    </View>
                </ScrollView>
                {/* C H E LOB (fijos a la derecha) */}
                <View style={{ flexDirection: 'row', paddingLeft: 2 }}>
                    {TOTALS.map((key) => (
                        <View key={key} style={{ width: TOTAL_W[key], alignItems: 'center' }}>
                            <View accessible accessibilityLabel={t(`pro.vivo.board.totals.${key}.name`)}>
                                {headText(t(`pro.vivo.board.totals.${key}.short`))}
                            </View>
                            {(['away', 'home'] as const).map((side) => {
                                const sum = totals(side);
                                return (
                                    <View key={side} accessible accessibilityLabel={`${game[side].abbrev} ${t(`pro.vivo.board.totals.${key}.name`)}: ${sum[key] ?? '—'}`} style={{ height: CELL_H + 2, justifyContent: 'center', alignItems: 'center' }}>
                                        {key === 'r' ? (
                                            <Flash value={sum.r} tone="live">
                                                <Txt condensed size={22} tabular style={{ lineHeight: 24, paddingHorizontal: 2 }}>
                                                    {sum.r}
                                                </Txt>
                                            </Flash>
                                        ) : (
                                            <Txt condensed size={17} tone="muted" tabular style={{ lineHeight: 19 }}>
                                                {sum[key] ?? '—'}
                                            </Txt>
                                        )}
                                    </View>
                                );
                            })}
                        </View>
                    ))}
                </View>
            </View>
            {board.detailed && (
                <View style={{ marginTop: 12, gap: 4 }}>
                    <Txt size={12} tone="muted">
                        {t('pro.vivo.board.legendSub')}
                    </Txt>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: proColors.down }} />
                        <Txt size={12} tone="muted" style={{ flexShrink: 1 }}>
                            {t('pro.vivo.board.legendError')}
                        </Txt>
                    </View>
                    <Txt size={12} tone="muted">
                        {t('pro.vivo.board.legendLob')}
                    </Txt>
                    {errorLine ? <Txt size={12}>{t('pro.vivo.board.errors', { list: errorLine })}</Txt> : null}
                </View>
            )}
        </ProSection>
    );
};
