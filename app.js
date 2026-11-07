const API_URL = "http://localhost:3000/api";

// DATOS DE RESPALDO (para que la interfaz nunca quede en blanco)
const SERVICIOS_DEFAULT = [
  { IdServicio: 1, Nombre: "Corte Clásico / Fade", Descripcion: "Lavado, degradado y perfilado a navaja.", PrecioCordobas: 300.00 },
  { IdServicio: 2, Nombre: "Corte y Perfilado de Barba", Descripcion: "Servicio completo a domicilio + toalla caliente.", PrecioCordobas: 450.00 },
  { IdServicio: 3, Nombre: "Perfilado de Barba Senior", Descripcion: "Afeitado tradicional y contornos precisos.", PrecioCordobas: 150.00 }
];

const PROMOS_DEFAULT = [
  { Titulo: "Bono Bienvenida", Descripcion: "15% de descuento en tu primer servicio solicitándolo por la web." },
  { Titulo: "Combo Dúo Familiar", Descripcion: "Dos cortes a domicilio en la misma dirección por solo C$650.00 NIO." }
];

/* ---------- Utilidades ---------- */
function escapeHtml(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// Fecha local (YYYY-MM-DD), no en UTC
function fechaLocalHoy() {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

function avisoCliente(mensaje, tipo = 'ok') {
  const el = document.getElementById('toastCliente');
  if (!el) { alert(mensaje); return; }   // respaldo si falta el div
  el.textContent = mensaje;
  el.className = `toast-cliente show ${tipo}`;
  clearTimeout(avisoCliente.timer);
  avisoCliente.timer = setTimeout(() => el.classList.remove('show'), 4000);
}

/* ---------- Inicio ---------- */
document.addEventListener('DOMContentLoaded', () => {
  cargarServicios();
  cargarZonas();
  cargarPromociones();

  const hoy = fechaLocalHoy();
  const campoFecha = document.getElementById('fechaCita');
  if (campoFecha) {
    campoFecha.setAttribute('min', hoy);
    campoFecha.value = hoy;
  }

  const form = document.getElementById('bookingForm');
  if (form) {
    form.addEventListener('submit', validarYEnviarReserva);
  }
});

/* ---------- SERVICIOS ---------- */
async function cargarServicios() {
  let servicios = SERVICIOS_DEFAULT;

  try {
    const res = await fetch(`${API_URL}/servicios`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.length > 0) servicios = data;
    }
  } catch (err) {
    console.warn("Usando datos locales de servicios por respaldo de red.");
  }

  const container = document.getElementById('servicesContainer');
  const select = document.getElementById('servicioSelect');
  if (!container || !select) return;

  container.innerHTML = '';
  select.innerHTML = '<option value="" disabled selected>-- Elige un servicio --</option>';

  servicios.forEach(s => {
    const precio = Number(s.PrecioCordobas !== undefined ? s.PrecioCordobas : (s.Precio || 0)).toFixed(2);

    container.innerHTML += `
      <div class="card">
        <div>
          <h3>${escapeHtml(s.Nombre)}</h3>
          <p>${escapeHtml(s.Descripcion)}</p>
        </div>
        <span class="price">C$ ${precio} NIO</span>
      </div>
    `;
    // value = ID numérico (es lo que necesita la base de datos)
    select.innerHTML += `<option value="${s.IdServicio}">${escapeHtml(s.Nombre)} (C$ ${precio})</option>`;
  });
}

/* ---------- ZONAS ---------- */
async function cargarZonas() {
  const select = document.getElementById('zonaSelect');
  if (!select) return;

  try {
    const res = await fetch(`${API_URL}/zonas`);
    if (!res.ok) throw new Error(`Error ${res.status}`);
    const zonas = await res.json();
    if (!zonas || zonas.length === 0) throw new Error('Sin zonas');

    select.innerHTML = '<option value="" disabled selected>-- Elige tu Distrito --</option>';
    zonas.forEach(z => {
      // Nombres de columna tolerantes (ajusta si los tuyos son distintos)
      const id     = z.IdZona ?? z.Id;
      const nombre = z.Nombre ?? z.NombreZona ?? z.Distrito ?? `Zona ${id}`;
      const costo  = z.Costo ?? z.CostoEnvio ?? z.CostoTransporte ?? z.Recargo;
      const texto  = costo !== undefined && costo !== null
        ? `${nombre} - C$${Number(costo).toFixed(0)}`
        : nombre;
      select.innerHTML += `<option value="${id}">${escapeHtml(texto)}</option>`;
    });
  } catch (err) {
    console.warn("No se pudieron cargar las zonas desde la BD:", err.message);
  }
}

/* ---------- PROMOCIONES ---------- */
async function cargarPromociones() {
  let promos = PROMOS_DEFAULT;

  try {
    const res = await fetch(`${API_URL}/promociones`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.length > 0) promos = data;
    }
  } catch (err) {
    console.warn("Usando datos locales de promociones por respaldo de red.");
  }

  const container = document.getElementById('promosContainer');
  if (!container) return;

  container.innerHTML = '';
  promos.forEach(p => {
    container.innerHTML += `
      <div class="card" style="border-top-color: var(--primary-red);">
        <h3><i class="fa-solid fa-tag"></i> ${escapeHtml(p.Titulo)}</h3>
        <p>${escapeHtml(p.Descripcion)}</p>
      </div>
    `;
  });
}

/* ---------- GPS ---------- */
function obtenerUbicacionGPS() {
  if (!navigator.geolocation) {
    avisoCliente('Tu navegador no soporta geolocalización.', 'error');
    return;
  }
  navigator.geolocation.getCurrentPosition(position => {
    const lat = position.coords.latitude;
    const lon = position.coords.longitude;
    document.getElementById('direccion').value = `GPS: Lat ${lat.toFixed(4)}, Lon ${lon.toFixed(4)}`;
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

  // Teléfono: solo dígitos (se permiten espacios y guiones al escribir)
  const telLimpio = telefono.replace(/[\s-]/g, '');
  if (!/^\d{8,15}$/.test(telLimpio)) {
    avisoCliente('⚠️ El teléfono debe tener solo números (8 dígitos).', 'error');
    return;
  }

  if (fecha.slice(0, 4) !== '2026') {
    avisoCliente('⚠️ La fecha debe corresponder al año 2026.', 'error');
    return;
  }

  const idServicio = Number(servicio);
  const idZona     = Number(zona);
  if (!idServicio || !idZona) {
    console.error('Los select no tienen IDs numéricos:', { servicio, zona });
    avisoCliente('Error interno: servicio o zona sin identificador.', 'error');
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
      return;
    }

    avisoCliente('✅ La información se envió con éxito.');
    form.reset();
    const campoFecha = document.getElementById('fechaCita');
    if (campoFecha) campoFecha.value = fechaLocalHoy();
  } catch (err) {
    console.error(err);
    avisoCliente('No se pudo conectar con el servidor.', 'error');
  } finally {
    btn.disabled = false;
  }
}