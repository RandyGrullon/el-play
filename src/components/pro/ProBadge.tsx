import React from 'react';
import { useIsPro } from '../../lib/pro';

export const PRO_GRADIENT = 'linear-gradient(135deg, #1e4fd8 0%, #6d28d9 55%, #e11d48 100%)';

/** Insignia «PRO»; con `auto` solo aparece si el modo PRO está activo */
export const ProBadge: React.FC<{ auto?: boolean; className?: string }> = ({ auto = false, className = '' }) => {
    const pro = useIsPro();
    if (auto && !pro) return null;
    return (
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 align-middle text-[10px] font-extrabold tracking-[0.14em] text-white ${className}`} style={{ background: PRO_GRADIENT }}>
            PRO
        </span>
    );
};
