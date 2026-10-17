import React from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react-native';
import { useLeague } from '../../state/league';
import { useColors } from '../../theme/theme';
import { radius, shadow } from '../../theme/tokens';
import { Sheet, Txt } from '../ui';

// Elegir liga (LIDOM, Clásico, Serie del Caribe): cambia los juegos y el color de la app
export const LeagueSheet: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const { leagues, activeLeague, setActiveLeague } = useLeague();
    return (
        <Sheet open={open} onClose={onClose} title={t('leagues.choose')}>
            <View style={{ gap: 8 }}>
                {leagues.map((league) => (
                    <Pressable
                        key={league.id}
                        onPress={() => {
                            setActiveLeague(league.id);
                            onClose();
                        }}
                        accessibilityRole="button"
                        accessibilityState={{ selected: league.id === activeLeague }}
                        style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: radius.tile, backgroundColor: colors.surface, padding: 16, opacity: pressed ? 0.85 : 1 }, shadow('card')]}
                    >
                        <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: league.color }} />
                        <View style={{ flex: 1 }}>
                            <Txt weight="bold">{t(`leagues.${league.id}.name`)}</Txt>
                            <Txt size={14} tone="muted">
                                {t(`leagues.${league.id}.fullName`)}
                            </Txt>
                        </View>
                        {league.id === activeLeague && <Check size={20} color={colors.accentInk} />}
                    </Pressable>
                ))}
            </View>
        </Sheet>
    );
};
