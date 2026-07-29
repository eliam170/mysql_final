import fs from 'fs';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const {
  DB_HOST = 'localhost',
  DB_USER = 'root',
  DB_PASSWORD = '',
  DB_NAME = 'vacunas_db',
} = process.env;

async function initDB() {
  const conn = await mysql.createConnection({ host: DB_HOST, user: DB_USER, password: DB_PASSWORD });

  try {
    const sql = fs.readFileSync(path.join(__dirname, 'init.sql'), 'utf8');

    const cleanSQL = sql
      .replace(/--.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');

    const chunks = cleanSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    for (const stmt of chunks) {
      try {
        await conn.query(stmt);
      } catch (err) {
        console.warn(`[WARN] ${err.message.slice(0, 120)}`);
      }
    }

    console.log(`[OK] Base de datos "${DB_NAME}" inicializada con esquema + datos masivos.`);
  } catch (err) {
    console.error(`[ERROR] ${err.message}`);
  } finally {
    await conn.end();
  }
}

initDB();
