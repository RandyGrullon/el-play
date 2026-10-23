// «Formas de entrar» de la cuenta abierta: el correo (siempre sirve: el código llega ahí) y Google, vinculada o con
// el botón para vincularla. Con el mismo correo Supabase las une solo; vincular aquí sirve para un Google con otro correo.
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Check, Mail } from 'lucide-react-native';
import { AccountError, authProviders, googleAllowed } from '../../lib/account';
import { showToast } from '../../lib/toast';
import { useColors } from '../../theme/theme';
import { alpha, radius } from '../../theme/tokens';
import { Row, Skeleton, Txt } from '../ui';
import { useLocalText, type TextKey } from '../fantasy/texts';
import { GoogleMark } from './GoogleMark';
import { getIdentities, linkGoogle, linkingOff, unlinkIdentity } from './identities';

// Errores con texto propio en la tarjeta (los demás dicen el genérico)
const METHOD_ERRORS = new Set<string>(['session_expired', 'linking_disabled', 'identity_taken', 'last_identity', 'rate_limit', 'network', 'link_other_account']);
const errorKey = (err: unknown) => `methods.errors.${err instanceof AccountError && METHOD_ERRORS.has(err.code) ? err.code : 'unknown'}` as TextKey;

export const LoginMethods: React.FC<{ userId: string; email: string }> = ({ userId, email }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const L = useLocalText();
    const identities = useQuery({ queryKey: ['account-identities', userId], queryFn: getIdentities, retry: 1, staleTime: 30000 });
    const providers = useQuery({ queryKey: ['auth-providers'], queryFn: authProviders, staleTime: Infinity });
    const [busy, setBusy] = useState<'link' | 'unlink' | null>(null);
    const [confirmUnlink, setConfirmUnlink] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // Supabase dijo que vincular está apagado: se esconden Vincular y Desvincular (un día, como la web)
    const [linkOff, setLinkOff] = useState(linkingOff);
    const fail = (err: unknown) => {
        if (err instanceof AccountError && err.code === 'linking_disabled') setLinkOff(true);
        setError(L(errorKey(err)));
    };

    const list = identities.data;
    const googleIdentity = list?.find((identity) => identity.provider === 'google');
    // En iOS no se ofrece Google (regla 4.8 de Apple); si ya estaba vinculada, igual se ve y se puede quitar
    const google = !!providers.data?.google && googleAllowed(providers.data);
    const showGoogle = !!googleIdentity || (google && !linkOff);
    const canLink = google && !linkOff && !googleIdentity;
    const loadError = identities.isError && !list;

    const link = async () => {
        setError(null);
        setBusy('link');
        try {
            if ((await linkGoogle()) === 'linked') {
                showToast(L('methods.linked'));
                await identities.refetch();
            }
        } catch (err) {
            fail(err);
        } finally {
            setBusy(null);
        }
    };
    const unlink = async () => {
        if (!googleIdentity) return;
        setBusy('unlink');
        try {
            await unlinkIdentity(googleIdentity.id);
            showToast(L('methods.unlinked'));
            await identities.refetch();
        } catch (err) {
            fail(err);
        } finally {
            setBusy(null);
            setConfirmUnlink(false);
        }
    };

    const iconBox = { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface } as const;
    const pill = (background: string) => ({ height: 32, paddingHorizontal: 12, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: background }) as const;

    return (
        <View style={{ gap: 8 }}>
            <Txt eyebrow accessibilityRole="header">
                {L('methods.title')}
            </Txt>
            <View style={{ borderRadius: 16, backgroundColor: colors.raised, overflow: 'hidden' }}>
                <Row gap={12} style={{ paddingHorizontal: 12, paddingVertical: 10 }}>
                    <View style={iconBox}>
                        <Mail size={18} color={colors.muted} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                        <Txt size={14} weight="bold">
                            {L('methods.email')}
                        </Txt>
                        <Txt size={12} tone="muted" numberOfLines={1}>
                            {email}
                        </Txt>
                    </View>
                    <Check size={20} color={colors.ball} accessibilityLabel={L('methods.active')} />
                </Row>
                {identities.isPending && (
                    <Row gap={12} style={{ paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.line }}>
                        <Skeleton height={36} width={36} round={12} />
                        <View style={{ flex: 1, gap: 6 }}>
                            <Skeleton height={14} width={64} round={7} />
                            <Skeleton height={12} width={112} round={6} />
                        </View>
                    </Row>
                )}
                {list && showGoogle && (
                    <Row gap={12} align={googleIdentity ? 'flex-start' : 'center'} style={{ paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.line }}>
                        <View style={iconBox}>
                            <GoogleMark />
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                            <Row gap={6}>
                                <Txt size={14} weight="bold">
                                    Google
                                </Txt>
                                {googleIdentity && (
                                    <Txt size={12} weight="semibold" color={colors.ball}>
                                        {L('methods.linkedBadge')}
                                    </Txt>
                                )}
                            </Row>
                            <Txt size={12} tone="muted" numberOfLines={1}>
                                {googleIdentity ? googleIdentity.email || email : L('methods.notLinked')}
                            </Txt>
                            {/* Debajo del correo para que este quepa entero; solo si queda otra forma de entrar */}
                            {googleIdentity && list.length > 1 && !linkOff && !confirmUnlink && (
                                <Pressable
                                    disabled={!!busy}
                                    onPress={() => {
                                        setError(null);
                                        setConfirmUnlink(true);
                                    }}
                                    accessibilityRole="button"
                                    style={({ pressed }) => [pill(colors.surface), { alignSelf: 'flex-start', marginTop: 8, opacity: busy ? 0.5 : pressed ? 0.8 : 1 }]}
                                >
                                    <Txt size={12} weight="bold">
                                        {L('methods.unlink')}
                                    </Txt>
                                </Pressable>
                            )}
                        </View>
                        {googleIdentity ? (
                            <Check size={20} color={colors.ball} accessibilityLabel={L('methods.active')} style={{ marginTop: 8 }} />
                        ) : canLink ? (
                            <Pressable
                                disabled={!!busy}
                                onPress={link}
                                accessibilityRole="button"
                                accessibilityLabel={L('methods.linkGoogle')}
                                style={({ pressed }) => [pill(colors.accent), { height: 36, paddingHorizontal: 14, opacity: busy ? 0.5 : pressed ? 0.85 : 1 }]}
                            >
                                <Txt size={13} weight="extrabold" tone="white">
                                    {busy === 'link' ? '…' : L('methods.link')}
                                </Txt>
                            </Pressable>
                        ) : null}
                    </Row>
                )}
            </View>
            {confirmUnlink && googleIdentity && (
                <View accessibilityRole="alert" style={{ gap: 8, borderRadius: 16, padding: 12, backgroundColor: alpha(colors.live, 0.1) }}>
                    <Txt size={14} weight="semibold" color={colors.live}>
                        {L('methods.unlinkConfirm')}
                    </Txt>
                    <Row gap={8}>
                        <Pressable disabled={!!busy} onPress={unlink} accessibilityRole="button" style={({ pressed }) => [pill(colors.live), { flex: 1, height: 40, opacity: busy ? 0.5 : pressed ? 0.85 : 1 }]}>
                            <Txt size={14} weight="extrabold" tone="white">
                                {busy === 'unlink' ? '…' : L('methods.unlinkYes')}
                            </Txt>
                        </Pressable>
                        <Pressable disabled={!!busy} onPress={() => setConfirmUnlink(false)} accessibilityRole="button" style={({ pressed }) => [pill(colors.surface), { flex: 1, height: 40, opacity: pressed ? 0.85 : 1 }]}>
                            <Txt size={14} weight="bold">
                                {t('account.deleteNo')}
                            </Txt>
                        </Pressable>
                    </Row>
                </View>
            )}
            {list && canLink && (
                <Txt size={12} tone="muted">
                    {L('methods.sameEmail')}
                </Txt>
            )}
            {(error || loadError) && (
                <Txt size={14} weight="semibold" color={colors.live} accessibilityRole="alert">
                    {error ?? L(errorKey(identities.error))}{' '}
                    {loadError && (
                        <Txt
                            size={14}
                            weight="bold"
                            tone="accentInk"
                            accessibilityRole="button"
                            onPress={() => {
                                setError(null);
                                identities.refetch();
                            }}
                        >
                            {t('common.retry')}
                        </Txt>
                    )}
                </Txt>
            )}
        </View>
    );
};
