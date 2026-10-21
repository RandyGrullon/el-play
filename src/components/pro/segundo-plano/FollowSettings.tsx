import React, { useEffect, useState } from 'react';
import { Linking, Platform, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import * as Notifications from 'expo-notifications';
import { setAlertPref, setLockMode, useFollowPrefs, type AlertKind, type LockMode } from '../../../lib/follow';
import { usePreferences } from '../../../state/preferences';
import { useColors } from '../../../theme/theme';
import { alpha, radius, shadow } from '../../../theme/tokens';
import { ProBadge, Txt } from '../../ui';
import { ProButton, ProNote, ProSegmented } from '../kit';
import { ProSwitch } from './ProSwitch';

/** Los dos equipos del juego (para decir de quién son los jonrones que avisa) */
interface GameTeams {
    away: { id: number; abbrev: string; name: string };
    home: { id: number; abbrev: string; name: string };
}

const ALERTS: AlertKind[] = ['homer', 'lead', 'noHitter', 'final'];
const MODES: LockMode[] = ['auto', 'ask', 'never'];

/** «Seguir en la pantalla de bloqueo»: automático para mi equipo / preguntar / nunca (también para Más) */
export const LockModeSetting: React.FC<{ game?: GameTeams | null; style?: StyleProp<ViewStyle> }> = ({ game, style }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const { mode } = useFollowPrefs();
    const { favoriteTeamId } = usePreferences();
    const team = game && favoriteTeamId !== null ? [game.away, game.home].find((side) => side.id === favoriteTeamId) : undefined;
    const note = favoriteTeamId === null ? t('pro.segundo-plano.lockNoTeam') : [team ? t('pro.segundo-plano.lockTeam', { team: team.name }) : '', t('pro.segundo-plano.lockHint')].filter(Boolean).join(' ');
    return (
        <View style={[{ gap: 8 }, style]}>
            <Txt size={14} weight="semibold">
                {t('pro.segundo-plano.lockTitle')}
            </Txt>
            <ProSegmented
                value={mode}
                onChange={setLockMode}
                label={t('pro.segundo-plano.lockTitle')}
                options={MODES.map((value) => ({
                    value,
                    accessibilityLabel: t(`pro.segundo-plano.lockModesA11y.${value}`),
                    // Dos líneas si no cabe (a 320 px «Auto: mi equipo» no entra en una)
                    label: (
                        <Txt size={12} weight="bold" color={value === mode ? colors.bg : alpha(colors.ink, 0.7)} numberOfLines={2} center style={{ lineHeight: 14 }}>
                            {t(`pro.segundo-plano.lockModes.${value}`)}
                        </Txt>
                    )
                }))}
            />
            <Txt size={11} tone="muted" style={{ lineHeight: 15 }}>
                {note}
            </Txt>
        </View>
    );
};

/** Avisos bloqueados para la app (el teléfono ya no deja pedirlos): las alertas no van a sonar */
const useNotificationsDenied = (watch: unknown) => {
    const [denied, setDenied] = useState(false);
    useEffect(() => {
        if (Platform.OS === 'web') return;
        let alive = true;
        Notifications.getPermissionsAsync()
            .then((permission) => {
                if (alive) setDenied(!permission.granted && !permission.canAskAgain);
            })
            .catch(() => undefined);
        return () => {
            alive = false;
        };
    }, [watch]);
    return [denied, setDenied] as const;
};

// Tarjeta «Alertas del juego» (PRO, opcionales) con «Seguir en la pantalla de bloqueo» abajo. Se guarda en el
// teléfono y vale para todos los juegos que sigas.
export const FollowSettings: React.FC<{ game?: GameTeams | null; style?: StyleProp<ViewStyle> }> = ({ game, style }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const prefs = useFollowPrefs();
    const { favoriteTeamId } = usePreferences();
    const [denied, setDenied] = useNotificationsDenied(prefs.alerts);
    const anyOn = ALERTS.some((kind) => prefs.alerts[kind]);
    const mine = game && favoriteTeamId !== null ? [game.away, game.home].find((side) => side.id === favoriteTeamId) : undefined;
    let homerHint = t('pro.segundo-plano.homerNoTeam');
    if (mine) homerHint = t('pro.segundo-plano.homerMine', { team: mine.abbrev });
    else if (favoriteTeamId !== null) homerHint = t('pro.segundo-plano.homerBoth');
    const toggle = (kind: AlertKind) => (next: boolean) => {
        setAlertPref(kind, next)
            .then((granted) => {
                if (!granted) setDenied(true);
            })
            .catch(() => undefined);
    };
    const line = alpha(colors.line, 0.08);

    return (
        <View style={[{ borderRadius: radius.card, backgroundColor: colors.surface, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 16, gap: 2 }, shadow('card'), style]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Txt size={16} weight="extrabold" accessibilityRole="header" style={{ letterSpacing: -0.5, flexShrink: 1 }}>
                    {t('pro.segundo-plano.alertsTitle')}
                </Txt>
                <ProBadge />
                <View style={{ flex: 1 }} />
                <Txt size={11} tone="muted">
                    {t('pro.segundo-plano.alertsOptional')}
                </Txt>
            </View>
            {ALERTS.map((kind, index) => (
                <ProSwitch
                    key={kind}
                    value={prefs.alerts[kind]}
                    onChange={toggle(kind)}
                    label={t(`pro.segundo-plano.alertNames.${kind}`)}
                    hint={kind === 'homer' ? homerHint : undefined}
                    style={index > 0 ? { borderTopWidth: 1, borderTopColor: line } : undefined}
                />
            ))}
            {denied && anyOn ? (
                <View style={{ marginTop: 6, gap: 2 }}>
                    <ProNote tone="warn">{t('pro.segundo-plano.alertsBlocked')}</ProNote>
                    <ProButton label={t('pro.segundo-plano.settings')} variant="ghost" onPress={() => Linking.openSettings().catch(() => undefined)} />
                </View>
            ) : null}
            <Txt size={11} tone="muted" style={{ lineHeight: 15, marginTop: 4 }}>
                {t('pro.segundo-plano.alertsWhen')}
            </Txt>
            <LockModeSetting game={game} style={{ borderTopWidth: 1, borderTopColor: line, paddingTop: 12, marginTop: 10 }} />
        </View>
    );
};
