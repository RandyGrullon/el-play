import React, { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';

interface VersionData {
    version: string;
    timestamp: number;
}

export const UpdateModal: React.FC = () => {
    const [showModal, setShowModal] = useState(false);
    const [initialVersion, setInitialVersion] = useState<string | null>(null);

    useEffect(() => {
        const fetchVersion = async () => {
            try {
                // Add timestamp to prevent caching
                const response = await fetch('/version.json?t=' + new Date().getTime());
                if (!response.ok) return null;
                const data: VersionData = await response.json();
                return data.version;
            } catch (error) {
                console.error('Failed to check version', error);
                return null;
            }
        };

        // Initial check to set the baseline version
        fetchVersion().then((version) => {
            if (version) {
                setInitialVersion(version);
            }
        });

        // Poll every 30 seconds
        const interval = setInterval(async () => {
            // Only poll if we have an initial version to compare against
            if (!initialVersion) return;

            const newVersion = await fetchVersion();
            if (newVersion && newVersion !== initialVersion) {
                setShowModal(true);
            }
        }, 30000);

        return () => clearInterval(interval);
    }, [initialVersion]);

    if (!showModal) return null;

    const handleReload = () => {
        // Reload the page to get the new assets
        window.location.reload();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 max-w-md w-full shadow-2xl animate-in fade-in zoom-in duration-300">
                <div className="flex flex-col items-center text-center space-y-4">
                    <div className="p-3 bg-blue-500/10 rounded-full">
                        <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
                    </div>

                    <div className="space-y-2">
                        <h3 className="text-xl font-bold text-white">Nueva actualización disponible</h3>
                        <p className="text-zinc-400 text-sm">
                            Se ha detectado una nueva versión de la aplicación. Por favor, reinicia para aplicar los cambios y obtener las últimas mejoras.
                        </p>
                    </div>

                    <div className="flex w-full gap-3 pt-2">
                        <button
                            onClick={() => setShowModal(false)}
                            className="flex-1 px-4 py-2 text-sm font-medium text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
                        >
                            Más tarde
                        </button>
                        <button
                            onClick={handleReload}
                            className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-lg shadow-blue-500/20"
                        >
                            Reiniciar ahora
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
