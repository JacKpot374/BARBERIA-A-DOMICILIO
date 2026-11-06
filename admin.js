const API_URL = "http://localhost:3000/api";

document.addEventListener('DOMContentLoaded', () => {
  cargarReservasAdmin();
});

// Función para obtener las reservas del servidor y pintarlas en la tabla
async function cargarReservasAdmin() {
  try {
    const res = await fetch(`${API_URL}/reservas`);
    
    if (!res.ok) {
      throw new Error("No se pudo conectar con el servidor backend.");
    }

    const reservas = await res.json();
    const tbody = document.getElementById('adminReservasContainer');
    tbody.innerHTML = '';

    if (reservas.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;">No hay reservas registradas.</td></tr>`;
      return;
    }

    reservas.forEach(r => {
      // Formatear fecha de forma limpia
      const fechaFormateada = r.FechaCita ? r.FechaCita.split('T')[0] : '';
      
      tbody.innerHTML += `
        <tr>
          <td>${r.IdReserva}</td>
          <td>${r.ClienteNombre}</td>
          <td>${r.Telefono}</td>
          <td>${r.ServicioNombre}</td>
          <td>${fechaFormateada} - ${r.HoraCita}</td>
          <td>${r.DireccionServicio}</td>
          <td><strong>${r.Estado}</strong></td>
          <td>
            ${r.Estado === 'Pendiente' ? `
              <button class="btn-confirm" onclick="cambiarEstado(${r.IdReserva}, 'Confirmada')">Confirmar</button>
              <button class="btn-reject" onclick="cambiarEstado(${r.IdReserva}, 'Rechazada')">Rechazar</button>
            ` : '<span style="color: gray;">Procesada</span>'}
          </td>
        </tr>
      `;
    });
  } catch (error) {
    console.error("Error al cargar reservas:", error);
    const tbody = document.getElementById('adminReservasContainer');
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color: red;">Error: Asegúrate de que el servidor (server.js) esté encendido.</td></tr>`;
  }
}

// Función para cambiar el estado de la reserva (Confirmar / Rechazar con validación de colisión)
async function cambiarEstado(idReserva, nuevoEstado) {
  try {
    const res = await fetch(`${API_URL}/reservas/${idReserva}/estado`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado: nuevoEstado })
    });

    const data = await res.json();

    if (res.ok) {
      alert(`¡Cita ${nuevoEstado.toLowerCase()} con éxito!`);
      cargarReservasAdmin(); // Recargar la tabla
    } else {
      alert(`⚠️ Advertencia: ${data.message}`);
    }
  } catch (err) {
    console.error("Error al actualizar estado:", err);
    alert("No se pudo comunicar con el servidor para actualizar el estado.");
  }
}