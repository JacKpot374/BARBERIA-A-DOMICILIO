// server.js
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const sql = require('mssql/msnodesqlv8');

const app = express();
app.use(express.json());
app.use(cors());

// ---------- NOMBRES DE COLUMNAS DE ZonasCobertura (ajústalos si son distintos) ----------
const ZONA = { tabla: 'ZonasCobertura', id: 'IdZona', nombre: 'Nombre', costo: 'Costo' };

// ---------- CARPETA DE IMÁGENES ----------
const CARPETA_UPLOADS = path.join(__dirname, 'uploads');
if (!fs.existsSync(CARPETA_UPLOADS)) fs.mkdirSync(CARPETA_UPLOADS);
app.use('/uploads', express.static(CARPETA_UPLOADS));

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

// =====================================================================
//  AUTENTICACIÓN
// =====================================================================
const DURACION_SESION = 8 * 60 * 60 * 1000;   // 8 horas
const sesiones = new Map();                    // token -> { usuario, expira }
const intentos = new Map();                    // ip -> { cuenta, hasta }

setInterval(() => {
    const ahora = Date.now();
    for (const [t, s] of sesiones) if (s.expira < ahora) sesiones.delete(t);
}, 10 * 60 * 1000).unref();

function verificarClave(clave, guardado) {
    const [alg, salt, hash] = String(guardado).split('$');
    if (alg !== 'scrypt' || !salt || !hash) return false;
    const calculado = crypto.scryptSync(clave, salt, 64);
    const esperado = Buffer.from(hash, 'hex');
    return esperado.length === calculado.length && crypto.timingSafeEqual(calculado, esperado);
}

function requireAuth(req, res, next) {
    const cab = req.headers.authorization || '';
    const token = cab.startsWith('Bearer ') ? cab.slice(7) : '';
    const ses = sesiones.get(token);
    if (!ses || ses.expira < Date.now()) {
        sesiones.delete(token);
        return res.status(401).json({ message: 'Sesión no válida o expirada. Inicia sesión.' });
    }
    ses.expira = Date.now() + DURACION_SESION;
    req.admin = ses.usuario;
    req.token = token;
    next();
}

app.post('/api/login', async (req, res) => {
    const ip = req.ip;
    const reg = intentos.get(ip);
    if (reg && reg.hasta > Date.now()) {
        return res.status(429).json({ message: 'Demasiados intentos. Espera 15 minutos.' });
    }

    const { usuario, clave } = req.body || {};
    if (!usuario || !clave) {
        return res.status(400).json({ message: 'Escribe usuario y contraseña.' });
    }

    try {
        const pool = await getPool();
        const r = await pool.request()
            .input('usuario', sql.NVarChar, String(usuario))
            .query("SELECT ClaveHash FROM Administradores WHERE Usuario = @usuario");

        const fila = r.recordset[0];
        let ok = false;
        if (fila) ok = verificarClave(String(clave), fila.ClaveHash);
        else crypto.scryptSync(String(clave), 'relleno', 64);   // mismo tiempo si el usuario no existe

        if (!ok) {
            const cuenta = (reg && reg.hasta <= Date.now() ? 0 : (reg ? reg.cuenta : 0)) + 1;
            intentos.set(ip, cuenta >= 5
                ? { cuenta: 0, hasta: Date.now() + 15 * 60 * 1000 }
                : { cuenta, hasta: 0 });
            return res.status(401).json({ message: 'Usuario o contraseña incorrectos.' });
        }

        intentos.delete(ip);
        const token = crypto.randomBytes(32).toString('hex');
        sesiones.set(token, { usuario: String(usuario), expira: Date.now() + DURACION_SESION });
        res.json({ token, usuario: String(usuario) });
    } catch (err) {
        console.error("Error en login:", err);
        res.status(500).json({ message: 'Error del servidor.' });
    }
});

app.get('/api/sesion', requireAuth, (req, res) => res.json({ usuario: req.admin }));

app.post('/api/logout', requireAuth, (req, res) => {
    sesiones.delete((req.headers.authorization || '').slice(7));
    res.json({ message: 'Sesión cerrada.' });
});

// =====================================================================
//  RUTAS PÚBLICAS (las usa el sitio web)
// =====================================================================
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

