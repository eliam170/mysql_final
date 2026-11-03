// Verifica la conexión con MySQL y el estado de la base de datos
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const { DB_HOST = 'localhost', DB_USER = 'root', DB_PASSWORD = '', DB_NAME = 'repuestos_db' } = process.env;

const TABLAS = ['marcas_vehiculo', 'modelos_vehiculo', 'marcas_repuesto', 'categorias_repuesto', 'repuestos', 'repuesto_compatibilidad', 'asesores'];

async function main() {
  let conn;
  try {
    conn = await mysql.createConnection({ host: DB_HOST, user: DB_USER, password: DB_PASSWORD, database: DB_NAME });
    console.log(`[OK] Conexión a MySQL correcta (${DB_USER}@${DB_HOST}/${DB_NAME}).`);

    const [rows] = await conn.query('SHOW TABLES');
    const existentes = rows.map((r) => Object.values(r)[0]);
    const faltan = TABLAS.filter((t) => !existentes.includes(t));
    if (faltan.length) {
      console.log(`[WARN] Faltan tablas: ${faltan.join(', ')}. Ejecuta: npm run db:init`);
    } else {
      console.log('[OK] Todas las tablas existen.');
    }

    for (const t of TABLAS) {
      if (!existentes.includes(t)) continue;
      const [[{ total }]] = await conn.query(`SELECT COUNT(*) AS total FROM ${t}`);
      console.log(`    - ${t}: ${total} registros`);
    }
    console.log('[LISTO] Base de datos verificada.');
  } catch (err) {
    console.error(`[ERROR] No se pudo conectar: ${err.code || err.message}`);
    console.error('Revisa que MySQL esté encendido y las credenciales en .env. Luego ejecuta: npm run db:init');
    process.exitCode = 1;
  } finally {
    if (conn) await conn.end();
  }
}

main();
