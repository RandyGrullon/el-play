// /fantasy/fan/<id>: perfil de un fanático (se abre desde «Tabla» y «Fanáticos» del Fantasy)
import React from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ChevronLeft } from 'lucide-react-native';
import { Screen } from '../../../components/layout';
import { EmptyState, IconButton, Row, Txt } from '../../../components/ui';
import { FanProfileView, useFanName } from '../../../components/fantasy/FanProfile';
import { isFanId } from '../../../components/fantasy/fans';
import { useLocalText } from '../../../components/fantasy/texts';
import { ProFanProfile } from '../../../components/pro/fanaticos/ProFanProfile';
import { useIsPro } from '../../../lib/pro';
import { useLeague } from '../../../state/league';
import { useColors } from '../../../theme/theme';

export default function FanScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const userId = typeof id === 'string' ? id : '';
    const { activeLeague } = useLeague();
    const colors = useColors();
    const router = useRouter();
    const { i18n } = useTranslation();
    const L = useLocalText();
    const { own, name } = useFanName(userId, activeLeague);
    const back = () => (router.canGoBack() ? router.back() : router.replace('/fantasy'));
    const pro = useIsPro();

    // PRO: el perfil con su temporada, su equipo de hoy, «Comparar conmigo» y sus días; el Lite sigue igual debajo
    if (pro) return <ProFanProfile userId={userId} league={activeLeague} onBack={back} />;

    return (
        <Screen contentStyle={{ gap: 20 }}>
            <Row gap={12}>
                <IconButton label={i18n.language.startsWith('en') ? 'Back' : 'Atrás'} onPress={back} style={{ width: 44, height: 44 }}>
                    <ChevronLeft size={22} color={colors.ink} />
                </IconButton>
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Txt size={14} weight="semibold" tone="muted" numberOfLines={1}>
                        {L('fans.tab')}
                    </Txt>
                    <Txt size={20} weight="extrabold" numberOfLines={1}>
                        {own ? name || L('fans.yourProfile') : name || L('fans.anonymous')}
                    </Txt>
                </View>
            </Row>
            {isFanId(userId) ? <FanProfileView userId={userId} league={activeLeague} /> : <EmptyState title={L('fans.notFound')} />}
        </Screen>
    );
}
