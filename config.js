// config.js - dirección del servidor. Debe cargarse ANTES de app.js, auth.js y admin.js
const URL_PUBLICA = '  https://weapon-python-apnic-strengths.trycloudflare.com   ';

const SERVIDOR = (() => {
  const h = location.hostname;
  const enMiRed = h === 'localhost' || h === '127.0.0.1' ||
                  /^192\.168\./.test(h) || /^10\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h);
  return enMiRed ? `http://${h}:3000` : URL_PUBLICA;
})();