import React, { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { GameDetail } from '../../../../types';
import type { GamePro } from '../../../../lib/pro/juego';
import { useGamePro } from '../../../../lib/pro/juego';
import { isRouteMissing } from '../../../../lib/pro/http';
import { useColors } from '../../../../theme/theme';
import { TeamLogo, Txt } from '../../../ui';
import { GlossaryButton, ModuleHeader, ProNote, ProSegmented, type GlossaryEntry } from '../../kit';
import { buildHalves, nameBook } from '../jugadas/model';
import { BattingCard } from './BattingCard';
import { GameNotes } from './GameNotes';
import { GameStrip } from './GameStrip';
import { Linescore } from './Linescore';
import { PitchingCard } from './PitchingCard';

export interface ProBoxProps {
    game: GameDetail;
    /** Extras PRO del juego (useGamePro): box ampliado, notas, ritmo; undefined mientras carga o si no existe */
    pro?: GamePro;
    /** tab: pestaña «Box» del detalle; sheet: hoja «Jugadas y box score» */
    place: 'tab' | 'sheet';
    /** En la hoja con `scroll={false}`: el box lleva su propio desplazamiento */
    fill?: boolean;
}

type Side = 'away' | 'home';
type View2 = 'basic' | 'expanded';

// Siglas del box con su nombre (el «?» del glosario)
const GLOSSARY = ['ab', 'r', 'h', 'rbi', 'bb', 'k', 'avg', 'd', 't', 'sb', 'hbp', 'sf', 'lob', 'obp', 'ops', 'ip', 'er', 'era', 'ps', 'bf', 'goao', 'ir', 'hold', 'risp'];
const LOWER_BETTER = new Set(['era']);

// Box score PRO: pizarra por entradas (C/H/LOB), bateo Básico · Expandido con la primera columna fija,
// pitcheo ampliado, notas del juego plegables y la franja final (duración, viento, clima, árbitros, retos ABS).
export const ProBox: React.FC<ProBoxProps> = ({ game, pro, place, fill = false }) => {
    const { t } = useTranslation();
    const colors = useColors();
    // En vivo, el equipo al bate; si no, el visitante (como se lee una pizarra)
    const [side, setSide] = useState<Side>(game.state === 'live' && game.inning && !game.inning.isTop ? 'home' : 'away');
    const [view, setView] = useState<View2>('basic');
    // Misma consulta que ya hace ProGame (react-query no la repite): solo para saber si carga o falló
    const status = useGamePro(game.gamePk ?? undefined, !pro);
    const names = useMemo(() => nameBook(game, pro), [game, pro]);
    const halves = useMemo(() => (pro?.abs ? buildHalves(game, pro) : []), [game, pro]);
    const glossary: GlossaryEntry[] = GLOSSARY.map((key) => ({
        term: t(`pro.box.glossary.${key}.term`),
        name: t(`pro.box.glossary.${key}.name`),
        description: t(`pro.box.glossary.${key}.text`, { defaultValue: '' }) || undefined,
        formula: t(`pro.box.glossary.${key}.formula`, { defaultValue: '' }) || undefined,
        lowerIsBetter: LOWER_BETTER.has(key) || undefined
    }));
    const failed = status.isError && !isRouteMissing(status.error);
    const loading = status.isPending && status.fetchStatus === 'fetching';

    const content = (
        <View style={{ gap: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <ModuleHeader title={t('pro.box.title')} aside={place === 'sheet' && game.state === 'final' ? t('pro.box.final') : undefined} style={{ flex: 1 }} />
                <GlossaryButton title={t('pro.box.title')} entries={glossary} />
            </View>

            {!pro && (loading || failed) ? <ProNote tone={failed ? 'warn' : 'pending'}>{t(failed ? 'pro.box.proError' : 'pro.box.proLoading')}</ProNote> : null}

            <Linescore game={game} pro={pro} />

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <ProSegmented
                    value={side}
                    onChange={setSide}
                    label={t('pro.box.team')}
                    track="surface"
                    style={{ flexGrow: 1, flexBasis: 150 }}
                    options={(['away', 'home'] as const).map((key) => ({
                        value: key,
                        accessibilityLabel: game[key].name,
                        label: (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
                                    <TeamLogo team={game[key]} size={16} />
                                </View>
                                <Txt size={13} weight="bold" color={side === key ? colors.bg : colors.ink}>
                                    {game[key].abbrev}
                                </Txt>
                            </View>
                        )
                    }))}
                />
                <ProSegmented
                    value={view}
                    onChange={setView}
                    label={t('pro.box.view')}
                    track="surface"
                    style={{ flexGrow: 1, flexBasis: 170 }}
                    options={[
                        { value: 'basic', label: t('pro.box.basic') },
                        { value: 'expanded', label: t('pro.box.expanded'), disabled: !pro }
                    ]}
                />
            </View>

            {/* Al cambiar de equipo las tarjetas vuelven a entrar (filas escalonadas) */}
            <View key={side} style={{ gap: 16 }}>
                <BattingCard game={game} pro={pro} side={side} expanded={view === 'expanded'} names={names} />
                <PitchingCard game={game} pro={pro} side={side} names={names} />
                {pro && <GameNotes game={game} pro={pro} side={side} names={names} />}
            </View>

            <GameStrip game={game} pro={pro} halves={halves} names={names} />
        </View>
    );

    if (!fill) return content;
    return (
        <View style={{ flex: 1, marginHorizontal: -16, marginBottom: -16 }}>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 48 }}>
                {content}
            </ScrollView>
        </View>
    );
};
