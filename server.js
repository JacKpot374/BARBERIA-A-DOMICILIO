// server.js
const express = require('express');
const cors = require('cors');
const sql = require('mssql/msnodesqlv8');

const app = express();
app.use(express.json());
app.use(cors());

// ---------- CONEXIÓN (Autenticación de Windows) ----------
const dbConfig = {
    connectionString:
        'Driver={ODBC Driver 17 for SQL Server};' +
        'Server=DESKTOP-L9A5594\\SQLEXPRESS;' +
        'Database=BarberiaDB;' +
        'Trusted_Connection=Yes;' +
        'TrustServerCertificate=Yes;'
};

let poolPromise;
function getPool() {
    if (!poolPromise) {
        poolPromise = new sql.ConnectionPool(dbConfig).connect().catch(err => {
            poolPromise = null;
            throw err;
        });
    }
    return poolPromise;
}

// ---------- CATÁLOGOS ----------

// ---------- SERVICIOS (cortes) ----------
app.get('/api/servicios', async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(
            "SELECT IdServicio, Nombre, Descripcion, Precio AS PrecioCordobas FROM Servicios WHERE Activo = 1 ORDER BY IdServicio");
        res.json(result.recordset);
    } catch (err) {
        console.error("Error en servicios:", err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/servicios', async (req, res) => {
    const { nombre, descripcion, precio } = req.body;
    const precioNum = Number(precio);

    if (!nombre || !nombre.trim() || !(precioNum > 0)) {
        return res.status(400).json({ message: 'Indica un nombre y un precio mayor a 0.' });
    }
    try {
        const pool = await getPool();
        await pool.request()
            .input('nombre', sql.NVarChar, nombre.trim())
            .input('descripcion', sql.NVarChar, (descripcion || '').trim())
            .input('precio', sql.Decimal(10, 2), precioNum)
            .query("INSERT INTO Servicios (Nombre, Descripcion, Precio, Activo) VALUES (@nombre, @descripcion, @precio, 1)");
        res.status(201).json({ message: 'Corte agregado.' });
    } catch (err) {
        console.error("Error al agregar servicio:", err);
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/servicios/:id', async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query("UPDATE Servicios SET Activo = 0 WHERE IdServicio = @id AND Activo = 1");
        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ message: 'Corte no encontrado.' });
        }
        res.json({ message: 'Corte quitado de la página.' });
    } catch (err) {
        console.error("Error al quitar servicio:", err);
        res.status(500).json({ error: err.message });
    }
});

// ---------- PROMOCIONES ----------
app.get('/api/promociones', async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(
            "SELECT IdPromocion, Titulo, Descripcion FROM Promociones WHERE Activa = 1 ORDER BY IdPromocion");
        res.json(result.recordset);
    } catch (err) {
        console.error("Error en promociones:", err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/promociones', async (req, res) => {
    const { titulo, descripcion } = req.body;
    if (!titulo || !titulo.trim() || !descripcion || !descripcion.trim()) {
        return res.status(400).json({ message: 'Indica un título y una descripción.' });
    }
    try {
        const pool = await getPool();
        await pool.request()
            .input('titulo', sql.NVarChar, titulo.trim())
            .input('descripcion', sql.NVarChar, descripcion.trim())
            .query("INSERT INTO Promociones (Titulo, Descripcion, Activa) VALUES (@titulo, @descripcion, 1)");
        res.status(201).json({ message: 'Promoción agregada.' });
    } catch (err) {
        console.error("Error al agregar promoción:", err);
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/promociones/:id', async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query("UPDATE Promociones SET Activa = 0 WHERE IdPromocion = @id AND Activa = 1");
        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ message: 'Promoción no encontrada.' });
        }
        res.json({ message: 'Promoción quitada de la página.' });
    } catch (err) {
        console.error("Error al quitar promoción:", err);
        res.status(500).json({ error: err.message });
    }
});

// ---------- GRÁFICO: citas por día (próximos 14 días) ----------
app.get('/api/estadisticas/dias', async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(`
            SELECT Fecha, SUM(Total) AS Total FROM (
                SELECT CONVERT(VARCHAR(10), FechaCita, 23) AS Fecha, COUNT(*) AS Total
                FROM Reservas
                WHERE Estado <> 'Cancelada'
                  AND FechaCita >= CAST(GETDATE() AS DATE)
                  AND FechaCita <  DATEADD(DAY, 14, CAST(GETDATE() AS DATE))
                GROUP BY CONVERT(VARCHAR(10), FechaCita, 23)
                UNION ALL
                SELECT CONVERT(VARCHAR(10), FechaCita, 23), COUNT(*)
                FROM SolicitudesPendientes
                WHERE Estado = 'Pendiente'
                  AND FechaCita >= CAST(GETDATE() AS DATE)
                  AND FechaCita <  DATEADD(DAY, 14, CAST(GETDATE() AS DATE))
                GROUP BY CONVERT(VARCHAR(10), FechaCita, 23)
            ) t
            GROUP BY Fecha
            ORDER BY Fecha
        `);
        res.json(result.recordset);
    } catch (err) {
        console.error("Error en estadísticas:", err);
        res.status(500).json({ error: err.message });
    }
});

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

