import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LogOut, Mail, Sparkles, User as UserRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AccountError, accountEnabled, authProviders, deleteAccount, saveName, sendCode, signInWithGoogle, signOut, useSession, verifyCode } from '../../lib/account';

// Cuenta: entrar con un código que llega al correo (sin contraseñas). Solo el Fantasy la pide; lo demás funciona sin ella.
// `purpose="fantasy"` cambia los textos para la puerta de entrada del Fantasy.
export const AccountCard: React.FC<{ compact?: boolean; purpose?: 'fantasy' }> = ({ compact = false, purpose }) => {
    const { t } = useTranslation();
    const session = useSession();
    const [email, setEmail] = useState('');
    const [code, setCode] = useState('');
    const [step, setStep] = useState<'email' | 'code'>('email');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [name, setName] = useState('');
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [google, setGoogle] = useState(false);
    useEffect(() => {
        let alive = true;
        authProviders().then((providers) => alive && setGoogle(providers.google));
        return () => {
            alive = false;
        };
    }, []);

    const fantasy = purpose === 'fantasy';

    if (!accountEnabled()) {
        return (
            <div className="card flex items-start gap-3 p-4">
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${fantasy ? 'bg-accent text-white' : 'bg-raised text-muted'}`}>
                    {fantasy ? <Sparkles className="h-5 w-5" /> : <UserRound className="h-5 w-5" />}
                </span>
                <span className="min-w-0">
                    <span className="block font-extrabold">{fantasy ? t('fantasy.gate.soonTitle') : t('account.title')}</span>
                    <span className="block text-sm text-muted">{fantasy ? t('fantasy.gate.soonText') : t('account.soon')}</span>
                </span>
            </div>
        );
    }

    const fail = (err: unknown) => setError(t(`account.errors.${err instanceof AccountError ? err.code : 'unknown'}`));

    if (session) {
        return (
            <div className="card space-y-3 p-4">
                <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent text-lg font-extrabold text-white">
                        {(session.name || session.user.email)[0]?.toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                        <span className="block truncate font-extrabold">{session.name || session.user.email.split('@')[0]}</span>
                        <span className="block truncate text-sm text-muted">{session.user.email}</span>
                    </span>
                    <button type="button" onClick={() => signOut()} className="flex h-10 items-center gap-1.5 rounded-full bg-raised px-3 text-sm font-semibold" aria-label={t('account.signOut')}>
                        <LogOut className="h-4 w-4" />
                        {!compact && t('account.signOut')}
                    </button>
                </div>
                {!compact && (
                    <form
                        className="flex gap-2"
                        onSubmit={async (event) => {
                            event.preventDefault();
                            if (!name.trim()) return;
                            setBusy(true);
                            await saveName(name).catch(fail);
                            setBusy(false);
                            setName('');
                        }}
                    >
                        <label htmlFor="account-name" className="sr-only">
                            {t('account.name')}
                        </label>
                        <input
                            id="account-name"
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            maxLength={30}
                            placeholder={t('account.namePlaceholder')}
                            className="h-11 min-w-0 flex-1 rounded-2xl bg-raised px-4 text-sm outline-none focus:ring-2 focus:ring-accent"
                        />
                        <button type="submit" disabled={busy || !name.trim()} className="h-11 rounded-2xl bg-ink px-4 text-sm font-bold text-bg disabled:opacity-40">
                            {t('account.saveName')}
                        </button>
                    </form>
                )}
                {!compact &&
                    (confirmDelete ? (
                        <div className="space-y-2 rounded-2xl bg-live/10 p-3" role="alert">
                            <p className="text-sm font-semibold text-live">{t('account.deleteConfirm')}</p>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    disabled={busy}
                                    onClick={async () => {
                                        setBusy(true);
                                        await deleteAccount().catch(fail);
                                        setBusy(false);
                                        setConfirmDelete(false);
                                    }}
                                    className="h-10 flex-1 rounded-full bg-live text-sm font-extrabold text-white disabled:opacity-50"
                                >
                                    {t('account.deleteYes')}
                                </button>
                                <button type="button" onClick={() => setConfirmDelete(false)} className="h-10 flex-1 rounded-full bg-surface text-sm font-bold">
                                    {t('account.deleteNo')}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <button type="button" onClick={() => setConfirmDelete(true)} className="text-sm font-semibold text-muted underline-offset-2 hover:underline">
                            {t('account.delete')}
                        </button>
                    ))}
                {error && <p className="text-sm font-semibold text-live">{error}</p>}
            </div>
        );
    }

    return (
        <form
            className="card space-y-3 p-4"
            onSubmit={async (event) => {
                event.preventDefault();
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
            }}
        >
            <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent text-white">
                    <Mail className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                    <span className="block font-extrabold">{fantasy ? t('fantasy.gate.joinTitle') : t('account.join')}</span>
                    <span className="block text-sm text-muted">{step === 'code' ? t('account.codeSent', { email }) : fantasy ? t('fantasy.gate.joinWhy') : t('account.why')}</span>
                </span>
            </div>
            {step === 'email' && google && (
                <>
                    <button type="button" onClick={signInWithGoogle} className="flex h-12 w-full items-center justify-center gap-3 rounded-2xl border border-line/15 bg-surface text-sm font-extrabold shadow-card">
                        <GoogleMark />
                        {t('account.google')}
                    </button>
                    <p className="flex items-center gap-3 text-xs font-semibold text-muted">
                        <span className="h-px flex-1 bg-line/15" />
                        {t('account.orEmail')}
                        <span className="h-px flex-1 bg-line/15" />
                    </p>
                </>
            )}
            {step === 'email' ? (
                <>
                    <label htmlFor="account-email" className="sr-only">
                        {t('account.email')}
                    </label>
                    <input
                        id="account-email"
                        type="email"
                        required
                        autoComplete="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        placeholder={t('account.emailPlaceholder')}
                        className="h-12 w-full rounded-2xl bg-raised px-4 text-[15px] outline-none focus:ring-2 focus:ring-accent"
                    />
                </>
            ) : (
                <>
                    <label htmlFor="account-code" className="sr-only">
                        {t('account.code')}
                    </label>
                    <input
                        id="account-code"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        pattern="[0-9]{6,8}"
                        required
                        value={code}
                        onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
                        placeholder="123456"
                        className="h-12 w-full rounded-2xl bg-raised px-4 text-center text-xl font-bold tracking-[0.4em] outline-none focus:ring-2 focus:ring-accent"
                    />
                </>
            )}
            {error && <p className="text-sm font-semibold text-live">{error}</p>}
            <div className="flex gap-2">
                {step === 'code' && (
                    <button type="button" onClick={() => setStep('email')} className="h-12 rounded-2xl bg-raised px-4 text-sm font-semibold">
                        {t('account.back')}
                    </button>
                )}
                <button type="submit" disabled={busy} className="h-12 flex-1 rounded-2xl bg-accent text-sm font-extrabold text-white disabled:opacity-50">
                    {busy ? '…' : step === 'email' ? t('account.sendCode') : t('account.enter')}
                </button>
            </div>
            <p className="text-xs text-muted">
                {t('account.optional')}{' '}
                <Link to="/privacidad" className="font-semibold text-accent-ink">
                    {t('privacy.title')}
                </Link>
            </p>
        </form>
    );
};

/** La «G» de Google en sus colores (lo piden sus normas de marca para el botón) */
const GoogleMark: React.FC = () => (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
        <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
        <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
        <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
);
