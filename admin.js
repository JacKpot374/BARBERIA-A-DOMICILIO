const API_URL = `${SERVIDOR}/api`;
// O si prefieres la fija:
API_URL = 'http://localhost:3000/api';

let reservas = [];
let totalSolicitudes = 0;
let serviciosCache = [];
let promosCache = [];
let editandoServicioId = null;
let editandoPromoId = null;

const tbody            = document.getElementById('adminReservasContainer');
const tbodySolicitudes = document.getElementById('solicitudesContainer');
const tbodyServicios   = document.getElementById('serviciosAdminContainer');
const tbodyPromos      = document.getElementById('promosAdminContainer');
const buscador         = document.getElementById('buscador');
const filtroEstado     = document.getElementById('filtroEstado');
const btnRecargar      = document.getElementById('btnRecargar');
const toastEl          = document.getElementById('toast');

const formServicio = document.getElementById('formServicio');
const formPromo    = document.getElementById('formPromo');

/* ---------- Utilidades ---------- */
function escapeHtml(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function mostrarToast(mensaje, tipo = 'ok') {
  toastEl.textContent = mensaje;
  toastEl.className = `toast show ${tipo}`;
  clearTimeout(mostrarToast.timer);
  mostrarToast.timer = setTimeout(() => toastEl.classList.remove('show'), 3000);
}

function formatearFecha(fechaISO) {
  if (!fechaISO) return '';
  const [y, m, d] = fechaISO.split('-');
  return `${d}/${m}/${y}`;
}

function formatearHora(hora24) {
  if (!hora24) return '';
  let [h, m] = hora24.split(':').map(Number);
  const sufijo = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, '0')} ${sufijo}`;
}

function fechaISOLocal(d) {
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

async function llamarAPI(ruta, metodo = 'GET', cuerpo = null) {
  const opciones = { method: metodo };
  if (cuerpo) {
    opciones.headers = { 'Content-Type': 'application/json' };
    opciones.body = JSON.stringify(cuerpo);
  }
  const resp = await fetch(`${API_URL}${ruta}`, opciones);
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.message || data.error || 'No se pudo completar la acción');
  return data;
}

function refrescarTodo() {
  return Promise.all([cargarSolicitudes(), cargarReservasAdmin(), cargarGrafico()]);
}

/* ---------- RESUMEN ---------- */
function actualizarResumen() {
  const contar = estado => reservas.filter(r => r.Estado === estado).length;
  document.getElementById('statTotal').textContent      = reservas.length + totalSolicitudes;
  document.getElementById('statPendiente').textContent  = contar('Pendiente') + totalSolicitudes;
  document.getElementById('statConfirmada').textContent = contar('Confirmada');
  document.getElementById('statCancelada').textContent  = contar('Cancelada');
}

/* ========== GRÁFICO: citas por día ========== */
async function cargarGrafico() {
  const cont = document.getElementById('graficoDias');
  if (!cont) return;
  try {
    const datos = await llamarAPI('/estadisticas/dias');
    const mapa = new Map(datos.map(d => [d.Fecha, Number(d.Total)]));

    const hoy = new Date();
    const dias = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + i);
      const clave = fechaISOLocal(d);
      dias.push({ d, clave, total: mapa.get(clave) || 0, esHoy: i === 0 });
    }

    const max = Math.max(1, ...dias.map(x => x.total));
    const nombresDia = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

    cont.innerHTML = dias.map(x => {
      const alto = x.total === 0 ? 0 : Math.max(8, (x.total / max) * 100);
      const clase = x.total === 0 ? 'vacia' : (x.esHoy ? 'hoy' : '');
      return `
        <div class="barra-col" title="${formatearFecha(x.clave)}: ${x.total} cita(s)">
          <span class="barra-valor">${x.total || ''}</span>
          <div class="barra ${clase}" style="height:${alto}%"></div>
        </div>`;
    }).join('');

    let etiquetas = cont.nextElementSibling;
    if (!etiquetas || !etiquetas.classList.contains('grafico-etiquetas')) {
      etiquetas = document.createElement('div');
      etiquetas.className = 'grafico-etiquetas';
      cont.after(etiquetas);
    }
    etiquetas.innerHTML = dias.map(x =>
      `<span><b>${x.d.getDate()}</b>${x.esHoy ? 'Hoy' : nombresDia[x.d.getDay()]}</span>`
    ).join('');
  } catch (err) {
    console.error('Error en gráfico:', err);
    cont.innerHTML = '<p class="table-msg error" style="width:100%">No se pudo cargar el gráfico.</p>';
  }
}

/* ========== SOLICITUDES POR APROBAR ========== */
async function cargarSolicitudes() {
  try {
    const lista = await llamarAPI('/solicitudes');
    totalSolicitudes = lista.length;
    actualizarResumen();

    if (lista.length === 0) {
      tbodySolicitudes.innerHTML = '<tr><td colspan="7" class="table-msg">No hay solicitudes pendientes.</td></tr>';
      return;
    }

    tbodySolicitudes.innerHTML = lista.map(s => `
      <tr>
        <td>#${s.IdSolicitud}</td>
        <td>${escapeHtml(s.Cliente)}</td>
        <td>${escapeHtml(s.Telefono)}</td>
        <td>${escapeHtml(s.Servicio)}</td>
        <td class="fecha-hora">${formatearFecha(s.Fecha)}<small>${formatearHora(s.Hora)}</small></td>
        <td>${escapeHtml(s.Direccion)}</td>
        <td>
          <div class="acciones">
            <button class="btn-action btn-confirmar" data-sol="aceptar"  data-id="${s.IdSolicitud}">Aceptar</button>
            <button class="btn-action btn-eliminar"  data-sol="rechazar" data-id="${s.IdSolicitud}">Rechazar</button>
          </div>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Error al cargar solicitudes:', err);
    tbodySolicitudes.innerHTML = '<tr><td colspan="7" class="table-msg error">No se pudieron cargar las solicitudes.</td></tr>';
  }
}

