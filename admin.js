const API_URL = "http://localhost:3000/api";

document.addEventListener('DOMContentLoaded', cargarReservasAdmin);

async function cargarReservasAdmin() {
  const res = await fetch(`${API_URL}/reservas`);
  const reservas = await res.json();
  const tbody = document.getElementById('adminReservasContainer');
  tbody.innerHTML = '';

  reservas.forEach(r => {
    tbody.innerHTML += `
      <tr>
        <td>${r.IdReserva}</td>
        <td>${r.ClienteNombre}</td>
        <td>${r.Telefono}</td>
        <td>${r.ServicioNombre}</td>
        <td>${r.FechaCita.split('T')[0]} - ${r.HoraCita}</td>
        <td>${r.DireccionServicio}</td>
        <td><strong>${r.Estado}</strong></td>
        <td>
          ${r.Estado === 'Pendiente' ? `
            <button class="btn-confirm" onclick="cambiarEstado(${r.IdReserva}, 'Confirmada')">Confirmar</button>
            <button class="btn-reject" onclick="cambiarEstado(${r.IdReserva}, 'Rechazada')">Rechazar</button>
          ` : 'Procesada'}
        </td>
      </tr>
    `;
  });
}

// Actualizar estado de cita y evitar colisiones (RF-10, RF-14)
async function cambiarEstado(idReserva, nuevoEstado) {
  const res = await fetch(`${API_URL}/reservas/${idReserva}/estado`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ estado: nuevoEstado })
  });

  const data = await res.json();
  if (res.ok) {
    alert(`Cita ${nuevoEstado} con éxito.`);
    cargarReservasAdmin();
  } else {
    alert(`No se pudo confirmar: ${data.message}`);
  }
}