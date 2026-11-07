import React, { Suspense, createContext, lazy, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { usePrefetchGame } from '../../lib/queries';
import { Bases } from '../game/Bases';

// Vista del terreno: tocar el diamante de un juego en vivo (página del juego, tarjeta de la lista, hoja de En vivo)
// abre el terreno con las caras de los que están en juego. Aquí va lo liviano (quién la abre y el botón); el panel se
// baja aparte la primera vez (se precarga al pasar el dedo o el ratón por el diamante).

const loadOverlay = () => import('./FieldOverlay');
const FieldOverlay = lazy(loadOverlay);

export interface OpenFieldOptions {
    gamePk: number;
    /** El diamante que se tocó: el panel sale de ahí y vuelve ahí al cerrarse */
    origin?: HTMLElement | null;
    /** Al irse a la página de un pelotero (cerrar la hoja de abajo, por ejemplo) */
    onLeave?: () => void;
}

interface FieldViewApi {
    open: (options: OpenFieldOptions) => void;
    preload: () => void;
}

const FieldViewContext = createContext<FieldViewApi | null>(null);

export const useFieldView = () => useContext(FieldViewContext);

export const FieldViewProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [current, setCurrent] = useState<(OpenFieldOptions & { token: number }) | null>(null);
    const counter = useRef(0);
    const location = useLocation();

    const open = useCallback((options: OpenFieldOptions) => {
        counter.current += 1;
        setCurrent({ ...options, token: counter.current });
    }, []);
    const preload = useCallback(() => {
        loadOverlay().catch(() => undefined);
    }, []);
    const api = useMemo(() => ({ open, preload }), [open, preload]);

    // Si se cambia de página por cualquier lado, el terreno no se queda abierto encima
    useEffect(() => setCurrent(null), [location.pathname]);

    return (
        <FieldViewContext.Provider value={api}>
            {children}
            {current && (
                <Suspense fallback={null}>
                    <FieldOverlay key={current.token} gamePk={current.gamePk} origin={current.origin ?? null} onLeave={current.onLeave} onClosed={() => setCurrent(null)} />
                </Suspense>
            )}
        </FieldViewContext.Provider>
    );
};

interface FieldButtonProps {
    gamePk: number | null | undefined;
    runners: { first: unknown; second: unknown; third: unknown };
    size: number;
    color?: string;
    className?: string;
    onLeave?: () => void;
}

/**
 * El diamante de las bases que abre el terreno. El toque no sube a la tarjeta (que abre el juego). Sin quién lo abra
 * (fuera de la app, en las pruebas de un componente suelto) queda como el diamante de siempre.
 */
export const FieldButton: React.FC<FieldButtonProps> = ({ gamePk, runners, size, color, className = '', onLeave }) => {
    const { t } = useTranslation();
    const api = useFieldView();
    const prefetch = usePrefetchGame();
    if (!api || !gamePk) return <Bases runners={runners} size={size} color={color} className={className} />;
    const warm = () => {
        api.preload();
        prefetch(gamePk).catch(() => undefined);
    };
    return (
        <button
            type="button"
            aria-label={t('field.open')}
            aria-haspopup="dialog"
            className={`-m-1.5 flex shrink-0 rounded-xl p-1.5 transition-[transform,background-color] duration-150 hover:bg-raised active:scale-90 ${className}`}
            onPointerEnter={warm}
            onFocus={warm}
            onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                api.open({ gamePk, origin: event.currentTarget, onLeave });
            }}
        >
            <Bases runners={runners} size={size} color={color} />
        </button>
    );
};