tbodySolicitudes.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-sol]');
  if (!btn) return;
  const { sol, id } = btn.dataset;

  if (sol === 'rechazar' && !confirm(`¿Rechazar la solicitud #${id}?`)) return;

  btn.disabled = true;
  try {
    const data = await llamarAPI(`/solicitudes/${id}/${sol}`, 'POST');
    mostrarToast(data.message, 'ok');
    await refrescarTodo();
  } catch (err) {
    mostrarToast(err.message, 'error');
    btn.disabled = false;
  }
});

/* ========== CITAS REGISTRADAS ========== */
async function cargarReservasAdmin() {
  tbody.innerHTML = '<tr><td colspan="8" class="table-msg">Cargando citas...</td></tr>';
  try {
    reservas = await llamarAPI('/reservas');
    actualizarResumen();
    renderizarTabla();
  } catch (err) {
    console.error('Error al cargar reservas:', err);
    tbody.innerHTML = `<tr><td colspan="8" class="table-msg error">
      No se pudo cargar. Asegúrate de que el servidor (server.js) esté encendido.</td></tr>`;
  }
}

function renderizarTabla() {
  const texto  = buscador.value.trim().toLowerCase();
  const estado = filtroEstado.value;

  const lista = reservas.filter(r => {
    const coincideEstado = !estado || r.Estado === estado;
    const coincideTexto  = !texto ||
      `${r.Cliente} ${r.Telefono} ${r.Servicio}`.toLowerCase().includes(texto);
    return coincideEstado && coincideTexto;
  });

  if (lista.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="table-msg">No hay citas que mostrar.</td></tr>';
    return;
  }

  tbody.innerHTML = lista.map(r => `
    <tr>
      <td>#${r.IdReserva}</td>
      <td>${escapeHtml(r.Cliente)}</td>
      <td>${escapeHtml(r.Telefono)}</td>
      <td>${escapeHtml(r.Servicio)}</td>
      <td class="fecha-hora">${formatearFecha(r.Fecha)}<small>${formatearHora(r.Hora)}</small></td>
      <td>${escapeHtml(r.Direccion)}</td>
      <td><span class="badge badge-${escapeHtml(r.Estado.toLowerCase())}">${escapeHtml(r.Estado)}</span></td>
      <td><div class="acciones">${botonesAccion(r)}</div></td>
    </tr>
  `).join('');
}

