// crear-admin.js  ->  node crear-admin.js usuario "contraseña"
const sql = require('mssql/msnodesqlv8');
const crypto = require('crypto');

const [, , usuario, clave] = process.argv;

if (!usuario || !clave || clave.length < 8) {
  console.log('Uso: node crear-admin.js usuario "contraseña de 8 o más caracteres"');
  process.exit(1);
}

const dbConfig = {
  connectionString:
    'Driver={ODBC Driver 17 for SQL Server};' +
    'Server=DESKTOP-L9A5594\\SQLEXPRESS;' +
    'Database=BarberiaDB;' +
    'Trusted_Connection=Yes;' +
    'TrustServerCertificate=Yes;'
};

(async () => {
  try {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(clave, salt, 64).toString('hex');
    const guardado = `scrypt$${salt}$${hash}`;

    const pool = await new sql.ConnectionPool(dbConfig).connect();
    await pool.request()
      .input('usuario', sql.NVarChar, usuario)
      .input('clave', sql.NVarChar, guardado)
      .query(`IF EXISTS (SELECT 1 FROM Administradores WHERE Usuario = @usuario)
                UPDATE Administradores SET ClaveHash = @clave WHERE Usuario = @usuario
              ELSE
                INSERT INTO Administradores (Usuario, ClaveHash) VALUES (@usuario, @clave)`);
    console.log(`Listo: usuario "${usuario}" guardado.`);
    await pool.close();
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();