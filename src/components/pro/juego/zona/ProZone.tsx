import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { GameDetail } from '../../../../types';
import type { GamePro } from '../../../../lib/pro/juego';
import { trackingLevel } from '../../../../lib/pro/juego';
import { atBatForZone } from '../../../../lib/baseball';
import { ProBadge, Txt } from '../../../ui';
import { ProNote, ProSegmented, lastName } from '../../kit';
import { pitchItems, teamShortName, type PitchItem } from '../vivo/logic';
import { sidesOf } from '../vivo/parts';
import { MovementChart } from './MovementChart';
import { PitchFlight } from './PitchFlight';
import { Repertoire } from './Repertoire';
import { ZoneCard, type ZoneMode } from './ZoneCard';
import { ZoneDuel } from './ZoneDuel';
import { ZoneHeat } from './ZoneHeat';

export interface ProZoneProps {
    game: GameDetail;
    /** Extras PRO del juego (useGamePro); undefined mientras carga o si la ruta no existe todavía */
    pro?: GamePro;
}

// Hoja «Zona de strike» del PRO: Turno · Lanzador · Bateador; el duelo arriba; la zona grande con la ficha de cada
// pitcheo; el mapa de calor del juego y de la temporada; el repertorio; la nube de movimiento y el vuelo (túnel).
// Va dentro de una hoja (Sheet) que ya se desliza: no lleva ScrollView propio.
export const ProZone: React.FC<ProZoneProps> = ({ game, pro }) => {
    const { t } = useTranslation();
    const [mode, setMode] = useState<ZoneMode>('atBat');
    const { atBat } = atBatForZone(game);
    // El pitcheo elegido es del turno y de la vista en que se eligió: si cambia uno de los dos, se vuelve al último
    const [picked, setPicked] = useState<{ turn: number; mode: ZoneMode; k: number } | null>(null);
    const pitcherId = atBat?.pitcher.id;
    const batterId = atBat?.batter.id;
    const turnItems = useMemo(() => (atBat ? pitchItems([atBat], pro) : []), [atBat, pro]);
    const pitcherItems = useMemo(() => pitchItems(game.atBats, pro, (item) => item.pitcher.id === pitcherId), [game.atBats, pro, pitcherId]);
    const batterItems = useMemo(() => pitchItems(game.atBats, pro, (item) => item.batter.id === batterId), [game.atBats, pro, batterId]);
    const pitcherAtBats = useMemo(() => game.atBats.filter((item) => item.pitcher.id === pitcherId), [game.atBats, pitcherId]);

    const subtitle = (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: -8 }}>
            <ProBadge />
            <Txt size={13} tone="muted" numberOfLines={2} style={{ flex: 1, minWidth: 0 }}>
                {t('pro.zona.subtitle', { away: teamShortName(game.away), home: teamShortName(game.home) })}
                {game.venue ? ` · ${game.venue}` : ''}
            </Txt>
        </View>
    );

    if (!atBat)
        return (
            <>
                {subtitle}
                <ProNote tone="neutral">{t('pro.zona.empty')}</ProNote>
            </>
        );

    const selected = picked && picked.turn === atBat.i && picked.mode === mode && picked.k < turnItems.length ? picked.k : null;
    const onSelect = (k: number | null) => setPicked(k === null ? null : { turn: atBat.i, mode, k });

    const { fielding } = sidesOf(game, atBat.top);
    const items = mode === 'atBat' ? turnItems : mode === 'pitcher' ? pitcherItems : batterItems;
    const subjectItems = mode === 'batter' ? batterItems : pitcherItems;
    const subject = mode === 'batter' ? atBat.batter.name : atBat.pitcher.name;
    const tracking = trackingLevel(pro);
    // Vuelo: el pitcheo elegido (o el último) con el anterior del mismo lanzador en fantasma
    const flightList = mode === 'atBat' ? turnItems : items;
    const flightIndex = mode === 'atBat' ? (selected ?? turnItems.length - 1) : items.length - 1;
    const current = flightList[flightIndex] ?? null;
    const pitcherIndex = current ? pitcherItems.findIndex((item) => item.pitch === current.pitch) : -1;
    const before = mode === 'atBat' ? (flightIndex > 0 ? turnItems[flightIndex - 1] : pitcherIndex > 0 ? pitcherItems[pitcherIndex - 1] : null) : (items[flightIndex - 1] ?? null);
    const ghost = before && before.atBat.pitcher.id === current?.atBat.pitcher.id ? before : null;
    const number = (item: PitchItem | null) => (item ? (mode === 'atBat' ? item.k + 1 : flightList.indexOf(item) + 1 || item.k + 1) : null);
    const facedCount = new Set(pitcherAtBats.map((item) => item.batter.id)).size;
    const pitchersSeen = new Set(game.atBats.filter((item) => item.batter.id === batterId).map((item) => item.pitcher.id)).size;

    return (
        <>
            {subtitle}
            <ProSegmented
                value={mode}
                onChange={setMode}
                label={t('pro.zona.modes')}
                track="surface"
                options={[
                    { value: 'atBat', label: t('pro.zona.mode.atBat') },
                    { value: 'pitcher', label: t('pro.zona.mode.pitcher') },
                    { value: 'batter', label: t('pro.zona.mode.batter') }
                ]}
            />
            <ZoneDuel game={game} pro={pro} atBat={atBat} />
            <ZoneCard game={game} pro={pro} atBat={atBat} mode={mode} items={items} selected={selected} onSelect={onSelect} />
            {pro && tracking !== 'full' && (
                <ProNote tone="pending" title={t('pro.kit.game.noTracking')}>
                    {t(tracking === 'none' ? 'pro.zona.trackingNone' : 'pro.zona.trackingPartial')}
                </ProNote>
            )}
            <ZoneHeat game={game} items={subjectItems} subject={subject} batter={atBat.batter} />
            <Repertoire
                items={subjectItems}
                atBats={mode === 'batter' ? undefined : pitcherAtBats}
                title={mode === 'batter' ? t('pro.zona.rep.seenTitle', { name: lastName(atBat.batter.name) }) : t('pro.zona.rep.title', { name: lastName(atBat.pitcher.name) })}
                against={mode === 'batter' ? t('pro.zona.rep.fromPitchers', { count: pitchersSeen }) : t('pro.zona.rep.toBatters', { count: facedCount })}
                pitcherId={mode === 'batter' ? null : pitcherId}
                league={game.league}
                gamePk={game.gamePk}
            />
            {mode !== 'batter' && <MovementChart items={pitcherItems} title={atBat.pitcher.name} subtitle={t('pro.zona.move.sub', { name: lastName(atBat.pitcher.name), team: fielding.abbrev })} hand={atBat.pitcher.hand} />}
            <PitchFlight current={current} ghost={ghost} currentNumber={number(current) ?? 1} ghostNumber={number(ghost)} />
        </>
    );
};