function botonesAccion(r) {
  const id = r.IdReserva;
  const btns = [];
  if (r.Estado === 'Pendiente') {
    btns.push(`<button class="btn-action btn-confirmar" data-accion="estado" data-id="${id}" data-estado="Confirmada">Confirmar</button>`);
  }
  if (r.Estado === 'Confirmada') {
    btns.push(`<button class="btn-action btn-completar" data-accion="estado" data-id="${id}" data-estado="Completada">Completar</button>`);
  }
  if (r.Estado === 'Pendiente' || r.Estado === 'Confirmada') {
    btns.push(`<button class="btn-action btn-cancelar" data-accion="estado" data-id="${id}" data-estado="Cancelada">Cancelar</button>`);
  }
  btns.push(`<button class="btn-action btn-eliminar" data-accion="eliminar" data-id="${id}">Eliminar</button>`);
  return btns.join('');
}

tbody.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-accion]');
  if (!btn) return;

  const { accion, id, estado } = btn.dataset;

  if (accion === 'eliminar' && !confirm(`¿Eliminar la cita #${id}? Esta acción no se puede deshacer.`)) return;
  if (accion === 'estado' && estado === 'Cancelada' && !confirm(`¿Cancelar la cita #${id}?`)) return;

  btn.disabled = true;
  try {
    const data = accion === 'estado'
      ? await llamarAPI(`/reservas/${id}/estado`, 'PUT', { estado })
      : await llamarAPI(`/reservas/${id}`, 'DELETE');
    mostrarToast(data.message, 'ok');
    await Promise.all([cargarReservasAdmin(), cargarGrafico()]);
  } catch (err) {
    mostrarToast(err.message, 'error');
    btn.disabled = false;
  }
});

/* ========== CORTES / SERVICIOS (agregar, editar, quitar) ========== */
function salirEdicionServicio() {
  editandoServicioId = null;
  formServicio.reset();
  formServicio.classList.remove('editando');
  document.getElementById('svBtnGuardar').textContent = '+ Agregar corte';
  document.getElementById('svBtnCancelar').hidden = true;
}

async function cargarServiciosAdmin() {
  try {
    serviciosCache = await llamarAPI('/servicios');
    if (serviciosCache.length === 0) {
      tbodyServicios.innerHTML = '<tr><td colspan="5" class="table-msg">No hay cortes. Agrega el primero arriba.</td></tr>';
      return;
    }
    tbodyServicios.innerHTML = serviciosCache.map(s => `
      <tr>
        <td>#${s.IdServicio}</td>
        <td>${escapeHtml(s.Nombre)}</td>
        <td>${escapeHtml(s.Descripcion)}</td>
        <td>C$ ${Number(s.PrecioCordobas).toFixed(2)}</td>
        <td>
          <div class="acciones">
            <button class="btn-action btn-editar"   data-op="editar" data-id="${s.IdServicio}">Editar</button>
            <button class="btn-action btn-eliminar" data-op="quitar" data-id="${s.IdServicio}">Quitar</button>
          </div>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Error al cargar cortes:', err);
    tbodyServicios.innerHTML = '<tr><td colspan="5" class="table-msg error">No se pudieron cargar los cortes. ¿Está encendido server.js?</td></tr>';
  }
}

formServicio.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('svBtnGuardar');
  btn.disabled = true;

  const cuerpo = {
    nombre:      document.getElementById('svNombre').value,
    descripcion: document.getElementById('svDescripcion').value,
    precio:      document.getElementById('svPrecio').value
  };

  try {
    const data = editandoServicioId
      ? await llamarAPI(`/servicios/${editandoServicioId}`, 'PUT', cuerpo)
      : await llamarAPI('/servicios', 'POST', cuerpo);
    mostrarToast(data.message, 'ok');
    salirEdicionServicio();
    await cargarServiciosAdmin();
  } catch (err) {
    mostrarToast(err.message, 'error');
  } finally {
    btn.disabled = false;
  }
});

document.getElementById('svBtnCancelar').addEventListener('click', salirEdicionServicio);

tbodyServicios.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-op]');
  if (!btn) return;
  const id = Number(btn.dataset.id);

  if (btn.dataset.op === 'editar') {
    const s = serviciosCache.find(x => x.IdServicio === id);
    if (!s) return;
    editandoServicioId = id;
    document.getElementById('svNombre').value      = s.Nombre;
    document.getElementById('svDescripcion').value = s.Descripcion || '';
    document.getElementById('svPrecio').value      = Number(s.PrecioCordobas);
    formServicio.classList.add('editando');
    document.getElementById('svBtnGuardar').textContent = 'Guardar cambios';
    document.getElementById('svBtnCancelar').hidden = false;
    formServicio.scrollIntoView({ behavior: 'smooth', block: 'center' });
    document.getElementById('svNombre').focus();
    return;
  }

  if (!confirm('¿Quitar este corte de la página principal?')) return;
  btn.disabled = true;
  try {
    const data = await llamarAPI(`/servicios/${id}`, 'DELETE');
    mostrarToast(data.message, 'ok');
    if (editandoServicioId === id) salirEdicionServicio();
    await cargarServiciosAdmin();
  } catch (err) {
    mostrarToast(err.message, 'error');
    btn.disabled = false;
  }
});

/* ========== PROMOCIONES (agregar, editar, quitar) ========== */
function salirEdicionPromo() {
  editandoPromoId = null;
  formPromo.reset();
  formPromo.classList.remove('editando');
  document.getElementById('prBtnGuardar').textContent = '+ Agregar promoción';
  document.getElementById('prBtnCancelar').hidden = true;
}

async function cargarPromosAdmin() {
  try {
    promosCache = await llamarAPI('/promociones');
    if (promosCache.length === 0) {
      tbodyPromos.innerHTML = '<tr><td colspan="5" class="table-msg">No hay promociones. Agrega la primera arriba.</td></tr>';
      return;
    }
    tbodyPromos.innerHTML = promosCache.map(p => `
      <tr>
        <td>#${p.IdPromocion}</td>
        <td>${escapeHtml(p.Titulo)}</td>
        <td>${escapeHtml(p.Descripcion)}</td>
        <td>${escapeHtml(p.Valor) || '—'}</td>
        <td>
          <div class="acciones">
            <button class="btn-action btn-editar"   data-op="editar" data-id="${p.IdPromocion}">Editar</button>
            <button class="btn-action btn-eliminar" data-op="quitar" data-id="${p.IdPromocion}">Quitar</button>
          </div>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Error al cargar promociones:', err);
    tbodyPromos.innerHTML = '<tr><td colspan="5" class="table-msg error">No se pudieron cargar las promociones. ¿Está encendido server.js?</td></tr>';
  }
}

formPromo.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('prBtnGuardar');
  btn.disabled = true;

  const cuerpo = {
    titulo:      document.getElementById('prTitulo').value,
    descripcion: document.getElementById('prDescripcion').value,
    valor:       document.getElementById('prValor').value
  };

  try {
    const data = editandoPromoId
      ? await llamarAPI(`/promociones/${editandoPromoId}`, 'PUT', cuerpo)
      : await llamarAPI('/promociones', 'POST', cuerpo);
    mostrarToast(data.message, 'ok');
    salirEdicionPromo();
    await cargarPromosAdmin();
  } catch (err) {
    mostrarToast(err.message, 'error');
  } finally {
    btn.disabled = false;
  }
});

