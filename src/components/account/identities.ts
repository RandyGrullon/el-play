// Formas de entrar a la cuenta abierta: correo (siempre) y Google. Viven en lib/account (como en la web); aquí solo
// se reexportan para la tarjeta. Los errores son AccountError con los mismos códigos que la web.
export { getIdentities, linkGoogle, linkingOff, unlinkIdentity, type Identity } from '../../lib/account';
