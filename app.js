const API_URL = "http://localhost:3000/api";

// DATOS DE RESPALDO (Garantizan que NUNCA se quede en blanco la interfaz)
const SERVICIOS_DEFAULT = [
  { IdServicio: 1, Nombre: "Corte Clásico / Fade", Descripcion: "Lavado, degradado y perfilado a navaja.", PrecioCordobas: 300.00 },
  { IdServicio: 2, Nombre: "Corte y Perfilado de Barba", Descripcion: "Servicio completo a domicilio + toalla caliente.", PrecioCordobas: 450.00 },
  { IdServicio: 3, Nombre: "Perfilado de Barba Senior", Descripcion: "Afeitado tradicional y contornos precisos.", PrecioCordobas: 150.00 }
];

const PROMOS_DEFAULT = [
  { Titulo: "Bono Bienvenida", Descripcion: "15% de descuento en tu primer servicio solicitándolo por la web." },
  { Titulo: "Combo Dúo Familiar", Descripcion: "Dos cortes a domicilio en la misma dirección por solo C$650.00 NIO." }
];

document.addEventListener('DOMContentLoaded', () => {
  cargarServicios();
  cargarPromociones();
  
  // Asignar fecha mínima de hoy (Año 2026)
  const hoy = new Date().toISOString().split('T')[0];
  const campoFecha = document.getElementById('fechaCita');
  if(campoFecha) {
    campoFecha.setAttribute('min', hoy);
    campoFecha.value = hoy;
  }

  const form = document.getElementById('bookingForm');
  if(form) {
    form.addEventListener('submit', validarYEnviarReserva);
  }
});

// CARGAR SERVICIOS (Desde BD o Respaldo)
async function cargarServicios() {
  let servicios = SERVICIOS_DEFAULT;

  try {
    const res = await fetch(`${API_URL}/servicios`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.length > 0) {
        servicios = data;
      }
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
    // Manejar si viene de la BD como Precio o PrecioCordobas
    const precioFinal = s.PrecioCordobas !== undefined ? s.PrecioCordobas : (s.Precio || 0);

    container.innerHTML += `
      <div class="card">
        <div>
          <h3>${s.Nombre}</h3>
          <p>${s.Descripcion}</p>
        </div>
        <span class="price">C$ ${Number(precioFinal).toFixed(2)} NIO</span>
      </div>
    `;
    select.innerHTML += `<option value="${s.Nombre} - C$${Number(precioFinal).toFixed(2)}">${s.Nombre} (C$ ${Number(precioFinal).toFixed(2)})</option>`;
  });
}

// CARGAR PROMOCIONES (Desde BD o Respaldo)
async function cargarPromociones() {
  let promos = PROMOS_DEFAULT;

  try {
    const res = await fetch(`${API_URL}/promociones`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.length > 0) {
        promos = data;
      }
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
        <h3><i class="fa-solid fa-tag"></i> ${p.Titulo}</h3>
        <p>${p.Descripcion}</p>
      </div>
    `;
  });
}

// OBTENER UBICACIÓN GPS
function obtenerUbicacionGPS() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(position => {
      const lat = position.coords.latitude;
      const lon = position.coords.longitude;
      document.getElementById('direccion').value = `GPS: Lat ${lat.toFixed(4)}, Lon ${lon.toFixed(4)}`;
      alert("¡Ubicación GPS capturada con éxito!");
    }, () => {
      alert("No se pudo obtener la ubicación. Por favor ingrese su dirección manual.");
    });
  } else {
    alert("Tu navegador no soporta geolocalización.");
  }
}

// VALIDACIÓN Y ENVÍO
function validarYEnviarReserva(e) {
  e.preventDefault();

  const nombre = document.getElementById('clienteNombre').value.trim();
  const telefono = document.getElementById('clienteTelefono').value.trim();
  const servicio = document.getElementById('servicioSelect').value;
  const zona = document.getElementById('zonaSelect').value;
  const fecha = document.getElementById('fechaCita').value;
  const hora = document.getElementById('horaCita').value;
  const direccion = document.getElementById('direccion').value.trim();
  const pago = document.getElementById('metodoPago').value;

  if (!nombre || !telefono || !servicio || !zona || !fecha || !hora || !direccion) {
    alert("⚠️ Error: Todos los campos son obligatorios y no pueden estar vacíos.");
    return;
  }

  const anioCita = new Date(fecha).getFullYear();
  if (anioCita !== 2026) {
    alert("⚠️ Error: La fecha de la reserva debe corresponder estrictamente al año actual (2026).");
    return;
  }

  // Enviar a Base de Datos (Opcional en segundo plano)
  try {
    fetch(`${API_URL}/reservas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre, telefono, idServicio: 1, idZona: 1, fecha, hora, direccion })
    });
  } catch (err) {
    console.log("Guardado local omitido, enviando directo a WhatsApp.");
  }

  const numeroBarbero = "50500000000";
  const mensaje = `*NUEVA RESERVA - BARBER DRIVE*%0A%0A` +
    `*Cliente:* ${encodeURIComponent(nombre)}%0A` +
    `*Teléfono:* ${encodeURIComponent(telefono)}%0A` +
    `*Servicio:* ${encodeURIComponent(servicio)}%0A` +
    `*Zona/Distrito:* ${encodeURIComponent(zona)}%0A` +
    `*Fecha:* ${encodeURIComponent(fecha)}%0A` +
    `*Hora:* ${encodeURIComponent(hora)}%0A` +
    `*Dirección:* ${encodeURIComponent(direccion)}%0A` +
    `*Método de Pago:* ${encodeURIComponent(pago)}`;

  ;

  const form = document.querySelector('form');   // usa el selector que ya tienes

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const btn = form.querySelector('button[type="submit"]');
  if (btn.disabled) return;          // ya se está enviando
  btn.disabled = true;
  btn.textContent = 'Enviando...';

  try {
    const resp = await fetch('http://localhost:3000/api/reservas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre, telefono, idServicio, idZona, fecha, hora, direccion })
    });
    const data = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      alert(data.message || data.error || 'No se pudo enviar la solicitud.');
      return;
    }
    alert('¡Solicitud enviada! Te confirmaremos tu cita pronto.');
    form.reset();
  } catch (err) {
    alert('No se pudo conectar con el servidor.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Confirmar Cita';
  }
});
}