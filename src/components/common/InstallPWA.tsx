import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Share, PlusSquare, X } from 'lucide-react';
import { useLeague } from '../../store/LeagueContext';

export const InstallPWA: React.FC = () => {
    const { t } = useTranslation();
    const { leagueConfig } = useLeague();
    const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
    const [isVisible, setIsVisible] = useState(false);
    const [isIOS, setIsIOS] = useState(false);
    const [showIOSInstructions, setShowIOSInstructions] = useState(false);

    useEffect(() => {
        // Check if it's iOS
        const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
        setIsIOS(isIOSDevice);

        // Check if already installed (standalone mode)
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;

        if (isIOSDevice && !isStandalone) {
            setIsVisible(true);
        }

        const handler = (e: any) => {
            // Prevent the mini-infobar from appearing on mobile
            e.preventDefault();
            // Stash the event so it can be triggered later.
            setDeferredPrompt(e);
            // Update UI notify the user they can install the PWA
            setIsVisible(true);
        };

        window.addEventListener('beforeinstallprompt', handler);

        return () => {
            window.removeEventListener('beforeinstallprompt', handler);
        };
    }, []);

    const handleInstallClick = async () => {
        if (isIOS) {
            setShowIOSInstructions(true);
            return;
        }

        if (!deferredPrompt) return;

        // Show the install prompt
        deferredPrompt.prompt();

        // Wait for the user to respond to the prompt
        const { outcome } = await deferredPrompt.userChoice;

        if (outcome === 'accepted') {
            console.log('User accepted the install prompt');
        } else {
            console.log('User dismissed the install prompt');
        }

        // We've used the prompt, and can't use it again, throw it away
        setDeferredPrompt(null);
        setIsVisible(false);
    };

    if (!isVisible) return null;

    return (
        <>
            <button
                onClick={handleInstallClick}
                className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full transition-all duration-300 animate-in fade-in zoom-in"
                style={{
                    color: leagueConfig.color,
                    backgroundColor: `${leagueConfig.color}1a`,
                    borderWidth: 1,
                    borderColor: `${leagueConfig.color}33`
                }}
            >
                <Download className="w-3 h-3" />
                <span>{t('installPWA.installApp')}</span>
            </button>

            {/* iOS Instructions Modal */}
            {showIOSInstructions && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl animate-in slide-in-from-bottom-10 duration-300 relative">
                        <button
                            onClick={() => setShowIOSInstructions(false)}
                            className="absolute top-4 right-4 text-zinc-500 hover:text-white"
                        >
                            <X className="w-5 h-5" />
                        </button>

                        <div className="flex flex-col items-center text-center space-y-4">
                            <div className="p-3 bg-zinc-800 rounded-xl">
                                <Share className="w-6 h-6" style={{ color: leagueConfig.color }} />
                            </div>

                            <h3 className="text-lg font-bold text-white">{t('installPWA.installOnIOS')}</h3>

                            <div className="space-y-4 text-sm text-zinc-400 text-left w-full bg-zinc-950/50 p-4 rounded-xl border border-white/5">
                                <div className="flex items-center gap-3">
                                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-zinc-800 text-white font-bold text-xs">1</span>
                                    <span>{t('installPWA.step1')} <Share className="w-3 h-3 inline mx-1" /></span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-zinc-800 text-white font-bold text-xs">2</span>
                                    <span>{t('installPWA.step2')} <PlusSquare className="w-3 h-3 inline mx-1" /></span>
                                </div>
                            </div>

                            <button
                                onClick={() => setShowIOSInstructions(false)}
                                className="w-full py-3 text-sm font-bold text-black rounded-xl transition-colors"
                                style={{ backgroundColor: leagueConfig.color }}
                            >
                                {t('installPWA.gotIt')}
                            </button>
                        </div>

                        {/* Little arrow pointing down for mobile context */}
                        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-zinc-900 border-r border-b border-zinc-800 rotate-45 sm:hidden"></div>
                    </div>
                </div>
            )}
        </>
    );
};
