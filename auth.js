// auth.js - inicio de sesión del panel admin (se carga ANTES de admin.js)
(function () {
  let API_URL = `${SERVIDOR}/api`;
// O si prefieres la fija:
  API_URL = 'http://localhost:3000/api';
  const CLAVE = 'barberDriveToken';
  const originalFetch = window.fetch.bind(window);

  function leerToken()   { try { return sessionStorage.getItem(CLAVE); } catch (e) { return null; } }
  function guardarToken(t) { try { sessionStorage.setItem(CLAVE, t); } catch (e) {} }
  function borrarToken() { try { sessionStorage.removeItem(CLAVE); } catch (e) {} }

  const overlay = document.getElementById('loginOverlay');
  const form    = document.getElementById('formLogin');
  const errorEl = document.getElementById('loginError');
  const btn     = document.getElementById('loginBtn');

  function mostrarLogin() {
    document.body.classList.add('bloqueado');
    overlay.hidden = false;
    document.getElementById('loginUsuario').focus();
  }
  function ocultarLogin() {
    document.body.classList.remove('bloqueado');
    overlay.hidden = true;
  }

  // Todas las llamadas a la API llevan el token; si el servidor responde 401, vuelve el login
  window.fetch = async function (url, opts) {
    opts = opts || {};
    const esAPI = typeof url === 'string' && url.startsWith(API) && !url.startsWith(API + '/login');
    if (esAPI) {
      const token = leerToken();
      if (token) {
        opts = Object.assign({}, opts, {
          headers: Object.assign({}, opts.headers || {}, { Authorization: 'Bearer ' + token })
        });
      }
    }
    const resp = await originalFetch(url, opts);
    if (esAPI && resp.status === 401) {
      borrarToken();
      mostrarLogin();
    }
    return resp;
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.textContent = '';
    btn.disabled = true;
    try {
      const resp = await originalFetch(API + '/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          usuario: document.getElementById('loginUsuario').value.trim(),
          clave:   document.getElementById('loginClave').value
        })
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.message || 'No se pudo iniciar sesión.');
      guardarToken(data.token);
      location.reload();
    } catch (err) {
      errorEl.textContent = err.message === 'Failed to fetch'
        ? 'No se pudo conectar con el servidor (¿está encendido server.js?).'
        : err.message;
      document.getElementById('loginClave').value = '';
      btn.disabled = false;
    }
  });

   document.addEventListener('click', async (e) => {
    if (!e.target.closest('#btnSalir')) return;
    try { await window.fetch(API + '/logout', { method: 'POST' }); } catch (err) {}
    borrarToken();
    location.reload();
  });

  // Al abrir la página: comprobar si ya hay una sesión válida
  (async function () {
    if (!leerToken()) { mostrarLogin(); return; }
    try {
      const resp = await window.fetch(API + '/sesion');
      if (resp.ok) ocultarLogin();
    } catch (e) {
      mostrarLogin();
      errorEl.textContent = 'No se pudo conectar con el servidor (¿está encendido server.js?).';
    }
  })();
})();