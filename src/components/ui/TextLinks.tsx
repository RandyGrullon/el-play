// Textos con enlaces adentro: la descripción de una jugada con el nombre de cada pelotero que abre su página, y las
// traducciones con un hueco («G: {{name}}») que lleva un enlace en vez de texto.
import React from 'react';
import type { PersonRef } from '../../types';
import { splitByNames, splitSlots } from '../../lib/links';
import { PlayerLink } from './PlayerLink';

/** El texto traducido con cada hueco (hecho con `slot()`) cambiado por su nodo */
export const withNodes = (text: string, nodes: Record<string, React.ReactNode>): React.ReactNode =>
    splitSlots(text).map((part, index) => (typeof part === 'string' ? <React.Fragment key={index}>{part}</React.Fragment> : <React.Fragment key={index}>{nodes[part.slot] ?? ''}</React.Fragment>));

/** Texto con los nombres de `people` como enlaces a su página */
export const LinkedNames: React.FC<{ text: string; people: (PersonRef | null | undefined)[]; linkClassName?: string; onNavigate?: () => void }> = ({ text, people, linkClassName = '', onNavigate }) => (
    <>
        {splitByNames(text, people).map((part, index) =>
            typeof part === 'string' ? (
                <React.Fragment key={index}>{part}</React.Fragment>
            ) : (
                <PlayerLink key={index} id={part.id} className={linkClassName} onClick={onNavigate}>
                    {part.text}
                </PlayerLink>
            )
        )}
    </>
);
