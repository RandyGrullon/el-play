// Piezas básicas con el estilo de El Play (las equivalentes de las clases de Tailwind de la web).
import React, { useEffect, useId, useState, useSyncExternalStore } from 'react';
import { AccessibilityInfo, ActivityIndicator, Animated, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type TextProps, type TextStyle, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FullWindowOverlay } from 'react-native-screens';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { usePathname } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { RotateCw, WifiOff, X } from 'lucide-react-native';
import { useColors } from '../theme/theme';
import { BRAND_GRADIENT, alpha, fonts, radius, shadow } from '../theme/tokens';
import type { Palette } from '../theme/tokens';
import { photoSources, rememberMiss, usePhotoIndex } from '../lib/photos';
import { hideToast, useToast } from '../lib/toast';

// ---------------------------------------------------------------- «Reducir movimiento» del sistema

let reduceMotion = false;
const motionListeners = new Set<() => void>();
const setReduceMotion = (value: boolean) => {
    reduceMotion = value;
    motionListeners.forEach((listener) => listener());
};
AccessibilityInfo.isReduceMotionEnabled?.()
    .then(setReduceMotion)
    .catch(() => undefined);
AccessibilityInfo.addEventListener?.('reduceMotionChanged', setReduceMotion);

/** true si el usuario pidió menos movimiento (iOS, Android y la web): las animaciones que se repiten se quedan quietas */
export const useReduceMotion = () =>
    useSyncExternalStore(
        (listener) => {
            motionListeners.add(listener);
            return () => motionListeners.delete(listener);
        },
        () => reduceMotion,
        () => false
    );

// ---------------------------------------------------------------- texto

type Weight = 'regular' | 'medium' | 'semibold' | 'bold' | 'extrabold' | 'black';
type Tone = keyof Palette | 'white';

export const Txt: React.FC<
    TextProps & { size?: number; weight?: Weight; tone?: Tone; color?: string; tabular?: boolean; eyebrow?: boolean; condensed?: boolean; center?: boolean; style?: StyleProp<TextStyle> }
> = ({ size = 15, weight = 'regular', tone = 'ink', color, tabular, eyebrow, condensed, center, style, ...props }) => {
    const colors = useColors();
    const base: TextStyle = {
        fontFamily: condensed ? fonts.condensed : fonts[weight],
        fontSize: eyebrow ? 11 : size,
        color: color ?? (tone === 'white' ? '#fff' : colors[tone]),
        fontVariant: tabular ? ['tabular-nums'] : undefined,
        textAlign: center ? 'center' : undefined
    };
    if (eyebrow) Object.assign(base, { fontFamily: fonts.extrabold, letterSpacing: 1.4, textTransform: 'uppercase', color: color ?? colors.muted });
    return <Text {...props} style={[base, style]} />;
};

/** Título grande de pantalla (display) */
export const Title: React.FC<{ children: React.ReactNode; size?: number; style?: StyleProp<TextStyle> }> = ({ children, size = 32, style }) => (
    <Txt size={size} weight="black" style={[{ lineHeight: size * 1.1, letterSpacing: -0.5 }, style]}>
        {children}
    </Txt>
);

// ---------------------------------------------------------------- superficies

export const Card: React.FC<{ children: React.ReactNode; style?: StyleProp<ViewStyle>; padded?: boolean; float?: boolean }> = ({ children, style, padded = true, float }) => {
    const colors = useColors();
    return <View style={[{ backgroundColor: colors.surface, borderRadius: radius.card, padding: padded ? 16 : 0 }, shadow(float ? 'float' : 'card'), style]}>{children}</View>;
};

export const Row: React.FC<{ children: React.ReactNode; gap?: number; style?: StyleProp<ViewStyle>; align?: ViewStyle['alignItems']; justify?: ViewStyle['justifyContent']; wrap?: boolean }> = ({
    children,
    gap = 8,
    style,
    align = 'center',
    justify,
    wrap
}) => <View style={[{ flexDirection: 'row', alignItems: align, justifyContent: justify, gap, flexWrap: wrap ? 'wrap' : undefined }, style]}>{children}</View>;

