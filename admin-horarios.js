// admin-horarios.js - horarios disponibles y cambio de contraseña (se carga después de admin.js)
const NOMBRES_DIA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const ORDEN_DIAS = [1, 2, 3, 4, 5, 6, 0];   // la semana empieza en lunes

const contHorarios = document.getElementById('horariosContainer');
const formHorario  = document.getElementById('formHorario');

/* =====================================================
   HORARIOS DISPONIBLES
   ===================================================== */
async function cargarHorarios() {
  try {
    const lista = await llamarAPI('/horarios');

    contHorarios.innerHTML = ORDEN_DIAS.map(d => {
      const horas = lista.filter(h => h.DiaSemana === d);
      const chips = horas.length
        ? horas.map(h => `
            <span class="chip">${formatearHora(h.Hora)}
              <button type="button" class="chip-x" data-id="${h.IdHorario}" title="Quitar este horario">×</button>
            </span>`).join('')
        : '<span class="sin-horario">Sin citas este día</span>';

      return `
        <div class="dia-card">
          <div class="dia-cab">
            <strong>${NOMBRES_DIA[d]}</strong>
            ${horas.length ? `<button type="button" class="btn-link" data-vaciar="${d}">Vaciar día</button>` : ''}
          </div>
          <div class="chips">${chips}</div>
        </div>`;
    }).join('');
  } catch (err) {
    console.error('Error al cargar horarios:', err);
    contHorarios.innerHTML = '<p class="table-msg error">No se pudieron cargar los horarios. Revisa la terminal de server.js.</p>';
  }
}

formHorario.addEventListener('submit', async (e) => {
  e.preventDefault();

  const dias = [...formHorario.querySelectorAll('input[name="dia"]:checked')].map(c => Number(c.value));
  if (dias.length === 0) {
    mostrarToast('Marca al menos un día de la semana.', 'error');
    return;
  }

  const btn = document.getElementById('hrBtn');
  btn.disabled = true;
  try {
    const data = await llamarAPI('/horarios', 'POST', {
      dias,
      desde: document.getElementById('hrDesde').value,
      hasta: document.getElementById('hrHasta').value,
      cada:  Number(document.getElementById('hrCada').value)
    });
    mostrarToast(data.message, 'ok');
    formHorario.querySelectorAll('input[name="dia"]').forEach(c => { c.checked = false; });
    await cargarHorarios();
  } catch (err) {
    mostrarToast(err.message, 'error');
  } finally {
    btn.disabled = false;
  }
});

contHorarios.addEventListener('click', async (e) => {
  const quitar = e.target.closest('button[data-id]');
  const vaciar = e.target.closest('button[data-vaciar]');

  try {
    if (quitar) {
      const data = await llamarAPI(`/horarios/${quitar.dataset.id}`, 'DELETE');
      mostrarToast(data.message, 'ok');
      await cargarHorarios();
    } else if (vaciar) {
      const dia = Number(vaciar.dataset.vaciar);
      if (!confirm(`¿Quitar todos los horarios del ${NOMBRES_DIA[dia]}? Ese día dejará de aceptar citas.`)) return;
      const data = await llamarAPI(`/horarios/dia/${dia}`, 'DELETE');
      mostrarToast(data.message, 'ok');
      await cargarHorarios();
    }
  } catch (err) {
    mostrarToast(err.message, 'error');
  }
});

/* =====================================================
   CAMBIAR CONTRASEÑA
   ===================================================== */
const modalClave = document.getElementById('modalClave');
const formClave  = document.getElementById('formClave');
const clError    = document.getElementById('clError');

function abrirModalClave() {
  formClave.reset();
  clError.textContent = '';
  modalClave.hidden = false;
  document.getElementById('clActual').focus();
}
function cerrarModalClave() {
  modalClave.hidden = true;
  formClave.reset();
}

document.getElementById('btnClave').addEventListener('click', abrirModalClave);
document.getElementById('clCancelar').addEventListener('click', cerrarModalClave);
modalClave.addEventListener('click', (e) => { if (e.target === modalClave) cerrarModalClave(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modalClave.hidden) cerrarModalClave(); });

formClave.addEventListener('submit', async (e) => {
  e.preventDefault();
  clError.textContent = '';

  const claveActual = document.getElementById('clActual').value;
  const claveNueva  = document.getElementById('clNueva').value;
  const repetir     = document.getElementById('clRepetir').value;

  if (claveNueva.length < 8) {
    clError.textContent = 'La nueva contraseña debe tener al menos 8 caracteres.';
    return;
  }
  if (claveNueva !== repetir) {
    clError.textContent = 'Las contraseñas nuevas no coinciden.';
    return;
  }

  const btn = document.getElementById('clGuardar');
  btn.disabled = true;
  try {
    const data = await llamarAPI('/cambiar-clave', 'POST', { claveActual, claveNueva });
    cerrarModalClave();
    mostrarToast(data.message, 'ok');
  } catch (err) {
    clError.textContent = err.message;
  } finally {
    btn.disabled = false;
  }
});

/* ---------- Inicio ---------- */
cargarHorarios();