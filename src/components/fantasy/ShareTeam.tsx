// Compartir mi equipo con la hoja de compartir del teléfono (en la web, WhatsApp si el navegador no comparte)
import React from 'react';
import { Linking, Platform, Share } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Share2 } from 'lucide-react-native';
import { WEB_URL } from '../../lib/config';
import { playerScore, type DayEntry, type FantasyDay, type FantasyPlayer } from '../../lib/fantasy';
import { useColors } from '../../theme/theme';
import { IconButton } from '../ui';

export const ShareTeam: React.FC<{ day: FantasyDay; entry: DayEntry; points: number }> = ({ day, entry, points }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const share = async () => {
        const names = entry.lineup
            .map((id) => day.players.find((p) => p.id === id))
            .filter((p): p is FantasyPlayer => !!p)
            .map((p) => `${entry.captain === p.id ? '👑 ' : ''}${p.name} (${playerScore(entry, p)})`)
            .join(', ');
        const text = t('fantasy.shareText', { points: Math.round(points * 10) / 10, names });
        const url = `${WEB_URL}/fantasy`;
        try {
            // iOS manda el enlace aparte; Android solo acepta el mensaje
            await Share.share(Platform.OS === 'ios' ? { message: text, url } : { message: `${text}\n${url}`, title: 'El Play Fantasy' });
        } catch (error) {
            // Si cerró la lista de apps no se hace nada; si el navegador no sabe compartir, WhatsApp
            if (Platform.OS === 'web' && (error as Error)?.name !== 'AbortError') Linking.openURL(`https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`).catch(() => undefined);
        }
    };
    return (
        <IconButton label={t('fantasy.share')} onPress={share}>
            <Share2 size={20} color={colors.ink} />
        </IconButton>
    );
};
