import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LogOut, Mail, Sparkles, User as UserRound } from 'lucide-react';
import { AccountError, accountEnabled, saveName, sendCode, signOut, useSession, verifyCode } from '../../lib/account';

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
            <p className="text-xs text-muted">{t('account.optional')}</p>
        </form>
    );
};
