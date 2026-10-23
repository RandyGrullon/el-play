// Cuenta: entrar con un código que llega al correo (sin contraseñas) o con Google. Solo el Fantasy la pide;
// lo demás funciona sin ella. `purpose="fantasy"` cambia los textos para la portada del Fantasy.
import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { LogOut, Mail, Sparkles, UserRound } from 'lucide-react-native';
import { AccountError, accountEnabled, appleAvailable, authProviders, deleteAccount, googleAllowed, saveName, sendCode, signInWithApple, signInWithGoogle, signOut, useSession, verifyCode, type Session } from '../../lib/account';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useColors, useTheme } from '../../theme/theme';
import { alpha, fonts, radius, shadow } from '../../theme/tokens';
import { Button, Card, Row, Txt } from '../ui';
import { Field, FieldButton } from './Field';
import { GoogleMark } from './GoogleMark';
import { LoginMethods } from './LoginMethods';

const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

/** Cuadro con el ícono de la tarjeta (acento o gris) */
const IconBox: React.FC<{ children: React.ReactNode; accent?: boolean }> = ({ children, accent }) => {
    const colors = useColors();
    return <View style={{ width: 44, height: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: accent ? colors.accent : colors.raised }}>{children}</View>;
};

export const AccountCard: React.FC<{ compact?: boolean; purpose?: 'fantasy' }> = ({ compact = false, purpose }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const session = useSession();

    const fantasy = purpose === 'fantasy';

    if (!accountEnabled()) {
        return (
            <Card>
                <Row gap={12} align="flex-start">
                    <IconBox accent={fantasy}>{fantasy ? <Sparkles size={20} color="#fff" /> : <UserRound size={20} color={colors.muted} />}</IconBox>
                    <View style={{ flex: 1, minWidth: 0 }}>
                        <Txt weight="extrabold">{fantasy ? t('fantasy.gate.soonTitle') : t('account.title')}</Txt>
                        <Txt size={14} tone="muted">
                            {fantasy ? t('fantasy.gate.soonText') : t('account.soon')}
                        </Txt>
                    </View>
                </Row>
            </Card>
        );
    }

    // Cada estado en su propio componente: al entrar o salir se empieza de cero (correo vacío, sin código)
    return session ? <SignedIn session={session} compact={compact} /> : <SignIn fantasy={fantasy} />;
};

