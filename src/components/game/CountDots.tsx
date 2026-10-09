import React from 'react';
import { useTranslation } from 'react-i18next';

const Row: React.FC<{ label: string; value: number; max: number; color: string }> = ({ label, value, max, color }) => (
    <div className="flex items-center gap-2">
        <span className="w-3 font-display text-sm font-bold text-muted">{label}</span>
        <span className="flex gap-1.5">
            {Array.from({ length: max }, (_, index) => (
                <span
                    key={index}
                    className={`h-3 w-3 rounded-full transition-colors duration-300 ${index < value ? '' : 'bg-line/15'}`}
                    style={index < value ? { backgroundColor: color } : undefined}
                />
            ))}
        </span>
    </div>
);

export const CountDots: React.FC<{ balls: number; strikes: number; outs: number }> = ({ balls, strikes, outs }) => {
    const { t } = useTranslation();
    return (
        <div className="flex flex-col gap-1.5" aria-label={t('game.countAria', { balls, strikes, outs })}>
            <Row label={t('game.ballShort')} value={balls} max={3} color="rgb(var(--ball))" />
            <Row label={t('game.strikeShort')} value={strikes} max={2} color="rgb(var(--strike))" />
            <Row label={t('game.outShort')} value={outs} max={2} color="rgb(var(--gold))" />
        </div>
    );
};
