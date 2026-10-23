import React from 'react';
import { RefreshCw } from 'lucide-react';
import i18n from '../../i18n';
import { reportError } from '../../lib/errorReport';

interface State {
    failed: boolean;
}

/**
 * Si una pantalla se rompe al pintarse, se dice claro y se ofrece recargar (en vez de una pantalla en blanco), y el
 * error se reporta. Al cambiar de página (`resetKey`) se vuelve a intentar.
 */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode; resetKey?: string }, State> {
    state: State = { failed: false };

    static getDerivedStateFromError(): State {
        return { failed: true };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        reportError(error.message, `${error.stack || ''}\n${info.componentStack || ''}`);
    }

    componentDidUpdate(previous: { resetKey?: string }) {
        if (this.state.failed && previous.resetKey !== this.props.resetKey) this.setState({ failed: false });
    }

    render() {
        if (!this.state.failed) return this.props.children;
        return (
            <div className="px-4 pt-6">
                <div className="card flex flex-col items-center gap-3 px-6 py-10 text-center" role="alert">
                    <p className="text-lg font-extrabold">{i18n.t('errors.screen')}</p>
                    <p className="max-w-xs text-sm text-muted">{i18n.t('errors.screenHint')}</p>
                    <button type="button" onClick={() => window.location.reload()} className="mt-1 inline-flex h-11 items-center gap-2 rounded-full bg-accent px-5 text-sm font-bold text-white">
                        <RefreshCw className="h-4 w-4" /> {i18n.t('errors.reload')}
                    </button>
                </div>
            </div>
        );
    }
}
