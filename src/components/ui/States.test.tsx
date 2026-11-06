import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '../../i18n';
import { NotFoundCard } from './States';

describe('NotFoundCard', () => {
    beforeEach(() => {
        i18n.changeLanguage('es');
    });

    it('con un enlace: va primero y «Volver» queda debajo', () => {
        const onBack = vi.fn();
        render(
            <MemoryRouter>
                <NotFoundCard title="No encontramos ese juego." hint="Pista de prueba" action={{ to: '/', label: 'Ver los juegos de hoy' }} onBack={onBack} />
            </MemoryRouter>
        );
        expect(screen.getByRole('alert').textContent).toContain('No encontramos ese juego.');
        expect(screen.getByText('Pista de prueba')).toBeTruthy();
        expect(screen.getByRole('link', { name: 'Ver los juegos de hoy' }).getAttribute('href')).toBe('/');
        fireEvent.click(screen.getByRole('button', { name: 'Volver' }));
        expect(onBack).toHaveBeenCalledTimes(1);
    });

    it('sin enlace: «Volver» es el botón principal', () => {
        const onBack = vi.fn();
        render(
            <MemoryRouter>
                <NotFoundCard title="No encontramos a ese pelotero." onBack={onBack} />
            </MemoryRouter>
        );
        expect(screen.queryByRole('link')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Volver' }));
        expect(onBack).toHaveBeenCalledTimes(1);
    });
});