export const Gradient: React.FC<{ children?: React.ReactNode; style?: StyleProp<ViewStyle>; colors?: readonly [string, string, ...string[]] }> = ({ children, style, colors = BRAND_GRADIENT }) => (
    <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={style}>
        {children}
    </LinearGradient>
);

// ---------------------------------------------------------------- botones y selectores

export const Pill: React.FC<{ label: string; active?: boolean; onPress?: () => void; icon?: React.ReactNode; accent?: boolean; small?: boolean; accessibilityLabel?: string }> = ({ label, active, onPress, icon, accent, small, accessibilityLabel }) => {
    const colors = useColors();
    const background = active ? (accent ? colors.accent : colors.ink) : colors.surface;
    const ink = active ? (accent ? '#fff' : colors.bg) : colors.muted;
    return (
        <Pressable
            onPress={onPress}
            accessibilityRole="button"
            accessibilityState={{ selected: !!active }}
            accessibilityLabel={accessibilityLabel ?? label}
            style={({ pressed }) => [
                { flexDirection: 'row', alignItems: 'center', gap: 6, height: small ? 34 : 40, paddingHorizontal: icon ? 6 : 16, paddingRight: 16, borderRadius: radius.pill, backgroundColor: background, opacity: pressed ? 0.8 : 1 },
                !active && shadow('card')
            ]}
        >
            {icon}
            <Txt size={small ? 13 : 14} weight="bold" color={ink}>
                {label}
            </Txt>
        </Pressable>
    );
};

export const Button: React.FC<{ label: string; onPress?: () => void; icon?: React.ReactNode; kind?: 'primary' | 'secondary' | 'danger' | 'ghost'; disabled?: boolean; busy?: boolean; style?: StyleProp<ViewStyle> }> = ({
    label,
    onPress,
    icon,
    kind = 'primary',
    disabled,
    busy,
    style
}) => {
    const colors = useColors();
    const background = kind === 'primary' ? colors.accent : kind === 'danger' ? colors.live : kind === 'secondary' ? colors.raised : 'transparent';
    const ink = kind === 'primary' || kind === 'danger' ? '#fff' : colors.ink;
    return (
        <Pressable
            onPress={onPress}
            disabled={disabled || busy}
            accessibilityRole="button"
            style={({ pressed }) => [{ height: 48, borderRadius: 16, backgroundColor: background, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 16, opacity: disabled ? 0.45 : pressed ? 0.85 : 1 }, style]}
        >
            {busy ? <ActivityIndicator color={ink} /> : icon}
            <Txt weight="extrabold" size={14} color={ink}>
                {label}
            </Txt>
        </Pressable>
    );
};

/** Escoger una opción entre pocas: para el lector de pantalla es un grupo de botones de radio */
export function Segmented<T extends string>({ value, options, onChange, small }: { value: T; options: { value: T; label: string }[]; onChange: (value: T) => void; small?: boolean }) {
    const colors = useColors();
    // El botón se ve de ~25 px (small) o ~32 px; crece hacia arriba y abajo (margen negativo) hasta ~44 px para el dedo
    // sin mover nada. Se sale del riel 6 px (small) o 3 px: si el padre recorta (un ScrollView horizontal), el padre
    // necesita ese espacio de sobra (paddingVertical y marginVertical negativo). role y aria-checked (no
    // accessibilityState): así también los lee la web.
    const reach = small ? 10 : 7;
    return (
        <View style={{ flexDirection: 'row', alignSelf: 'flex-start', backgroundColor: colors.raised, borderRadius: radius.pill, padding: 4 }} role="radiogroup">
            {options.map((option) => {
                const active = option.value === value;
                return (
                    <Pressable key={option.value} onPress={() => onChange(option.value)} role="radio" aria-checked={active} style={{ paddingVertical: reach, marginVertical: -reach }}>
                        <View style={[{ borderRadius: radius.pill, paddingHorizontal: small ? 12 : 16, paddingVertical: small ? 5 : 7 }, active && [{ backgroundColor: colors.surface }, shadow('card')]]}>
                            <Txt size={small ? 12 : 14} weight="semibold" tone={active ? 'ink' : 'muted'}>
                                {option.label}
                            </Txt>
                        </View>
                    </Pressable>
                );
            })}
        </View>
    );
}

