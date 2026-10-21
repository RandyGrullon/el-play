import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Footprints, PenLine, Shield, Target } from 'lucide-react-native';
import type { GameDetail } from '../../../../types';
import type { GamePro } from '../../../../lib/pro/juego';
import type { NameBook } from '../jugadas/model';
import { itemName, noteItems, sumItems, translateNote } from '../jugadas/model';
import { alpha, radius, shadow } from '../../../../theme/tokens';
import { Txt } from '../../../ui';
import { ModuleHeader, StatTile, fmtAvg } from '../../kit';
import { Collapse, Turn, usePlayColors } from '../jugadas/parts';

type Side = 'away' | 'home';
type BlockId = 'batting' | 'running' | 'fielding' | 'pitching';

// Etiquetas de MLB (en inglés) → clave de texto; lo que no esté aquí se muestra tal cual
const LABELS: Record<string, string> = {
    '2B': 'd',
    '3B': 't',
    HR: 'hr',
    TB: 'tb',
    RBI: 'rbi',
    '2-out RBI': 'rbi2',
    'Runners left in scoring position, 2 out': 'lisp2',
    SF: 'sf',
    SAC: 'sac',
    GIDP: 'gidp',
    HBP: 'hbp',
    IBB: 'ibb',
    SB: 'sb',
    CS: 'cs',
    PO: 'po',
    Pickoffs: 'po',
    E: 'e',
    DP: 'dp',
    TP: 'tp',
    PB: 'pb',
    'Outfield assists': 'ofa',
    WP: 'wp',
    Balk: 'bk',
    'Pitch timer violations': 'timer',
    'Inherited runners-scored': 'ir'
};

interface Field {
    label: string;
    value: string;
}

const MLB_BLOCK: Record<Exclude<BlockId, 'pitching'>, string> = { batting: 'BATTING', running: 'BASERUNNING', fielding: 'FIELDING' };
const ICONS: Record<BlockId, typeof PenLine> = { batting: PenLine, running: Footprints, fielding: Shield, pitching: Target };

