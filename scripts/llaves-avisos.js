// Genera las llaves VAPID para los avisos con la app cerrada. Córrelo tú (node scripts/llaves-avisos.js) y pega lo
// que salga en Vercel → Settings → Environment Variables. La privada no se comparte ni se sube al repositorio.
const crypto = require('crypto');

const b64url = (buffer) => buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const ecdh = crypto.createECDH('prime256v1');
ecdh.generateKeys();

console.log(`VAPID_PUBLIC_KEY=${b64url(ecdh.getPublicKey())}`);
// 32 bytes siempre (si empieza con ceros, Node la da más corta)
const privateKey = ecdh.getPrivateKey();
console.log(`VAPID_PRIVATE_KEY=${b64url(Buffer.concat([Buffer.alloc(32 - privateKey.length), privateKey]))}`);
console.log('VAPID_SUBJECT=mailto:tu-correo@ejemplo.com');
console.log(`PUSH_SECRET=${b64url(crypto.randomBytes(32))}`);
