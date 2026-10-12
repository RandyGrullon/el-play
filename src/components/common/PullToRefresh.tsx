import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Ball } from '../brand/Logo';

interface PullToRefreshProps {
    onRefresh: () => Promise<void> | void;
    children: React.ReactNode;
}

export const PullToRefresh: React.FC<PullToRefreshProps> = ({ onRefresh, children }) => {
    const { t } = useTranslation();
    const [refreshing, setRefreshing] = useState(false);
    const [currentY, setCurrentY] = useState(0);

    // Refs to keep track of values inside event listeners without triggering re-renders/re-binds
    const startYRef = useRef(0);
    const currentYRef = useRef(0);
    const refreshingRef = useRef(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const onRefreshRef = useRef(onRefresh);

    // Update refs when props/state change
    useEffect(() => {
        onRefreshRef.current = onRefresh;
    }, [onRefresh]);

    useEffect(() => {
        refreshingRef.current = refreshing;
    }, [refreshing]);

    // Threshold to trigger refresh (in pixels)
    const PULL_THRESHOLD = 80;
    // Maximum pull distance visually
    const MAX_PULL = 120;

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handleTouchStart = (e: TouchEvent) => {
            // Solo iniciar si estamos en el tope de la página
            const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
            if (scrollTop === 0 && !refreshingRef.current) {
                startYRef.current = e.touches[0].clientY;
            } else {
                startYRef.current = 0;
            }
        };

        const handleTouchMove = (e: TouchEvent) => {
            if (refreshingRef.current) return;

            // Verificar que seguimos en el tope
            const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
            
            // Si no estamos en el tope, no hacer nada
            if (scrollTop > 0) {
                startYRef.current = 0;
                currentYRef.current = 0;
                setCurrentY(0);
                return;
            }

            const y = e.touches[0].clientY;

            // Si no hay punto de inicio, salir
            if (!startYRef.current) {
                return;
            }

            const diff = y - startYRef.current;

            // Solo si estamos jalando hacia abajo (diff > 0) y en el tope
            if (diff > 0) {
                // Prevenir scroll nativo solo cuando estamos jalando
                if (e.cancelable) e.preventDefault();

                // Agregar resistencia
                const newY = Math.min(diff * 0.5, MAX_PULL);
                currentYRef.current = newY;
                setCurrentY(newY);
            } else {
                // Si empujamos hacia arriba, resetear
                currentYRef.current = 0;
                setCurrentY(0);
            }
        };

        const handleTouchEnd = async () => {
            if (!startYRef.current || refreshingRef.current) {
                startYRef.current = 0;
                // Only reset currentY if we are not refreshing
                if (!refreshingRef.current) {
                    currentYRef.current = 0;
                    setCurrentY(0);
                }
                return;
            }

            if (currentYRef.current > PULL_THRESHOLD) {
                setRefreshing(true);
                refreshingRef.current = true;
                setCurrentY(PULL_THRESHOLD); // Snap to threshold
                currentYRef.current = PULL_THRESHOLD;

                try {
                    await onRefreshRef.current();
                } finally {
                    setTimeout(() => {
                        setRefreshing(false);
                        refreshingRef.current = false;
                        setCurrentY(0);
                        currentYRef.current = 0;
                        startYRef.current = 0;
                    }, 500); // Small delay to show completion
                }
            } else {
                // Snap back
                setCurrentY(0);
                currentYRef.current = 0;
                startYRef.current = 0;
            }
        };

        // Use passive: false for touchmove to allow preventDefault
        container.addEventListener('touchstart', handleTouchStart, { passive: true });
        container.addEventListener('touchmove', handleTouchMove, { passive: false });
        container.addEventListener('touchend', handleTouchEnd);

        return () => {
            container.removeEventListener('touchstart', handleTouchStart);
            container.removeEventListener('touchmove', handleTouchMove);
            container.removeEventListener('touchend', handleTouchEnd);
        };
    }, []); // Empty dependency array ensures listeners are bound only once

    return (
        <div ref={containerRef} className="relative">
            {/* Indicador: una pelota que gira con el jalón y da vueltas mientras recarga */}
            <div
                className="pointer-events-none fixed left-0 top-0 z-50 flex w-full justify-center transition-transform duration-200 ease-out"
                style={{
                    transform: `translateY(${currentY > 0 ? currentY - 44 : -60}px)`,
                    opacity: currentY > 0 ? Math.min(currentY / PULL_THRESHOLD, 1) : 0
                }}
                role="status"
                aria-live="polite"
            >
                <div className="flex items-center gap-2 rounded-full border border-line/15 bg-surface py-1.5 pl-1.5 pr-3 shadow-xl">
                    <svg
                        width="30"
                        height="30"
                        viewBox="19 13.7 26 26"
                        aria-hidden="true"
                        className={refreshing ? 'animate-spin' : ''}
                        style={{
                            transform: refreshing ? undefined : `rotate(${currentY * 3}deg) scale(${currentY >= PULL_THRESHOLD ? 1.12 : 1})`,
                            transition: 'transform 0.15s ease-out',
                            animationDuration: '0.7s'
                        }}
                    >
                        <Ball />
                    </svg>
                    <span className="text-xs font-semibold text-muted">
                        {refreshing ? t('pull.loading') : currentY >= PULL_THRESHOLD ? t('pull.release') : t('pull.pull')}
                    </span>
                </div>
            </div>

            {/* Content */}
            <div
                style={currentY ? { transform: `translateY(${currentY}px)`, transition: 'transform 0.2s ease-out' } : undefined}
            >
                {children}
            </div>
        </div>
    );
};
