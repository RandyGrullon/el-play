import { useEffect, useState } from 'react';

/** La hora de ahora, que avanza sola cada `every` ms (cuentas regresivas, minutos sin datos, lo que lleva el juego) */
export const useNow = (every = 30000, enabled = true) => {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (!enabled) return;
        setNow(Date.now());
        const timer = window.setInterval(() => setNow(Date.now()), every);
        return () => window.clearInterval(timer);
    }, [every, enabled]);
    return now;
};
