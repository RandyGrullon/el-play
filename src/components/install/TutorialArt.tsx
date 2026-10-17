import React from 'react';
import { useTranslation } from 'react-i18next';
import { LogoMark } from '../brand/Logo';

// Dibujos del tutorial de instalación: la parte del teléfono donde hay que tocar, con un aro que late encima.
// Son esquemas (no capturas): sirven en claro y oscuro y no se desactualizan con cada versión de iOS o Chrome.

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
    | 'home-android';

const C = {
    screen: 'rgb(var(--bg))',
    surface: 'rgb(var(--surface))',
    raised: 'rgb(var(--raised))',
    ink: 'rgb(var(--ink))',
    muted: 'rgb(var(--muted))',
    faint: 'rgb(var(--faint))',
    accent: 'rgb(var(--accent))'
};

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

export const TutorialArt: React.FC<{ kind: SceneKind }> = ({ kind }) => {
    const { t } = useTranslation();
    const url = 'el-play.vercel.app';
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
                        {url}
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
                        {url}
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
                        {url}
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
                        {url}
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
                        {url}
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
                    <rect x={100} y={8} width={172} height={156} rx={12} fill={C.surface} />
                    <Row x={100} y={12} w={172} label={t('install.art.newTab')} />
                    <Row x={100} y={40} w={172} label={t('install.art.history')} />
                    <Row x={100} y={68} w={172} label={t('install.art.downloads')} />
                    <Row x={100} y={96} w={172} label={t('install.art.installApp')} icon={<PlusSquare x={0} y={0} />} strong />
                    <Row x={100} y={124} w={172} label={t('install.art.settings')} />
                    <Target x={104} y={98} w={164} h={26} r={8} />
                </>
            );
            break;
        case 'android-dialog':
            body = (
                <>
                    <rect width={280} height={170} rx={20} fill={C.screen} />
                    <rect width={280} height={170} rx={20} fill="#000" opacity={0.35} />
                    <rect x={30} y={22} width={220} height={126} rx={18} fill={C.surface} />
                    <Text x={46} y={46} size={13} weight={800}>
                        {t('install.art.installQ')}
                    </Text>
                    <Logo x={46} y={58} size={32} />
                    <Text x={86} y={72} weight={700}>
                        El Play
                    </Text>
                    <Text x={86} y={86} size={9} color={C.muted}>
                        {url}
                    </Text>
                    <Text x={150} y={130} anchor="end" color={C.accent} weight={600}>
                        {t('install.art.cancel')}
                    </Text>
                    <rect x={166} y={114} width={70} height={24} rx={12} fill={C.accent} />
                    <Text x={201} y={130} anchor="middle" color="#ffffff" weight={800}>
                        {t('install.art.install')}
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
    }

    return (
        <svg viewBox="0 0 280 170" className="h-auto w-full" role="img" aria-hidden="true">
            {body}
        </svg>
    );
};
