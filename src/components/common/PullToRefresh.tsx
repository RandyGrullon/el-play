import React, { useState, useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';

interface PullToRefreshProps {
    onRefresh: () => Promise<void> | void;
    children: React.ReactNode;
}

export const PullToRefresh: React.FC<PullToRefreshProps> = ({ onRefresh, children }) => {
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
        <div ref={containerRef} className="min-h-screen relative">
            {/* Loader Indicator */}
            <div
                className="fixed top-0 left-0 w-full flex justify-center pointer-events-none z-50 transition-transform duration-200 ease-out"
                style={{
                    transform: `translateY(${currentY > 0 ? currentY - 40 : -50}px)`,
                    opacity: currentY > 0 ? Math.min(currentY / PULL_THRESHOLD, 1) : 0
                }}
            >
                <div className="bg-zinc-900/90 backdrop-blur-md border border-white/10 rounded-full p-2 shadow-xl">
                    <Loader2 className={`w-6 h-6 text-cyan-400 ${refreshing ? 'animate-spin' : ''}`} style={{ transform: `rotate(${currentY * 2}deg)` }} />
                </div>
            </div>

            {/* Content */}
            <div
                style={{
                    transform: `translateY(${currentY}px)`,
                    transition: refreshing ? 'transform 0.2s ease-out' : 'transform 0.2s ease-out'
                }}
            >
                {children}
            </div>
        </div>
    );
};