// ---------------------------------------------------------------- con la cuenta abierta
const SignedIn: React.FC<{ session: Session; compact: boolean }> = ({ session, compact }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [name, setName] = useState('');
    const [confirmDelete, setConfirmDelete] = useState(false);
    const fail = (err: unknown) => setError(t(`account.errors.${err instanceof AccountError ? err.code : 'unknown'}`));

    const display = session.name || session.user.email.split('@')[0];
    const submitName = async () => {
        if (!name.trim()) return;
        setError(null);
        setBusy(true);
        await saveName(name).catch(fail);
        setBusy(false);
        setName('');
    };
    return (
        <Card style={{ gap: 12 }}>
            <Row gap={12}>
                <View style={{ width: 44, height: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent }}>
                    <Txt size={18} weight="extrabold" tone="white">
                        {(session.name || session.user.email)[0]?.toUpperCase()}
                    </Txt>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Txt weight="extrabold" numberOfLines={1}>
                        {display}
                    </Txt>
                    <Txt size={14} tone="muted" numberOfLines={1}>
                        {session.user.email}
                    </Txt>
                </View>
                <Pressable
                    onPress={() => signOut()}
                    accessibilityRole="button"
                    accessibilityLabel={t('account.signOut')}
                    style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: colors.raised, opacity: pressed ? 0.8 : 1 })}
                >
                    <LogOut size={16} color={colors.ink} />
                    {!compact && (
                        <Txt size={14} weight="semibold">
                            {t('account.signOut')}
                        </Txt>
                    )}
                </Pressable>
            </Row>
            {!compact && (
                <Row gap={8}>
                    <Field
                        value={name}
                        onChangeText={setName}
                        maxLength={30}
                        placeholder={t('account.namePlaceholder')}
                        accessibilityLabel={t('account.name')}
                        autoCapitalize="words"
                        returnKeyType="done"
                        onSubmitEditing={submitName}
                        style={{ flex: 1 }}
                    />
                    <FieldButton label={t('account.saveName')} onPress={submitName} disabled={!name.trim()} busy={busy && !confirmDelete} />
                </Row>
            )}
            {!compact && <LoginMethods userId={session.user.id} email={session.user.email} />}
            {!compact &&
                (confirmDelete ? (
                    <View accessibilityRole="alert" style={{ gap: 8, borderRadius: 16, padding: 12, backgroundColor: alpha(colors.live, 0.1) }}>
                        <Txt size={14} weight="semibold" color={colors.live}>
                            {t('account.deleteConfirm')}
                        </Txt>
                        <Row gap={8}>
                            <Pressable
                                disabled={busy}
                                accessibilityRole="button"
                                onPress={async () => {
                                    setBusy(true);
                                    await deleteAccount().catch(fail);
                                    setBusy(false);
                                    setConfirmDelete(false);
                                }}
                                style={({ pressed }) => ({ flex: 1, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.live, opacity: busy ? 0.5 : pressed ? 0.85 : 1 })}
                            >
                                <Txt size={14} weight="extrabold" tone="white">
                                    {t('account.deleteYes')}
                                </Txt>
                            </Pressable>
                            <Pressable
                                accessibilityRole="button"
                                onPress={() => setConfirmDelete(false)}
                                style={({ pressed }) => ({ flex: 1, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, opacity: pressed ? 0.85 : 1 })}
                            >
                                <Txt size={14} weight="bold">
                                    {t('account.deleteNo')}
                                </Txt>
                            </Pressable>
                        </Row>
                    </View>
                ) : (
                    <Pressable onPress={() => setConfirmDelete(true)} accessibilityRole="button" hitSlop={8} style={{ alignSelf: 'flex-start' }}>
                        <Txt size={14} weight="semibold" tone="muted">
                            {t('account.delete')}
                        </Txt>
                    </Pressable>
                ))}
            {error && (
                <Txt size={14} weight="semibold" color={colors.live}>
                    {error}
                </Txt>
            )}
        </Card>
    );
};

