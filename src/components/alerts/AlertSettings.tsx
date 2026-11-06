// Más → «Avisos» (igual que AlertSettings de MorePage en la web): qué avisos quiere y si llegan con la app cerrada.
// En el teléfono, los de 10 minutos antes y el playball se programan y llegan con la app cerrada; el resultado final y
// el juego sin hit salen cuando la app ve el juego (falta el push del servidor para que lleguen con la app cerrada).
import React, { useEffect, useState } from 'react';
import { Linking, Pressable, Switch, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ALERT_KINDS } from '../../lib/gameAlerts';
import { ensurePermission, usePreferences } from '../../state/preferences';
import { useColors } from '../../theme/theme';
import { Card, Txt } from '../ui';
import { recheckPermission, useNotificationPermission } from '../pro/mas/notifications';

const STATUS = { granted: 'on', default: 'off', denied: 'blocked', unsupported: 'unsupported' } as const;

export const AlertSettings: React.FC = () => {
    const { t } = useTranslation();
    const colors = useColors();
    const { alertKinds, setAlertKind, syncAlerts } = usePreferences();
    const permission = useNotificationPermission();
    // Hasta que el teléfono responda no se sabe si ya se dio el permiso
    const [checked, setChecked] = useState(permission === 'unsupported');
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        let alive = true;
        recheckPermission().finally(() => {
            if (alive) setChecked(true);
        });
        return () => {
            alive = false;
        };
    }, []);
    const status = checked ? STATUS[permission] : 'checking';

    const enable = async () => {
        setBusy(true);
        try {
            const granted = await ensurePermission();
            await recheckPermission();
            // El playball de tu equipo se programa ahora que hay permiso
            if (granted) syncAlerts();
        } catch {
            /* sin respuesta del teléfono: queda como estaba */
        } finally {
            setBusy(false);
        }
    };

    const pill = (label: string, onPress: () => void) => (
        <Pressable
            onPress={onPress}
            disabled={busy}
            accessibilityRole="button"
            accessibilityState={{ busy }}
            style={({ pressed }) => ({ marginTop: 4, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.ink, opacity: pressed || busy ? 0.75 : 1 })}
        >
            <Txt size={14} weight="bold" color={colors.bg}>
                {label}
            </Txt>
        </Pressable>
    );

    return (
        <View style={{ gap: 8 }}>
            <Txt eyebrow accessibilityRole="header">
                {t('alertsMore.title')}
            </Txt>
            <View style={{ gap: 12 }}>
                <Card padded={false} style={{ overflow: 'hidden' }}>
                    {ALERT_KINDS.map((kind, index) => (
                        <View key={kind} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: index ? 1 : 0, borderTopColor: colors.line }}>
                            <View style={{ flex: 1, minWidth: 0 }}>
                                <Txt weight="semibold">{t(`alertsMore.kinds.${kind}`)}</Txt>
                                <Txt size={12} tone="muted">
                                    {t(`alertsMore.hints.${kind}`)}
                                </Txt>
                            </View>
                            <Switch
                                value={alertKinds[kind]}
                                onValueChange={(on) => setAlertKind(kind, on)}
                                accessibilityLabel={t(`alertsMore.kinds.${kind}`)}
                                accessibilityHint={t(`alertsMore.hints.${kind}`)}
                                trackColor={{ false: colors.raised, true: colors.accent }}
                                ios_backgroundColor={colors.raised}
                                thumbColor="#fff"
                            />
                        </View>
                    ))}
                </Card>
                <Card style={{ gap: 8 }}>
                    <Txt size={14} weight="semibold">
                        {t('alertsMore.closed')}
                    </Txt>
                    <Txt size={14} tone="muted" accessibilityLiveRegion="polite">
                        {t(`alertsMore.status.${status}`)}
                    </Txt>
                    {status === 'off' && pill(t('alertsMore.enable'), () => void enable())}
                    {status === 'blocked' && pill(t('alertsMore.settings'), () => void Linking.openSettings().catch(() => undefined))}
                    <Txt size={12} tone="faint">
                        {t('alertsMore.how')}
                    </Txt>
                </Card>
            </View>
        </View>
    );
};