app.get('/api/promociones', async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(
            "SELECT IdPromocion, Titulo, Descripcion, Valor FROM Promociones WHERE Activa = 1 ORDER BY IdPromocion");
        res.json(result.recordset);
    } catch (err) {
        console.error("Error en promociones:", err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/zonas', async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(
            `SELECT ${ZONA.id} AS IdZona, ${ZONA.nombre} AS Nombre, ${ZONA.costo} AS Costo
             FROM ${ZONA.tabla} WHERE Activa = 1 ORDER BY ${ZONA.id}`);
        res.json(result.recordset);
    } catch (err) {
        console.error("Error en zonas:", err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/imagenes', async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(
            "SELECT IdImagen, Seccion, Titulo, Archivo FROM Imagenes ORDER BY IdImagen");
        res.json(result.recordset);
    } catch (err) {
        console.error("Error en imágenes:", err);
        res.status(500).json({ error: err.message });
    }
});

// CLIENTE ENVÍA SOLICITUD (va a la tabla de espera)
// ---------- Utilidades de fechas y horas ----------
function hoyLocal() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function horaActualLocal() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
// Devuelve 0 (domingo) a 6 (sábado), o null si la fecha no es válida
function diaSemanaDe(f) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(f))) return null;
    const [y, m, d] = f.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
    return dt.getDay();
}
function normalizarHora(h) {
    const m = /^(\d{1,2}):(\d{2})/.exec(String(h || ''));
    if (!m) return null;
    const hh = Number(m[1]), mm = Number(m[2]);
    if (hh > 23 || mm > 59) return null;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

// ---------- CLIENTE ENVÍA SOLICITUD (valida horario y choques) ----------
app.post('/api/reservas', async (req, res) => {
    const { nombre, telefono, idServicio, idZona, fecha, direccion } = req.body;
    const hora = normalizarHora(req.body.hora);

    if (!nombre || !telefono || !idServicio || !idZona || !fecha || !hora) {
        console.error("Datos incompletos recibidos:", req.body);
        return res.status(400).json({
            message: 'Faltan datos: se requiere nombre, telefono, idServicio, idZona, fecha y hora.'
        });
    }

    const dia = diaSemanaDe(fecha);
    if (dia === null) return res.status(400).json({ message: 'La fecha no es válida.' });
    if (fecha < hoyLocal()) return res.status(400).json({ message: 'No puedes reservar en una fecha pasada.' });
    if (fecha === hoyLocal() && hora <= horaActualLocal()) {
        return res.status(400).json({ message: 'Esa hora ya pasó. Elige una hora posterior.' });
    }

    const tx = new sql.Transaction(await getPool());
    try {
        await tx.begin();

        // 1. ¿Ese día y esa hora forman parte del horario de atención?
        const disp = await new sql.Request(tx)
            .input('dia', sql.Int, dia)
            .input('hora', sql.NVarChar, hora)
            .query("SELECT COUNT(*) AS N FROM HorariosDisponibles WHERE DiaSemana = @dia AND Hora = @hora");
        if (disp.recordset[0].N === 0) {
            await tx.rollback();
            return res.status(400).json({ message: 'Ese día y hora no están disponibles. Elige otro horario.' });
        }

        // 2. ¿Ya hay una cita en esa fecha y hora? (UPDLOCK evita que dos personas
        //    reserven la misma hora al mismo tiempo)
        const ocupada = await new sql.Request(tx)
            .input('fecha', sql.NVarChar, fecha)
            .input('hora', sql.NVarChar, hora)
            .query(`SELECT
                      (SELECT COUNT(*) FROM Reservas WITH (UPDLOCK, HOLDLOCK)
                        WHERE FechaCita = @fecha AND HoraCita = @hora AND Estado <> 'Cancelada')
                    + (SELECT COUNT(*) FROM SolicitudesPendientes WITH (UPDLOCK, HOLDLOCK)
                        WHERE FechaCita = @fecha AND HoraCita = @hora AND Estado = 'Pendiente') AS Total`);
        if (ocupada.recordset[0].Total > 0) {
            await tx.rollback();
            return res.status(409).json({
                message: 'Ya existe una cita con esa fecha y hora. Elige otro horario.'
            });
        }

        // 3. Guardar la solicitud
        await new sql.Request(tx)
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

        await tx.commit();
        res.status(201).json({ message: 'Solicitud enviada. Te confirmaremos pronto.' });
    } catch (err) {
        try { await tx.rollback(); } catch (_) {}
        console.error("Error al registrar solicitud:", err);
        res.status(500).json({ error: err.message });
    }
});
// =====================================================================
//  RUTAS DEL ADMIN (requieren sesión)
// =====================================================================

// ---------- SOLICITUDES ----------
app.get('/api/solicitudes', requireAuth, async (req, res) => {
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

app.post('/api/solicitudes/:id/aceptar', requireAuth, async (req, res) => {
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

        const colision = await new sql.Request(tx)
            .input('fecha', sql.NVarChar, s.Fecha)
            .input('hora', sql.NVarChar, s.Hora)
            .query(`SELECT COUNT(*) AS Conteo FROM Reservas
                    WHERE FechaCita = @fecha AND HoraCita = @hora AND Estado = 'Confirmada'`);
        if (colision.recordset[0].Conteo > 0) {
            await tx.rollback();
            return res.status(400).json({ message: 'Ya existe una cita confirmada en ese mismo horario.' });
        }

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

        await new sql.Request(tx)
            .input('idCliente', sql.Int, idCliente)
            .input('idServicio', sql.Int, s.IdServicio)
            .input('idZona', sql.Int, s.IdZona)
            .input('fecha', sql.NVarChar, s.Fecha)
            .input('hora', sql.NVarChar, s.Hora)
            .input('direccion', sql.NVarChar, s.Direccion)
            .query(`INSERT INTO Reservas (IdCliente, IdServicio, IdZona, FechaCita, HoraCita, DireccionServicio, Estado)
                    VALUES (@idCliente, @idServicio, @idZona, @fecha, @hora, @direccion, 'Confirmada')`);

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

app.post('/api/solicitudes/:id/rechazar', requireAuth, async (req, res) => {
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

// ---------- RESERVAS ----------
app.get('/api/reservas', requireAuth, async (req, res) => {
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

app.put('/api/reservas/:id/estado', requireAuth, async (req, res) => {
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

app.delete('/api/reservas/:id', requireAuth, async (req, res) => {
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

// ---------- SERVICIOS (cortes) ----------
app.post('/api/servicios', requireAuth, async (req, res) => {
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

app.put('/api/servicios/:id', requireAuth, async (req, res) => {
    const { nombre, descripcion, precio } = req.body;
    const precioNum = Number(precio);

    if (!nombre || !nombre.trim() || !(precioNum > 0)) {
        return res.status(400).json({ message: 'Indica un nombre y un precio mayor a 0.' });
    }
    try {
        const pool = await getPool();
        const result = await pool.request()
            .input('id', sql.Int, req.params.id)
            .input('nombre', sql.NVarChar, nombre.trim())
            .input('descripcion', sql.NVarChar, (descripcion || '').trim())
            .input('precio', sql.Decimal(10, 2), precioNum)
            .query(`UPDATE Servicios SET Nombre = @nombre, Descripcion = @descripcion, Precio = @precio
                    WHERE IdServicio = @id AND Activo = 1`);
        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ message: 'Corte no encontrado.' });
        }
        res.json({ message: 'Corte actualizado.' });
    } catch (err) {
        console.error("Error al editar servicio:", err);
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/servicios/:id', requireAuth, async (req, res) => {
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
app.post('/api/promociones', requireAuth, async (req, res) => {
    const { titulo, descripcion, valor } = req.body;
    if (!titulo || !titulo.trim() || !descripcion || !descripcion.trim()) {
        return res.status(400).json({ message: 'Indica un título y una descripción.' });
    }
    try {
        const pool = await getPool();
        await pool.request()
            .input('titulo', sql.NVarChar, titulo.trim())
            .input('descripcion', sql.NVarChar, descripcion.trim())
            .input('valor', sql.NVarChar, (valor || '').trim())
            .query("INSERT INTO Promociones (Titulo, Descripcion, Valor, Activa) VALUES (@titulo, @descripcion, @valor, 1)");
        res.status(201).json({ message: 'Promoción agregada.' });
    } catch (err) {
        console.error("Error al agregar promoción:", err);
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/promociones/:id', requireAuth, async (req, res) => {
    const { titulo, descripcion, valor } = req.body;
    if (!titulo || !titulo.trim() || !descripcion || !descripcion.trim()) {
        return res.status(400).json({ message: 'Indica un título y una descripción.' });
    }
    try {
        const pool = await getPool();
        const result = await pool.request()
            .input('id', sql.Int, req.params.id)
            .input('titulo', sql.NVarChar, titulo.trim())
            .input('descripcion', sql.NVarChar, descripcion.trim())
            .input('valor', sql.NVarChar, (valor || '').trim())
            .query(`UPDATE Promociones SET Titulo = @titulo, Descripcion = @descripcion, Valor = @valor
                    WHERE IdPromocion = @id AND Activa = 1`);
        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ message: 'Promoción no encontrada.' });
        }
        res.json({ message: 'Promoción actualizada.' });
    } catch (err) {
        console.error("Error al editar promoción:", err);
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/promociones/:id', requireAuth, async (req, res) => {
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

// ---------- DISTRITOS ----------
app.post('/api/zonas', requireAuth, async (req, res) => {
    const { nombre, costo } = req.body;
    const costoNum = Number(costo);

    if (!nombre || !nombre.trim() || costo === '' || costo === undefined || !(costoNum >= 0)) {
        return res.status(400).json({ message: 'Indica el nombre del distrito y un costo (0 o más).' });
    }
    try {
        const pool = await getPool();
        await pool.request()
            .input('nombre', sql.NVarChar, nombre.trim())
            .input('costo', sql.Decimal(10, 2), costoNum)
            .query(`INSERT INTO ${ZONA.tabla} (${ZONA.nombre}, ${ZONA.costo}, Activa) VALUES (@nombre, @costo, 1)`);
        res.status(201).json({ message: 'Distrito agregado.' });
    } catch (err) {
        console.error("Error al agregar distrito:", err);
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/zonas/:id', requireAuth, async (req, res) => {
    const { nombre, costo } = req.body;
    const costoNum = Number(costo);

    if (!nombre || !nombre.trim() || costo === '' || costo === undefined || !(costoNum >= 0)) {
        return res.status(400).json({ message: 'Indica el nombre del distrito y un costo (0 o más).' });
    }
    try {
        const pool = await getPool();
        const result = await pool.request()
            .input('id', sql.Int, req.params.id)
            .input('nombre', sql.NVarChar, nombre.trim())
            .input('costo', sql.Decimal(10, 2), costoNum)
            .query(`UPDATE ${ZONA.tabla} SET ${ZONA.nombre} = @nombre, ${ZONA.costo} = @costo
                    WHERE ${ZONA.id} = @id AND Activa = 1`);
        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ message: 'Distrito no encontrado.' });
        }
        res.json({ message: 'Distrito actualizado.' });
    } catch (err) {
        console.error("Error al editar distrito:", err);
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/zonas/:id', requireAuth, async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query(`UPDATE ${ZONA.tabla} SET Activa = 0 WHERE ${ZONA.id} = @id AND Activa = 1`);
        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ message: 'Distrito no encontrado.' });
        }
        res.json({ message: 'Distrito quitado de la página.' });
    } catch (err) {
        console.error("Error al quitar distrito:", err);
        res.status(500).json({ error: err.message });
    }
});

// ---------- IMÁGENES (solo archivos locales) ----------
const TIPOS = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const SECCIONES = ['galeria', 'portada'];

const upload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, CARPETA_UPLOADS),
        filename: (req, file, cb) =>
            cb(null, crypto.randomBytes(16).toString('hex') + TIPOS[file.mimetype])
    }),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) =>
        TIPOS[file.mimetype] ? cb(null, true) : cb(new Error('Solo se permiten imágenes JPG, PNG o WEBP.'))
});

function subirImagen(req, res, next) {
    upload.single('imagen')(req, res, err => {
        if (err) {
            const msg = err.code === 'LIMIT_FILE_SIZE' ? 'La imagen supera los 5 MB.' : err.message;
            return res.status(400).json({ message: msg });
        }
        next();
    });
}

function borrarArchivo(nombre) {
    if (!/^[a-f0-9]{32}\.(jpg|png|webp)$/.test(String(nombre))) return;   // evita rutas raras
    fs.unlink(path.join(CARPETA_UPLOADS, nombre), () => {});
}

app.post('/api/imagenes', requireAuth, subirImagen, async (req, res) => {
    const seccion = req.body.seccion;
    const titulo = (req.body.titulo || '').trim();

    if (!req.file) return res.status(400).json({ message: 'Selecciona una imagen de tu computadora.' });
    if (!SECCIONES.includes(seccion)) {
        borrarArchivo(req.file.filename);
        return res.status(400).json({ message: 'Sección no válida.' });
    }
    if (seccion === 'galeria' && !titulo) {
        borrarArchivo(req.file.filename);
        return res.status(400).json({ message: 'Escribe un título para la imagen de la galería.' });
    }

    try {
        const pool = await getPool();

        // La portada es una sola: la nueva reemplaza a la anterior
        if (seccion === 'portada') {
            const viejas = await pool.request().query("SELECT Archivo FROM Imagenes WHERE Seccion = 'portada'");
            await pool.request().query("DELETE FROM Imagenes WHERE Seccion = 'portada'");
            viejas.recordset.forEach(v => borrarArchivo(v.Archivo));
        }

        await pool.request()
            .input('seccion', sql.NVarChar, seccion)
            .input('titulo', sql.NVarChar, titulo || 'Portada')
            .input('archivo', sql.NVarChar, req.file.filename)
            .query("INSERT INTO Imagenes (Seccion, Titulo, Archivo) VALUES (@seccion, @titulo, @archivo)");
        res.status(201).json({ message: 'Imagen subida.' });
    } catch (err) {
        borrarArchivo(req.file.filename);
        console.error("Error al subir imagen:", err);
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/imagenes/:id', requireAuth, subirImagen, async (req, res) => {
    const titulo = (req.body.titulo || '').trim();

    try {
        const pool = await getPool();
        const actual = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query("SELECT Seccion, Titulo, Archivo FROM Imagenes WHERE IdImagen = @id");

        if (actual.recordset.length === 0) {
            if (req.file) borrarArchivo(req.file.filename);
            return res.status(404).json({ message: 'Imagen no encontrada.' });
        }
        const img = actual.recordset[0];
        const nuevoTitulo = titulo || img.Titulo;
        const nuevoArchivo = req.file ? req.file.filename : img.Archivo;

        await pool.request()
            .input('id', sql.Int, req.params.id)
            .input('titulo', sql.NVarChar, nuevoTitulo)
            .input('archivo', sql.NVarChar, nuevoArchivo)
            .query("UPDATE Imagenes SET Titulo = @titulo, Archivo = @archivo WHERE IdImagen = @id");

        if (req.file) borrarArchivo(img.Archivo);
        res.json({ message: req.file ? 'Imagen reemplazada.' : 'Título actualizado.' });
    } catch (err) {
        if (req.file) borrarArchivo(req.file.filename);
        console.error("Error al editar imagen:", err);
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/imagenes/:id', requireAuth, async (req, res) => {
    try {
        const pool = await getPool();
        const actual = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query("SELECT Archivo FROM Imagenes WHERE IdImagen = @id");
        if (actual.recordset.length === 0) {
            return res.status(404).json({ message: 'Imagen no encontrada.' });
        }
        await pool.request()
            .input('id', sql.Int, req.params.id)
            .query("DELETE FROM Imagenes WHERE IdImagen = @id");
        borrarArchivo(actual.recordset[0].Archivo);
        res.json({ message: 'Imagen quitada.' });
    } catch (err) {
        console.error("Error al quitar imagen:", err);
        res.status(500).json({ error: err.message });
    }
});

// ---------- GRÁFICO: citas por día (próximos 14 días) ----------
app.get('/api/estadisticas/dias', requireAuth, async (req, res) => {
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

// ---------- DISPONIBILIDAD (pública: la usa el formulario del sitio) ----------
app.get('/api/disponibilidad', async (req, res) => {
    const fecha = String(req.query.fecha || '');
    const dia = diaSemanaDe(fecha);
    if (dia === null) return res.status(400).json({ message: 'Fecha no válida.' });

    try {
        const pool = await getPool();

        const slots = await pool.request()
            .input('dia', sql.Int, dia)
            .query("SELECT CONVERT(VARCHAR(5), Hora, 108) AS Hora FROM HorariosDisponibles WHERE DiaSemana = @dia ORDER BY Hora");

        const ocupadas = await pool.request()
            .input('fecha', sql.NVarChar, fecha)
            .query(`SELECT CONVERT(VARCHAR(5), HoraCita, 108) AS Hora FROM Reservas
                    WHERE FechaCita = @fecha AND Estado <> 'Cancelada'
                    UNION
                    SELECT CONVERT(VARCHAR(5), HoraCita, 108) FROM SolicitudesPendientes
                    WHERE FechaCita = @fecha AND Estado = 'Pendiente'`);

        const tomadas = new Set(ocupadas.recordset.map(r => r.Hora));
        const hoy = hoyLocal();
        const ahora = horaActualLocal();

        res.json(slots.recordset.map(s => ({
            hora: s.Hora,
            disponible: fecha >= hoy
                && !tomadas.has(s.Hora)
                && !(fecha === hoy && s.Hora <= ahora)
        })));
    } catch (err) {
        console.error("Error en disponibilidad:", err);
        res.status(500).json({ error: err.message });
    }
});

// ---------- HORARIOS (admin) ----------
app.get('/api/horarios', requireAuth, async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(
            "SELECT IdHorario, DiaSemana, CONVERT(VARCHAR(5), Hora, 108) AS Hora FROM HorariosDisponibles ORDER BY DiaSemana, Hora");
        res.json(result.recordset);
    } catch (err) {
        console.error("Error en horarios:", err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/horarios', requireAuth, async (req, res) => {
    const dias = Array.isArray(req.body.dias) ? [...new Set(req.body.dias.map(Number))] : [];
    const desde = normalizarHora(req.body.desde);
    const hasta = normalizarHora(req.body.hasta);
    const cada = Number(req.body.cada);

    if (dias.length === 0 || dias.some(d => !Number.isInteger(d) || d < 0 || d > 6)) {
        return res.status(400).json({ message: 'Marca al menos un día de la semana.' });
    }
    if (!desde || !hasta || desde > hasta) {
        return res.status(400).json({ message: 'Revisa las horas: la primera cita no puede ser después de la última.' });
    }
    if (![15, 30, 45, 60, 90, 120].includes(cada)) {
        return res.status(400).json({ message: 'Intervalo no válido.' });
    }

    const aMin = h => Number(h.slice(0, 2)) * 60 + Number(h.slice(3));
    const horas = [];
    for (let m = aMin(desde); m <= aMin(hasta); m += cada) {
        horas.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
    }

    const valores = [];
    dias.forEach(d => horas.forEach(h => valores.push(`(${d}, '${h}')`)));   // solo números y HH:MM ya validados
    if (valores.length > 500) {
        return res.status(400).json({ message: 'Demasiados horarios a la vez. Reduce los días o el rango.' });
    }

    try {
        const pool = await getPool();
        const r = await pool.request().query(`
            INSERT INTO HorariosDisponibles (DiaSemana, Hora)
            SELECT v.d, CAST(v.h AS TIME(0))
            FROM (VALUES ${valores.join(',')}) AS v(d, h)
            WHERE NOT EXISTS (SELECT 1 FROM HorariosDisponibles x
                              WHERE x.DiaSemana = v.d AND x.Hora = CAST(v.h AS TIME(0)))`);
        const nuevos = r.rowsAffected[0];
        res.status(201).json({
            message: nuevos > 0 ? `${nuevos} horario(s) agregado(s).` : 'Esos horarios ya existían.'
        });
    } catch (err) {
        console.error("Error al agregar horarios:", err);
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/horarios/dia/:dia', requireAuth, async (req, res) => {
    const dia = Number(req.params.dia);
    if (!Number.isInteger(dia) || dia < 0 || dia > 6) {
        return res.status(400).json({ message: 'Día no válido.' });
    }
    try {
        const pool = await getPool();
        await pool.request()
            .input('dia', sql.Int, dia)
            .query("DELETE FROM HorariosDisponibles WHERE DiaSemana = @dia");
        res.json({ message: 'Horarios del día quitados.' });
    } catch (err) {
        console.error("Error al vaciar día:", err);
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/horarios/:id', requireAuth, async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query("DELETE FROM HorariosDisponibles WHERE IdHorario = @id");
        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ message: 'Horario no encontrado.' });
        }
        res.json({ message: 'Horario quitado.' });
    } catch (err) {
        console.error("Error al quitar horario:", err);
        res.status(500).json({ error: err.message });
    }
});

// ---------- CAMBIAR CONTRASEÑA ----------
const intentosClave = new Map();   // usuario -> { cuenta, hasta }

app.post('/api/cambiar-clave', requireAuth, async (req, res) => {
    const { claveActual, claveNueva } = req.body || {};
    const reg = intentosClave.get(req.admin);

    if (reg && reg.hasta > Date.now()) {
        return res.status(429).json({ message: 'Demasiados intentos. Espera 15 minutos.' });
    }
    if (!claveActual || !claveNueva) {
        return res.status(400).json({ message: 'Escribe la contraseña actual y la nueva.' });
    }
    if (String(claveNueva).length < 8) {
        return res.status(400).json({ message: 'La nueva contraseña debe tener al menos 8 caracteres.' });
    }
    if (claveNueva === claveActual) {
        return res.status(400).json({ message: 'La nueva contraseña debe ser distinta de la actual.' });
    }

    try {
        const pool = await getPool();
        const r = await pool.request()
            .input('usuario', sql.NVarChar, req.admin)
            .query("SELECT ClaveHash FROM Administradores WHERE Usuario = @usuario");

        const fila = r.recordset[0];
        // Se responde 400 (no 401) para que el panel no cierre la sesión por error
        if (!fila || !verificarClave(String(claveActual), fila.ClaveHash)) {
            const cuenta = (reg && reg.hasta <= Date.now() ? 0 : (reg ? reg.cuenta : 0)) + 1;
            intentosClave.set(req.admin, cuenta >= 5
                ? { cuenta: 0, hasta: Date.now() + 15 * 60 * 1000 }
                : { cuenta, hasta: 0 });
            return res.status(400).json({ message: 'La contraseña actual es incorrecta.' });
        }

        const salt = crypto.randomBytes(16).toString('hex');
        const hash = crypto.scryptSync(String(claveNueva), salt, 64).toString('hex');
        await pool.request()
            .input('usuario', sql.NVarChar, req.admin)
            .input('clave', sql.NVarChar, `scrypt$${salt}$${hash}`)
            .query("UPDATE Administradores SET ClaveHash = @clave WHERE Usuario = @usuario");

        intentosClave.delete(req.admin);
        // Cierra las demás sesiones de este usuario (queda solo la actual)
        for (const [t, s] of sesiones) {
            if (s.usuario === req.admin && t !== req.token) sesiones.delete(t);
        }
        res.json({ message: 'Contraseña actualizada.' });
    } catch (err) {
        console.error("Error al cambiar contraseña:", err);
        res.status(500).json({ error: err.message });
    }
});

// ---------- HORARIO SEMANAL (público: lo muestra el sitio al cliente) ----------
app.get('/api/horario-semanal', async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(
            "SELECT DiaSemana, CONVERT(VARCHAR(5), Hora, 108) AS Hora FROM HorariosDisponibles ORDER BY DiaSemana, Hora");
        res.json(result.recordset);
    } catch (err) {
        console.error("Error en horario semanal:", err);
        res.status(500).json({ error: err.message });
    }
});

// ---------- ARRANQUE ----------
getPool()
    .then(async pool => {
        console.log('Conectado a SQL Server (BarberiaDB)');
        const r = await pool.request().query("SELECT COUNT(*) AS Total FROM Administradores");
        if (r.recordset[0].Total === 0) {
            console.warn('AVISO: no hay administradores. Ejecuta: node crear-admin.js usuario "contraseña"');
        }
    })
    .catch(err => console.error('Error al iniciar la base de datos:', err.message));

app.listen(3000, () => console.log('Servidor Barber Drive corriendo en puerto 3000'));