// Notas del juego del equipo en bloques plegables (Bateo abierto): lo que MLB pone bajo el box, con los
// nombres cortos y las frases fijas en español. Bateo lleva arriba RISP, bases totales y quedados en tiles.
export const GameNotes: React.FC<{ game: GameDetail; pro: GamePro; side: Side; names: NameBook }> = ({ game, pro, side, names }) => {
    const { t, i18n } = useTranslation();
    const paint = usePlayColors();
    const { colors } = paint;
    const [open, setOpen] = useState<Record<BlockId, boolean>>({ batting: true, running: false, fielding: false, pitching: false });
    const team = game[side];
    const box = pro.box[side];
    const teamNames = new Set([...game.box[side].batters, ...game.box[side].pitchers].map((line) => line.name));
    const pitcherNames = new Set(game.box[side].pitchers.map((line) => line.name));
    // «Romero Jr., M.» pasa a «M. Romero Jr.» y el punto final quedaría doble
    const show = (value: string) => translateNote(names.replace(value), i18n.language).replace(/\.{2}(?=\s|$)/g, '.');
    const labelOf = (label: string) => (LABELS[label] ? t(`pro.box.notes.label.${LABELS[label]}`) : label);
    const fieldsOf = (title: string, skip: string[] = []) =>
        (box.info.find((block) => block.title === title)?.fields ?? []).filter((field) => field.value && !skip.includes(field.label)).map((field) => ({ label: labelOf(field.label), value: show(field.value as string) }));
    // Notas generales del juego que son de este equipo (por el nombre del box de cada elemento)
    const gameNote = (label: string, belongs: (item: string) => boolean): Field | null => {
        const items = noteItems(pro.notes.find((note) => note.label === label)?.value).filter(belongs);
        return items.length ? { label: labelOf(label), value: show(`${items.join('; ')}.`) } : null;
    };
    const byPitcher = (item: string) => pitcherNames.has(item.match(/\(by ([^)]+)\)/)?.[1]?.trim() ?? '');
    const isField = (field: Field | null): field is Field => !!field;

    const batting: Field[] = [
        ...fieldsOf(MLB_BLOCK.batting, ['Team RISP', 'Team LOB']),
        gameNote('HBP', (item) => teamNames.has(itemName(item))),
        gameNote('Pitch timer violations', (item) => teamNames.has(itemName(item)) && !pitcherNames.has(itemName(item)))
    ].filter(isField);
    const running = fieldsOf(MLB_BLOCK.running);
    const fielding = fieldsOf(MLB_BLOCK.fielding);
    const pitching = [
        gameNote('WP', (item) => pitcherNames.has(itemName(item))),
        gameNote('HBP', byPitcher),
        gameNote('Balk', (item) => pitcherNames.has(itemName(item))),
        gameNote('Pitch timer violations', (item) => pitcherNames.has(itemName(item))),
        gameNote('Inherited runners-scored', (item) => pitcherNames.has(itemName(item)))
    ].filter(isField);

    const totals = box.totals;
    const risp = totals.risp;
    const lispTwoOut = sumItems(box.info.find((block) => block.title === MLB_BLOCK.batting)?.fields.find((field) => field.label === 'Runners left in scoring position, 2 out')?.value);
    const wild = box.pitchers.reduce((sum, line) => sum + line.wp, 0);
    const hit = box.pitchers.reduce((sum, line) => sum + line.hbp, 0);
    const dp = Number(fielding.find((field) => field.label === labelOf('DP'))?.value.match(/^\d+/)?.[0] ?? 0);
    const tile = { flexGrow: 1, flexBasis: 92 };

    const blocks: { id: BlockId; summary: string; fields: Field[]; empty: string; tiles?: React.ReactNode }[] = [
        {
            id: 'batting',
            summary: [t('pro.box.notes.hits', { count: team.hits }), risp ? t('pro.box.notes.risp', { h: risp.h, ab: risp.ab }) : null].filter(Boolean).join(' · '),
            fields: batting,
            empty: t('pro.box.notes.none'),
            tiles:
                risp || totals.tb !== null || totals.lob !== null ? (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 12 }}>
                        {risp && <StatTile size="sm" value={`${risp.h}-${risp.ab}`} label={t('pro.box.notes.rispLabel')} sub={risp.ab ? fmtAvg(risp.h / risp.ab) : undefined} style={tile} />}
                        {totals.tb !== null && <StatTile size="sm" value={totals.tb} label={t('pro.box.notes.tb')} style={tile} />}
                        {totals.lob !== null && <StatTile size="sm" value={totals.lob} label={t('pro.box.notes.lob')} sub={lispTwoOut ? t('pro.box.notes.lispTwoOut', { count: lispTwoOut }) : undefined} style={tile} />}
                    </View>
                ) : null
        },
        {
            id: 'running',
            summary: [t('pro.box.notes.sb', { count: totals.sb ?? 0 }), totals.cs ? t('pro.box.notes.cs', { count: totals.cs }) : null].filter(Boolean).join(' · '),
            fields: running,
            empty: t('pro.box.notes.noRunning')
        },
        {
            id: 'fielding',
            summary: [t('pro.box.notes.e', { count: team.errors }), dp ? t('pro.box.notes.dp', { count: dp }) : null].filter(Boolean).join(' · '),
            fields: fielding,
            empty: t('pro.box.notes.noFielding')
        },
        {
            id: 'pitching',
            summary: wild ? t('pro.box.notes.wp', { count: wild }) : hit ? t('pro.box.notes.hbpBy', { count: hit }) : t('pro.box.notes.clean'),
            fields: pitching,
            empty: t('pro.box.notes.noPitching')
        }
    ];

    return (
        <View style={[{ backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: alpha(colors.line, 0.06), paddingTop: 16, paddingBottom: 4 }, shadow('card')]}>
            <ModuleHeader title={t('pro.box.notes.title', { team: team.abbrev })} style={{ paddingHorizontal: 16, marginBottom: 6 }} />
            {blocks.map(({ id, summary, fields, empty, tiles }, index) => {
                const isOpen = open[id];
                const Icon = ICONS[id];
                const title = t(`pro.box.notes.block.${id}`);
                return (
                    <View key={id} style={{ borderTopWidth: index ? 1 : 0, borderTopColor: alpha(colors.line, 0.08) }}>
                        <Pressable
                            onPress={() => setOpen((current) => ({ ...current, [id]: !current[id] }))}
                            accessibilityRole="button"
                            accessibilityState={{ expanded: isOpen }}
                            accessibilityLabel={`${title}: ${summary}`}
                            style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 }}
                        >
                            <View style={{ width: 32, height: 32, borderRadius: 12, backgroundColor: colors.raised, alignItems: 'center', justifyContent: 'center' }}>
                                <Icon size={16} color={colors.muted} />
                            </View>
                            <Txt size={15} weight="extrabold" style={{ flexShrink: 0 }}>
                                {title}
                            </Txt>
                            <Txt size={12} tone="muted" numberOfLines={1} style={{ flex: 1, minWidth: 0, textAlign: 'right' }}>
                                {summary}
                            </Txt>
                            <Turn open={isOpen} size={16} />
                        </Pressable>
                        <Collapse open={isOpen} style={{ paddingHorizontal: 16, paddingBottom: 14 }}>
                            {tiles}
                            {fields.length ? (
                                <View style={{ gap: 6 }}>
                                    {fields.map((field) => (
                                        <Txt key={field.label} size={13} style={{ lineHeight: 19 }}>
                                            <Txt size={11} weight="extrabold" tone="muted" style={{ letterSpacing: 0.6, textTransform: 'uppercase' }}>
                                                {field.label}
                                            </Txt>
                                            {'  '}
                                            {field.value}
                                        </Txt>
                                    ))}
                                </View>
                            ) : (
                                <Txt size={13} tone="muted">
                                    {empty}
                                </Txt>
                            )}
                        </Collapse>
                    </View>
                );
            })}
        </View>
    );
};