// ---------- 1. CLIENTE ENVÍA SOLICITUD (va a la tabla de espera) ----------
app.post('/api/reservas', async (req, res) => {
    const { nombre, telefono, idServicio, idZona, fecha, hora, direccion } = req.body;

    // Validar que lleguen los datos
    if (!nombre || !telefono || !idServicio || !idZona || !fecha || !hora) {
        console.error("Datos incompletos recibidos:", req.body);
        return res.status(400).json({
            message: 'Faltan datos: se requiere nombre, telefono, idServicio, idZona, fecha y hora.'
        });
    }

    try {
        const pool = await getPool();

        // Evitar duplicados: misma persona, misma fecha y hora
        const duplicada = await pool.request()
            .input('telefono', sql.NVarChar, telefono)
            .input('fecha', sql.NVarChar, fecha)
            .input('hora', sql.NVarChar, hora)
            .query(`
                SELECT
                  (SELECT COUNT(*) FROM SolicitudesPendientes
                    WHERE Telefono = @telefono AND FechaCita = @fecha
                      AND HoraCita = @hora AND Estado = 'Pendiente')
                +
                  (SELECT COUNT(*) FROM Reservas r
                    INNER JOIN Clientes c ON c.IdCliente = r.IdCliente
                    WHERE c.Telefono = @telefono AND r.FechaCita = @fecha
                      AND r.HoraCita = @hora AND r.Estado <> 'Cancelada') AS Total`);

        if (duplicada.recordset[0].Total > 0) {
            return res.status(409).json({
                message: 'Ya enviaste una solicitud para esa fecha y hora.'
            });
        }

        await pool.request()
            .input('nombre', sql.NVarChar, nombre)
            .input('telefono', sql.NVarChar, telefono)
            .input('idServicio', sql.Int, idServicio)
            .input('idZona', sql.Int, idZona)
            .input('fecha', sql.NVarChar, fecha)
            .input('hora', sql.NVarChar, hora)
            .input('direccion', sql.NVarChar, direccion || '')
            .query(`INSERT INTO SolicitudesPendientes
                    (Nombre, Telefono, IdServicio, IdZona, FechaCita, HoraCita, Direccion)
                    VALUES (@nombre, @telefono, @idServicio, @idZona, @fecha, @hora, @direccion)`);

        res.status(201).json({ message: 'Solicitud enviada. Te confirmaremos pronto.' });
    } catch (err) {
        console.error("Error al registrar solicitud:", err);
        res.status(500).json({ error: err.message });
    }
});

// ---------- 2. ADMIN: LISTAR SOLICITUDES POR APROBAR ----------
app.get('/api/solicitudes', async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(`
            SELECT sp.IdSolicitud,
                   sp.Nombre   AS Cliente,
                   sp.Telefono,
                   s.Nombre    AS Servicio,
                   CONVERT(VARCHAR(10), sp.FechaCita, 23) AS Fecha,
                   CONVERT(VARCHAR(5),  sp.HoraCita, 108) AS Hora,
                   sp.Direccion
            FROM SolicitudesPendientes sp
            INNER JOIN Servicios s ON s.IdServicio = sp.IdServicio
            WHERE sp.Estado = 'Pendiente'
            ORDER BY sp.FechaSolicitud ASC
        `);
        res.json(result.recordset);
    } catch (err) {
        console.error("Error al listar solicitudes:", err);
        res.status(500).json({ error: err.message });
    }
});