document.getElementById('prBtnCancelar').addEventListener('click', salirEdicionPromo);

tbodyPromos.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-op]');
  if (!btn) return;
  const id = Number(btn.dataset.id);

  if (btn.dataset.op === 'editar') {
    const p = promosCache.find(x => x.IdPromocion === id);
    if (!p) return;
    editandoPromoId = id;
    document.getElementById('prTitulo').value      = p.Titulo;
    document.getElementById('prDescripcion').value = p.Descripcion || '';
    document.getElementById('prValor').value       = p.Valor || '';
    formPromo.classList.add('editando');
    document.getElementById('prBtnGuardar').textContent = 'Guardar cambios';
    document.getElementById('prBtnCancelar').hidden = false;
    formPromo.scrollIntoView({ behavior: 'smooth', block: 'center' });
    document.getElementById('prTitulo').focus();
    return;
  }

  if (!confirm('¿Quitar esta promoción de la página principal?')) return;
  btn.disabled = true;
  try {
    const data = await llamarAPI(`/promociones/${id}`, 'DELETE');
    mostrarToast(data.message, 'ok');
    if (editandoPromoId === id) salirEdicionPromo();
    await cargarPromosAdmin();
  } catch (err) {
    mostrarToast(err.message, 'error');
    btn.disabled = false;
  }
});

/* ---------- Eventos generales e inicio ---------- */
buscador.addEventListener('input', renderizarTabla);
filtroEstado.addEventListener('change', renderizarTabla);
btnRecargar.addEventListener('click', () => {
  refrescarTodo();
  cargarServiciosAdmin();
  cargarPromosAdmin();
});

refrescarTodo();
cargarServiciosAdmin();
cargarPromosAdmin();