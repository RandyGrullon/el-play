import { useEffect, useState } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

export const prefersReducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.(QUERY).matches;

/** El sistema pide menos movimiento (se sigue si lo cambian con la app abierta) */
export const useReducedMotion = () => {
    const [reduced, setReduced] = useState(prefersReducedMotion);
    useEffect(() => {
        const media = typeof window !== 'undefined' ? window.matchMedia?.(QUERY) : undefined;
        if (!media) return;
        const onChange = () => setReduced(media.matches);
        media.addEventListener?.('change', onChange);
        return () => media.removeEventListener?.('change', onChange);
    }, []);
    return reduced;
};
