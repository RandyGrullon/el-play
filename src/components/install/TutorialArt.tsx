import React from 'react';
import { useTranslation } from 'react-i18next';
import { LogoMark } from '../brand/Logo';

// Dibujos del tutorial de instalación: la parte del teléfono (o de la computadora) donde hay que tocar, con un aro que
// late encima. Son esquemas (no capturas): sirven en claro y oscuro y no se desactualizan con cada versión del navegador.

export type SceneKind =
    | 'safari26-bar'
    | 'safari-menu'
    | 'share-sheet'
    | 'add-ios'
    | 'add-ios-old'
    | 'safari-old-bar'
    | 'chrome-ios-bar'
    | 'chrome-android-bar'
    | 'chrome-menu'
    | 'android-dialog'
    | 'app-button'
    | 'home'
    | 'home-android'
    // Escenas por navegador: barra de abajo (Samsung Internet, Edge), menú con la opción marcada, barra de Instagram,
    // confirmación y las de computadora
    | 'bottom-bar'
    | 'menu'
    | 'inapp-bar'
    | 'confirm'
    | 'desktop-bar'
    | 'desktop-menu'
    | 'mac-menu'
    | 'desktop-dialog'
    | 'desktop-done';

/** Lo que cambia de un navegador a otro en una misma escena */
export interface ArtProps {
    /** Menús: opciones y cuál marcar; `at` = menú que baja de arriba o que sube de abajo */
    items?: string[];
    highlight?: number;
    at?: 'top' | 'bottom';
    /** Submenú (computadora) y cuál marcar */
    sub?: string[];
    subHighlight?: number;
    /** Barra de abajo: ícono del menú (≡ o …) y dónde está */
    icon?: 'lines' | 'dots';
    spot?: 'right' | 'center';
    /** Barra de Instagram/Facebook: los tres puntos de iPhone (•••) o de Android (⋮) */
    os?: 'ios' | 'android';
    /** Diálogos: título y botón */
    title?: string;
    action?: string;
    /** Computadora: qué marcar en la barra de direcciones y si la app queda en el Dock (Mac) o en la barra de tareas */
    mark?: 'install' | 'star';
    dock?: boolean;
}

const C = {
    screen: 'rgb(var(--bg))',
    surface: 'rgb(var(--surface))',
    raised: 'rgb(var(--raised))',
    ink: 'rgb(var(--ink))',
    muted: 'rgb(var(--muted))',
    faint: 'rgb(var(--faint))',
    accent: 'rgb(var(--accent))'
};

const URL = 'elplay.grullonb.com';

/** Marca dónde tocar: borde de color y un aro que late (quieto si el sistema pide menos movimiento) */
const Target: React.FC<{ x: number; y: number; w: number; h: number; r?: number }> = ({ x, y, w, h, r = 10 }) => (
    <g pointerEvents="none">
        <rect x={x} y={y} width={w} height={h} rx={r} fill="none" stroke={C.accent} strokeWidth={2.5} />
        <rect className="tut-ring" x={x} y={y} width={w} height={h} rx={r} fill="none" stroke={C.accent} strokeWidth={2} />
    </g>
);

const Text: React.FC<{ x: number; y: number; size?: number; weight?: number; color?: string; anchor?: 'start' | 'middle' | 'end'; children: React.ReactNode }> = ({
    x,
    y,
    size = 11,
    weight = 600,
    color = C.ink,
    anchor = 'start',
    children
}) => (
    <text x={x} y={y} fontSize={size} fontWeight={weight} fill={color} textAnchor={anchor} fontFamily="Outfit, system-ui, sans-serif">
        {children}
    </text>
);

const Logo: React.FC<{ x: number; y: number; size: number }> = ({ x, y, size }) => (
    <g transform={`translate(${x} ${y})`}>
        <LogoMark size={size} />
    </g>
);

const ShareIcon: React.FC<{ x: number; y: number; color?: string }> = ({ x, y, color = C.accent }) => (
    <g transform={`translate(${x} ${y})`} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M-5 -1 v7 h10 v-7" />
        <path d="M0 2 v-10 M-3.5 -4.5 L0 -8 L3.5 -4.5" />
    </g>
);

