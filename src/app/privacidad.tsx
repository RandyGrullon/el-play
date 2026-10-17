// Política de privacidad (la piden las tiendas y las cuentas del Fantasy). Es la de la web adaptada a la app:
// avisos programados en el teléfono, datos guardados en el teléfono y sin estadísticas de uso.
// Revisar si cambia algo de lo que la app guarda o comparte (p. ej. si se agrega analítica o reporte de fallos).
import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ChevronLeft } from 'lucide-react-native';
import { Screen } from '../components/layout';
import { Card, IconButton, Title, Txt } from '../components/ui';
import { useColors } from '../theme/theme';

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
            'En tu propio teléfono se guardan tus preferencias (liga, tema, idioma, equipo favorito, juegos con aviso y animaciones) para recordarlas la próxima vez. No salen de tu teléfono y se borran al borrar la app.',
            'Los avisos de juegos los programa tu propio teléfono al activarlos: no usamos un servidor de notificaciones ni guardamos un identificador de tu teléfono. Puedes apagarlos cuando quieras desde el juego o desde los ajustes del teléfono.'
        ]
    },
    {
        title: 'Cuenta del Fantasy',
        body: [
            'Solo el Fantasy pide cuenta. Si la creas guardamos tu correo (para mandarte el código de entrada), el nombre que elijas para la tabla, tus equipos y pronósticos de cada día y las ligas privadas en las que estás.',
            'Si entras con Google, Google nos pasa tu correo y los datos básicos de tu perfil para crear la cuenta; nunca vemos tu contraseña.',
            'Se guardan en Supabase, el servicio de base de datos de El Play. Tu nombre y tus equipos se ven en la tabla de puntos y en tus ligas; tu correo no se le muestra a nadie.',
            'La sesión queda guardada de forma cifrada en tu teléfono, y una copia de tus equipos se guarda en él para que el Fantasy abra rápido.',
            'Puedes borrar tu cuenta y todo lo anterior cuando quieras desde Más → Cuenta → Borrar mi cuenta.'
        ]
    },
    {
        title: 'Estadísticas de uso',
        body: ['La app no usa herramientas de análisis ni de rastreo: no contamos tus visitas ni te identificamos.']
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
            'Your preferences (league, theme, language, favorite team, game alerts and animations) are saved on your own phone so the app remembers them. They never leave your phone and are deleted when you remove the app.',
            "Game alerts are scheduled by your own phone when you turn them on: we don't use a notification server or store an identifier for your phone. You can turn them off at any time from the game or from your phone's settings."
        ]
    },
    {
        title: 'Fantasy account',
        body: [
            'Only Fantasy needs an account. If you create one we store your email (to send you the sign-in code), the name you choose for the standings, your daily teams and picks, and the private leagues you belong to.',
            'If you sign in with Google, Google shares your email and basic profile details with us to create the account; we never see your password.',
            "It's stored in Supabase, El Play's database service. Your name and teams are visible in the standings and in your leagues; your email is never shown to anyone.",
            'Your session is stored encrypted on your phone, and a copy of your teams is kept there so Fantasy opens quickly.',
            'You can delete your account and everything above at any time from More → Account → Delete my account.'
        ]
    },
    {
        title: 'Usage statistics',
        body: ["The app doesn't use analytics or tracking tools: we don't count your visits or identify you."]
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

export default function PrivacyScreen() {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const router = useRouter();
    const en = i18n.language.startsWith('en');
    const sections = en ? EN : ES;

    return (
        <Screen contentStyle={{ gap: 20 }}>
            <View style={{ gap: 12 }}>
                <IconButton label={en ? 'Back' : 'Atrás'} onPress={() => (router.canGoBack() ? router.back() : router.replace('/mas'))} style={{ width: 44, height: 44 }}>
                    <ChevronLeft size={22} color={colors.ink} />
                </IconButton>
                <View>
                    <Title>{t('privacy.title')}</Title>
                    <Txt size={14} tone="muted">
                        {t('privacy.updated', { date: en ? UPDATED.en : UPDATED.es })}
                    </Txt>
                </View>
            </View>
            {sections.map((section) => (
                <Card key={section.title} style={{ gap: 8 }}>
                    <Txt size={18} weight="extrabold" accessibilityRole="header">
                        {section.title}
                    </Txt>
                    {section.body.map((paragraph) => (
                        <Txt key={paragraph} size={14} tone="muted" style={{ lineHeight: 22 }}>
                            {paragraph}
                        </Txt>
                    ))}
                </Card>
            ))}
        </Screen>
    );
}
