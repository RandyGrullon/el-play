// Español por defecto; inglés si el teléfono está en inglés o si se escoge en «Más». Mismos textos que la web.
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';
import es from './locales/es.json';
import en from './locales/en.json';
import { getItem, setItem } from './lib/storage';

const KEY = 'el-play-lng';

const deviceLanguage = () => (getLocales()[0]?.languageCode === 'en' ? 'en' : 'es');

i18n.use(initReactI18next).init({
    resources: { es: { translation: es }, en: { translation: en } },
    lng: 'es',
    fallbackLng: 'es',
    interpolation: { escapeValue: false },
    returnNull: false
});

/** Se llama al terminar de cargar el teléfono: idioma guardado o el del sistema */
export const initLanguage = () => {
    const saved = getItem(KEY);
    const language = saved === 'es' || saved === 'en' ? saved : deviceLanguage();
    if (i18n.language !== language) i18n.changeLanguage(language);
};

i18n.on('languageChanged', (language) => setItem(KEY, language));

export default i18n;
