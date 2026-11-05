import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Plus, type LucideIcon } from 'lucide-react';
import { inkOn } from '../gamecast/GameHero';

// Botón flotante abajo a la derecha (encima de la barra): al tocarlo se oscurece la pantalla y sus opciones salen en
// abanico a su alrededor (de la izquierda hacia arriba), una tras otra con rebote; cada una con su nombre debajo.
// Se cierra al elegir, al tocar fuera o con Escape. Con «menos movimiento» solo aparecen. Va directo en el body: dentro
// de la página, un contenedor con transform movería el fondo oscuro y el botón.

export interface DialAction {
    key: string;
    label: string;
    icon: LucideIcon;
    onSelect: () => void;
    disabled?: boolean;
    /** Encendida (p. ej. «Mi equipo» ya elegido) */
    active?: boolean;
}

/** Dónde queda cada opción: en un cuarto de círculo de la izquierda (180°) hacia arriba (90°) */
export const dialPositions = (count: number) => {
    const radius = count <= 3 ? 128 : 156;
    return Array.from({ length: count }, (_, index) => {
        const angle = ((180 - (90 * index) / Math.max(1, count - 1)) * Math.PI) / 180;
        return { x: Math.round(Math.cos(angle) * radius), y: Math.round(-Math.sin(angle) * radius) };
    });
};

export const ActionDial: React.FC<{ actions: DialAction[]; color: string; label: string }> = ({ actions, color, label }) => {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    // Cada apertura reinicia la onda que sale del botón
    const [burst, setBurst] = useState(0);
    const first = useRef<HTMLButtonElement>(null);
    const fab = useRef<HTMLButtonElement>(null);
    const ink = inkOn(color);
    // Los íconos van sobre blanco: un color muy claro (dorado, amarillo) no se vería y se usa el oscuro
    const iconColor = ink === '#ffffff' ? color : '#14151a';
    const positions = dialPositions(actions.length);

    useEffect(() => {
        if (!open) return;
        first.current?.focus();
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setOpen(false);
                fab.current?.focus();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open]);

    const toggle = () => {
        if (!open) {
            setBurst((value) => value + 1);
            navigator.vibrate?.(8);
        }
        setOpen((value) => !value);
    };

    return createPortal(
        <>
            {open && <div className="dial-backdrop" onClick={() => setOpen(false)} aria-hidden="true" />}
            <div className="dial" data-open={open} style={{ ['--dial-c' as string]: color }}>
                <div id="dial-menu" role="menu" aria-label={label} aria-hidden={!open}>
                    {actions.map((action, index) => {
                        const Icon = action.icon;
                        const { x, y } = positions[index];
                        return (
                            <div
                                key={action.key}
                                className="dial-item"
                                style={{
                                    transform: open ? `translate(${x}px, ${y}px)` : 'translate(0, 0) scale(.35)',
                                    opacity: open ? 1 : 0,
                                    // Salen una tras otra y vuelven en el orden contrario
                                    transitionDelay: `${open ? index * 45 : (actions.length - 1 - index) * 25}ms`
                                }}
                            >
                                <button
                                    ref={index === 0 ? first : undefined}
                                    type="button"
                                    role="menuitem"
                                    tabIndex={open ? 0 : -1}
                                    disabled={action.disabled}
                                    aria-pressed={action.active ?? undefined}
                                    onClick={() => {
                                        setOpen(false);
                                        action.onSelect();
                                    }}
                                    className={`dial-option ${action.active ? 'on' : ''}`}
                                    style={action.active ? { backgroundColor: color, color: ink } : { color: iconColor }}
                                >
                                    <Icon className={`h-[22px] w-[22px] ${action.active ? 'fill-current' : ''}`} aria-hidden="true" />
                                    <span className="dial-label">{action.label}</span>
                                </button>
                            </div>
                        );
                    })}
                </div>
                {burst > 0 && open && <span key={burst} className="dial-ring" aria-hidden="true" />}
                <button
                    ref={fab}
                    type="button"
                    onClick={toggle}
                    aria-haspopup="menu"
                    aria-expanded={open}
                    aria-controls="dial-menu"
                    aria-label={open ? t('dial.close') : label}
                    className="dial-fab"
                    style={{ backgroundColor: color, color: ink }}
                >
                    <Plus className="h-7 w-7" strokeWidth={2.6} aria-hidden="true" />
                </button>
            </div>
        </>,
        document.body
    );
};
