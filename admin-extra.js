// admin-extra.js - distritos e imágenes (se carga DESPUÉS de admin.js)
const BASE_URL = API_URL.replace(/\/api$/, '');

/* =====================================================
   DISTRITOS
   ===================================================== */
let zonasCache = [];
let editandoZonaId = null;

const formZona   = document.getElementById('formZona');
const tbodyZonas = document.getElementById('zonasAdminContainer');

function salirEdicionZona() {
  editandoZonaId = null;
  formZona.reset();
  formZona.classList.remove('editando');
  document.getElementById('zBtnGuardar').textContent = '+ Agregar distrito';
  document.getElementById('zBtnCancelar').hidden = true;
}

async function cargarZonasAdmin() {
  try {
    zonasCache = await llamarAPI('/zonas');
    if (zonasCache.length === 0) {
      tbodyZonas.innerHTML = '<tr><td colspan="4" class="table-msg">No hay distritos. Agrega el primero arriba.</td></tr>';
      return;
    }
    tbodyZonas.innerHTML = zonasCache.map(z => `
      <tr>
        <td>#${z.IdZona}</td>
        <td>${escapeHtml(z.Nombre)}</td>
        <td>C$ ${Number(z.Costo).toFixed(2)}</td>
        <td>
          <div class="acciones">
            <button class="btn-action btn-editar"   data-op="editar" data-id="${z.IdZona}">Editar</button>
            <button class="btn-action btn-eliminar" data-op="quitar" data-id="${z.IdZona}">Quitar</button>
          </div>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Error al cargar distritos:', err);
    tbodyZonas.innerHTML = '<tr><td colspan="4" class="table-msg error">No se pudieron cargar los distritos. Revisa la terminal de server.js.</td></tr>';
  }
}

formZona.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('zBtnGuardar');
  btn.disabled = true;

  const cuerpo = {
    nombre: document.getElementById('zNombre').value,
    costo:  document.getElementById('zCosto').value
  };

  try {
    const data = editandoZonaId
      ? await llamarAPI(`/zonas/${editandoZonaId}`, 'PUT', cuerpo)
      : await llamarAPI('/zonas', 'POST', cuerpo);
    mostrarToast(data.message, 'ok');
    salirEdicionZona();
    await cargarZonasAdmin();
  } catch (err) {
    mostrarToast(err.message, 'error');
  } finally {
    btn.disabled = false;
  }
});

document.getElementById('zBtnCancelar').addEventListener('click', salirEdicionZona);

tbodyZonas.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-op]');
  if (!btn) return;
  const id = Number(btn.dataset.id);

  if (btn.dataset.op === 'editar') {
    const z = zonasCache.find(x => x.IdZona === id);
    if (!z) return;
    editandoZonaId = id;
    document.getElementById('zNombre').value = z.Nombre;
    document.getElementById('zCosto').value  = Number(z.Costo);
    formZona.classList.add('editando');
    document.getElementById('zBtnGuardar').textContent = 'Guardar cambios';
    document.getElementById('zBtnCancelar').hidden = false;
    formZona.scrollIntoView({ behavior: 'smooth', block: 'center' });
    document.getElementById('zNombre').focus();
    return;
  }

  if (!confirm('¿Quitar este distrito del formulario de la página?')) return;
  btn.disabled = true;
  try {
    const data = await llamarAPI(`/zonas/${id}`, 'DELETE');
    mostrarToast(data.message, 'ok');
    if (editandoZonaId === id) salirEdicionZona();
    await cargarZonasAdmin();
  } catch (err) {
    mostrarToast(err.message, 'error');
    btn.disabled = false;
  }
});

/* =====================================================
   IMÁGENES (solo archivos locales)
   ===================================================== */
let imagenesCache = [];
let editandoImagenId = null;

const formImagen   = document.getElementById('formImagen');
const tbodyImagenes = document.getElementById('imagenesAdminContainer');
const TIPOS_OK = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024;

async function enviarFormData(ruta, metodo, formData) {
  // Sin Content-Type: el navegador lo pone con el "boundary" correcto
  const resp = await fetch(`${API_URL}${ruta}`, { method: metodo, body: formData });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.message || data.error || 'No se pudo completar la acción');
  return data;
}

function salirEdicionImagen() {
  editandoImagenId = null;
  formImagen.reset();
  formImagen.classList.remove('editando');
  document.getElementById('imSeccion').disabled = false;
  document.getElementById('imBtnGuardar').textContent = '+ Subir imagen';
  document.getElementById('imBtnCancelar').hidden = true;
  document.getElementById('imNota').textContent =
    'JPG, PNG o WEBP de hasta 5 MB. La portada es una sola: la nueva reemplaza a la anterior.';
}

async function cargarImagenesAdmin() {
  try {
    imagenesCache = await llamarAPI('/imagenes');
    if (imagenesCache.length === 0) {
      tbodyImagenes.innerHTML = '<tr><td colspan="5" class="table-msg">No has subido imágenes. Mientras tanto, la página usa las que trae por defecto.</td></tr>';
      return;
    }
    tbodyImagenes.innerHTML = imagenesCache.map(i => `
      <tr>
        <td>#${i.IdImagen}</td>
        <td><img class="miniatura" src="${BASE_URL}/uploads/${encodeURIComponent(i.Archivo)}" alt="${escapeHtml(i.Titulo)}"></td>
        <td><span class="tag-seccion ${i.Seccion}">${i.Seccion === 'portada' ? 'Portada' : 'Galería'}</span></td>
        <td>${escapeHtml(i.Titulo)}</td>
        <td>
          <div class="acciones">
            <button class="btn-action btn-editar"   data-op="editar" data-id="${i.IdImagen}">Cambiar</button>
            <button class="btn-action btn-eliminar" data-op="quitar" data-id="${i.IdImagen}">Quitar</button>
          </div>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Error al cargar imágenes:', err);
    tbodyImagenes.innerHTML = '<tr><td colspan="5" class="table-msg error">No se pudieron cargar las imágenes. Revisa la terminal de server.js.</td></tr>';
  }
}

formImagen.addEventListener('submit', async (e) => {
  e.preventDefault();
  const archivo = document.getElementById('imArchivo').files[0];

  if (!editandoImagenId && !archivo) {
    mostrarToast('Selecciona una imagen de tu computadora.', 'error');
    return;
  }
  if (archivo) {
    if (!TIPOS_OK.includes(archivo.type)) {
      mostrarToast('Solo se permiten imágenes JPG, PNG o WEBP.', 'error');
      return;
    }
    if (archivo.size > MAX_BYTES) {
      mostrarToast('La imagen supera los 5 MB.', 'error');
      return;
    }
  }

  const btn = document.getElementById('imBtnGuardar');
  btn.disabled = true;

  const fd = new FormData();
  fd.append('seccion', document.getElementById('imSeccion').value);
  fd.append('titulo',  document.getElementById('imTitulo').value);
  if (archivo) fd.append('imagen', archivo);

  try {
    const data = editandoImagenId
      ? await enviarFormData(`/imagenes/${editandoImagenId}`, 'PUT', fd)
      : await enviarFormData('/imagenes', 'POST', fd);
    mostrarToast(data.message, 'ok');
    salirEdicionImagen();
    await cargarImagenesAdmin();
  } catch (err) {
    mostrarToast(err.message, 'error');
  } finally {
    btn.disabled = false;
  }
});

document.getElementById('imBtnCancelar').addEventListener('click', salirEdicionImagen);

tbodyImagenes.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-op]');
  if (!btn) return;
  const id = Number(btn.dataset.id);

  if (btn.dataset.op === 'editar') {
    const i = imagenesCache.find(x => x.IdImagen === id);
    if (!i) return;
    editandoImagenId = id;
    document.getElementById('imSeccion').value = i.Seccion;
    document.getElementById('imSeccion').disabled = true;
    document.getElementById('imTitulo').value = i.Titulo;
    formImagen.classList.add('editando');
    document.getElementById('imBtnGuardar').textContent = 'Guardar cambios';
    document.getElementById('imBtnCancelar').hidden = false;
    document.getElementById('imNota').textContent =
      'Cambia el título o elige un archivo nuevo para reemplazar la imagen (opcional).';
    formImagen.scrollIntoView({ behavior: 'smooth', block: 'center' });
    document.getElementById('imTitulo').focus();
    return;
  }

  if (!confirm('¿Quitar esta imagen? Se borra también el archivo.')) return;
  btn.disabled = true;
  try {
    const data = await llamarAPI(`/imagenes/${id}`, 'DELETE');
    mostrarToast(data.message, 'ok');
    if (editandoImagenId === id) salirEdicionImagen();
    await cargarImagenesAdmin();
  } catch (err) {
    mostrarToast(err.message, 'error');
    btn.disabled = false;
  }
});

/* ---------- Inicio ---------- */
btnRecargar.addEventListener('click', () => { cargarZonasAdmin(); cargarImagenesAdmin(); });
cargarZonasAdmin();
cargarImagenesAdmin();