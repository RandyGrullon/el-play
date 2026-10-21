// Textos del modo PRO: cada parte escribe los suyos en src/locales/pro/<nombre>.json con la forma
// { "es": {…}, "en": {…} } y aquí se juntan bajo pro.<nombre> (t('pro.vivo.algo'), t('pro.segundo-plano.algo')).
// Metro no tiene import.meta.glob: cada archivo va con su import. Un archivo nuevo se agrega a esta lista.
import kit from './kit.json';
import portada from './portada.json';
import vivo from './vivo.json';
import zona from './zona.json';
import jugadas from './jugadas.json';
import box from './box.json';
import previa from './previa.json';
import final from './final.json';
import posiciones from './posiciones.json';
import lideres from './lideres.json';
import estadisticas from './estadisticas.json';
import ficha from './ficha.json';
import fantasy from './fantasy.json';
import fanaticos from './fanaticos.json';
import mas from './mas.json';
import animaciones from './animaciones.json';
import segundoPlano from './segundo-plano.json';

type Texts = { es?: object; en?: object };

const FILES: Record<string, Texts> = {
    kit,
    portada,
    vivo,
    zona,
    jugadas,
    box,
    previa,
    final,
    posiciones,
    lideres,
    estadisticas,
    ficha,
    fantasy,
    fanaticos,
    mas,
    animaciones,
    'segundo-plano': segundoPlano
};

/** Los textos PRO de un idioma, uno por archivo: { kit: {…}, vivo: {…}, … } */
export const proTexts = (lang: 'es' | 'en'): Record<string, object> => Object.fromEntries(Object.entries(FILES).map(([name, texts]) => [name, texts[lang] ?? {}]));
