import React from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Pitch } from '../../types';
import { pitchCallName, pitchTypeName } from '../../lib/baseball';
import { useColors } from '../../theme/theme';
import { Txt } from '../ui';
import { resultColor } from './colors';

interface PitchListProps {
    pitches: Pitch[];
    selected?: number | null;
    onSelect?: (index: number | null) => void;
    newestFirst?: boolean;
}

// Lista de pitcheos del turno: número en el color del resultado, cantada, tipo, velocidad y conteo
export const PitchList: React.FC<PitchListProps> = ({ pitches, selected = null, onSelect, newestFirst = true }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    if (!pitches.length) {
        return (
            <Txt size={14} tone="muted" center style={{ paddingVertical: 24 }}>
                {t('zone.waiting')}
            </Txt>
        );
    }

    const rows = pitches.map((pitch, index) => ({ pitch, index }));
    if (newestFirst) rows.reverse();
    const count = (pitch: Pitch) => (pitch.b !== null && pitch.s !== null && pitch.r !== 'inplay' ? `${pitch.b}-${pitch.s}` : '');

    return (
        <View accessibilityLabel={t('zone.sequence')}>
            {rows.map(({ pitch, index }, position) => {
                const active = selected === index;
                const detail = [pitch.type || pitch.typeDesc ? pitchTypeName(pitch, i18n.language) : '', pitch.hit?.ev ? t('zone.exitVelo', { mph: pitch.hit.ev }) : ''].filter(Boolean).join(' · ');
                return (
                    <Pressable
                        key={index}
                        disabled={!onSelect}
                        onPress={() => onSelect?.(active ? null : index)}
                        style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 10,
                            paddingHorizontal: 4,
                            paddingVertical: 8,
                            borderRadius: 10,
                            backgroundColor: active ? colors.raised : 'transparent',
                            borderTopWidth: position ? 1 : 0,
                            borderTopColor: colors.line
                        }}
                    >
                        <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: resultColor(colors, pitch.r), alignItems: 'center', justifyContent: 'center' }}>
                            <Txt size={11} weight="bold" tone="white">
                                {pitch.n ?? index + 1}
                            </Txt>
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                            <Txt size={14} weight="semibold" numberOfLines={1}>
                                {pitchCallName(pitch, i18n.language)}
                            </Txt>
                            {/* Sin rastreo no hay tipo ni velocidad: no se pintan guiones */}
                            {detail ? (
                                <Txt size={12} tone="muted" numberOfLines={1}>
                                    {detail}
                                </Txt>
                            ) : null}
                        </View>
                        {pitch.mph ? (
                            <View style={{ alignItems: 'flex-end' }}>
                                <Txt size={16} weight="bold" tabular style={{ lineHeight: 18 }}>
                                    {pitch.mph.toFixed(1)}
                                </Txt>
                                <Txt size={11} tone="faint" tabular>
                                    {count(pitch) || 'mph'}
                                </Txt>
                            </View>
                        ) : (
                            <Txt size={16} weight="bold" tone="muted" tabular>
                                {count(pitch)}
                            </Txt>
                        )}
                    </Pressable>
                );
            })}
        </View>
    );
};
