// app.js - sitio público de Barber Drive (config.js debe cargarse ANTES)
const API_URL = `${SERVIDOR}/api`;
const BASE_URL = SERVIDOR;
const ANIO_RESERVAS = 2026;

// Datos de respaldo: solo se usan si el servidor no responde
const SERVICIOS_DEFAULT = [
  { IdServicio: 1, Nombre: "Corte Clásico / Fade", Descripcion: "Lavado, degradado y perfilado a navaja.", PrecioCordobas: 365.00 },
  { IdServicio: 2, Nombre: "Corte y Perfilado de Barba", Descripcion: "Servicio completo a domicilio + toalla caliente.", PrecioCordobas: 550.00 },
  { IdServicio: 3, Nombre: "Perfilado de Barba Senior", Descripcion: "Afeitado tradicional y contornos precisos.", PrecioCordobas: 290.00 }
];
const PROMOS_DEFAULT = [
  { Titulo: "Bono Bienvenida", Descripcion: "15% de descuento en tu primer servicio solicitándolo por la web.", Valor: "15%" },
  { Titulo: "Combo Dúo Familiar", Descripcion: "Dos cortes a domicilio en la misma ubicación por solo C$650.00 NIO.", Valor: "C$650" }
];

/* ---------- Utilidades ---------- */
function escapeHtml(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function fechaLocalHoy() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatearHoraCliente(hora24) {
  let [h, m] = String(hora24).split(':').map(Number);
  const sufijo = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, '0')} ${sufijo}`;
}

function avisoCliente(mensaje, tipo = 'ok') {
  const el = document.getElementById('toastCliente');
  if (!el) { alert(mensaje); return; }
  el.textContent = mensaje;
  el.className = `toast-cliente show ${tipo}`;
  clearTimeout(avisoCliente.timer);
  avisoCliente.timer = setTimeout(() => el.classList.remove('show'), 4500);
}

/* ---------- Inicio ---------- */
document.addEventListener('DOMContentLoaded', () => {
  cargarServicios();
  cargarZonas();
  cargarPromociones();
  cargarImagenesSitio();
  cargarHorarioSemanal();

  const campoFecha = document.getElementById('fechaCita');
  if (campoFecha) {
    const hoy = fechaLocalHoy();
    campoFecha.setAttribute('min', hoy);
    campoFecha.value = hoy;
    campoFecha.addEventListener('change', cargarHoras);
    cargarHoras();
  }

  const form = document.getElementById('bookingForm');
  if (form) form.addEventListener('submit', validarYEnviarReserva);

  // Menú en pantallas pequeñas
  const menuToggle = document.getElementById('menuToggle');
  const navLinks   = document.querySelector('.nav-links');
  if (menuToggle && navLinks) {
    menuToggle.addEventListener('click', () => {
      const abierto = navLinks.classList.toggle('abierto');
      menuToggle.setAttribute('aria-expanded', abierto);
    });
    navLinks.addEventListener('click', (e) => {
      if (e.target.closest('a')) navLinks.classList.remove('abierto');
    });
  }
});

/* ---------- SERVICIOS ---------- */
async function cargarServicios() {
  let servicios = SERVICIOS_DEFAULT;
  try {
    const res = await fetch(`${API_URL}/servicios`);
    if (res.ok) servicios = await res.json();
  } catch (err) {
    console.warn("Usando servicios de respaldo:", err.message);
  }

  const container = document.getElementById('servicesContainer');
  const select = document.getElementById('servicioSelect');
  if (!container || !select) return;

  container.innerHTML = servicios.length === 0 ? '<p>Pronto publicaremos nuestros servicios.</p>' : '';
  select.innerHTML = '<option value="" disabled selected>-- Elige un servicio --</option>';

  servicios.forEach(s => {
    const precio = Number(s.PrecioCordobas ?? s.Precio ?? 0).toFixed(2);
    container.innerHTML += `
      <div class="card">
        <div>
          <h3>${escapeHtml(s.Nombre)}</h3>
          <p>${escapeHtml(s.Descripcion)}</p>
        </div>
        <span class="price">C$ ${precio} NIO</span>
      </div>`;
    select.innerHTML += `<option value="${s.IdServicio}">${escapeHtml(s.Nombre)} (C$ ${precio})</option>`;
  });
}

/* ---------- DISTRITOS ---------- */
async function cargarZonas() {
  const select = document.getElementById('zonaSelect');
  if (!select) return;

  try {
    const res = await fetch(`${API_URL}/zonas`);
    if (!res.ok) throw new Error(`Error ${res.status}`);
    const zonas = await res.json();

    if (zonas.length === 0) {
      select.innerHTML = '<option value="" disabled selected>No hay distritos disponibles</option>';
      return;
    }
    select.innerHTML = '<option value="" disabled selected>-- Elige tu Distrito --</option>';
    zonas.forEach(z => {
      const texto = `${z.Nombre} - C$${Number(z.Costo).toFixed(0)}`;
      select.innerHTML += `<option value="${z.IdZona}">${escapeHtml(texto)}</option>`;
    });
  } catch (err) {
    console.warn("No se pudieron cargar los distritos:", err.message);
    select.innerHTML = '<option value="" disabled selected>No se pudieron cargar los distritos</option>';
  }
}

/* ---------- PROMOCIONES ---------- */
async function cargarPromociones() {
  let promos = PROMOS_DEFAULT;
  try {
    const res = await fetch(`${API_URL}/promociones`);
    if (res.ok) promos = await res.json();
  } catch (err) {
    console.warn("Usando promociones de respaldo:", err.message);
  }

  const container = document.getElementById('promosContainer');
  if (!container) return;

  container.innerHTML = promos.length === 0 ? '<p>No hay promociones activas por ahora.</p>' : '';
  promos.forEach(p => {
    container.innerHTML += `
      <div class="card" style="border-top-color: var(--primary-red);">
        <div>
          <h3><i class="fa-solid fa-tag"></i> ${escapeHtml(p.Titulo)}</h3>
          <p>${escapeHtml(p.Descripcion)}</p>
        </div>
        ${p.Valor ? `<span class="price">${escapeHtml(p.Valor)}</span>` : ''}
      </div>`;
  });
}

/* ---------- GALERÍA Y PORTADA (imágenes subidas desde el admin) ---------- */
async function cargarImagenesSitio() {
  try {
    const res = await fetch(`${API_URL}/imagenes`);
    if (!res.ok) return;
    const imagenes = await res.json();

    const galeria = imagenes.filter(i => i.Seccion === 'galeria');
    const cont = document.querySelector('.gallery-grid');
    if (cont && galeria.length > 0) {
      cont.innerHTML = galeria.map(i => `
        <div class="gallery-item">
          <img src="${BASE_URL}/uploads/${encodeURIComponent(i.Archivo)}" alt="${escapeHtml(i.Titulo)}">
          <h3>${escapeHtml(i.Titulo)}</h3>
        </div>`).join('');
    }

    const portada = imagenes.filter(i => i.Seccion === 'portada').pop();
    const hero = document.querySelector('.hero');
    if (hero && portada) {
      hero.style.background =
        `linear-gradient(135deg, rgba(15, 23, 42, 0.9), rgba(30, 58, 138, 0.85)), ` +
        `url('${BASE_URL}/uploads/${encodeURIComponent(portada.Archivo)}') center/cover`;
    }
  } catch (err) {
    console.warn("No se pudieron cargar las imágenes:", err.message);
  }
}

/* ---------- HORARIO SEMANAL (tarjetas informativas) ---------- */
function asegurarSeccionHorarios() {
  let cont = document.getElementById('horariosSitio');
  if (cont) return cont;

  const seccion = document.createElement('section');
  seccion.className = 'section-box';
  seccion.id = 'horarios';
  seccion.innerHTML = `
    <h2 class="section-title"><i class="fa-regular fa-clock"></i> Horarios de Atención</h2>
    <div id="horariosSitio" class="horarios-sitio"><p>Cargando horarios...</p></div>
    <p class="horarios-nota">Elige tu fecha en el formulario para ver qué horas están libres.</p>`;

  const promos = document.getElementById('promosContainer');
  const caja = promos ? (promos.closest('.section-box') || promos.parentElement) : null;
  if (caja) caja.after(seccion);
  else (document.querySelector('.content-col') || document.querySelector('main') || document.body).appendChild(seccion);
  return seccion.querySelector('#horariosSitio');
}

async function cargarHorarioSemanal() {
  const nombres = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const orden = [1, 2, 3, 4, 5, 6, 0];
  const cont = asegurarSeccionHorarios();

  try {
    const res = await fetch(`${API_URL}/horario-semanal`);
    if (!res.ok) throw new Error(`Error ${res.status}`);
    const lista = await res.json();

    if (lista.length === 0) {
      cont.innerHTML = '<p>Pronto publicaremos nuestros horarios.</p>';
      return;
    }
    const hoy = new Date().getDay();
    cont.innerHTML = orden.map(d => {
      const horas = lista.filter(h => h.DiaSemana === d);
      const clase = `dia-sitio${d === hoy ? ' hoy' : ''}${horas.length === 0 ? ' cerrado' : ''}`;
      const contenido = horas.length
        ? `<div class="chips-sitio">${horas.map(h => `<span class="chip-sitio">${formatearHoraCliente(h.Hora)}</span>`).join('')}</div>`
        : '<p>Sin atención</p>';
      return `<div class="${clase}"><h3>${nombres[d]}</h3>${contenido}</div>`;
    }).join('');
  } catch (err) {
    console.warn('No se pudo cargar el horario semanal:', err.message);
    cont.innerHTML = '<p>No se pudieron cargar los horarios. Intenta de nuevo más tarde.</p>';
  }
}

/* ---------- HORAS LIBRES DEL DÍA ELEGIDO ---------- */
async function cargarHoras() {
  const fecha  = document.getElementById('fechaCita')?.value;
  const select = document.getElementById('horaCita');
  if (!select) return;

  if (!fecha) {
    select.innerHTML = '<option value="" disabled selected>-- Elige una fecha --</option>';
    return;
  }

  select.innerHTML = '<option value="" disabled selected>Cargando horarios...</option>';
  try {
    const res = await fetch(`${API_URL}/disponibilidad?fecha=${encodeURIComponent(fecha)}`);
    if (!res.ok) throw new Error(`Error ${res.status}`);
    const horas = await res.json();

    if (horas.length === 0) {
      select.innerHTML = '<option value="" disabled selected>No hay horarios ese día</option>';
      return;
    }
    const libres = horas.filter(h => h.disponible).length;
    select.innerHTML =
      `<option value="" disabled selected>${libres ? '-- Elige una hora --' : 'Sin horas libres ese día'}</option>` +
      horas.map(h => `
        <option value="${h.hora}" ${h.disponible ? '' : 'disabled'}>
          ${formatearHoraCliente(h.hora)}${h.disponible ? '' : ' (ocupada)'}
        </option>`).join('');
  } catch (err) {
    console.warn('No se pudieron cargar las horas:', err.message);
    select.innerHTML = '<option value="" disabled selected>No se pudieron cargar los horarios</option>';
  }
}

/* ---------- GPS ---------- */
function obtenerUbicacionGPS() {
  if (!navigator.geolocation) {
    avisoCliente('Tu navegador no soporta geolocalización.', 'error');
    return;
  }
  navigator.geolocation.getCurrentPosition(position => {
    const { latitude, longitude } = position.coords;
    document.getElementById('direccion').value = `GPS: Lat ${latitude.toFixed(4)}, Lon ${longitude.toFixed(4)}`;
    avisoCliente('📍 Ubicación GPS capturada con éxito.');
  }, () => {
    avisoCliente('No se pudo obtener la ubicación. Ingresa tu dirección manualmente.', 'error');
  });
}

/* ---------- VALIDACIÓN Y ENVÍO ---------- */
async function validarYEnviarReserva(e) {
  e.preventDefault();

  const nombre    = document.getElementById('clienteNombre').value.trim();
  const telefono  = document.getElementById('clienteTelefono').value.trim();
  const servicio  = document.getElementById('servicioSelect').value;
  const zona      = document.getElementById('zonaSelect').value;
  const fecha     = document.getElementById('fechaCita').value;
  const hora      = document.getElementById('horaCita').value;
  const direccion = document.getElementById('direccion').value.trim();

  if (!nombre || !telefono || !servicio || !zona || !fecha || !hora || !direccion) {
    avisoCliente('⚠️ Todos los campos son obligatorios.', 'error');
    return;
  }

  const telLimpio = telefono.replace(/[\s-]/g, '');
  if (!/^\d{8,15}$/.test(telLimpio)) {
    avisoCliente('⚠️ El teléfono debe tener solo números (8 dígitos).', 'error');
    return;
  }

  if (fecha.slice(0, 4) !== String(ANIO_RESERVAS)) {
    avisoCliente(`⚠️ La fecha debe corresponder al año ${ANIO_RESERVAS}.`, 'error');
    return;
  }

  const idServicio = Number(servicio);
  const idZona     = Number(zona);
  if (!idServicio || !idZona) {
    avisoCliente('Error interno: servicio o distrito sin identificador.', 'error');
    return;
  }

  const form = e.target;
  const btn = form.querySelector('button[type="submit"]');
  if (btn.disabled) return;
  btn.disabled = true;

  try {
    const resp = await fetch(`${API_URL}/reservas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre, telefono: telLimpio, idServicio, idZona, fecha, hora, direccion })
    });
    const data = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      avisoCliente(data.message || data.error || 'No se pudo enviar la información.', 'error');
      if (resp.status === 409 || resp.status === 400) cargarHoras();   // refresca las horas ocupadas
      return;
    }

    avisoCliente('✅ La información se envió con éxito.');
    form.reset();
    const campoFecha = document.getElementById('fechaCita');
    if (campoFecha) campoFecha.value = fechaLocalHoy();
    cargarHoras();
  } catch (err) {
    console.error(err);
    avisoCliente('No se pudo conectar con el servidor.', 'error');
  } finally {
    btn.disabled = false;
  }
}