export const IconButton: React.FC<{ onPress?: () => void; children: React.ReactNode; label: string; style?: StyleProp<ViewStyle> }> = ({ onPress, children, label, style }) => {
    const colors = useColors();
    return (
        <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => [{ width: 48, height: 48, borderRadius: 16, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 }, shadow('card'), style]}>
            {children}
        </Pressable>
    );
};

// ---------------------------------------------------------------- estados

export const Skeleton: React.FC<{ height: number; width?: ViewStyle['width']; style?: StyleProp<ViewStyle>; round?: number }> = ({ height, width = '100%', style, round = radius.card }) => {
    const colors = useColors();
    const reduce = useReduceMotion();
    const [pulse] = useState(() => new Animated.Value(0.5));
    useEffect(() => {
        if (reduce) return;
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: Platform.OS !== 'web' }),
                Animated.timing(pulse, { toValue: 0.5, duration: 700, useNativeDriver: Platform.OS !== 'web' })
            ])
        );
        loop.start();
        return () => loop.stop();
    }, [pulse, reduce]);
    // Con «Reducir movimiento» no late: se queda quieto a medio tono
    return <Animated.View style={[{ height, width, borderRadius: round, backgroundColor: colors.raised, opacity: reduce ? 0.75 : pulse }, style]} />;
};

export const ErrorState: React.FC<{ message: string; onRetry?: () => void }> = ({ message, onRetry }) => {
    const { t } = useTranslation();
    const colors = useColors();
    return (
        <Card style={{ alignItems: 'center', gap: 12, paddingVertical: 32 }}>
            <Txt tone="muted" center>
                {message}
            </Txt>
            {onRetry && (
                <Pressable onPress={onRetry} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 9 }}>
                    <RotateCw size={16} color="#fff" />
                    <Txt weight="semibold" size={14} tone="white">
                        {t('common.retry')}
                    </Txt>
                </Pressable>
            )}
        </Card>
    );
};

export const OfflineState: React.FC = () => {
    const { t } = useTranslation();
    const colors = useColors();
    return (
        <Card style={{ alignItems: 'center', gap: 8, paddingVertical: 32 }}>
            <WifiOff size={28} color={colors.faint} />
            <Txt weight="semibold">{t('offline.title')}</Txt>
            <Txt size={14} tone="muted" center style={{ maxWidth: 280 }}>
                {t('offline.notLoaded')}
            </Txt>
        </Card>
    );
};

export const EmptyState: React.FC<{ title: string; hint?: string; icon?: React.ReactNode }> = ({ title, hint, icon }) => (
    <Card style={{ alignItems: 'center', gap: 6, paddingVertical: 32 }}>
        {icon}
        <Txt weight="extrabold" center>
            {title}
        </Txt>
        {hint ? (
            <Txt size={14} tone="muted" center>
                {hint}
            </Txt>
        ) : null}
    </Card>
);

/** Mensaje de error de la API en el idioma de la app */
export const useErrorText = () => {
    const { t } = useTranslation();
    return (error: unknown) => {
        const code = (error as { code?: string })?.code ?? 'network';
        return t(`errors.${code}`, { defaultValue: t('errors.internal_error') });
    };
};

// ---------------------------------------------------------------- logos y fotos

export interface LogoTeam {
    id: number | null;
    abbrev?: string;
    logo?: string | null;
    color?: string | null;
    flag?: string | null;
}

/** Logo de mlbstatic (SVG); si no carga, la sigla en el color del equipo */
export const TeamLogo: React.FC<{ team: LogoTeam; size?: number }> = ({ team, size = 32 }) => {
    const [failed, setFailed] = useState(false);
    if (failed || !team.logo) {
        return (
            <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: team.color ?? '#2563eb', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#fff', fontFamily: fonts.bold, fontSize: size * 0.34 }}>{team.flag || team.abbrev || ''}</Text>
            </View>
        );
    }
    return <Image source={{ uri: team.logo }} style={{ width: size, height: size }} contentFit="contain" onError={() => setFailed(true)} cachePolicy="memory-disk" />;
};

