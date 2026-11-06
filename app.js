// PRECIOS EN CÓRDOBAS (NIO) CON TASA REFERENCIAL
const SERVICIOS_CORDOBAS = [
  { IdServicio: 1, Nombre: "Corte Clásico / Fade", Descripcion: "Lavado, degradado y perfilado a navaja.", PrecioCordobas: 365.00 },
  { IdServicio: 2, Nombre: "Corte y Perfilado de Barba", Descripcion: "Servicio completo a domicilio + toalla caliente.", PrecioCordobas: 550.00 },
  { IdServicio: 3, Nombre: "Perfilado de Barba Senior", Descripcion: "Afeitado tradicional y contornos precisos.", PrecioCordobas: 290.00 }
];

const PROMOS_CORDOBAS = [
  { Titulo: "Bono Bienvenida", Descripcion: "15% de descuento en tu primer corte agendando desde la plataforma web." },
  { Titulo: "Combo Dúo Familiar", Descripcion: "Dos cortes a domicilio en la misma dirección por solo C$650 NIO." }
];

document.addEventListener('DOMContentLoaded', () => {
  cargarServicios();
  cargarPromociones();
  
  // Establecer fecha mínima como hoy (2026) y máxima fin de año
  const hoy = new Date().toISOString().split('T')[0];
  document.getElementById('fechaCita').setAttribute('min', hoy);

  document.getElementById('bookingForm').addEventListener('submit', validarYEnviarReserva);
});

function cargarServicios() {
  const container = document.getElementById('servicesContainer');
  const select = document.getElementById('servicioSelect');
  container.innerHTML = '';
  select.innerHTML = '<option value="" disabled selected>-- Elige un servicio --</option>';

  SERVICIOS_CORDOBAS.forEach(s => {
    container.innerHTML += `
      <div class="card">
        <div>
          <h3>${s.Nombre}</h3>
          <p>${s.Descripcion}</p>
        </div>
        <span class="price">C$ ${s.PrecioCordobas.toFixed(2)} NIO</span>
      </div>
    `;
    select.innerHTML += `<option value="${s.Nombre} - C$${s.PrecioCordobas}">${s.Nombre} (C$ ${s.PrecioCordobas.toFixed(2)})</option>`;
  });
}

function cargarPromociones() {
  const container = document.getElementById('promosContainer');
  container.innerHTML = '';
  PROMOS_CORDOBAS.forEach(p => {
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
      document.getElementById('direccion').value = `Ubicación GPS: Lat ${lat.toFixed(4)}, Lon ${lon.toFixed(4)}`;
      alert("¡Ubicación GPS capturada con éxito!");
    }, () => {
      alert("No se pudo obtener la ubicación. Por favor ingrese su dirección manual.");
    });
  } else {
    alert("Tu navegador no soporta geolocalización.");
  }
}

// VALIDACIÓN ESTRICTA Y ENVÍO A WHATSAPP
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

  // 1. Validar que no existan campos vacíos ni espacios en blanco puros
  if (!nombre || !telefono || !servicio || !zona || !fecha || !hora || !direccion) {
    alert("⚠️ Error: Todos los campos son obligatorios y no pueden contener solo espacios en blanco.");
    return;
  }

  // 2. Validar que la fecha pertenezca estrictamente al año actual (2026) y no sea anterior
  const anioCita = new Date(fecha).getFullYear();
  if (anioCita !== 2026) {
    alert("⚠️ Error: La fecha de la reserva debe corresponder estrictamente al año actual (2026). No se permiten fechas de años pasados ni futuros incorrectos.");
    return;
  }

  // Redirección profesional a WhatsApp
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

  window.open(`https://wa.me/${numeroBarbero}?text=${mensaje}`, '_blank');
}