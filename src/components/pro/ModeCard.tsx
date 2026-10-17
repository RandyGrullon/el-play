// «Más» → modo de la app. Lite es el de siempre; PRO suma estadísticas y pide la cuenta abierta.
import React from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { BarChart3, Gauge, Table2, Trophy } from 'lucide-react-native';
import { accountEnabled, useSession } from '../../lib/account';
import { setUiMode, useUiMode, type UiMode } from '../../lib/pro';
import { useColors } from '../../theme/theme';
import { Card, Gradient, ProBadge, Row, Segmented, Txt } from '../ui';

export const ModeCard: React.FC = () => {
    const { t } = useTranslation();
    const colors = useColors();
    const session = useSession();
    const mode = useUiMode();
    const canUse = accountEnabled() && !!session;
    const perks = [
        { Icon: Table2, text: t('pro.perks.stats') },
        { Icon: Gauge, text: t('pro.perks.live') },
        { Icon: BarChart3, text: t('pro.perks.standings') },
        { Icon: Trophy, text: t('pro.perks.fantasy') }
    ];

    return (
        <Card style={{ gap: 12 }}>
            <Row justify="space-between" gap={12} wrap>
                <Row gap={8}>
                    <Txt weight="semibold">{t('pro.title')}</Txt>
                    {mode === 'pro' && <ProBadge />}
                </Row>
                <Segmented<UiMode>
                    small
                    value={mode}
                    onChange={(next) => session && canUse && setUiMode(session.user.id, next)}
                    options={[
                        { value: 'lite', label: 'Lite' },
                        { value: 'pro', label: 'PRO' }
                    ]}
                />
            </Row>
            <Txt size={14} tone="muted">
                {mode === 'pro' ? t('pro.hintPro') : t('pro.hintLite')}
            </Txt>
            {!canUse && (
                <Txt size={14} weight="semibold" tone="accentInk">
                    {accountEnabled() ? t('pro.needsAccount') : t('pro.soon')}
                </Txt>
            )}
            <View style={{ gap: 8 }}>
                {perks.map(({ Icon, text }) => (
                    <Row key={text} gap={10} style={{ borderRadius: 16, backgroundColor: colors.raised, paddingHorizontal: 12, paddingVertical: 10 }}>
                        <Gradient style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }}>
                            <Icon size={14} color="#fff" />
                        </Gradient>
                        <Txt size={14} weight="semibold" style={{ flex: 1 }}>
                            {text}
                        </Txt>
                    </Row>
                ))}
            </View>
        </Card>
    );
};