const PlusSquare: React.FC<{ x: number; y: number }> = ({ x, y }) => (
    <g transform={`translate(${x} ${y})`} fill="none" stroke={C.ink} strokeWidth={1.6} strokeLinecap="round">
        <rect x={-6} y={-6} width={12} height={12} rx={3} />
        <path d="M0 -3 v6 M-3 0 h6" />
    </g>
);

const Dots: React.FC<{ x: number; y: number; vertical?: boolean }> = ({ x, y, vertical }) => (
    <g fill={C.ink}>
        {[-5, 0, 5].map((d) => (
            <circle key={d} cx={vertical ? x : x + d} cy={vertical ? y + d : y} r={1.7} />
        ))}
    </g>
);

const Lines: React.FC<{ x: number; y: number }> = ({ x, y }) => (
    <g stroke={C.ink} strokeWidth={1.8} strokeLinecap="round">
        {[-4.5, 0, 4.5].map((d) => (
            <path key={d} d={`M${x - 7} ${y + d} h14`} />
        ))}
    </g>
);

/** Ícono de instalar de la barra de direcciones (pantalla con una flecha hacia abajo) */
const InstallIcon: React.FC<{ x: number; y: number }> = ({ x, y }) => (
    <g transform={`translate(${x} ${y})`} fill="none" stroke={C.ink} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        <rect x={-7} y={-6} width={14} height={10} rx={2} />
        <path d="M-3 7 h6 M0 -3.5 v4.5 M-2.2 -0.6 L0 1.4 L2.2 -0.6" />
    </g>
);

const Star: React.FC<{ x: number; y: number }> = ({ x, y }) => (
    <path
        transform={`translate(${x} ${y})`}
        d="M0 -6.5 L1.9 -2.2 L6.5 -1.8 L3 1.2 L4 5.8 L0 3.4 L-4 5.8 L-3 1.2 L-6.5 -1.8 L-1.9 -2.2 Z"
        fill="none"
        stroke={C.ink}
        strokeWidth={1.4}
        strokeLinejoin="round"
    />
);

/** Fondo: una página cualquiera de El Play, borrosa, para ubicar la barra del navegador */
const Page: React.FC<{ top?: number }> = ({ top = 14 }) => (
    <g>
        <rect width={280} height={170} rx={20} fill={C.screen} />
        <rect x={16} y={top} width={120} height={12} rx={6} fill={C.raised} />
        <rect x={16} y={top + 22} width={248} height={44} rx={12} fill={C.surface} />
        <rect x={16} y={top + 74} width={248} height={30} rx={10} fill={C.surface} />
    </g>
);

const Row: React.FC<{ x: number; y: number; w: number; label: string; icon?: React.ReactNode; strong?: boolean }> = ({ x, y, w, label, icon, strong }) => (
    <g>
        <Text x={x + 12} y={y + 15} weight={strong ? 700 : 500} color={strong ? C.ink : C.muted}>
            {label}
        </Text>
        {icon && <g transform={`translate(${x + w - 18} ${y + 11})`}>{icon}</g>}
    </g>
);

/** Lista de opciones con una marcada (menú que baja de arriba a la derecha o que sube de abajo) */
const Menu: React.FC<{ items: string[]; highlight: number; at: 'top' | 'bottom' }> = ({ items, highlight, at }) => {
    const rowH = 26;
    const height = items.length * rowH + 10;
    const x = at === 'top' ? 100 : 8;
    const w = at === 'top' ? 172 : 264;
    const y = at === 'top' ? 8 : 170 - height - 6;
    return (
        <>
            <rect x={x} y={y} width={w} height={height} rx={12} fill={C.surface} />
            {items.map((label, index) => (
                <Row key={label + index} x={x} y={y + 5 + index * rowH} w={w} label={label} strong={index === highlight} icon={index === highlight ? <PlusSquare x={0} y={0} /> : undefined} />
            ))}
            <Target x={x + 4} y={y + 5 + highlight * rowH} w={w - 8} h={rowH - 2} r={8} />
        </>
    );
};

