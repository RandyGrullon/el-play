// Pasos para instalar El Play según el sistema y el navegador: cada uno lo hace distinto (Safari con Compartir, Samsung
// Internet con su menú de abajo, Edge con «Agregar al teléfono», Chrome en la computadora con el ícono de la barra…).
// Las palabras salen de las páginas de ayuda de Google, Apple, Mozilla, Samsung y Microsoft (octubre de 2026).
// Igual que la web (el-play/src/components/install/steps.ts): la app no tiene los dibujos (TutorialArt), solo el texto.

export type InstallPlatform = 'ios' | 'android' | 'desktop';
export type InstallBrowser = 'safari' | 'chrome' | 'firefox' | 'edge' | 'samsung' | 'opera' | 'other' | 'inapp';

/** Los navegadores de cada sistema que tienen su propia guía, en el orden en que salen (igual que la web) */
export const BROWSERS: Record<InstallPlatform, InstallBrowser[]> = {
    ios: ['safari', 'chrome', 'firefox', 'edge', 'other', 'inapp'],
    android: ['chrome', 'samsung', 'firefox', 'edge', 'opera', 'other', 'inapp'],
    desktop: ['chrome', 'edge', 'safari', 'firefox', 'other']
};

// En la web es la escena del dibujo y sus datos; aquí solo viajan con el paso
type SceneKind = string;
type ArtProps = Record<string, unknown>;

export interface Step {
    scene: SceneKind;
    text: string;
    art?: ArtProps;
}

export interface Guide {
    steps: Step[];
    /** Aviso debajo del dibujo (p. ej. «si no aparece, ábrela en Chrome») */
    note?: string;
}

type Translate = (key: string, options?: Record<string, unknown>) => string;