const initials = (name: string) =>
    name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0])
        .join('')
        .toUpperCase();

/** Foto del pelotero con los mismos respaldos que la web: uniforme del equipo, MLB, MiLB e iniciales */
export const PlayerPhoto: React.FC<{ personId: number | null | undefined; name: string; size?: number; team?: LogoTeam | null; background?: string }> = ({ personId, name, size = 56, team, background }) => {
    const colors = useColors();
    const index = usePhotoIndex();
    const px = Math.min(480, Math.round(size * 2.5));
    const sources = React.useMemo(() => photoSources(personId, name, team?.id, index, px), [personId, name, team?.id, index, px]);
    // El respaldo que va es el de esta foto: si cambia la primera opción (otro pelotero), se vuelve a empezar
    const first = sources[0]?.url;
    const [miss, setMiss] = useState({ url: first, step: 0 });
    const step = miss.url === first ? miss.step : 0;
    const source = sources[step];
    const badge = team?.logo && size >= 44 ? Math.round(size * 0.36) : 0;
    return (
        <View style={{ width: size, height: size }}>
            {source ? (
                <Image
                    key={source.url}
                    source={{ uri: source.url }}
                    style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: source.kind === 'mlb' ? background ?? colors.raised : colors.raised }}
                    contentFit="cover"
                    contentPosition={source.kind === 'team' ? { top: '18%' } : 'center'}
                    cachePolicy="memory-disk"
                    onError={() => {
                        rememberMiss(source.kind, personId);
                        setMiss({ url: first, step: step + 1 });
                    }}
                />
            ) : (
                <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: team?.color ? alpha(team.color, 0.2) : colors.raised, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: team?.color ?? colors.muted, fontFamily: fonts.extrabold, fontSize: size * 0.32 }}>{initials(name)}</Text>
                </View>
            )}
            {badge > 0 && (
                <View style={[{ position: 'absolute', right: -2, bottom: -2, width: badge, height: badge, borderRadius: badge / 2, backgroundColor: '#fff', padding: Math.max(2, badge * 0.1), alignItems: 'center', justifyContent: 'center' }, shadow('card')]}>
                    <Image source={{ uri: team!.logo! }} style={{ width: '100%', height: '100%' }} contentFit="contain" />
                </View>
            )}
        </View>
    );
};

// ---------------------------------------------------------------- aviso corto

// Hojas abiertas, la última encima. En Android y la web el Modal de la hoja tapa la raíz: el aviso se pinta dentro de la
// de arriba. En iOS va en una capa nativa sobre toda la ventana, pero lo que UIKit presenta después (una hoja, un modal
// de Expo Router) queda encima de la capa: por eso se vuelve a montar (key nueva) cuando terminan de abrirse.
let openSheets: string[] = [];
let overlayTurn = 0;
const sheetListeners = new Set<() => void>();
const subscribeSheets = (listener: () => void) => {
    sheetListeners.add(listener);
    return () => sheetListeners.delete(listener);
};
const setOpenSheets = (next: string[]) => {
    openSheets = next;
    sheetListeners.forEach((listener) => listener());
};
/** iOS: vuelve a subir la capa del aviso encima de lo último que se presentó */
const raiseOverlay = () => {
    overlayTurn += 1;
    sheetListeners.forEach((listener) => listener());
};
const useTopSheet = () => useSyncExternalStore(subscribeSheets, () => openSheets[openSheets.length - 1] ?? null, () => null);
const useOverlayTurn = () => useSyncExternalStore(subscribeSheets, () => overlayTurn, () => 0);

