import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import es from './locales/es.json';
import en from './locales/en.json';

// Textos del modo PRO: un archivo por pantalla (src/locales/pro/<nombre>.json con "es" y "en"), bajo pro.<nombre>
const proFiles = import.meta.glob('./locales/pro/*.json', { eager: true });
for (const [path, file] of Object.entries(proFiles)) {
    const name = path.split('/').pop().replace(/\.json$/, '');
    const texts = file.default || file;
    es.pro = { ...es.pro, [name]: texts.es || {} };
    en.pro = { ...en.pro, [name]: texts.en || {} };
}

const STORAGE_KEY = 'i18n_lng';

function getInitialLanguage() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved === 'es' || saved === 'en') return saved;
    } catch (_) {}
    const browser = navigator.language || navigator.languages?.[0] || '';
    if (browser.startsWith('en')) return 'en';
    return 'es';
}

i18n.use(initReactI18next).init({
    resources: { es: { translation: es }, en: { translation: en } },
    lng: getInitialLanguage(),
    fallbackLng: 'es',
    interpolation: { escapeValue: false },
});

i18n.on('languageChanged', (lng) => {
    try {
        localStorage.setItem(STORAGE_KEY, lng);
    } catch (_) {}
});

export default i18n;
