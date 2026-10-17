import React from 'react';
import { useTranslation } from 'react-i18next';

// Política de privacidad. Hace falta por las cuentas del Fantasy (correo) y la piden las tiendas de apps.
// Revisar si cambia algo de lo que la app guarda o comparte.

interface Section {
    title: string;
    body: string[];
}

const UPDATED = { es: '17 de octubre de 2026', en: 'October 17, 2026' };

const ES: Section[] = [
    {
        title: 'Sin cuenta',
        body: [
            'Para ver juegos, posiciones, líderes y estadísticas no necesitas cuenta y no te pedimos ningún dato.',
            'En tu propio teléfono se guardan tus preferencias (liga, tema, idioma, equipo favorito, juegos con aviso y animaciones) para recordarlas la próxima vez. No salen de tu teléfono y se borran al borrar la app o los datos del sitio.',
            'Los avisos de juegos los genera tu teléfono; no usamos un servidor de notificaciones.'
        ]
    },
    {
        title: 'Cuenta del Fantasy',
        body: [
            'Solo el Fantasy pide cuenta. Puedes entrar con un código que te mandamos al correo o con Google, y vincular tu cuenta de Google. Guardamos tu correo, el nombre que elijas, tus equipos y pronósticos de cada día y las ligas privadas en las que estás. Si usas Google, Google nos comparte el correo, el nombre y la foto de esa cuenta; se guardan con tu cuenta y no se le muestran a nadie.',
            'El nombre que elijas es público: sale en la tabla de puntos y en tus ligas, y cualquiera lo puede encontrar en el buscador de fanáticos. Si no eliges uno, no tomamos ninguno de tu correo.',
            'Tus equipos y pronósticos de cada día son públicos; en la app los demás los ven cuando empieza cada juego. Tu correo nunca se le muestra a nadie.',
            'Todo se guarda en Supabase, el servicio de base de datos de El Play.',
            'Puedes borrar tu cuenta y todo lo anterior cuando quieras desde Más → Tu cuenta → Borrar mi cuenta.'
        ]
    },
    {
        title: 'Estadísticas de uso',
        body: ['Usamos Vercel Web Analytics y Speed Insights para contar visitas y medir la velocidad de la app, sin cookies y sin identificarte.']
    },
    {
        title: 'Publicidad',
        body: ['El Play no muestra anuncios ni vende tus datos.']
    },
    {
        title: 'Datos del béisbol',
        body: ['Los marcadores y estadísticas vienen de MLB Stats API y las fotos de MLB y de los equipos. El Play no está afiliado a MLB ni a LIDOM.']
    }
];

const EN: Section[] = [
    {
        title: 'Without an account',
        body: [
            "You don't need an account to follow games, standings, leaders or stats, and we don't ask for any data.",
            'Your preferences (league, theme, language, favorite team, game alerts and animations) are saved on your own device so the app remembers them. They never leave your device and are deleted when you remove the app or the site data.',
            "Game alerts are created by your phone; we don't use a notification server."
        ]
    },
    {
        title: 'Fantasy account',
        body: [
            "Only Fantasy needs an account. You can sign in with a code we email you or with Google, and you can link your Google account. We store your email, the name you choose, your daily teams and picks, and the private leagues you belong to. If you use Google, Google shares that account's email, name and photo with us; they are kept with your account and never shown to anyone.",
            "The name you choose is public: it appears in the standings and in your leagues, and anyone can find it with the fan search. If you don't choose one, we never take one from your email.",
            'Your daily teams and picks are public; in the app, other fans see them once each game starts. Your email is never shown to anyone.',
            "Everything is stored in Supabase, El Play's database service.",
            'You can delete your account and everything above at any time from More → Your account → Delete my account.'
        ]
    },
    {
        title: 'Usage statistics',
        body: ['We use Vercel Web Analytics and Speed Insights to count visits and measure speed, without cookies and without identifying you.']
    },
    {
        title: 'Advertising',
        body: ["El Play doesn't show ads or sell your data."]
    },
    {
        title: 'Baseball data',
        body: ['Scores and stats come from MLB Stats API, and photos from MLB and the teams. El Play is not affiliated with MLB or LIDOM.']
    }
];

export const PrivacyPage: React.FC = () => {
    const { t, i18n } = useTranslation();
    const en = i18n.language.startsWith('en');
    const sections = en ? EN : ES;

    return (
        <div className="space-y-5 px-4 pt-5">
            <header>
                <h1 className="display text-[32px] leading-tight">{t('privacy.title')}</h1>
                <p className="text-sm text-muted">{t('privacy.updated', { date: en ? UPDATED.en : UPDATED.es })}</p>
            </header>
            {sections.map((section) => (
                <section key={section.title} className="card space-y-2 p-4">
                    <h2 className="text-lg font-extrabold">{section.title}</h2>
                    {section.body.map((paragraph) => (
                        <p key={paragraph} className="max-w-[65ch] text-sm leading-relaxed text-muted">
                            {paragraph}
                        </p>
                    ))}
                </section>
            ))}
        </div>
    );
};