const ToastBox: React.FC<{ bottom: number }> = ({ bottom }) => {
    const toast = useToast();
    const colors = useColors();
    const insets = useSafeAreaInsets();
    if (!toast) return null;
    return (
        <View pointerEvents="box-none" style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + bottom }}>
            <View accessibilityRole="alert" style={[{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.ink, borderRadius: radius.tile, padding: 12, paddingLeft: 16, maxWidth: 480, alignSelf: 'center', width: '100%' }, shadow('float')]}>
                <Txt size={14} weight="medium" color={colors.bg} style={{ flex: 1 }}>
                    {toast.text}
                </Txt>
                {toast.action && (
                    <Pressable
                        onPress={() => {
                            toast.action?.run();
                            hideToast();
                        }}
                        style={{ backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 }}
                    >
                        <Txt size={13} weight="semibold" tone="white">
                            {toast.action.label}
                        </Txt>
                    </Pressable>
                )}
                <Pressable onPress={hideToast} hitSlop={8}>
                    <X size={16} color={colors.bg} />
                </Pressable>
            </View>
        </View>
    );
};

/** El aviso global (va en la raíz, después del Stack): encima de la barra de abajo, de los modales y de las hojas */
export const Toast: React.FC = () => {
    const toast = useToast();
    const topSheet = useTopSheet();
    const turn = useOverlayTurn();
    const pathname = usePathname();
    // iOS: react-native-screens presenta el modal de Expo Router un instante después de cambiar la ruta; después de eso
    // se sube la capa (el aviso queda debajo del modal mientras sube, unos 0,4 s)
    useEffect(() => {
        if (Platform.OS !== 'ios') return;
        const timer = setTimeout(raiseOverlay, 400);
        return () => clearTimeout(timer);
    }, [pathname]);
    if (!toast) return null;
    // key: un aviso nuevo, una hoja que terminó de abrirse o un modal nuevo vuelven a montar la capa encima de todo.
    // No modal para VoiceOver: el resto de la pantalla se sigue pudiendo leer mientras está el aviso.
    if (Platform.OS === 'ios') {
        return (
            <FullWindowOverlay key={`${toast.id}-${turn}`} unstable_accessibilityContainerViewIsModal={false}>
                <ToastBox bottom={96} />
            </FullWindowOverlay>
        );
    }
    return topSheet ? null : <ToastBox bottom={96} />;
};

// ---------------------------------------------------------------- hoja que sube desde abajo

export const Sheet: React.FC<{ open: boolean; onClose: () => void; title: string; children: React.ReactNode; scroll?: boolean }> = ({ open, onClose, title, children, scroll = true }) => {
    const colors = useColors();
    const { t } = useTranslation();
    const id = useId();
    const topSheet = useTopSheet();
    useEffect(() => {
        if (!open) return;
        setOpenSheets([...openSheets, id]);
        return () => setOpenSheets(openSheets.filter((sheet) => sheet !== id));
    }, [open, id]);
    return (
        <Modal
            visible={open}
            animationType="slide"
            presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
            onRequestClose={onClose}
            // iOS: ya abierta, el aviso que estaba puesto vuelve a quedar encima
            onShow={Platform.OS === 'ios' ? raiseOverlay : undefined}
            transparent={false}
        >
            <View style={{ flex: 1, backgroundColor: colors.bg }}>
                <View style={{ alignItems: 'center', paddingTop: 8 }}>
                    <View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: colors.faint, opacity: 0.5 }} />
                </View>
                <Row justify="space-between" style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 }}>
                    <Txt size={20} weight="extrabold" numberOfLines={1} style={{ flex: 1 }}>
                        {title}
                    </Txt>
                    <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={t('common.close')} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.raised, alignItems: 'center', justifyContent: 'center' }}>
                        <X size={18} color={colors.ink} />
                    </Pressable>
                </Row>
                {scroll ? <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 16 }}>{children}</ScrollView> : <View style={{ flex: 1, padding: 16 }}>{children}</View>}
                {Platform.OS !== 'ios' && topSheet === id && <ToastBox bottom={24} />}
            </View>
        </Modal>
    );
};

// ---------------------------------------------------------------- PRO

export const ProBadge: React.FC = () => (
    <Gradient style={{ borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'center' }}>
        <Txt size={10} weight="extrabold" tone="white" style={{ letterSpacing: 1.4 }}>
            PRO
        </Txt>
    </Gradient>
);

export const styles = StyleSheet.create({
    screenPad: { paddingHorizontal: 16 }
});
