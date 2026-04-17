const Hmac = {
  sign(body) {
    const secret = PropertiesService.getScriptProperties().getProperty('HMAC_SECRET');
    if (!secret) throw new Error('HMAC_SECRET not set. Run Setup.bootstrap().');
    const raw = Utilities.computeHmacSha256Signature(body, secret);
    return raw.map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
  },

  verify(body, sig) {
    if (!sig) return false;
    const expected = this.sign(body);
    return _timingSafeEqual(expected, String(sig).replace(/^sha256=/, ''));
  },
};

function _timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