// ---------- 3. ADMIN: ACEPTAR (recién aquí se guarda en Reservas) ----------
app.post('/api/solicitudes/:id/aceptar', async (req, res) => {
    const tx = new sql.Transaction(await getPool());
    try {
        await tx.begin();

        const sol = await new sql.Request(tx)
            .input('id', sql.Int, req.params.id)
            .query(`SELECT Nombre, Telefono, IdServicio, IdZona, Direccion,
                           CONVERT(VARCHAR(10), FechaCita, 23) AS Fecha,
                           CONVERT(VARCHAR(8),  HoraCita, 108) AS Hora
                    FROM SolicitudesPendientes
                    WHERE IdSolicitud = @id AND Estado = 'Pendiente'`);

        if (sol.recordset.length === 0) {
            await tx.rollback();
            return res.status(404).json({ message: 'Solicitud no encontrada o ya procesada.' });
        }
        const s = sol.recordset[0];

        // Validar choque de horario (RF-14)
        const colision = await new sql.Request(tx)
            .input('fecha', sql.NVarChar, s.Fecha)
            .input('hora', sql.NVarChar, s.Hora)
            .query(`SELECT COUNT(*) AS Conteo FROM Reservas
                    WHERE FechaCita = @fecha AND HoraCita = @hora AND Estado = 'Confirmada'`);
        if (colision.recordset[0].Conteo > 0) {
            await tx.rollback();
            return res.status(400).json({ message: 'Ya existe una cita confirmada en ese mismo horario.' });
        }

        // Cliente: buscar o crear
        const cli = await new sql.Request(tx)
            .input('telefono', sql.NVarChar, s.Telefono)
            .query("SELECT IdCliente FROM Clientes WHERE Telefono = @telefono");

        let idCliente;
        if (cli.recordset.length === 0) {
            const nuevo = await new sql.Request(tx)
                .input('nombre', sql.NVarChar, s.Nombre)
                .input('telefono', sql.NVarChar, s.Telefono)
                .query("INSERT INTO Clientes (Nombre, Telefono) OUTPUT INSERTED.IdCliente VALUES (@nombre, @telefono)");
            idCliente = nuevo.recordset[0].IdCliente;
        } else {
            idCliente = cli.recordset[0].IdCliente;
        }

        // Guardar la reserva ya CONFIRMADA
        await new sql.Request(tx)
            .input('idCliente', sql.Int, idCliente)
            .input('idServicio', sql.Int, s.IdServicio)
            .input('idZona', sql.Int, s.IdZona)
            .input('fecha', sql.NVarChar, s.Fecha)
            .input('hora', sql.NVarChar, s.Hora)
            .input('direccion', sql.NVarChar, s.Direccion)
            .query(`INSERT INTO Reservas (IdCliente, IdServicio, IdZona, FechaCita, HoraCita, DireccionServicio, Estado)
                    VALUES (@idCliente, @idServicio, @idZona, @fecha, @hora, @direccion, 'Confirmada')`);

        // Quitar de la lista de espera
        await new sql.Request(tx)
            .input('id', sql.Int, req.params.id)
            .query("DELETE FROM SolicitudesPendientes WHERE IdSolicitud = @id");

        await tx.commit();
        res.json({ message: 'Cita aceptada y guardada.' });
    } catch (err) {
        try { await tx.rollback(); } catch (_) {}
        console.error("Error al aceptar solicitud:", err);
        res.status(500).json({ error: err.message });
    }
});

// ---------- 4. ADMIN: RECHAZAR (queda como Cancelada, no pasa a Reservas) ----------
app.post('/api/solicitudes/:id/rechazar', async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query("UPDATE SolicitudesPendientes SET Estado = 'Cancelada' WHERE IdSolicitud = @id AND Estado = 'Pendiente'");

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ message: 'Solicitud no encontrada o ya procesada.' });
        }
        res.json({ message: 'Los datos se han enviado exitosamente. Solicitud cancelada.' });
    } catch (err) {
        console.error("Error al rechazar solicitud:", err);
        res.status(500).json({ error: err.message });
    }
});

// ---------- 5. ADMIN: RESERVAS REGISTRADAS ----------
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

app.put('/api/reservas/:id/estado', async (req, res) => {
    const idReserva = req.params.id;
    const { estado } = req.body;

    try {
        const pool = await getPool();

        if (estado === 'Confirmada') {
            const citaActual = await pool.request()
                .input('idReserva', sql.Int, idReserva)
                .query(`SELECT CONVERT(VARCHAR(10), FechaCita, 23) AS Fecha,
                               CONVERT(VARCHAR(8),  HoraCita, 108) AS Hora
                        FROM Reservas WHERE IdReserva = @idReserva`);

            if (citaActual.recordset.length === 0) {
                return res.status(404).json({ message: 'Reserva no encontrada.' });
            }
            const { Fecha, Hora } = citaActual.recordset[0];

            const colision = await pool.request()
                .input('fecha', sql.NVarChar, Fecha)
                .input('hora', sql.NVarChar, Hora)
                .input('idReserva', sql.Int, idReserva)
                .query(`SELECT COUNT(*) AS Conteo FROM Reservas
                        WHERE FechaCita = @fecha AND HoraCita = @hora
                        AND Estado = 'Confirmada' AND IdReserva <> @idReserva`);

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

// ---------- ARRANQUE ----------
getPool()
    .then(() => console.log('Conectado a SQL Server (BarberiaDB)'))
    .catch(err => console.error('No se pudo conectar a SQL Server:', err.message));

app.listen(3000, () => console.log('Servidor Barber Drive corriendo en puerto 3000'));