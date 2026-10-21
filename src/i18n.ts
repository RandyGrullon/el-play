// Español por defecto; inglés si el teléfono está en inglés o si se escoge en «Más». Mismos textos que la web.
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';
import es from './locales/es.json';
import en from './locales/en.json';
import { proTexts } from './locales/pro';
import { getItem, setItem } from './lib/storage';

const KEY = 'el-play-lng';

const deviceLanguage = () => (getLocales()[0]?.languageCode === 'en' ? 'en' : 'es');

i18n.use(initReactI18next).init({
    // Los textos del modo PRO (src/locales/pro/<nombre>.json) van bajo pro.<nombre>, junto a los pro.* de siempre
    resources: { es: { translation: { ...es, pro: { ...es.pro, ...proTexts('es') } } }, en: { translation: { ...en, pro: { ...en.pro, ...proTexts('en') } } } },
    lng: 'es',
    fallbackLng: 'es',
    interpolation: { escapeValue: false },
    returnNull: false
});

/** El cambio que hace initLanguage siguiendo al teléfono no se guarda: solo lo que el usuario escoge en «Más» */
let followingDevice = false;

/** Se llama al terminar de cargar el teléfono: idioma guardado o el del sistema */
export const initLanguage = () => {
    const saved = getItem(KEY);
    const language = saved === 'es' || saved === 'en' ? saved : deviceLanguage();
    if (i18n.language === language) return;
    // Sin elección guardada, si el teléfono cambia de idioma la app lo sigue
    followingDevice = language !== saved;
    i18n.changeLanguage(language).finally(() => {
        followingDevice = false;
    });
};

i18n.on('languageChanged', (language) => {
    if (!followingDevice) setItem(KEY, language);
});

export default i18n;