/** Ventana de computadora con la barra de direcciones */
const Window: React.FC<{ dim?: boolean; children?: React.ReactNode }> = ({ dim, children }) => (
    <g>
        <rect width={280} height={170} rx={12} fill={C.raised} />
        <rect x={6} y={6} width={268} height={158} rx={10} fill={C.screen} />
        {[18, 30, 42].map((cx) => (
            <circle key={cx} cx={cx} cy={17} r={3.2} fill={C.faint} />
        ))}
        <rect x={58} y={9} width={96} height={16} rx={6} fill={C.surface} />
        <Text x={66} y={21} size={8.5} color={C.muted}>
            El Play
        </Text>
        <rect x={14} y={30} width={234} height={20} rx={10} fill={C.surface} />
        <Text x={26} y={44} size={9} color={C.muted}>
            {URL}
        </Text>
        <Dots x={262} y={40} vertical />
        <rect x={20} y={62} width={110} height={10} rx={5} fill={C.raised} />
        <rect x={20} y={80} width={240} height={36} rx={10} fill={C.surface} />
        <rect x={20} y={124} width={240} height={30} rx={10} fill={C.surface} />
        {children}
        {dim && <rect x={6} y={6} width={268} height={158} rx={10} fill="#000" opacity={0.35} />}
    </g>
);

