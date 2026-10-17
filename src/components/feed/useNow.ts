import { useEffect, useState } from 'react';

const clock = () => Date.now();

/** La hora de ahora, que se renueva sola (para las cuentas regresivas «en 2 h 15 min») */
export const useNow = (every = 30000) => {
    const [now, setNow] = useState(clock);
    useEffect(() => {
        const timer = setInterval(() => setNow(clock()), every);
        return () => clearInterval(timer);
    }, [every]);
    return now;
};
