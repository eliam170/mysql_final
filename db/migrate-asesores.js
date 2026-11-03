// Crea la tabla "asesores" si no existe y carga 8 asesores de ejemplo.
// Idempotente: se puede ejecutar varias veces sin duplicar datos.
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const { DB_HOST = 'localhost', DB_USER = 'root', DB_PASSWORD = '', DB_NAME = 'repuestos_db' } = process.env;

const SEMILLA = [
  ['Carlos Ramírez', 'Asesor de repuestos', '573001112233', 'carlos@repuestosla61.com'],
  ['Laura Gómez', 'Asesora de frenos', '573002223344', 'laura@repuestosla61.com'],
  ['Andrés Torres', 'Asesor comercial', '573003334455', 'andres@repuestosla61.com'],
  ['Diana Herrera', 'Asesora de motores', '573004445566', 'diana@repuestosla61.com'],
  ['Jorge Peña', 'Asesor de suspensión', '573005556677', 'jorge@repuestosla61.com'],
  ['Marcela Ruiz', 'Asesora de filtros', '573006667788', 'marcela@repuestosla61.com'],
  ['Felipe Castro', 'Asesor eléctrico', '573007778899', 'felipe@repuestosla61.com'],
  ['Sofía Mendoza', 'Servicio al cliente', '573008889900', 'sofia@repuestosla61.com'],
];

async function main() {
  const conn = await mysql.createConnection({ host: DB_HOST, user: DB_USER, password: DB_PASSWORD, database: DB_NAME });
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS asesores (
        id_asesor INT AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(80) NOT NULL,
        cargo VARCHAR(60),
        telefono VARCHAR(20) NOT NULL,
        correo VARCHAR(100),
        activo TINYINT(1) NOT NULL DEFAULT 1,
        fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB
    `);
    console.log('[OK] Tabla "asesores" lista.');

    const [[{ total }]] = await conn.query('SELECT COUNT(*) AS total FROM asesores');
    if (total === 0) {
      await conn.query('INSERT INTO asesores (nombre, cargo, telefono, correo, activo) VALUES ?', [SEMILLA.map((a) => [...a, 1])]);
      console.log(`[OK] ${SEMILLA.length} asesores de ejemplo cargados.`);
    } else {
      console.log(`[OK] La tabla ya tiene ${total} asesores. No se cargan duplicados.`);
    }

    console.log('[LISTO] Migración de asesores completada.');
  } catch (err) {
    console.error(`[ERROR] ${err.code || err.message}`);
    console.error('Revisa que MySQL esté encendido y las credenciales del .env. Luego ejecuta: npm run db:init');
    process.exitCode = 1;
  } finally {
    await conn.end();
  }
}

main();
