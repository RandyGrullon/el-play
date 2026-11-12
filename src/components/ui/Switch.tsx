import React from 'react';

type NativeProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'role' | 'checked' | 'onChange' | 'className' | 'children'>;

interface SwitchProps extends NativeProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    className?: string;
}

/**
 * Interruptor de encendido/apagado. Por dentro es un checkbox de verdad (role="switch"): se toca él o la etiqueta que
 * lo envuelve, se lee bien con lector de pantalla y funciona con el teclado. Lo que se ve es un riel de 48×28 y una
 * bolita blanca de 24 centrada con 2 px de margen por cada lado, que corre 20 px (riel en el color de acento al
 * encenderse). La bolita no va en un ::before del input, que no centraba y que Firefox no dibuja.
 */
export const Switch: React.FC<SwitchProps> = ({ checked, onChange, className = '', disabled, ...rest }) => (
    <span className={`relative inline-flex h-7 w-12 shrink-0 ${disabled ? 'opacity-50' : ''} ${className}`}>
        <input
            {...rest}
            type="checkbox"
            role="switch"
            checked={checked}
            disabled={disabled}
            onChange={(event) => onChange(event.target.checked)}
            className="peer absolute inset-0 z-[1] m-0 h-full w-full cursor-pointer appearance-none rounded-full opacity-0 disabled:cursor-default"
        />
        <span
            aria-hidden="true"
            className="absolute inset-0 rounded-full bg-faint/40 transition-colors duration-200 peer-checked:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-surface motion-reduce:transition-none"
        />
        <span
            aria-hidden="true"
            className="pointer-events-none absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.3),0_1px_1px_rgba(0,0,0,0.12)] transition-transform duration-200 ease-[cubic-bezier(0.3,1.3,0.5,1)] peer-checked:translate-x-5 peer-active:scale-95 motion-reduce:transition-none"
        />
    </span>
);
