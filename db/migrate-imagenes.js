// Agrega la columna "imagen" a la tabla repuestos y asigna una imagen por defecto
// a cada repuesto segun su categoria. Es idempotente: se puede ejecutar varias veces.
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const { DB_HOST = 'localhost', DB_USER = 'root', DB_PASSWORD = '', DB_NAME = 'repuestos_db' } = process.env;

// Imagen por defecto segun el nombre de la categoria (relativa a la raiz del front)
const IMAGENES = {
  'Frenos': '/img/frenos.jpg',
  'Filtros': '/img/filtros.jpg',
  'Suspension': '/img/suspension.jpg',
  'Suspensión': '/img/suspension.jpg',
  'Motor': '/img/motor.jpg',
  'Encendido': '/img/encendido.jpg',
  'Transmision': '/img/transmision.jpg',
  'Transmisión': '/img/transmision.jpg',
  'Electrico': '/img/electrico.jpg',
  'Eléctrico': '/img/electrico.jpg',
  'Direccion': '/img/direccion.jpg',
  'Dirección': '/img/direccion.jpg',
};
const GENERICA = '/img/productos-generico.jpg';

async function columnaExiste(conn, tabla, columna) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS total FROM information_schema.columns
     WHERE table_schema = ? AND table_name = ? AND column_name = ?`,
    [DB_NAME, tabla, columna]
  );
  return rows[0].total > 0;
}

async function main() {
  const conn = await mysql.createConnection({ host: DB_HOST, user: DB_USER, password: DB_PASSWORD, database: DB_NAME });
  try {
    if (await columnaExiste(conn, 'repuestos', 'imagen')) {
      console.log('[OK] La columna "imagen" ya existe en repuestos.');
    } else {
      await conn.query('ALTER TABLE repuestos ADD COLUMN imagen VARCHAR(255) NULL AFTER descripcion');
      console.log('[OK] Columna "imagen" agregada a la tabla repuestos.');
    }

    const [categorias] = await conn.query('SELECT id_categoria, nombre FROM categorias_repuesto');
    let actualizados = 0;
    for (const c of categorias) {
      const url = IMAGENES[c.nombre] || GENERICA;
      const [res] = await conn.query(
        'UPDATE repuestos SET imagen = ? WHERE id_categoria = ? AND (imagen IS NULL OR imagen = "")',
        [url, c.id_categoria]
      );
      actualizados += res.affectedRows;
    }

    const [[{ pendientes }]] = await conn.query(
      'SELECT COUNT(*) AS pendientes FROM repuestos WHERE imagen IS NULL OR imagen = ""'
    );
    if (pendientes > 0) {
      const [res] = await conn.query('UPDATE repuestos SET imagen = ? WHERE imagen IS NULL OR imagen = ""', [GENERICA]);
      actualizados += res.affectedRows;
    }

    console.log(`[OK] Imagenes asignadas a ${actualizados} repuestos.`);
    console.log('[LISTO] Migración de imagenes completada.');
  } catch (err) {
    console.error(`[ERROR] ${err.code || err.message}`);
    console.error('Revisa que MySQL esté encendido y las credenciales del .env. Luego ejecuta: npm run db:init');
    process.exitCode = 1;
  } finally {
    await conn.end();
  }
}

main();
