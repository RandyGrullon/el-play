import React, { useMemo, useState } from 'react';
import { Platform, Pressable, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import { CircleHelp, Search } from 'lucide-react-native';
import { useColors } from '../../../theme/theme';
import { alpha, fonts, radius } from '../../../theme/tokens';
import { Sheet, Txt } from '../../ui';

// Letra de las fórmulas: monoespaciada del sistema
const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });

// Sin tildes ni mayúsculas para buscar «babip» o «efectividad»
const normalize = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export interface GlossaryEntry {
    /** La sigla tal como sale en la tabla: «OPS», «DIF», «LOB» */
    term: string;
    /** Qué es: «Embase más slugging» */
    name: string;
    /** Una o dos frases; cómo leerla */
    description?: string;
    /** Fórmula en monoespaciado: «OPS = OBP + SLG» */
    formula?: string;
    /** En las de «menos es mejor» (EFE, WHIP, K% del bateador) sale el aviso */
    lowerIsBetter?: boolean;
}

interface GlossarySheetProps {
    open: boolean;
    onClose: () => void;
    /** Título de la hoja: «Qué mide cada cifra» o el de la tabla */
    title: string;
    entries: GlossaryEntry[];
    /** Texto antes de la lista (de dónde salen los datos, quién califica) */
    intro?: string;
}

// Glosario táctil: hoja (Sheet de ui.tsx) con cada sigla, su nombre, la fórmula y si menos es mejor.
// Con más de 6 métricas lleva buscador.
export const GlossarySheet: React.FC<GlossarySheetProps> = ({ open, onClose, title, entries, intro }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const [query, setQuery] = useState('');
    const visible = useMemo(() => {
        const q = normalize(query.trim());
        if (!q) return entries;
        return entries.filter((entry) => normalize(`${entry.term} ${entry.name}`).includes(q));
    }, [entries, query]);

    return (
        <Sheet open={open} onClose={onClose} title={title}>
            {intro ? (
                <Txt size={14} tone="muted">
                    {intro}
                </Txt>
            ) : null}
            {entries.length > 6 && (
                <View style={{ height: 44, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: radius.pill, backgroundColor: colors.raised, paddingHorizontal: 14 }}>
                    <Search size={16} color={colors.muted} />
                    <TextInput
                        value={query}
                        onChangeText={setQuery}
                        placeholder={t('pro.kit.glossary.search')}
                        placeholderTextColor={colors.muted}
                        accessibilityLabel={t('pro.kit.glossary.search')}
                        autoCorrect={false}
                        autoCapitalize="none"
                        returnKeyType="search"
                        style={{ flex: 1, height: 44, color: colors.ink, fontFamily: fonts.regular, fontSize: 14 }}
                    />
                </View>
            )}
            {visible.length === 0 ? (
                <Txt size={14} tone="muted" center style={{ paddingVertical: 24 }}>
                    {t('pro.kit.glossary.empty')}
                </Txt>
            ) : (
                <View style={{ borderRadius: radius.card, backgroundColor: colors.surface, overflow: 'hidden' }}>
                    {visible.map((entry, index) => (
                        <View key={entry.term} style={[{ gap: 6, paddingHorizontal: 16, paddingVertical: 12 }, index > 0 && { borderTopWidth: 1, borderTopColor: alpha(colors.line, 0.1) }]}>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 8, rowGap: 4 }}>
                                <Txt condensed size={20} style={{ lineHeight: 22 }}>
                                    {entry.term}
                                </Txt>
                                <Txt size={14} weight="semibold" tone="muted" style={{ flexShrink: 1 }}>
                                    {entry.name}
                                </Txt>
                                {entry.lowerIsBetter && (
                                    <View style={{ marginLeft: 'auto', borderRadius: radius.pill, backgroundColor: colors.raised, paddingHorizontal: 8, paddingVertical: 2 }}>
                                        <Txt size={11} weight="bold" tone="muted">
                                            {t('pro.kit.glossary.lowerBetter')}
                                        </Txt>
                                    </View>
                                )}
                            </View>
                            {entry.formula ? (
                                <View style={{ borderRadius: 12, backgroundColor: colors.raised, paddingHorizontal: 12, paddingVertical: 8 }}>
                                    <Txt size={12} style={{ fontFamily: MONO }}>
                                        {entry.formula}
                                    </Txt>
                                </View>
                            ) : null}
                            {entry.description ? (
                                <Txt size={14} color={alpha(colors.ink, 0.8)} style={{ lineHeight: 19 }}>
                                    {entry.description}
                                </Txt>
                            ) : null}
                        </View>
                    ))}
                </View>
            )}
        </Sheet>
    );
};

interface GlossaryButtonProps {
    /** Título de la hoja (y del botón para lectores de pantalla) */
    title: string;
    entries: GlossaryEntry[];
    intro?: string;
    style?: StyleProp<ViewStyle>;
}

// Botón «?» de 44 px que abre el glosario de una tabla o un módulo.
export const GlossaryButton: React.FC<GlossaryButtonProps> = ({ title, entries, intro, style }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const [open, setOpen] = useState(false);
    return (
        <>
            <Pressable
                onPress={() => setOpen(true)}
                accessibilityRole="button"
                accessibilityLabel={t('pro.kit.glossary.open', { title })}
                style={({ pressed }) => [{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? colors.raised : 'transparent' }, style]}
            >
                <CircleHelp size={20} color={colors.muted} />
            </Pressable>
            <GlossarySheet open={open} onClose={() => setOpen(false)} title={title} entries={entries} intro={intro} />
        </>
    );
};
