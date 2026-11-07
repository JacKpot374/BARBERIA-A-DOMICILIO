const API_URL = 'http://localhost:3000/api';

let reservas = [];   // copia local para filtrar sin volver a consultar

const tbody        = document.getElementById('adminReservasContainer');
const buscador     = document.getElementById('buscador');
const filtroEstado = document.getElementById('filtroEstado');
const btnRecargar  = document.getElementById('btnRecargar');
const toastEl      = document.getElementById('toast');

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

/* ---------- READ ---------- */
async function cargarReservasAdmin() {
  tbody.innerHTML = '<tr><td colspan="8" class="table-msg">Cargando citas...</td></tr>';
  try {
    const resp = await fetch(`${API_URL}/reservas`);
    if (!resp.ok) throw new Error(`Error ${resp.status}`);
    reservas = await resp.json();
    actualizarResumen();
    renderizarTabla();
  } catch (err) {
    console.error('Error al cargar reservas:', err);
    tbody.innerHTML = `<tr><td colspan="8" class="table-msg error">
      No se pudo cargar. Asegúrate de que el servidor (server.js) esté encendido.</td></tr>`;
  }
}

function actualizarResumen() {
  const contar = estado => reservas.filter(r => r.Estado === estado).length;
  document.getElementById('statTotal').textContent      = reservas.length;
  document.getElementById('statPendiente').textContent  = contar('Pendiente');
  document.getElementById('statConfirmada').textContent = contar('Confirmada');
  document.getElementById('statCancelada').textContent  = contar('Cancelada');
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

/* ---------- UPDATE ---------- */
async function cambiarEstado(id, estado) {
  const resp = await fetch(`${API_URL}/reservas/${id}/estado`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ estado })
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.message || data.error || 'No se pudo actualizar');
  return data.message;
}

/* ---------- DELETE ---------- */
async function eliminarReserva(id) {
  const resp = await fetch(`${API_URL}/reservas/${id}`, { method: 'DELETE' });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.message || data.error || 'No se pudo eliminar');
  return data.message;
}

/* ---------- Eventos ---------- */
tbody.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-accion]');
  if (!btn) return;

  const { accion, id, estado } = btn.dataset;

  if (accion === 'eliminar' && !confirm(`¿Eliminar la cita #${id}? Esta acción no se puede deshacer.`)) return;
  if (accion === 'estado' && estado === 'Cancelada' && !confirm(`¿Cancelar la cita #${id}?`)) return;

  btn.disabled = true;
  try {
    const mensaje = accion === 'estado'
      ? await cambiarEstado(id, estado)
      : await eliminarReserva(id);
    mostrarToast(mensaje, 'ok');
    await cargarReservasAdmin();
  } catch (err) {
    mostrarToast(err.message, 'error');
    btn.disabled = false;
  }
});

buscador.addEventListener('input', renderizarTabla);
filtroEstado.addEventListener('change', renderizarTabla);
btnRecargar.addEventListener('click', cargarReservasAdmin);

cargarReservasAdmin();

// Ejemplo de cómo debe mapear admin.js los datos devueltos por la API /api/reservas:
reservas.forEach(reserva => {
    const fila = document.createElement('tr');
    fila.innerHTML = `
        <td>#${reserva.IdReserva || reserva.id}</td>
        <td>${reserva.NombreCliente || reserva.cliente || 'N/D'}</td>
        <td>${reserva.Telefono || reserva.telefono || 'N/D'}</td>
        <td>${reserva.NombreServicio || reserva.servicio || 'N/D'}</td>
        <td>${reserva.FechaHora || reserva.fecha || 'N/D'}</td>
        <td>${reserva.Direccion || reserva.direccion || 'N/D'}</td>
        <td><span class="badge ${reserva.Estado ? reserva.Estado.toLowerCase() : 'pendiente'}">${reserva.Estado || 'Pendiente'}</span></td>
        <td>
          <div class="btn-action-group">
            <button class="btn-action-confirm" onclick="cambiarEstado(${reserva.IdReserva}, 'Confirmada')">Confirmar</button>
            <button class="btn-action-cancel" onclick="cambiarEstado(${reserva.IdReserva}, 'Cancelada')">Cancelar</button>
            <button class="btn-action-delete" onclick="eliminarReserva(${reserva.IdReserva})">Eliminar</button>
          </div>
        </td>
    `;
    adminReservasContainer.appendChild(fila);
});