export const TutorialArt: React.FC<{ kind: SceneKind; art?: ArtProps }> = ({ kind, art = {} }) => {
    const { t } = useTranslation();
    let body: React.ReactNode = null;

    switch (kind) {
        case 'safari26-bar':
            body = (
                <>
                    <Page />
                    <rect x={10} y={124} width={260} height={38} rx={19} fill={C.surface} />
                    <path d="M30 136 l-6 7 l6 7" fill="none" stroke={C.ink} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                    <rect x={48} y={130} width={176} height={26} rx={13} fill={C.raised} />
                    <Text x={136} y={147} anchor="middle" color={C.muted}>
                        {URL}
                    </Text>
                    <circle cx={248} cy={143} r={13} fill={C.raised} />
                    <Dots x={248} y={143} />
                    <Target x={233} y={128} w={30} h={30} r={15} />
                </>
            );
            break;
        case 'safari-menu':
            body = (
                <>
                    <Page />
                    <rect x={110} y={14} width={160} height={110} rx={14} fill={C.surface} />
                    <Row x={110} y={20} w={160} label={t('install.art.share')} icon={<ShareIcon x={0} y={0} color={C.ink} />} strong />
                    <Row x={110} y={52} w={160} label={t('install.art.bookmark')} />
                    <Row x={110} y={84} w={160} label={t('install.art.find')} />
                    <Target x={114} y={20} w={152} h={28} />
                    <rect x={10} y={132} width={260} height={30} rx={15} fill={C.surface} opacity={0.6} />
                </>
            );
            break;
        case 'share-sheet':
            body = (
                <>
                    <rect width={280} height={170} rx={20} fill={C.screen} />
                    <rect x={0} y={18} width={280} height={152} rx={18} fill={C.surface} />
                    <Logo x={16} y={28} size={24} />
                    <Text x={48} y={39} weight={700}>
                        El Play
                    </Text>
                    <Text x={48} y={51} size={9} color={C.muted}>
                        {URL}
                    </Text>
                    {[0, 1, 2, 3, 4].map((i) => (
                        <circle key={i} cx={32 + i * 52} cy={78} r={14} fill={C.raised} />
                    ))}
                    <rect x={10} y={98} width={260} height={66} rx={12} fill={C.raised} />
                    <Row x={10} y={100} w={260} label={t('install.art.copy')} />
                    <Row x={10} y={120} w={260} label={t('install.art.bookmark')} />
                    <Row x={10} y={140} w={260} label={t('install.art.addHome')} icon={<PlusSquare x={0} y={0} />} strong />
                    <Target x={12} y={140} w={256} h={22} r={8} />
                </>
            );
            break;
        case 'add-ios':
        case 'add-ios-old':
            body = (
                <>
                    <rect width={280} height={170} rx={20} fill={C.screen} />
                    <Text x={16} y={26} color={C.accent} weight={500}>
                        {t('install.art.cancel')}
                    </Text>
                    <Text x={140} y={26} anchor="middle" weight={700}>
                        {t('install.art.addHome')}
                    </Text>
                    <Text x={264} y={26} anchor="end" color={C.accent} weight={800}>
                        {t('install.art.add')}
                    </Text>
                    <Target x={214} y={11} w={58} h={22} r={8} />
                    <rect x={12} y={42} width={256} height={54} rx={12} fill={C.surface} />
                    <Logo x={22} y={50} size={38} />
                    <Text x={70} y={66} weight={700}>
                        El Play
                    </Text>
                    <Text x={70} y={82} size={9} color={C.muted}>
                        {URL}
                    </Text>
                    {kind === 'add-ios' && (
                        <>
                            <rect x={12} y={106} width={256} height={36} rx={12} fill={C.surface} />
                            <Text x={24} y={128}>
                                {t('install.art.webApp')}
                            </Text>
                            <rect x={222} y={114} width={36} height={20} rx={10} fill="#34c759" />
                            <circle cx={248} cy={124} r={8} fill="#ffffff" />
                            <rect x={214} y={110} width={52} height={28} rx={14} fill="none" stroke={C.accent} strokeWidth={1.5} strokeDasharray="3 3" />
                        </>
                    )}
                </>
            );
            break;
        case 'safari-old-bar':
            body = (
                <>
                    <Page />
                    <rect x={0} y={130} width={280} height={40} fill={C.surface} />
                    <path d="M34 142 l-6 7 l6 7" fill="none" stroke={C.muted} strokeWidth={2} strokeLinecap="round" />
                    <path d="M84 142 l6 7 l-6 7" fill="none" stroke={C.faint} strokeWidth={2} strokeLinecap="round" />
                    <ShareIcon x={140} y={151} />
                    <rect x={186} y={142} width={14} height={13} rx={2} fill="none" stroke={C.muted} strokeWidth={1.6} />
                    <rect x={238} y={142} width={13} height={13} rx={3} fill="none" stroke={C.muted} strokeWidth={1.6} />
                    <Target x={124} y={134} w={32} h={32} r={16} />
                </>
            );
            break;
        case 'chrome-ios-bar':
            body = (
                <>
                    <rect width={280} height={170} rx={20} fill={C.screen} />
                    <rect x={10} y={12} width={260} height={30} rx={15} fill={C.surface} />
                    <Text x={130} y={31} anchor="middle" color={C.muted}>
                        {URL}
                    </Text>
                    <ShareIcon x={250} y={30} />
                    <Target x={236} y={14} w={28} h={26} r={13} />
                    <rect x={16} y={54} width={120} height={12} rx={6} fill={C.raised} />
                    <rect x={16} y={76} width={248} height={44} rx={12} fill={C.surface} />
                    <rect x={16} y={128} width={248} height={30} rx={10} fill={C.surface} />
                </>
            );
            break;
        case 'chrome-android-bar':
            body = (
                <>
                    <rect width={280} height={170} rx={20} fill={C.screen} />
                    <rect x={10} y={12} width={204} height={30} rx={15} fill={C.surface} />
                    <Text x={112} y={31} anchor="middle" color={C.muted}>
                        {URL}
                    </Text>
                    <rect x={224} y={19} width={16} height={16} rx={4} fill="none" stroke={C.ink} strokeWidth={1.6} />
                    <Dots x={258} y={27} vertical />
                    <Target x={246} y={13} w={24} h={28} r={12} />
                    <rect x={16} y={54} width={120} height={12} rx={6} fill={C.raised} />
                    <rect x={16} y={76} width={248} height={44} rx={12} fill={C.surface} />
                    <rect x={16} y={128} width={248} height={30} rx={10} fill={C.surface} />
                </>
            );
            break;
        case 'chrome-menu':
            body = (
                <>
                    <rect width={280} height={170} rx={20} fill={C.screen} />
                    <Menu
                        items={[t('install.art.newTab'), t('install.art.history'), t('install.art.downloads'), t('install.art.installApp'), t('install.art.settings')]}
                        highlight={3}
                        at="top"
                    />
                </>
            );
            break;
        case 'android-dialog':
        case 'confirm':
            body = (
                <>
                    <rect width={280} height={170} rx={20} fill={C.screen} />
                    <rect width={280} height={170} rx={20} fill="#000" opacity={0.35} />
                    <rect x={30} y={22} width={220} height={126} rx={18} fill={C.surface} />
                    <Text x={46} y={46} size={13} weight={800}>
                        {art.title ?? t('install.art.installQ')}
                    </Text>
                    <Logo x={46} y={58} size={32} />
                    <Text x={86} y={72} weight={700}>
                        El Play
                    </Text>
                    <Text x={86} y={86} size={9} color={C.muted}>
                        {URL}
                    </Text>
                    <Text x={150} y={130} anchor="end" color={C.accent} weight={600}>
                        {t('install.art.cancel')}
                    </Text>
                    <rect x={166} y={114} width={70} height={24} rx={12} fill={C.accent} />
                    <Text x={201} y={130} anchor="middle" color="#ffffff" weight={800}>
                        {art.action ?? t('install.art.install')}
                    </Text>
                    <Target x={162} y={110} w={78} h={32} r={16} />
                </>
            );
            break;
        case 'app-button':
            body = (
                <>
                    <Page />
                    <rect x={40} y={118} width={200} height={38} rx={19} fill={C.accent} />
                    <path d="M98 128 v10 M93 134 l5 5 l5 -5 M91 143 h14" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                    <Text x={150} y={142} anchor="middle" color="#ffffff" size={13} weight={800}>
                        {t('install.button')}
                    </Text>
                    <Target x={36} y={114} w={208} h={46} r={23} />
                </>
            );
            break;
        case 'home':
        case 'home-android': {
            const round = kind === 'home-android';
            const cells = Array.from({ length: 10 }, (_, i) => ({ x: 22 + (i % 5) * 50, y: 18 + Math.floor(i / 5) * 62 }));
            body = (
                <>
                    <rect width={280} height={170} rx={20} fill={C.raised} />
                    {cells.map((cell, i) =>
                        i === 6 ? (
                            <g key={i}>
                                <Logo x={cell.x} y={cell.y} size={36} />
                                <Text x={cell.x + 18} y={cell.y + 50} size={9} anchor="middle" weight={700}>
                                    El Play
                                </Text>
                                <Target x={cell.x - 6} y={cell.y - 6} w={48} h={48} r={round ? 24 : 14} />
                            </g>
                        ) : (
                            <rect key={i} x={cell.x} y={cell.y} width={36} height={36} rx={round ? 18 : 10} fill={C.surface} />
                        )
                    )}
                </>
            );
            break;
        }
        case 'bottom-bar': {
            // Barra de abajo: atrás, adelante, en el centro (Edge: «…») o casa, pestañas y a la derecha (Samsung: ≡)
            const center = art.spot === 'center';
            const icon = art.icon === 'lines' ? 'lines' : 'dots';
            const menuX = center ? 140 : 246;
            body = (
                <>
                    <rect width={280} height={170} rx={20} fill={C.screen} />
                    <rect x={10} y={10} width={260} height={28} rx={14} fill={C.surface} />
                    <Text x={140} y={28} anchor="middle" color={C.muted}>
                        {URL}
                    </Text>
                    <rect x={16} y={48} width={120} height={12} rx={6} fill={C.raised} />
                    <rect x={16} y={68} width={248} height={44} rx={12} fill={C.surface} />
                    <rect x={0} y={128} width={280} height={42} fill={C.surface} />
                    <path d="M34 142 l-6 7 l6 7" fill="none" stroke={C.muted} strokeWidth={2} strokeLinecap="round" />
                    <path d="M84 142 l6 7 l-6 7" fill="none" stroke={C.faint} strokeWidth={2} strokeLinecap="round" />
                    {!center && <path d="M134 151 l6 -6 l6 6 v7 h-12 Z" fill="none" stroke={C.muted} strokeWidth={1.6} strokeLinejoin="round" />}
                    <rect x={190} y={143} width={13} height={13} rx={3} fill="none" stroke={C.muted} strokeWidth={1.6} />
                    {center && <rect x={240} y={143} width={13} height={13} rx={3} fill="none" stroke={C.muted} strokeWidth={1.6} />}
                    {icon === 'lines' ? <Lines x={menuX} y={149} /> : <Dots x={menuX} y={149} />}
                    <Target x={menuX - 16} y={133} w={32} h={32} r={16} />
                </>
            );
            break;
        }
        case 'menu':
            body = (
                <>
                    <Page />
                    {art.at === 'bottom' && <rect width={280} height={170} rx={20} fill="#000" opacity={0.25} />}
                    <Menu items={art.items ?? []} highlight={art.highlight ?? 0} at={art.at ?? 'top'} />
                </>
            );
            break;
        case 'inapp-bar': {
            // Navegador de Instagram, Facebook o TikTok: cerrar a la izquierda, la dirección y el menú a la derecha
            const ios = art.os !== 'android';
            body = (
                <>
                    <rect width={280} height={170} rx={20} fill={C.screen} />
                    <rect x={0} y={0} width={280} height={44} rx={20} fill={C.surface} />
                    <rect x={0} y={24} width={280} height={20} fill={C.surface} />
                    <path d="M18 16 l10 10 M28 16 l-10 10" stroke={C.ink} strokeWidth={1.8} strokeLinecap="round" />
                    <Text x={140} y={20} anchor="middle" size={10} weight={700}>
                        El Play
                    </Text>
                    <Text x={140} y={33} anchor="middle" size={8.5} color={C.muted}>
                        {URL}
                    </Text>
                    <Dots x={256} y={22} vertical={!ios} />
                    <Target x={240} y={8} w={32} h={28} r={14} />
                    <rect x={16} y={58} width={120} height={12} rx={6} fill={C.raised} />
                    <rect x={16} y={80} width={248} height={44} rx={12} fill={C.surface} />
                    <rect x={16} y={132} width={248} height={28} rx={10} fill={C.surface} />
                </>
            );
            break;
        }
        case 'desktop-bar':
            body = (
                <Window>
                    {art.mark === 'star' ? <Star x={236} y={40} /> : <InstallIcon x={234} y={40} />}
                    <Target x={222} y={30} w={24} h={20} r={8} />
                    {art.title && (
                        <g>
                            <rect x={150} y={54} width={110} height={20} rx={8} fill={C.ink} />
                            <Text x={205} y={67} anchor="middle" size={9} weight={700} color={C.screen}>
                                {art.title}
                            </Text>
                        </g>
                    )}
                </Window>
            );
            break;
        case 'desktop-menu': {
            // Menú de la derecha (x 140) y, si hay, el submenú a la izquierda (x 8) sin taparse
            const items = art.items ?? [];
            const sub = art.sub ?? [];
            const rowH = 20;
            const top = 48;
            const highlight = art.highlight ?? 0;
            const subHighlight = art.subHighlight ?? 0;
            const subTop = top + 4 + highlight * rowH;
            body = (
                <Window>
                    <Target x={252} y={30} w={20} h={20} r={8} />
                    <rect x={140} y={top} width={132} height={items.length * rowH + 8} rx={8} fill={C.surface} stroke={C.faint} strokeWidth={0.6} />
                    {items.map((label, index) => (
                        <Text key={label + index} x={148} y={top + 17 + index * rowH} size={8.5} weight={index === highlight ? 800 : 500} color={index === highlight ? C.ink : C.muted}>
                            {label}
                        </Text>
                    ))}
                    {sub.length > 0 && (
                        <>
                            <rect x={8} y={subTop} width={130} height={sub.length * rowH + 8} rx={8} fill={C.surface} stroke={C.faint} strokeWidth={0.6} />
                            {sub.map((label, index) => (
                                <Text key={label + index} x={15} y={subTop + 17 + index * rowH} size={8.5} weight={index === subHighlight ? 800 : 500} color={index === subHighlight ? C.ink : C.muted}>
                                    {label}
                                </Text>
                            ))}
                            <Target x={10} y={subTop + 4 + subHighlight * rowH} w={126} h={rowH} r={6} />
                        </>
                    )}
                    {sub.length === 0 && <Target x={142} y={top + 4 + highlight * rowH} w={128} h={rowH} r={6} />}
                </Window>
            );
            break;
        }
        case 'mac-menu': {
            // Barra de menú de la Mac: Archivo → Agregar al Dock
            const items = art.items ?? [];
            const highlight = art.highlight ?? 0;
            body = (
                <>
                    <rect width={280} height={170} rx={12} fill={C.raised} />
                    <rect x={0} y={0} width={280} height={18} rx={0} fill={C.surface} />
                    <Text x={14} y={13} size={9} weight={800}>
                        Safari
                    </Text>
                    <rect x={46} y={2} width={44} height={14} rx={4} fill={C.accent} opacity={0.18} />
                    <Text x={52} y={13} size={9} weight={700}>
                        {art.title ?? ''}
                    </Text>
                    <rect x={46} y={20} width={150} height={items.length * 20 + 8} rx={8} fill={C.surface} stroke={C.faint} strokeWidth={0.6} />
                    {items.map((label, index) => (
                        <Text key={label + index} x={56} y={37 + index * 20} size={9} weight={index === highlight ? 800 : 500} color={index === highlight ? C.ink : C.muted}>
                            {label}
                        </Text>
                    ))}
                    <Target x={48} y={24 + highlight * 20} w={146} h={20} r={6} />
                </>
            );
            break;
        }
        case 'desktop-dialog':
            body = (
                <Window dim>
                    <rect x={60} y={40} width={160} height={100} rx={12} fill={C.surface} />
                    <Text x={72} y={60} size={11} weight={800}>
                        {art.title ?? t('install.art.installQ')}
                    </Text>
                    <Logo x={72} y={70} size={26} />
                    <Text x={104} y={82} size={10} weight={700}>
                        El Play
                    </Text>
                    <Text x={104} y={94} size={8} color={C.muted}>
                        {URL}
                    </Text>
                    <rect x={150} y={112} width={60} height={20} rx={10} fill={C.accent} />
                    <Text x={180} y={126} anchor="middle" size={9.5} color="#ffffff" weight={800}>
                        {art.action ?? t('install.art.install')}
                    </Text>
                    <Text x={140} y={126} anchor="end" size={9.5} color={C.accent} weight={600}>
                        {t('install.art.cancel')}
                    </Text>
                    <Target x={146} y={108} w={68} h={28} r={14} />
                </Window>
            );
            break;
        case 'desktop-done':
            // La app en su propia ventana (sin barra de direcciones) y su ícono en el Dock o en la barra de tareas
            body = (
                <>
                    <rect width={280} height={170} rx={12} fill={C.raised} />
                    <rect x={30} y={10} width={220} height={118} rx={10} fill={C.screen} />
                    <rect x={30} y={10} width={220} height={18} rx={10} fill={C.surface} />
                    <Logo x={38} y={13} size={12} />
                    <Text x={56} y={23} size={8.5} weight={700}>
                        El Play
                    </Text>
                    <rect x={42} y={38} width={90} height={10} rx={5} fill={C.raised} />
                    <rect x={42} y={56} width={196} height={30} rx={8} fill={C.surface} />
                    <rect x={42} y={94} width={196} height={24} rx={8} fill={C.surface} />
                    <rect x={art.dock ? 70 : 0} y={140} width={art.dock ? 140 : 280} height={26} rx={art.dock ? 10 : 0} fill={C.surface} />
                    {[0, 1, 2, 3].map((i) => (
                        <rect key={i} x={(art.dock ? 82 : 94) + i * 26} y={145} width={16} height={16} rx={4} fill={C.raised} />
                    ))}
                    <Logo x={art.dock ? 186 : 198} y={144} size={18} />
                    <Target x={art.dock ? 181 : 193} y={139} w={28} h={28} r={8} />
                </>
            );
            break;
    }

    return (
        <svg viewBox="0 0 280 170" className="h-auto w-full" role="img" aria-hidden="true">
            {body}
        </svg>
    );
};
