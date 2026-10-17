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
            'Solo el Fantasy pide cuenta. Si la creas guardamos tu correo (para mandarte el código de entrada), el nombre que elijas para la tabla, tus equipos y pronósticos de cada día y las ligas privadas en las que estás.',
            'Se guardan en Supabase, el servicio de base de datos de El Play. Tu nombre y tus equipos se ven en la tabla de puntos y en tus ligas; tu correo no se le muestra a nadie.',
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
            'Only Fantasy needs an account. If you create one we store your email (to send you the sign-in code), the name you choose for the standings, your daily teams and picks, and the private leagues you belong to.',
            "It's stored in Supabase, El Play's database service. Your name and teams are visible in the standings and in your leagues; your email is never shown to anyone.",
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
