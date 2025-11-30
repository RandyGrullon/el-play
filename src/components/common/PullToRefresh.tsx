import React, { useState, useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';

interface PullToRefreshProps {
    onRefresh: () => Promise<void> | void;
    children: React.ReactNode;
}

export const PullToRefresh: React.FC<PullToRefreshProps> = ({ onRefresh, children }) => {
    const [startY, setStartY] = useState(0);
    const [currentY, setCurrentY] = useState(0);
    const [refreshing, setRefreshing] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Threshold to trigger refresh (in pixels)
    const PULL_THRESHOLD = 80;
    // Maximum pull distance visually
    const MAX_PULL = 120;

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handleTouchStart = (e: TouchEvent) => {
            // Only enable pull to refresh if we are at the top of the page
            if (window.scrollY === 0) {
                setStartY(e.touches[0].clientY);
            }
        };

        const handleTouchMove = (e: TouchEvent) => {
            if (startY === 0 || window.scrollY > 0 || refreshing) return;

            const y = e.touches[0].clientY;
            const diff = y - startY;

            if (diff > 0) {
                // Prevent default only if we are pulling down at the top
                // This prevents native browser refresh in some cases, but we want our custom one
                if (e.cancelable) e.preventDefault();

                // Add resistance
                const newY = Math.min(diff * 0.5, MAX_PULL);
                setCurrentY(newY);
            }
        };

        const handleTouchEnd = async () => {
            if (startY === 0 || window.scrollY > 0 || refreshing) {
                setStartY(0);
                setCurrentY(0);
                return;
            }

            if (currentY > PULL_THRESHOLD) {
                setRefreshing(true);
                setCurrentY(PULL_THRESHOLD); // Snap to threshold

                try {
                    await onRefresh();
                } finally {
                    setTimeout(() => {
                        setRefreshing(false);
                        setCurrentY(0);
                        setStartY(0);
                    }, 500); // Small delay to show completion
                }
            } else {
                // Snap back
                setCurrentY(0);
                setStartY(0);
            }
        };

        container.addEventListener('touchstart', handleTouchStart, { passive: true });
        container.addEventListener('touchmove', handleTouchMove, { passive: false });
        container.addEventListener('touchend', handleTouchEnd);

        return () => {
            container.removeEventListener('touchstart', handleTouchStart);
            container.removeEventListener('touchmove', handleTouchMove);
            container.removeEventListener('touchend', handleTouchEnd);
        };
    }, [startY, currentY, refreshing, onRefresh]);

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
