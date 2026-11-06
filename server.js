// server.js
const express = require('express');
const cors = require('cors');
const sql = require('mssql');

const app = express();
app.use(express.json());
app.use(cors());

// CONFIGURACIÓN DE CONEXIÓN A SQL SERVER
const dbConfig = {
    user: 'sa',
    password: 'TuPasswordSeguro123',
    server: 'localhost',
    database: 'BarberiaDB',
    options: { encrypt: false, trustServerCertificate: true }
};

// 1. OBTENER SERVICIOS (RF-02)
app.get('/api/servicios', async (req, res) => {
    try {
        let pool = await sql.connect(dbConfig);
        let result = await pool.request().query("SELECT * FROM Servicios WHERE Activo = 1");
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. OBTENER PROMOCIONES (RF-03)
app.get('/api/promociones', async (req, res) => {
    try {
        let pool = await sql.connect(dbConfig);
        let result = await pool.request().query("SELECT * FROM Promociones WHERE Activa = 1");
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. OBTENER ZONAS DE COBERTURA (RF-06)
app.get('/api/zonas', async (req, res) => {
    try {
        let pool = await sql.connect(dbConfig);
        let result = await pool.request().query("SELECT * FROM ZonasCobertura WHERE Activa = 1");
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 4. CREAR NUEVA RESERVA (RF-07, RF-08)
app.post('/api/reservas', async (req, res) => {
    const { nombre, telefono, idServicio, idZona, fecha, hora, direccion } = req.body;

    try {
        let pool = await sql.connect(dbConfig);
        
        // Registrar o consultar cliente
        let clienteResult = await pool.request()
            .input('telefono', sql.NVarChar, telefono)
            .query("SELECT IdCliente FROM Clientes WHERE Telefono = @telefono");

        let idCliente;
        if (clienteResult.recordset.length === 0) {
            let nuevoCliente = await pool.request()
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
            .input('hora', sql.Time, hora)
            .input('direccion', sql.NVarChar, direccion)
            .query(`INSERT INTO Reservas (IdCliente, IdServicio, IdZona, FechaCita, HoraCita, DireccionServicio, Estado) 
                    VALUES (@idCliente, @idServicio, @idZona, @fecha, @hora, @direccion, 'Pendiente')`);

        res.status(201).json({ message: 'Reserva registrada como Pendiente' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 5. CONSULTAR SOLICITUDES PARA EL BARBERO (RF-09)
app.get('/api/reservas', async (req, res) => {
    try {
        let pool = await sql.connect(dbConfig);
        let result = await pool.request().query(`
            SELECT R.IdReserva, C.Nombre AS ClienteNombre, C.Telefono, S.Nombre AS ServicioNombre, 
                   R.FechaCita, R.HoraCita, R.DireccionServicio, R.Estado
            FROM Reservas R
            INNER JOIN Clientes C ON R.IdCliente = C.IdCliente
            INNER JOIN Servicios S ON R.IdServicio = S.IdServicio
            ORDER BY R.FechaCita DESC, R.HoraCita ASC
        `);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 6. CAMBIAR ESTADO DE RESERVA CON VALIDACIÓN DE SUPERPOSICIÓN (RF-10, RF-14)
app.put('/api/reservas/:id/estado', async (req, res) => {
    const idReserva = req.params.id;
    const { estado } = req.body;

    try {
        let pool = await sql.connect(dbConfig);

        if (estado === 'Confirmada') {
            // Obtener fecha y hora de la cita actual
            let citaActual = await pool.request()
                .input('idReserva', sql.Int, idReserva)
                .query("SELECT FechaCita, HoraCita FROM Reservas WHERE IdReserva = @idReserva");
            
            const { FechaCita, HoraCita } = citaActual.recordset[0];

            // Validar si existe otra cita confirmada en la misma fecha y hora (RF-14)
            let colision = await pool.request()
                .input('fecha', sql.Date, FechaCita)
                .input('hora', sql.Time, HoraCita)
                .input('idReserva', sql.Int, idReserva)
                .query(`SELECT COUNT(*) AS Conteo FROM Reservas 
                        WHERE FechaCita = @fecha AND HoraCita = @hora AND Estado = 'Confirmada' AND IdReserva != @idReserva`);

            if (colision.recordset[0].Conteo > 0) {
                return res.status(400).json({ message: 'Ya existe una cita confirmada en ese mismo horario.' });
            }
        }

        // Actualizar estado
        await pool.request()
            .input('estado', sql.NVarChar, estado)
            .input('idReserva', sql.Int, idReserva)
            .query("UPDATE Reservas SET Estado = @estado WHERE IdReserva = @idReserva");

        res.json({ message: `Cita actualizada a ${estado}` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(3000, () => console.log('Servidor Barber Drive corriendo en puerto 3000'));