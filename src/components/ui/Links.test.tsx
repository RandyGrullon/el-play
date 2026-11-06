import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '../../i18n';
import { PlayerLink } from './PlayerLink';
import { TeamLink } from './TeamLink';
import { CardLink, OVER_CARD } from './CardLink';
import { LinkedNames, withNodes } from './TextLinks';
import { slot } from '../../lib/links';

// Datos inventados
const PELOTERO = { id: 12345678, name: 'Pelotero Uno' };
const EQUIPO = { id: 99999, name: 'Equipo Prueba' };

describe('PlayerLink y TeamLink', () => {
    beforeEach(() => {
        i18n.changeLanguage('es');
    });

    it('llevan a la página (el pelotero en la temporada pedida)', () => {
        render(
            <MemoryRouter>
                <PlayerLink id={PELOTERO.id} season={2025}>{PELOTERO.name}</PlayerLink>
                <TeamLink id={EQUIPO.id}>{EQUIPO.name}</TeamLink>
            </MemoryRouter>
        );
        expect(screen.getByRole('link', { name: PELOTERO.name }).getAttribute('href')).toBe('/jugador/12345678?temporada=2025');
        expect(screen.getByRole('link', { name: EQUIPO.name }).getAttribute('href')).toBe('/equipo/99999');
    });

    it('sin id quedan como texto', () => {
        render(
            <MemoryRouter>
                <PlayerLink id={null}>{PELOTERO.name}</PlayerLink>
                <TeamLink id={undefined}>{EQUIPO.name}</TeamLink>
            </MemoryRouter>
        );
        expect(screen.queryByRole('link')).toBeNull();
        expect(screen.getByText(PELOTERO.name)).toBeTruthy();
        expect(screen.getByText(EQUIPO.name)).toBeTruthy();
    });

    it('el toque no sube a la fila y avisa (para cerrar la hoja)', () => {
        const row = vi.fn();
        const close = vi.fn();
        render(
            <MemoryRouter>
                <div onClick={row}>
                    <TeamLink id={EQUIPO.id} onClick={close}>{EQUIPO.name}</TeamLink>
                    <PlayerLink id={PELOTERO.id}>{PELOTERO.name}</PlayerLink>
                </div>
            </MemoryRouter>
        );
        fireEvent.click(screen.getByRole('link', { name: EQUIPO.name }));
        fireEvent.click(screen.getByRole('link', { name: PELOTERO.name }));
        expect(close).toHaveBeenCalledTimes(1);
        expect(row).not.toHaveBeenCalled();
    });

    it('el logo solo lleva su nombre para el lector; el repetido queda fuera del tabulador', () => {
        render(
            <MemoryRouter>
                <TeamLink id={EQUIPO.id} label={i18n.t('team.open', { team: EQUIPO.name })}><img alt="" src="" /></TeamLink>
                <PlayerLink id={PELOTERO.id} decorative><img alt="" src="" /></PlayerLink>
            </MemoryRouter>
        );
        expect(screen.getByRole('link', { name: 'Abrir la página de Equipo Prueba' }).getAttribute('href')).toBe('/equipo/99999');
        const hidden = document.querySelector('a[href="/jugador/12345678"]')!;
        expect(hidden.getAttribute('tabindex')).toBe('-1');
        expect(hidden.getAttribute('aria-hidden')).toBe('true');
    });
});

describe('CardLink: la tarjeta que abre el juego con el equipo encima', () => {
    it('el enlace de la tarjeta y el del equipo son hermanos (no uno dentro del otro)', () => {
        render(
            <MemoryRouter>
                <div className="relative isolate">
                    <CardLink to="/juego/123456" label={i18n.t('card.openGame', { away: 'Equipo Prueba', home: 'Equipo Dos' })} />
                    <TeamLink id={EQUIPO.id} className={OVER_CARD}>{EQUIPO.name}</TeamLink>
                </div>
            </MemoryRouter>
        );
        const card = screen.getByRole('link', { name: 'Abrir el juego Equipo Prueba contra Equipo Dos' });
        const team = screen.getByRole('link', { name: EQUIPO.name });
        expect(card.getAttribute('href')).toBe('/juego/123456');
        expect(card.contains(team)).toBe(false);
        expect(team.className).toContain('z-[2]');
    });
});

describe('textos con enlaces', () => {
    it('withNodes pone el enlace en el hueco de la traducción', () => {
        render(<MemoryRouter><p>{withNodes(i18n.t('card.win', { name: slot('name') }), { name: <PlayerLink id={PELOTERO.id}>{PELOTERO.name}</PlayerLink> })}</p></MemoryRouter>);
        expect(screen.getByText('G:', { exact: false }).textContent).toBe('G: Pelotero Uno');
        expect(screen.getByRole('link', { name: PELOTERO.name }).getAttribute('href')).toBe('/jugador/12345678');
    });

    it('LinkedNames enlaza a los peloteros que nombra la jugada', () => {
        render(<MemoryRouter><p>{<LinkedNames text="Pelotero Uno batea un jonrón." people={[PELOTERO]} />}</p></MemoryRouter>);
        expect(screen.getByText('batea un jonrón.', { exact: false }).textContent).toBe('Pelotero Uno batea un jonrón.');
        expect(screen.getByRole('link', { name: PELOTERO.name }).getAttribute('href')).toBe('/jugador/12345678');
    });
});
