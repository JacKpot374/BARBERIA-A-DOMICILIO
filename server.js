// server.js
const express = require('express');
const cors = require('cors');
const sql = require('mssql/msnodesqlv8'); // <-- driver con Windows Auth

const app = express();
app.use(express.json());
app.use(cors());

// CONFIGURACIÓN DE CONEXIÓN A SQL SERVER (Autenticación de Windows)
const dbConfig = {
    connectionString:
        'Driver={ODBC Driver 17 for SQL Server};' +
        'Server=DESKTOP-L9A5594\\SQLEXPRESS;' +
        'Database=BarberiaDB;' +
        'Trusted_Connection=Yes;' +
        'TrustServerCertificate=Yes;'
};

// Un solo pool reutilizable
let poolPromise;
function getPool() {
    if (!poolPromise) {
        poolPromise = new sql.ConnectionPool(dbConfig).connect().catch(err => {
            poolPromise = null; // permite reintentar
            throw err;
        });
    }
    return poolPromise;
}

// 1. OBTENER SERVICIOS (RF-02)
app.get('/api/servicios', async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(
            "SELECT IdServicio, Nombre, Descripcion, Precio AS PrecioCordobas FROM Servicios WHERE Activo = 1"
        );
        res.json(result.recordset);
    } catch (err) {
        console.error("Error en servicios:", err);
        res.status(500).json({ error: err.message });
    }
});

// 2. OBTENER PROMOCIONES (RF-03)
app.get('/api/promociones', async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(
            "SELECT IdPromocion, Titulo, Descripcion FROM Promociones WHERE Activa = 1"
        );
        res.json(result.recordset);
    } catch (err) {
        console.error("Error en promociones:", err);
        res.status(500).json({ error: err.message });
    }
});

// 3. OBTENER ZONAS DE COBERTURA (RF-06)
app.get('/api/zonas', async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query("SELECT * FROM ZonasCobertura WHERE Activa = 1");
        res.json(result.recordset);
    } catch (err) {
        console.error("Error en zonas:", err);
        res.status(500).json({ error: err.message });
    }
});

// OBTENER RESERVAS
// OBTENER RESERVAS (con cliente y servicio)
app.get('/api/reservas', async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(`
            SELECT r.IdReserva,
                   c.Nombre   AS Cliente,
                   c.Telefono AS Telefono,
                   s.Nombre   AS Servicio,
                   CONVERT(VARCHAR(10), r.FechaCita, 23) AS Fecha,
                   CONVERT(VARCHAR(5),  r.HoraCita, 108) AS Hora,
                   r.DireccionServicio AS Direccion,
                   r.Estado
            FROM Reservas r
            INNER JOIN Clientes c ON c.IdCliente = r.IdCliente
            INNER JOIN Servicios s ON s.IdServicio = r.IdServicio
            ORDER BY r.FechaCita DESC, r.HoraCita DESC
        `);
        res.json(result.recordset);
    } catch (err) {
        console.error("Error al obtener reservas:", err);
        res.status(500).json({ error: err.message });
    }
});

// ELIMINAR RESERVA
app.delete('/api/reservas/:id', async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request()
            .input('idReserva', sql.Int, req.params.id)
            .query("DELETE FROM Reservas WHERE IdReserva = @idReserva");

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ message: 'Reserva no encontrada.' });
        }
        res.json({ message: 'Reserva eliminada' });
    } catch (err) {
        console.error("Error al eliminar reserva:", err);
        res.status(500).json({ error: err.message });
    }
});
// 4. CREAR NUEVA RESERVA (RF-07, RF-08)
app.post('/api/reservas', async (req, res) => {
    const { nombre, telefono, idServicio, idZona, fecha, hora, direccion } = req.body;

    try {
        const pool = await getPool();

        // Registrar o consultar cliente
        const clienteResult = await pool.request()
            .input('telefono', sql.NVarChar, telefono)
            .query("SELECT IdCliente FROM Clientes WHERE Telefono = @telefono");

        let idCliente;
        if (clienteResult.recordset.length === 0) {
            const nuevoCliente = await pool.request()
                .input('nombre', sql.NVarChar, nombre)
                .input('telefono', sql.NVarChar, telefono)
                .query("INSERT INTO Clientes (Nombre, Telefono) OUTPUT INSERTED.IdCliente VALUES (@nombre, @telefono)");
            idCliente = nuevoCliente.recordset[0].IdCliente;
        } else {
            idCliente = clienteResult.recordset[0].IdCliente;
        }

        // Insertar reserva en estado PENDIENTE
        await pool.request()
            .input('idCliente', sql.Int, idCliente)
            .input('idServicio', sql.Int, idServicio)
            .input('idZona', sql.Int, idZona)
            .input('fecha', sql.Date, fecha)
            .input('hora', sql.NVarChar, hora) // ver nota abajo
            .input('direccion', sql.NVarChar, direccion)
            .query(`INSERT INTO Reservas (IdCliente, IdServicio, IdZona, FechaCita, HoraCita, DireccionServicio, Estado)
                    VALUES (@idCliente, @idServicio, @idZona, @fecha, @hora, @direccion, 'Pendiente')`);

        res.status(201).json({ message: 'Reserva registrada como Pendiente' });
    } catch (err) {
        console.error("Error al crear reserva:", err);
        res.status(500).json({ error: err.message });
    }
});

// 6. CAMBIAR ESTADO DE RESERVA CON VALIDACIÓN DE SUPERPOSICIÓN (RF-10, RF-14)
app.put('/api/reservas/:id/estado', async (req, res) => {
    const idReserva = req.params.id;
    const { estado } = req.body;

    try {
        const pool = await getPool();

        if (estado === 'Confirmada') {
            const citaActual = await pool.request()
                .input('idReserva', sql.Int, idReserva)
                .query("SELECT FechaCita, HoraCita FROM Reservas WHERE IdReserva = @idReserva");

            if (citaActual.recordset.length === 0) {
                return res.status(404).json({ message: 'Reserva no encontrada.' });
            }

            const { FechaCita, HoraCita } = citaActual.recordset[0];

            const colision = await pool.request()
                .input('fecha', sql.Date, FechaCita)
                .input('hora', sql.NVarChar, HoraCita instanceof Date
                    ? HoraCita.toISOString().substring(11, 19)
                    : String(HoraCita))
                .input('idReserva', sql.Int, idReserva)
                .query(`SELECT COUNT(*) AS Conteo FROM Reservas
                        WHERE FechaCita = @fecha AND HoraCita = @hora
                        AND Estado = 'Confirmada' AND IdReserva != @idReserva`);

            if (colision.recordset[0].Conteo > 0) {
                return res.status(400).json({ message: 'Ya existe una cita confirmada en ese mismo horario.' });
            }
        }

        await pool.request()
            .input('estado', sql.NVarChar, estado)
            .input('idReserva', sql.Int, idReserva)
            .query("UPDATE Reservas SET Estado = @estado WHERE IdReserva = @idReserva");

        res.json({ message: `Cita actualizada a ${estado}` });
    } catch (err) {
        console.error("Error al cambiar estado:", err);
        res.status(500).json({ error: err.message });
    }
});

// Probar la conexión al arrancar para ver el error de inmediato
getPool()
    .then(() => console.log('Conectado a SQL Server (BarberiaDB)'))
    .catch(err => console.error('No se pudo conectar a SQL Server:', err.message));

app.listen(3000, () => console.log('Servidor Barber Drive corriendo en puerto 3000'));