// ---------------------------------------------------------------- entrar: correo → código
const SignIn: React.FC<{ fantasy: boolean }> = ({ fantasy }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [code, setCode] = useState('');
    const [step, setStep] = useState<'email' | 'code'>('email');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [google, setGoogle] = useState(false);
    const [googleBusy, setGoogleBusy] = useState(false);
    const [apple, setApple] = useState(false);
    const { isDark } = useTheme();
    useEffect(() => {
        let alive = true;
        // En iOS no se ofrece Google hasta tener «Iniciar sesión con Apple» (regla 4.8)
        authProviders().then((providers) => alive && setGoogle(providers.google && googleAllowed(providers)));
        appleAvailable().then((available) => alive && setApple(available));
        return () => {
            alive = false;
        };
    }, []);
    const fail = (err: unknown) => setError(t(`account.errors.${err instanceof AccountError ? err.code : 'unknown'}`));

    const ready = step === 'email' ? validEmail(email) : /^\d{6,8}$/.test(code);
    const submit = async () => {
        if (!ready || busy) return;
        setError(null);
        setBusy(true);
        try {
            if (step === 'email') {
                await sendCode(email.trim());
                setStep('code');
            } else {
                await verifyCode(email.trim(), code.trim());
            }
        } catch (err) {
            fail(err);
        } finally {
            setBusy(false);
        }
    };
    const withApple = async () => {
        setError(null);
        const result = await signInWithApple().catch(() => 'error' as const);
        if (result === 'error') setError(t('account.errors.unknown'));
    };
    const withGoogle = async () => {
        setError(null);
        setGoogleBusy(true);
        const result = await signInWithGoogle().catch(() => 'error' as const);
        setGoogleBusy(false);
        if (result === 'error') setError(t('account.errors.unknown'));
    };

    return (
        <Card style={{ gap: 12 }}>
            <Row gap={12} align="flex-start">
                <IconBox accent>
                    <Mail size={20} color="#fff" />
                </IconBox>
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Txt weight="extrabold">{fantasy ? t('fantasy.gate.joinTitle') : t('account.join')}</Txt>
                    <Txt size={14} tone="muted">
                        {step === 'code' ? t('account.codeSent', { email: email.trim() }) : fantasy ? t('fantasy.gate.joinWhy') : t('account.why')}
                    </Txt>
                </View>
            </Row>
            {step === 'email' && apple && (
                <AppleAuthentication.AppleAuthenticationButton
                    buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                    buttonStyle={isDark ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                    cornerRadius={16}
                    style={{ height: 48, width: '100%' }}
                    onPress={withApple}
                />
            )}
            {step === 'email' && apple && !google && (
                <Row gap={12}>
                    <View style={{ flex: 1, height: 1, backgroundColor: colors.line }} />
                    <Txt size={12} weight="semibold" tone="muted">
                        {t('account.orEmail')}
                    </Txt>
                    <View style={{ flex: 1, height: 1, backgroundColor: colors.line }} />
                </Row>
            )}
            {step === 'email' && google && (
                <>
                    <Pressable
                        onPress={withGoogle}
                        disabled={googleBusy}
                        accessibilityRole="button"
                        style={({ pressed }) => [
                            { height: 48, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, opacity: googleBusy ? 0.6 : pressed ? 0.85 : 1 },
                            shadow('card')
                        ]}
                    >
                        <GoogleMark />
                        <Txt size={14} weight="extrabold">
                            {t('account.google')}
                        </Txt>
                    </Pressable>
                    <Row gap={12}>
                        <View style={{ flex: 1, height: 1, backgroundColor: colors.line }} />
                        <Txt size={12} weight="semibold" tone="muted">
                            {t('account.orEmail')}
                        </Txt>
                        <View style={{ flex: 1, height: 1, backgroundColor: colors.line }} />
                    </Row>
                </>
            )}
            {step === 'email' ? (
                <Field
                    key="email"
                    value={email}
                    onChangeText={setEmail}
                    placeholder={t('account.emailPlaceholder')}
                    accessibilityLabel={t('account.email')}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="email"
                    textContentType="emailAddress"
                    returnKeyType="send"
                    onSubmitEditing={submit}
                    height={48}
                />
            ) : (
                <Field
                    key="code"
                    value={code}
                    onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 8))}
                    placeholder="123456"
                    accessibilityLabel={t('account.code')}
                    keyboardType="number-pad"
                    autoComplete="one-time-code"
                    textContentType="oneTimeCode"
                    returnKeyType="done"
                    onSubmitEditing={submit}
                    autoFocus
                    height={48}
                    style={{ textAlign: 'center', fontSize: 20, fontFamily: fonts.bold, letterSpacing: 8 }}
                />
            )}
            {error && (
                <Txt size={14} weight="semibold" color={colors.live}>
                    {error}
                </Txt>
            )}
            <Row gap={8}>
                {step === 'code' && (
                    <Button
                        kind="secondary"
                        label={t('account.back')}
                        onPress={() => {
                            setStep('email');
                            setCode('');
                            setError(null);
                        }}
                    />
                )}
                <Button label={step === 'email' ? t('account.sendCode') : t('account.enter')} onPress={submit} busy={busy} disabled={!ready} style={{ flex: 1 }} />
            </Row>
            <Txt size={12} tone="muted">
                {t('account.optional')}{' '}
                <Txt size={12} weight="semibold" tone="accentInk" onPress={() => router.push('/privacidad')} accessibilityRole="link">
                    {t('privacy.title')}
                </Txt>
            </Txt>
        </Card>
    );
};