export const guideFor = (platform: InstallPlatform, browser: InstallBrowser, options: { prompt: boolean; safariNew: boolean }, t: Translate): Guide => {
    const step = (key: string, scene: SceneKind, art?: ArtProps): Step => ({ scene, text: t(`install.steps.${key}`), art });
    const art = (key: string) => t(`install.art.${key}`);
    const doneIos: Step = { scene: 'home', text: t('install.tutorial.done') };
    const doneAndroid: Step = { scene: 'home-android', text: t('install.tutorial.done') };
    const shareSheet: Step = { scene: 'share-sheet', text: t('install.iosAdd') };
    const addIos: Step = { scene: 'add-ios-old', text: t('install.iosConfirm') };

    const safari: Step[] = options.safariNew
        ? [{ scene: 'safari26-bar', text: t('install.iosMore') }, { scene: 'safari-menu', text: t('install.iosShare') }, shareSheet, { scene: 'add-ios', text: t('install.iosWebApp') }, doneIos]
        : [{ scene: 'safari-old-bar', text: t('install.iosShareBottom') }, shareSheet, addIos, doneIos];

    const chromeAndroid: Step[] = options.prompt
        ? [{ scene: 'app-button', text: t('install.tutorial.tapInstall') }, { scene: 'android-dialog', text: t('install.androidConfirm') }, doneAndroid]
        : [
              step('androidChrome1', 'chrome-android-bar'),
              step('androidChrome2', 'menu', { at: 'top', items: [art('newTab'), art('history'), art('downloads'), art('addHomeAndroid'), art('settings')], highlight: 3 }),
              step('androidInstall', 'android-dialog'),
              doneAndroid
          ];

    if (platform === 'ios') {
        switch (browser) {
            case 'chrome':
                return { steps: [step('iosChrome1', 'chrome-ios-bar'), shareSheet, addIos, doneIos] };
            case 'firefox':
                return { steps: [step('iosFirefox1', 'chrome-ios-bar'), shareSheet, addIos, doneIos] };
            case 'edge':
                return {
                    steps: [
                        step('iosEdge1', 'bottom-bar', { icon: 'dots', spot: 'right' }),
                        step('iosEdge2', 'menu', { at: 'bottom', items: [art('share'), art('bookmark'), art('find')], highlight: 0 }),
                        shareSheet,
                        addIos,
                        doneIos
                    ]
                };
            case 'other':
                return { steps: [step('iosOther1', 'chrome-ios-bar'), shareSheet, addIos, doneIos], note: t('install.steps.iosOtherNote') };
            case 'inapp':
                return {
                    steps: [step('inappIos1', 'inapp-bar', { os: 'ios' }), step('inappIos2', 'menu', { at: 'bottom', items: [art('openSafari'), art('copyLink'), art('share')], highlight: 0 }), ...safari],
                    note: t('install.steps.inappNote')
                };
            default:
                return { steps: safari };
        }
    }

    if (platform === 'android') {
        switch (browser) {
            case 'samsung':
                return {
                    steps: [
                        step('samsung1', 'bottom-bar', { icon: 'lines', spot: 'right' }),
                        step('samsung2', 'menu', { at: 'bottom', items: [art('bookmarks'), art('addPageTo'), art('history'), art('settings')], highlight: 1 }),
                        step('samsung3', 'menu', { at: 'bottom', items: [art('bookmarks'), art('quickAccess'), art('homeScreen')], highlight: 2 }),
                        step('samsung4', 'confirm', { title: art('addHomeQ'), action: art('add') }),
                        doneAndroid
                    ],
                    note: t('install.steps.samsungNote')
                };
            case 'firefox':
                return {
                    steps: [
                        step('firefox1', 'chrome-android-bar'),
                        step('firefox2', 'menu', { at: 'top', items: [art('newTab'), art('bookmarks'), art('history'), art('addHomeFirefox'), art('settings')], highlight: 3 }),
                        step('firefox3', 'confirm', { title: art('addHomeQ'), action: art('add') }),
                        doneAndroid
                    ]
                };
            case 'edge':
                return {
                    steps: [
                        step('edge1', 'bottom-bar', { icon: 'dots', spot: 'center' }),
                        step('edge2', 'menu', { at: 'bottom', items: [art('bookmarks'), art('history'), art('addToPhone'), art('settings')], highlight: 2 }),
                        step('androidInstall', 'android-dialog'),
                        doneAndroid
                    ]
                };
            case 'opera':
                return {
                    steps: [
                        step('opera1', 'chrome-android-bar'),
                        step('opera2', 'menu', { at: 'top', items: [art('newTab'), art('bookmarks'), art('addTo'), art('settings')], highlight: 2 }),
                        step('opera3', 'menu', { at: 'top', items: [art('bookmarks'), art('speedDial'), art('homeScreen')], highlight: 2 }),
                        step('opera4', 'confirm', { title: art('addHomeQ'), action: art('add') }),
                        doneAndroid
                    ]
                };
            case 'other':
                return {
                    steps: [
                        step('androidOther1', 'chrome-android-bar'),
                        step('androidOther2', 'menu', { at: 'top', items: [art('newTab'), art('history'), art('installApp'), art('settings')], highlight: 2 }),
                        step('androidInstall', 'android-dialog'),
                        doneAndroid
                    ],
                    note: t('install.steps.androidOtherNote')
                };
            case 'inapp':
                return {
                    steps: [
                        step('inappAndroid1', 'inapp-bar', { os: 'android' }),
                        step('inappAndroid2', 'menu', { at: 'top', items: [art('openChrome'), art('copyLink'), art('share')], highlight: 0 }),
                        ...chromeAndroid.filter((item) => item.scene !== 'app-button')
                    ],
                    note: t('install.steps.inappNote')
                };
            default:
                return { steps: chromeAndroid };
        }
    }

    // Computadora
    const install: Step = step('desktopInstall', 'desktop-dialog');
    const doneDesktop: Step = { scene: 'desktop-done', text: t('install.steps.desktopDone') };
    switch (browser) {
        case 'edge':
            return {
                steps: [
                    step('desktopEdge1', 'desktop-bar', { title: art('appAvailable') }),
                    step('desktopEdge2', 'desktop-menu', { items: [art('newTab'), art('bookmarks'), art('apps'), art('settings')], highlight: 2, sub: [art('installSite'), art('viewApps')], subHighlight: 0 }),
                    install,
                    doneDesktop
                ]
            };
        case 'safari':
            return {
                steps: [
                    step('desktopSafari1', 'mac-menu', { title: art('file'), items: [art('newWindow'), art('newTab'), art('addToDock'), art('close')], highlight: 2 }),
                    step('desktopSafari2', 'desktop-dialog', { title: art('addToDock'), action: art('add') }),
                    { scene: 'desktop-done', text: t('install.steps.desktopSafariDone'), art: { dock: true } }
                ],
                note: t('install.steps.desktopSafariNote')
            };
        case 'firefox':
            return { steps: [step('desktopFirefox1', 'desktop-bar', { mark: 'star', title: art('bookmarkThis') })], note: t('install.steps.desktopFirefoxNote') };
        case 'other':
            return { steps: [step('desktopOther1', 'desktop-bar', { title: art('installApp') }), install, doneDesktop], note: t('install.steps.desktopOtherNote') };
        default:
            return {
                steps: [
                    step('desktopChrome1', 'desktop-bar', { title: art('installApp') }),
                    step('desktopChrome2', 'desktop-menu', { items: [art('newTab'), art('history'), art('castSave'), art('settings')], highlight: 2, sub: [art('savePage'), art('installPage'), art('shortcut')], subHighlight: 1 }),
                    install,
                    doneDesktop
                ]
            };
    }
};
