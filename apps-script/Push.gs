/**
 * Bassment Hub — firma delle notifiche (Web Push, VAPID / ES256).
 * Curva P-256 in JavaScript puro, perché Apps Script non ha ECDSA.
 * Le chiavi vengono create qui dentro e restano nelle Proprietà dello script: non sono nel codice.
 */
const P256 = (() => {
  const p = 0xffffffff00000001000000000000000000000000ffffffffffffffffffffffffn;
  const n = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
  const a = p - 3n;
  const b = 0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604bn;
  const G = [0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296n, 0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5n];
  const mod = (x, m) => { const r = x % m; return r >= 0n ? r : r + m; };
  function inv(x, m) {
    let [r0, r1] = [mod(x, m), m], [s0, s1] = [1n, 0n];
    while (r1) { const q = r0 / r1; [r0, r1] = [r1, r0 - q * r1]; [s0, s1] = [s1, s0 - q * s1]; }
    return mod(s0, m);
  }
  // coordinate jacobiane [X, Y, Z]; punto all'infinito = Z 0
  function dbl(P) {
    const [X, Y, Z] = P;
    if (!Z || !Y) return [0n, 1n, 0n];
    const YY = mod(Y * Y, p), S = mod(4n * X * YY, p), ZZ = mod(Z * Z, p);
    const M = mod(3n * X * X + a * ZZ * ZZ, p);
    const X3 = mod(M * M - 2n * S, p);
    return [X3, mod(M * (S - X3) - 8n * YY * YY, p), mod(2n * Y * Z, p)];
  }
  function add(P, Q) {
    if (!P[2]) return Q; if (!Q[2]) return P;
    const Z1Z1 = mod(P[2] * P[2], p), Z2Z2 = mod(Q[2] * Q[2], p);
    const U1 = mod(P[0] * Z2Z2, p), U2 = mod(Q[0] * Z1Z1, p);
    const S1 = mod(P[1] * Q[2] * Z2Z2, p), S2 = mod(Q[1] * P[2] * Z1Z1, p);
    if (U1 === U2) return S1 === S2 ? dbl(P) : [0n, 1n, 0n];
    const H = mod(U2 - U1, p), R = mod(S2 - S1, p), HH = mod(H * H, p), HHH = mod(H * HH, p), V = mod(U1 * HH, p);
    const X3 = mod(R * R - HHH - 2n * V, p);
    return [X3, mod(R * (V - X3) - S1 * HHH, p), mod(P[2] * Q[2] * H, p)];
  }
  function mul(k, P) {
    let R = [0n, 1n, 0n], Q = [P[0], P[1], 1n];
    while (k > 0n) { if (k & 1n) R = add(R, Q); Q = dbl(Q); k >>= 1n; }
    return R;
  }
  function affine(P) { const zi = inv(P[2], p), zi2 = mod(zi * zi, p); return [mod(P[0] * zi2, p), mod(P[1] * zi2 * zi, p)]; }
  const onCurve = ([x, y]) => mod(y * y - (x * x * x + a * x + b), p) === 0n;
  return { p, n, G, mod, inv, mul, affine, onCurve };
})();

/* ---- byte e numeri ---- */
function bytesToBig_(bs) { let x = 0n; for (const v of bs) x = (x << 8n) | BigInt(v & 255); return x; }
function bigToBytes_(x, len) { const out = new Array(len); for (let i = len - 1; i >= 0; i--) { out[i] = Number(x & 255n); x >>= 8n; } return out; }
function b64u_(bytes) { return Utilities.base64EncodeWebSafe(bytes.map(v => (v > 127 ? v - 256 : v))).replace(/=+$/, ''); }
function b64uStr_(s) { return Utilities.base64EncodeWebSafe(s, Utilities.Charset.UTF_8).replace(/=+$/, ''); }
function u8_(javaBytes) { return javaBytes.map(v => v & 255); }
function sha256_(bytes) { return u8_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes.map(v => (v > 127 ? v - 256 : v)))); }
function hmac_(key, data) { return u8_(Utilities.computeHmacSignature(Utilities.MacAlgorithm.HMAC_SHA_256, data.map(v => (v > 127 ? v - 256 : v)), key.map(v => (v > 127 ? v - 256 : v)))); }
function strBytes_(s) { return u8_(Utilities.newBlob(s).getBytes()); }

/* ---- firma ECDSA deterministica (RFC 6979) ---- */
function ecdsaSign_(d, msgBytes) {
  const n = P256.n, h1 = sha256_(msgBytes), e = bytesToBig_(h1) % n;
  const x = bigToBytes_(d, 32), h = bigToBytes_(e, 32);
  let V = new Array(32).fill(1), K = new Array(32).fill(0);
  K = hmac_(K, V.concat([0], x, h)); V = hmac_(K, V);
  K = hmac_(K, V.concat([1], x, h)); V = hmac_(K, V);
  for (;;) {
    V = hmac_(K, V);
    const k = bytesToBig_(V);
    if (k > 0n && k < n) {
      const R = P256.affine(P256.mul(k, P256.G));
      const r = R[0] % n;
      const s = P256.mod(P256.inv(k, n) * (e + r * d), n);
      if (r && s) return bigToBytes_(r, 32).concat(bigToBytes_(s, 32));
    }
    K = hmac_(K, V.concat([0])); V = hmac_(K, V);
  }
}

/* ---- chiavi VAPID: create una volta, salvate nelle Proprietà dello script ---- */
function vapidKeys_() {
  const props = PropertiesService.getScriptProperties();
  let d = props.getProperty('VAPID_D'), pub = props.getProperty('VAPID_PUB');
  if (!d || !pub) {
    let seed = [];
    for (let i = 0; i < 8; i++) seed = seed.concat(strBytes_(Utilities.getUuid()));
    seed = seed.concat(strBytes_(String(Date.now()) + Math.random()));
    let dn = 0n;
    while (dn <= 0n || dn >= P256.n) { seed = sha256_(seed.concat(strBytes_(Utilities.getUuid()))); dn = bytesToBig_(seed); }
    const Q = P256.affine(P256.mul(dn, P256.G));
    d = dn.toString(16);
    pub = b64u_([4].concat(bigToBytes_(Q[0], 32), bigToBytes_(Q[1], 32)));
    props.setProperties({ VAPID_D: d, VAPID_PUB: pub });
  }
  return { d: BigInt('0x' + d), pub: pub };
}
function vapidPublicKey() { return vapidKeys_().pub; }

function vapidAuth_(endpoint) {
  const aud = endpoint.match(/^https:\/\/[^/]+/)[0];
  const cache = CacheService.getScriptCache(), ck = 'vapid:' + aud;
  const hit = cache.get(ck);
  if (hit) return hit;
  const keys = vapidKeys_();
  const head = b64uStr_(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const body = b64uStr_(JSON.stringify({ aud: aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: 'https://anteeero.github.io/bassment-hub/' }));
  const sig = b64u_(ecdsaSign_(keys.d, strBytes_(head + '.' + body)));
  const auth = 'vapid t=' + head + '.' + body + '.' + sig + ', k=' + keys.pub;
  cache.put(ck, auth, 6 * 3600);
  return auth;
}

/* Manda una "spinta" vuota: il telefono si sveglia e chiede all'app cosa mostrare. */
function pushTo_(sub) {
  const res = UrlFetchApp.fetch(sub.endpoint, {
    method: 'post', muteHttpExceptions: true, payload: '',
    headers: { TTL: '86400', Urgency: 'high', Authorization: vapidAuth_(sub.endpoint) }
  });
  return res.getResponseCode();
}
