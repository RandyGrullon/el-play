import React from 'react';
import { useTranslation } from 'react-i18next';
import { BarChart3, Gauge, Table2, Trophy } from 'lucide-react';
import { accountEnabled, useSession } from '../../lib/account';
import { setUiMode, useUiMode, type UiMode } from '../../lib/pro';
import { Segmented } from '../ui/Segmented';
import { PRO_GRADIENT, ProBadge } from './ProBadge';

// «Más» → modo de la app. Lite es el de siempre; PRO suma estadísticas y pide la cuenta abierta.
export const ModeCard: React.FC = () => {
    const { t } = useTranslation();
    const session = useSession();
    const mode = useUiMode();
    const canUse = accountEnabled() && !!session;
    const perks = [
        { Icon: Table2, text: t('pro.perks.stats') },
        { Icon: Gauge, text: t('pro.perks.live') },
        { Icon: BarChart3, text: t('pro.perks.standings') },
        { Icon: Trophy, text: t('pro.perks.fantasy') }
    ];

    return (
        <div className="card space-y-3 overflow-hidden p-0">
            <div className="space-y-3 p-4">
                <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 font-semibold">
                        {t('pro.title')}
                        {mode === 'pro' && <ProBadge />}
                    </span>
                    <Segmented<UiMode>
                        size="sm"
                        label={t('pro.title')}
                        value={mode}
                        onChange={(next) => session && canUse && setUiMode(session.user.id, next)}
                        options={[
                            { value: 'lite', label: 'Lite' },
                            { value: 'pro', label: 'PRO' }
                        ]}
                    />
                </div>
                <p className="text-sm text-muted">{mode === 'pro' ? t('pro.hintPro') : t('pro.hintLite')}</p>
                {!canUse && <p className="text-sm font-semibold text-accent-ink">{accountEnabled() ? t('pro.needsAccount') : t('pro.soon')}</p>}
            </div>
            <ul className="grid grid-cols-1 gap-2 p-4 pt-0 sm:grid-cols-2">
                {perks.map(({ Icon, text }) => (
                    <li key={text} className="flex items-center gap-2.5 rounded-2xl bg-raised px-3 py-2.5 text-sm font-semibold">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white" style={{ background: PRO_GRADIENT }}>
                            <Icon className="h-3.5 w-3.5" />
                        </span>
                        {text}
                    </li>
                ))}
            </ul>
        </div>
    );
};
