import React from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Clock, Cloud, ScanLine, User, Wind } from 'lucide-react-native';
import type { GameDetail } from '../../../../types';
import type { GamePro } from '../../../../lib/pro/juego';
import type { HalfInning, NameBook } from '../jugadas/model';
import { absByTeam, fmtDuration, kmh } from '../jugadas/model';
import { formatTime } from '../../../../lib/format';
import { useColors } from '../../../../theme/theme';
import { alpha, radius } from '../../../../theme/tokens';
import { Txt } from '../../../ui';
import { toCelsius } from '../../kit';

const OFFICIALS: Record<string, string> = { 'Home Plate': 'HP', 'First Base': '1B', 'Second Base': '2B', 'Third Base': '3B', 'Left Field': 'LF', 'Right Field': 'RF' };

const slug = (text: string) =>
    text
        .toLowerCase()
        .replace(/[^a-z]+/g, '_')
        .replace(/^_|_$/g, '');

// Franja final del box: duración y demora, viento, clima, árbitros y retos ABS. Solo lo que MLB mandó.
export const GameStrip: React.FC<{ game: GameDetail; pro?: GamePro; halves: HalfInning[]; names: NameBook }> = ({ game, pro, halves, names }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const rows: { Icon: typeof Clock; title?: string; text: string }[] = [];
    const info = pro?.game;

    const duration = fmtDuration(info?.durationMin);
    if (duration || info?.firstPitch) {
        const parts = [
            duration,
            info?.delayMin ? t('pro.box.strip.delay', { time: fmtDuration(info.delayMin) }) : duration && game.state === 'final' ? t('pro.box.strip.noDelay') : null,
            info?.firstPitch ? t('pro.box.strip.firstPitch', { time: formatTime(info.firstPitch, i18n.language) }) : null
        ].filter(Boolean);
        rows.push({ Icon: Clock, title: duration ? t('pro.box.strip.time') : undefined, text: parts.join(' · ') });
    }

    const wind = info?.weather?.wind;
    if (wind) {
        const speed = kmh(wind.mph);
        let where: string;
        if (wind.dir === 'calm' || speed === 0) where = t('pro.box.strip.wind.calm');
        else if (wind.dir === 'varies') where = t('pro.box.strip.wind.varies');
        else if ((wind.dir === 'out' || wind.dir === 'in') && wind.field) where = t(`pro.box.strip.wind.${wind.dir}`, { field: t(`pro.box.strip.field.${wind.field}`) });
        else if (wind.dir === 'cross') where = /^L To R/i.test(wind.text) ? t('pro.box.strip.wind.crossLR') : /^R To L/i.test(wind.text) ? t('pro.box.strip.wind.crossRL') : t('pro.box.strip.wind.cross');
        else where = wind.text;
        rows.push({ Icon: Wind, title: t('pro.box.strip.windTitle'), text: speed && wind.dir !== 'calm' ? t('pro.box.strip.wind.speed', { speed, where }) : where });
    }

    const condition = info?.weather?.condition ?? game.weather?.condition ?? null;
    const celsius = info?.weather?.tempC ?? toCelsius(game.weather?.temp);
    if (condition || celsius !== null) {
        const said = condition ? t(`pro.box.strip.sky.${slug(condition)}`, { defaultValue: condition }) : null;
        rows.push({ Icon: Cloud, text: [said, celsius !== null ? `${celsius} °C` : null].filter(Boolean).join(', ') });
    }

    if (info?.officials.length) {
        rows.push({ Icon: User, title: t('pro.box.strip.umpires'), text: info.officials.map((official) => `${OFFICIALS[official.type] ?? official.type} ${official.name}`).join(' · ') });
    }

    if (pro?.abs) {
        const teams = absByTeam(halves);
        const sideText = (side: 'away' | 'home') => {
            const entry = teams[side];
            const total = entry.ok + entry.fail;
            const head = t('pro.box.strip.absTeam', { team: game[side].abbrev, ok: entry.ok, total });
            const who = entry.players.map((player) => t('pro.box.strip.absPlayer', { name: names.label(player.id), ok: player.ok, total: player.ok + player.fail })).join(', ');
            return who ? `${head} (${who})` : head;
        };
        rows.push({ Icon: ScanLine, title: t('pro.box.strip.abs'), text: `${sideText('away')} · ${sideText('home')}` });
    }

    if (!rows.length) return null;
    return (
        <View accessibilityLabel={t('pro.box.strip.label')} style={{ borderRadius: radius.card, borderWidth: 1, borderColor: alpha(colors.line, 0.12), paddingHorizontal: 16, paddingVertical: 12, gap: 8 }}>
            {rows.map(({ Icon, title, text }, index) => (
                <View key={index} accessible accessibilityLabel={title ? `${title}: ${text}` : text} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                    <View style={{ paddingTop: 2 }}>
                        <Icon size={16} color={colors.accentInk} />
                    </View>
                    <Txt size={13} tone="muted" style={{ flex: 1, minWidth: 0, lineHeight: 19 }}>
                        {title ? (
                            <Txt size={13} weight="bold">
                                {title}{' '}
                            </Txt>
                        ) : null}
                        {text}
                    </Txt>
                </View>
            ))}
        </View>
    );
};
