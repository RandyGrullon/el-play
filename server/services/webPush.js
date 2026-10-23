const crypto = require('crypto');

// Web Push sin dependencias: la firma VAPID (RFC 8292) y el cifrado del mensaje (RFC 8291, aes128gcm) con el
// crypto de Node. Las llaves VAPID van en base64url: la pública sin comprimir (65 bytes) y la privada (32 bytes).

const b64url = (buffer) => Buffer.from(buffer).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (text) => Buffer.from(String(text).replace(/-/g, '+').replace(/_/g, '/'), 'base64');

/** Llave privada de Node a partir de las dos de VAPID (la pública trae x e y) */
const vapidKey = (publicKey, privateKey) => {
    const raw = fromB64url(publicKey);
    if (raw.length !== 65 || raw[0] !== 4) throw new Error('VAPID_PUBLIC_KEY inválida');
    return crypto.createPrivateKey({
        // La privada mide 32 bytes (si empezaba con ceros a veces llega más corta)
        key: { kty: 'EC', crv: 'P-256', x: b64url(raw.subarray(1, 33)), y: b64url(raw.subarray(33, 65)), d: b64url(Buffer.concat([Buffer.alloc(Math.max(0, 32 - fromB64url(privateKey).length)), fromB64url(privateKey)])) },
        format: 'jwk'
    });
};

/** «Authorization: vapid t=…, k=…» para el servicio de avisos del navegador (válido 12 horas) */
const vapidHeader = (endpoint, { publicKey, privateKey, subject }, now = Date.now()) => {
    const audience = new URL(endpoint).origin;
    const header = b64url(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
    const claims = b64url(JSON.stringify({ aud: audience, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject }));
    const signature = crypto.sign('sha256', Buffer.from(`${header}.${claims}`), { key: vapidKey(publicKey, privateKey), dsaEncoding: 'ieee-p1363' });
    return `vapid t=${header}.${claims}.${b64url(signature)}, k=${publicKey}`;
};

/**
 * Cifra el mensaje para una suscripción (p256dh y auth del navegador). Devuelve el cuerpo listo para mandar con
 * Content-Encoding: aes128gcm. `salt` y `serverKeys` solo se pasan en las pruebas.
 */
const encrypt = (payload, p256dh, auth, { salt = crypto.randomBytes(16), serverKeys = null } = {}) => {
    const clientPublic = fromB64url(p256dh);
    const authSecret = fromB64url(auth);
    const ecdh = serverKeys || crypto.createECDH('prime256v1');
    if (!serverKeys) ecdh.generateKeys();
    const serverPublic = ecdh.getPublicKey();
    const shared = ecdh.computeSecret(clientPublic);
    // IKM = HKDF(auth, ecdh, "WebPush: info" || 0 || ua_public || as_public)
    const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), clientPublic, serverPublic]);
    const ikm = Buffer.from(crypto.hkdfSync('sha256', shared, authSecret, keyInfo, 32));
    const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
    const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
    const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
    // Un solo registro: el mensaje y el delimitador de último registro (2)
    const body = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
    const recordSize = Buffer.alloc(4);
    recordSize.writeUInt32BE(4096);
    return Buffer.concat([salt, recordSize, Buffer.from([serverPublic.length]), serverPublic, body]);
};

/**
 * Manda un aviso. Devuelve el estado HTTP: 201/200 salió; 404 o 410 la suscripción ya no existe (hay que borrarla).
 */
const sendPush = async (subscription, message, vapid, { ttl = 600, urgency = 'high', topic } = {}) => {
    const body = encrypt(JSON.stringify(message), subscription.p256dh, subscription.auth);
    const headers = {
        Authorization: vapidHeader(subscription.endpoint, vapid),
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: String(ttl),
        Urgency: urgency
    };
    // Topic: un aviso nuevo del mismo tema reemplaza al viejo si el teléfono estaba apagado (máx. 32 caracteres base64url)
    if (topic) headers.Topic = topic.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32);
    const response = await fetch(subscription.endpoint, { method: 'POST', headers, body, signal: AbortSignal.timeout(8000) });
    return response.status;
};

module.exports = { b64url, fromB64url, vapidHeader, encrypt, sendPush };
