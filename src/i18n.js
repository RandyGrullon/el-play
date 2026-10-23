import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import es from './locales/es.json';

// Textos del modo PRO: un archivo por pantalla (src/locales/pro/<nombre>.json con "es" y "en"), bajo pro.<nombre>
const proFiles = import.meta.glob('./locales/pro/*.json', { eager: true });
const withPro = (texts, lang) => {
    for (const [path, file] of Object.entries(proFiles)) {
        const name = path.split('/').pop().replace(/\.json$/, '');
        const content = file.default || file;
        texts.pro = { ...texts.pro, [name]: content[lang] || {} };
    }
    return texts;
};
withPro(es, 'es');

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

// El inglés se baja solo si se usa (casi todos usan español: ~58 KB menos en la primera carga)
i18n.use(initReactI18next).init({
    resources: { es: { translation: es } },
    lng: 'es',
    fallbackLng: 'es',
    partialBundledLanguages: true,
    interpolation: { escapeValue: false },
});

/** Cambia el idioma (bajando sus textos si hace falta) */
export const setLanguage = async (lng) => {
    if (lng === 'en' && !i18n.hasResourceBundle('en', 'translation')) {
        const module = await import('./locales/en.json');
        i18n.addResourceBundle('en', 'translation', withPro({ ...(module.default || module) }, 'en'));
    }
    return i18n.changeLanguage(lng);
};

/** Listo para pintar: en inglés, cuando ya llegaron sus textos */
export const languageReady = getInitialLanguage() === 'en' ? setLanguage('en').catch(() => undefined) : Promise.resolve();

i18n.on('languageChanged', (lng) => {
    try {
        localStorage.setItem(STORAGE_KEY, lng);
    } catch (_) {}
});

export default i18n;
