// Página del pelotero: su ficha completa (la misma de la hoja del fantasy) y el botón flotante para compararlo con
// otro, compartirla, ir a su equipo o a su último juego. `?temporada=` abre otra temporada.
import React, { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, GitCompare, History, Share2, Shield } from 'lucide-react';
import { useLeague } from '../store/LeagueContext';
import { usePlayer } from '../lib/stats';
import { PlayerProfile } from '../components/stats/PlayerSheet';
import { ActionDial } from '../components/ui/ActionDial';
import { PlayerCompareSheet } from '../components/compare/CompareSheet';
import { NotFoundCard } from '../components/ui/States';
import { ApiError } from '../lib/api';
import { useBack } from '../hooks/useBack';
import { shareLink } from './TeamPage';

export const PlayerPage: React.FC = () => {
    const { t } = useTranslation();
    const { playerId } = useParams<{ playerId: string }>();
    const id = Number(playerId) || null;
    const [params] = useSearchParams();
    const [season, setSeason] = useState<number | undefined>(() => Number(params.get('temporada')) || undefined);
    const { activeLeague } = useLeague();
    const query = usePlayer(id, activeLeague, season);
    const player = query.data;
    const navigate = useNavigate();
    const back = useBack('/estadisticas');
    const [comparing, setComparing] = useState(false);
    // Enlace roto o pelotero que no existe: se dice claro y se ofrece volver (antes salía la página en blanco o una ficha vacía)
    const notFound = !id || (!player && query.error instanceof ApiError && query.error.code === 'player_not_found');
    if (notFound) {
        return (
            <div className="px-4 pb-6 pt-[calc(14px+env(safe-area-inset-top))]">
                <NotFoundCard title={t('errors.player_not_found')} onBack={back} />
            </div>
        );
    }
    const color = player?.team?.color || '#2563eb';
    const lastGame = player?.log[0];

    return (
        <div className="space-y-3 px-4 pb-6 pt-[calc(14px+env(safe-area-inset-top))]">
            <button type="button" onClick={back} aria-label={t('team.back')} className="flex h-11 w-11 items-center justify-center rounded-2xl bg-surface shadow-card">
                <ArrowLeft className="h-5 w-5" />
            </button>
            <PlayerProfile key={id} id={id} name="" season={season} onSeasonChange={setSeason} />

            <ActionDial
                label={t('dial.playerMenu', { name: player?.name ?? '' })}
                color={color}
                actions={[
                    { key: 'compare', label: t('dial.compare'), icon: GitCompare, disabled: !player || (!player.hitting && !player.pitching), onSelect: () => setComparing(true) },
                    { key: 'share', label: t('dial.share'), icon: Share2, disabled: !player, onSelect: () => player && void shareLink(player.name, t('player.shareText', { name: player.name }), t('dial.copied')) },
                    { key: 'team', label: t('dial.team'), icon: Shield, disabled: !player?.team, onSelect: () => player?.team && navigate(`/equipo/${player.team.id}`) },
                    { key: 'last', label: t('dial.lastGame'), icon: History, disabled: !lastGame, onSelect: () => lastGame && navigate(`/juego/${lastGame.gamePk}`) }
                ]}
            />

            {comparing && player && <PlayerCompareSheet player={player} league={activeLeague} onClose={() => setComparing(false)} />}
        </div>
    );
};
