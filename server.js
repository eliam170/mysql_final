import express from 'express';
import compression from 'compression';
import cors from 'cors';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import fs from 'fs';
import multer from 'multer';
import * as XLSX from 'xlsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'la61admin';
const VERSION = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf8')).version;

app.use(compression());
app.use(cors());
app.use(express.json({ limit: '25mb' }));

// Recursos estaticos (imagenes de repuestos) disponibles en dev y produccion
app.use(express.static(path.resolve(__dirname, 'public'), {
  maxAge: '7d',
  etag: true,
  setHeaders: (res) => res.setHeader('Cache-Control', 'public, max-age=604800'),
}));

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'repuestos_db',
  waitForConnections: true,
  connectionLimit: 20,
  queueLimit: 0,
  connectTimeout: 8000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  idleTimeout: 60000,
  maxIdle: 20,
});

// Si una conexión del pool falla, que no derribe el proceso
pool.on('connection', (conn) => {
  conn.on('error', (err) => console.error('[MYSQL CONN ERROR]', err.code || err.message));
});

/* ========== UTILIDADES MYSQL (reintento ante conexiones caídas) ========== */
const ERRORES_CONEXION = new Set([
  'PROTOCOL_CONNECTION_LOST',
  'PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR',
  'ECONNRESET',
  'ETIMEDOUT',
  'EPIPE',
  'ER_CLIENT_INTERACTION_TIMEOUT',
  'ER_QUERY_INTERRUPTED',
]);

const esErrorConexion = (err) => !!err && ERRORES_CONEXION.has(err.code);
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// Ejecuta una consulta reintentando si la conexión del pool estaba caída
async function ejecutar(sql, params = [], reintentos = 3) {
  try {
    return await pool.execute(sql, params);
  } catch (err) {
    if (reintentos > 0 && esErrorConexion(err)) {
      console.warn(`[MySQL] Conexión caída (${err.code}). Reintentando...`);
      await esperar(400);
      return ejecutar(sql, params, reintentos - 1);
    }
    throw err;
  }
}

// Obtiene una conexión del pool reintentando si viene muerta
async function conexion(reintentos = 3) {
  try {
    return await pool.getConnection();
  } catch (err) {
    if (reintentos > 0 && esErrorConexion(err)) {
      console.warn(`[MySQL] No se pudo obtener conexión (${err.code}). Reintentando...`);
      await esperar(400);
      return conexion(reintentos - 1);
    }
    throw err;
  }
}

/* ========== BUSQUEDA DIFUSA (tolerante a errores y por nombre + marca + modelo) ========== */
const PALABRAS_VACIAS = new Set([
  'de', 'la', 'el', 'los', 'las', 'y', 'o', 'para', 'con', 'por', 'en', 'del', 'al',
  'un', 'una', 'unos', 'unas', 'mi', 'tu', 'su', 'que', 'd', 'l',
]);
const PESO_MAXIMO = 3;

function normalizarTexto(valor) {
  return String(valor ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Separa "mazda2" en ["mazda", "2"] y descarta palabras vacias si se pide.
function tokenizar(valor, { quitarVacias = false } = {}) {
  const salida = [];
  const agregar = (token) => {
    if (!token) return;
    if (quitarVacias && (PALABRAS_VACIAS.has(token) || (token.length === 1 && !/\d/.test(token)))) return;
    salida.push(token);
  };
  for (const bruto of normalizarTexto(valor).split(' ')) {
    if (!bruto) continue;
    const partes = bruto.match(/^([a-z]+)(\d+)$/);
    if (partes) {
      agregar(partes[1]);
      agregar(partes[2]);
    } else {
      agregar(bruto);
    }
  }
  return salida;
}

function distanciaLevenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let previo = Array.from({ length: b.length + 1 }, (_, i) => i);
  let actual = new Array(b.length + 1);
  for (let i = 1; i <= a.length; i += 1) {
    actual[0] = i;
    const codigo = a.charCodeAt(i - 1);
    for (let j = 1; j <= b.length; j += 1) {
      const costo = codigo === b.charCodeAt(j - 1) ? 0 : 1;
      actual[j] = Math.min(previo[j] + 1, actual[j - 1] + 1, previo[j - 1] + costo);
    }
    [previo, actual] = [actual, previo];
  }
  return previo[b.length];
}

function similitud(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  // Numeros (años, codigos): solo coincidencia exacta o por prefijo, sin difusos.
  if (/^\d+$/.test(a) && /^\d+$/.test(b)) {
    if (a.length >= 3 && b.length >= 3 && (a.startsWith(b) || b.startsWith(a))) return 0.85;
    return 0;
  }
  if (a.length > 1 && b.length > 1 && (a.startsWith(b) || b.startsWith(a))) {
    return Math.min(a.length, b.length) >= 3 ? 0.9 : 0.75;
  }
  if (a.length >= 4 && b.length >= 4 && (a.includes(b) || b.includes(a))) return 0.8;
  const maximo = Math.max(a.length, b.length);
  if (Math.abs(a.length - b.length) > Math.max(2, Math.floor(maximo * 0.4))) return 0;
  const sim = 1 - distanciaLevenshtein(a, b) / maximo;
  return sim >= 0.55 ? sim : 0;
}

async function cargarCompatibilidad(ids) {
  const mapa = new Map();
  if (!ids.length) return mapa;
  const lote = 700;
  for (let i = 0; i < ids.length; i += lote) {
    const trozo = ids.slice(i, i + lote);
    const marcadores = trozo.map(() => '?').join(',');
    const [filas] = await ejecutar(`
      SELECT rc.id_repuesto, ma.nombre AS marca, mo.nombre AS modelo,
             mo.cilindraje, mo.anio_inicio, mo.anio_fin
      FROM repuesto_compatibilidad rc
      JOIN modelos_vehiculo mo ON mo.id_modelo = rc.id_modelo
      JOIN marcas_vehiculo ma ON ma.id_marca_vehiculo = mo.id_marca_vehiculo
      WHERE rc.id_repuesto IN (${marcadores})
    `, trozo);
    for (const fila of filas) {
      if (!mapa.has(fila.id_repuesto)) mapa.set(fila.id_repuesto, { tokens: new Set(), rangos: [] });
      const entrada = mapa.get(fila.id_repuesto);
      for (const token of tokenizar(fila.marca, { quitarVacias: true })) entrada.tokens.add(token);
      for (const token of tokenizar(fila.modelo, { quitarVacias: true })) entrada.tokens.add(token);
      for (const token of tokenizar(String(fila.cilindraje ?? '').replace('.', ' '), { quitarVacias: true })) entrada.tokens.add(token);
      if (fila.anio_inicio != null && fila.anio_fin != null) entrada.rangos.push([fila.anio_inicio, fila.anio_fin]);
    }
  }
  return mapa;
}

function puntuarRepuesto(repuesto, tokensConsulta, compat) {
  const campos = [
    { peso: 3.0, identidad: true, tokens: tokenizar(repuesto.nombre, { quitarVacias: true }) },
    { peso: 2.5, identidad: true, tokens: tokenizar(repuesto.codigo, { quitarVacias: true }) },
    { peso: 1.8, identidad: true, tokens: tokenizar(repuesto.marca_repuesto, { quitarVacias: true }) },
    { peso: 1.5, identidad: true, tokens: tokenizar(repuesto.categoria, { quitarVacias: true }) },
    { peso: 0.9, identidad: true, tokens: tokenizar(repuesto.descripcion, { quitarVacias: true }) },
  ];
  if (compat?.tokens?.size) campos.push({ peso: 1.6, identidad: false, tokens: [...compat.tokens] });

  let total = 0;
  let identidad = 0;
  let vehiculo = 0;
  for (const token of tokensConsulta) {
    let mejor = 0;
    let mejorIdentidad = 0;
    let mejorVehiculo = 0;
    for (const campo of campos) {
      const factor = campo.peso / PESO_MAXIMO;
      for (const candidato of campo.tokens) {
        const sim = similitud(token, candidato);
        if (!sim) continue;
        const valor = sim * factor;
        if (valor > mejor) mejor = valor;
        if (campo.identidad && valor > mejorIdentidad) mejorIdentidad = valor;
        if (!campo.identidad && valor > mejorVehiculo) mejorVehiculo = valor;
      }
    }
    if (/^\d{4}$/.test(token) && compat?.rangos?.length) {
      const anio = Number(token);
      let valorAnio = 0;
      for (const [inicio, fin] of compat.rangos) {
        if (inicio == null || fin == null) continue;
        if (anio >= inicio && anio <= fin) {
          valorAnio = Math.max(valorAnio, 0.45);
          break;
        }
        const distancia = anio < inicio ? inicio - anio : anio - fin;
        if (distancia <= 2) valorAnio = Math.max(valorAnio, 0.25);
      }
      mejor = Math.max(mejor, valorAnio);
      mejorVehiculo = Math.max(mejorVehiculo, valorAnio);
    }
    total += mejor;
    if (mejorIdentidad > 0) identidad += 1;
    if (mejorVehiculo > 0) vehiculo += 1;
  }
  return {
    score: tokensConsulta.length ? total / tokensConsulta.length : 0,
    identidad,
    vehiculo,
  };
}

/* ========== INDICES PARA CATALOGOS GRANDES ========== */
let fulltextOk = false;

async function asegurarIndices() {
  const indices = [
    { tabla: 'repuestos', nombre: 'idx_rep_stock', sql: 'CREATE INDEX idx_rep_stock ON repuestos (stock)' },
    { tabla: 'repuestos', nombre: 'idx_rep_categoria', sql: 'CREATE INDEX idx_rep_categoria ON repuestos (id_categoria, id_repuesto)' },
    { tabla: 'repuestos', nombre: 'idx_rep_marca_rep', sql: 'CREATE INDEX idx_rep_marca_rep ON repuestos (id_marca_repuesto, id_repuesto)' },
    { tabla: 'repuesto_compatibilidad', nombre: 'idx_compat_modelo_rep', sql: 'CREATE INDEX idx_compat_modelo_rep ON repuesto_compatibilidad (id_modelo, id_repuesto)' },
    { tabla: 'repuestos', nombre: 'ft_repuestos', sql: 'ALTER TABLE repuestos ADD FULLTEXT INDEX ft_repuestos (nombre, descripcion)' },
  ];
  for (const idx of indices) {
    try {
      const [existe] = await ejecutar(
        `SELECT 1 FROM information_schema.STATISTICS
         WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ? LIMIT 1`,
        [idx.tabla, idx.nombre],
      );
      if (!existe.length) {
        await ejecutar(idx.sql);
        console.log(`[DB] Indice creado: ${idx.nombre}`);
      }
    } catch (err) {
      console.error(`[DB] No se pudo crear el indice ${idx.nombre}:`, err.code || err.message);
    }
  }
  try {
    const [ft] = await ejecutar(
      `SELECT 1 FROM information_schema.STATISTICS
       WHERE table_schema = DATABASE() AND table_name = 'repuestos' AND index_name = 'ft_repuestos' LIMIT 1`,
    );
    fulltextOk = ft.length > 0;
  } catch {
    fulltextOk = false;
  }
}

function respuestaError(res, err, contexto = 'Error del servidor') {
  const conexionCaida = esErrorConexion(err);
  if (conexionCaida) console.error(`[MySQL] ${contexto}:`, err.code);
  else console.error(`[SERVER] ${contexto}:`, err);
  res.status(500).json({
    error: conexionCaida
      ? 'Se perdió la conexión con la base de datos. Revisa que MySQL esté encendido.'
      : (err.message || contexto),
    codigo: err.code || 'ERROR',
  });
}

/* ========== AUTENTICACION (panel de administracion) ========== */
const tokens = new Set();

function tokenDesdeReq(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7) : '';
}

function requireAuth(req, res, next) {
  const token = tokenDesdeReq(req);
  if (!token || !tokens.has(token)) {
    return res.status(401).json({ error: 'No autorizado. Inicia sesión.' });
  }
  next();
}

app.post('/api/login', (req, res) => {
  const { password } = req.body || {};
  if (!password || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Contraseña incorrecta.' });
  }
  const token = crypto.randomBytes(24).toString('hex');
  tokens.add(token);
  res.json({ token });
});

app.post('/api/logout', (req, res) => {
  tokens.delete(tokenDesdeReq(req));
  res.json({ exito: true });
});

/* ========== HEALTH / VERSION / SESION ========== */
app.get('/api/health', async (req, res) => {
  try {
    await ejecutar('SELECT 1');
    res.json({ ok: true, version: VERSION, db: 'ok' });
  } catch (err) {
    res.status(503).json({ ok: false, db: 'error', error: err.message, codigo: err.code || 'ERROR' });
  }
});

app.get('/api/version', (req, res) => {
  res.json({ version: VERSION });
});

// Verifica si el token de administrador sigue siendo válido
app.get('/api/session', (req, res) => {
  const token = tokenDesdeReq(req);
  res.json({ valido: !!token && tokens.has(token) });
});

/* ========== RAIZ INFORMATIVA ========== */
app.get('/', (req, res) => {
  const indexDist = path.resolve(__dirname, 'dist', 'index.html');
  if (fs.existsSync(indexDist)) return res.sendFile(indexDist);
  res.type('html').send(`
    <!doctype html><html lang="es"><head><meta charset="utf-8">
    <title>TODO REPUESTOS Y FRENOS LA 61 - API</title></head>
    <body style="font-family:system-ui;background:#fff;color:#1a1a1a;max-width:640px;margin:3rem auto;padding:0 1rem">
      <h1 style="margin-bottom:.3rem">TODO REPUESTOS Y FRENOS LA 61</h1>
      <p style="color:#555">API funcionando (v${VERSION}).</p>
      <p>La tienda se abre en <a href="http://localhost:5173" style="color:#b8860b;font-weight:700">http://localhost:5173</a>.</p>
      <ul>
        <li><a href="/api/health">/api/health</a></li>
        <li><a href="/api/kpi">/api/kpi</a></li>
        <li><a href="/api/repuestos">/api/repuestos</a></li>
      </ul>
    </body></html>`);
});

/* ========== KPIs ========== */
app.get('/api/kpi', async (req, res) => {
  try {
    const [[{ total: totalRepuestos }]] = await ejecutar('SELECT COUNT(*) AS total FROM repuestos');
    const [[{ total: totalMarcas }]] = await ejecutar('SELECT COUNT(*) AS total FROM marcas_vehiculo');
    const [[{ total: totalModelos }]] = await ejecutar('SELECT COUNT(*) AS total FROM modelos_vehiculo');
    const [[{ total: agotados }]] = await ejecutar('SELECT COUNT(*) AS total FROM repuestos WHERE stock = 0');
    const [[{ total: valorInventario }]] = await ejecutar('SELECT COALESCE(SUM(precio * stock), 0) AS total FROM repuestos');
    res.json({ totalRepuestos, totalMarcas, totalModelos, agotados, valorInventario });
  } catch (err) {
    respuestaError(res, err);
  }
});

/* ========== MARCAS DE VEHICULO ========== */
app.get('/api/marcas-vehiculo', async (req, res) => {
  try {
    const [rows] = await ejecutar(`
      SELECT m.id_marca_vehiculo, m.nombre, m.pais_origen,
             COUNT(mo.id_modelo) AS total_modelos
      FROM marcas_vehiculo m
      LEFT JOIN modelos_vehiculo mo ON mo.id_marca_vehiculo = m.id_marca_vehiculo
      GROUP BY m.id_marca_vehiculo
      ORDER BY m.nombre
    `);
    res.json(rows);
  } catch (err) {
    respuestaError(res, err);
  }
});

// Crea una marca de vehículo nueva (o devuelve la existente si ya existe)
app.post('/api/marcas-vehiculo', requireAuth, async (req, res) => {
  try {
    const { nombre, pais_origen } = req.body || {};
    const limpio = String(nombre || '').trim();
    if (!limpio) return res.status(400).json({ error: 'El nombre de la marca es obligatorio.' });

    const [existentes] = await ejecutar(
      'SELECT * FROM marcas_vehiculo WHERE LOWER(nombre) = LOWER(?)',
      [limpio]
    );
    if (existentes.length) {
      return res.json({ exito: true, existente: true, marca: existentes[0] });
    }

    const [result] = await ejecutar(
      'INSERT INTO marcas_vehiculo (nombre, pais_origen) VALUES (?, ?)',
      [limpio, (pais_origen || 'Sin especificar').toString().trim() || 'Sin especificar']
    );
    const [creada] = await ejecutar('SELECT * FROM marcas_vehiculo WHERE id_marca_vehiculo = ?', [result.insertId]);
    res.json({ exito: true, existente: false, marca: creada[0] });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Esa marca ya existe.' });
    }
    respuestaError(res, err);
  }
});

/* ========== MODELOS ========== */
app.get('/api/modelos', async (req, res) => {
  try {
    const { marca, cilindraje } = req.query;
    const conditions = [];
    const params = [];
    if (marca) { conditions.push('mo.id_marca_vehiculo = ?'); params.push(marca); }
    if (cilindraje) { conditions.push('mo.cilindraje = ?'); params.push(cilindraje); }
    let sql = `
      SELECT mo.id_modelo, mo.nombre, mo.cilindraje, mo.anio_inicio, mo.anio_fin,
             ma.nombre AS marca, ma.id_marca_vehiculo
      FROM modelos_vehiculo mo
      JOIN marcas_vehiculo ma ON mo.id_marca_vehiculo = ma.id_marca_vehiculo
    `;
    if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY ma.nombre, mo.nombre, mo.cilindraje';
    const [rows] = await ejecutar(sql, params);
    res.json(rows);
  } catch (err) {
    respuestaError(res, err);
  }
});

// Crea un modelo de vehículo nuevo (o devuelve el existente si repite marca/nombre/cilindraje)
app.post('/api/modelos', requireAuth, async (req, res) => {
  try {
    const { id_marca_vehiculo, nombre, cilindraje, anio_inicio, anio_fin } = req.body || {};
    const idMarca = Number(id_marca_vehiculo);
    const limpio = String(nombre || '').trim();
    const cil = Number(cilindraje);
    if (!idMarca || !limpio) {
      return res.status(400).json({ error: 'La marca y el nombre del modelo son obligatorios.' });
    }
    if (!Number.isFinite(cil) || cil <= 0 || cil > 99.9) {
      return res.status(400).json({ error: 'El cilindraje debe ser un número mayor a 0 (ej: 1.6).' });
    }

    const anioIni = Number(anio_inicio) || null;
    const anioFin = Number(anio_fin) || null;
    if (anioIni && anioFin && anioFin < anioIni) {
      return res.status(400).json({ error: 'El año final no puede ser menor que el año inicial.' });
    }

    const [marca] = await ejecutar('SELECT * FROM marcas_vehiculo WHERE id_marca_vehiculo = ?', [idMarca]);
    if (!marca.length) return res.status(404).json({ error: 'La marca indicada no existe.' });

    const [existentes] = await ejecutar(
      `SELECT * FROM modelos_vehiculo
       WHERE id_marca_vehiculo = ? AND LOWER(nombre) = LOWER(?) AND cilindraje = ?
         AND anio_inicio <=> ? AND anio_fin <=> ?`,
      [idMarca, limpio, cil, anioIni, anioFin]
    );
    if (existentes.length) {
      return res.json({
        exito: true,
        existente: true,
        modelo: { ...existentes[0], marca: marca[0].nombre },
      });
    }

    const [result] = await ejecutar(
      'INSERT INTO modelos_vehiculo (id_marca_vehiculo, nombre, cilindraje, anio_inicio, anio_fin) VALUES (?, ?, ?, ?, ?)',
      [idMarca, limpio, cil, anioIni, anioFin]
    );
    const [creado] = await ejecutar(
      `SELECT mo.id_modelo, mo.nombre, mo.cilindraje, mo.anio_inicio, mo.anio_fin,
              ma.nombre AS marca, ma.id_marca_vehiculo
       FROM modelos_vehiculo mo
       JOIN marcas_vehiculo ma ON mo.id_marca_vehiculo = ma.id_marca_vehiculo
       WHERE mo.id_modelo = ?`,
      [result.insertId]
    );
    res.json({ exito: true, existente: false, modelo: creado[0] });
  } catch (err) {
    respuestaError(res, err);
  }
});

/* ========== CILINDRAJES ========== */
app.get('/api/cilindrajes', async (req, res) => {
  try {
    const { marca } = req.query;
    let sql = 'SELECT DISTINCT cilindraje FROM modelos_vehiculo';
    const params = [];
    if (marca) { sql += ' WHERE id_marca_vehiculo = ?'; params.push(marca); }
    sql += ' ORDER BY cilindraje';
    const [rows] = await ejecutar(sql, params);
    res.json(rows.map(r => r.cilindraje));
  } catch (err) {
    respuestaError(res, err);
  }
});

/* ========== MARCAS DE REPUESTO / CATEGORIAS ========== */
app.get('/api/marcas-repuesto', async (req, res) => {
  try {
    const [rows] = await ejecutar('SELECT * FROM marcas_repuesto ORDER BY nombre');
    res.json(rows);
  } catch (err) {
    respuestaError(res, err);
  }
});

// Crea una marca de repuesto nueva (o devuelve la existente si ya existe)
app.post('/api/marcas-repuesto', requireAuth, async (req, res) => {
  try {
    const { nombre, pais_origen } = req.body || {};
    const limpio = String(nombre || '').trim();
    if (!limpio) return res.status(400).json({ error: 'El nombre de la marca es obligatorio.' });

    const [existentes] = await ejecutar(
      'SELECT * FROM marcas_repuesto WHERE LOWER(nombre) = LOWER(?)',
      [limpio]
    );
    if (existentes.length) {
      return res.json({ exito: true, existente: true, marca: existentes[0] });
    }

    const [result] = await ejecutar(
      'INSERT INTO marcas_repuesto (nombre, pais_origen) VALUES (?, ?)',
      [limpio, (pais_origen || 'Sin especificar').toString().trim() || 'Sin especificar']
    );
    const [creada] = await ejecutar('SELECT * FROM marcas_repuesto WHERE id_marca_repuesto = ?', [result.insertId]);
    res.json({ exito: true, existente: false, marca: creada[0] });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Esa marca ya existe.' });
    }
    respuestaError(res, err);
  }
});

app.get('/api/categorias', async (req, res) => {
  try {
    const [rows] = await ejecutar(`
      SELECT c.id_categoria, c.nombre, c.descripcion,
             COUNT(r.id_repuesto) AS total_repuestos
      FROM categorias_repuesto c
      LEFT JOIN repuestos r ON r.id_categoria = c.id_categoria
      GROUP BY c.id_categoria, c.nombre, c.descripcion
      ORDER BY c.nombre
    `);
    res.json(rows);
  } catch (err) {
    respuestaError(res, err);
  }
});

// Crea una categoria nueva (o devuelve la existente si ya existe)
app.post('/api/categorias', requireAuth, async (req, res) => {
  try {
    const limpio = String(req.body?.nombre || '').trim();
    const descripcion = String(req.body?.descripcion || '').trim();
    if (!limpio) return res.status(400).json({ error: 'El nombre de la categoría es obligatorio.' });

    const [existentes] = await ejecutar(
      'SELECT * FROM categorias_repuesto WHERE LOWER(nombre) = LOWER(?)',
      [limpio]
    );
    if (existentes.length) {
      return res.json({ exito: true, existente: true, categoria: existentes[0] });
    }

    const [result] = await ejecutar(
      'INSERT INTO categorias_repuesto (nombre, descripcion) VALUES (?, ?)',
      [limpio, descripcion || null]
    );
    const [creada] = await ejecutar('SELECT * FROM categorias_repuesto WHERE id_categoria = ?', [result.insertId]);
    res.json({ exito: true, existente: false, categoria: creada[0] });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Esa categoría ya existe.' });
    }
    respuestaError(res, err);
  }
});

app.put('/api/categorias/:id', requireAuth, async (req, res) => {
  try {
    const nombre = String(req.body?.nombre || '').trim();
    const descripcion = req.body?.descripcion !== undefined
      ? (String(req.body.descripcion).trim() || null)
      : undefined;
    if (!nombre) return res.status(400).json({ error: 'El nombre de la categoría es obligatorio.' });

    const [duplicadas] = await ejecutar(
      'SELECT id_categoria FROM categorias_repuesto WHERE LOWER(nombre) = LOWER(?) AND id_categoria <> ?',
      [nombre, req.params.id]
    );
    if (duplicadas.length) return res.status(409).json({ error: 'Ya existe otra categoría con ese nombre.' });

    const sets = ['nombre = ?'];
    const params = [nombre];
    if (descripcion !== undefined) {
      sets.push('descripcion = ?');
      params.push(descripcion);
    }
    params.push(req.params.id);

    const [result] = await ejecutar(
      `UPDATE categorias_repuesto SET ${sets.join(', ')} WHERE id_categoria = ?`,
      params
    );
    if (!result.affectedRows) return res.status(404).json({ error: 'La categoría no existe.' });
    res.json({ exito: true, mensaje: 'Categoría actualizada correctamente.' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Ya existe otra categoría con ese nombre.' });
    }
    respuestaError(res, err);
  }
});

app.delete('/api/categorias/:id', requireAuth, async (req, res) => {
  try {
    const [[{ total }]] = await ejecutar(
      'SELECT COUNT(*) AS total FROM repuestos WHERE id_categoria = ?',
      [req.params.id]
    );
    if (total > 0) {
      return res.status(409).json({
        error: `No se puede eliminar: ${total} repuesto${total === 1 ? '' : 's'} usa${total === 1 ? '' : 'n'} esta categoría. Reasígnalos primero.`,
      });
    }
    const [result] = await ejecutar('DELETE FROM categorias_repuesto WHERE id_categoria = ?', [req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ error: 'La categoría no existe.' });
    res.json({ exito: true, mensaje: 'Categoría eliminada correctamente.' });
  } catch (err) {
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(409).json({ error: 'No se puede eliminar: la categoría tiene repuestos asignados.' });
    }
    respuestaError(res, err);
  }
});

/* ========== REPUESTOS (catalogo con filtros y paginacion) ========== */
app.get('/api/repuestos', async (req, res) => {
  try {
    const { q, marca, modelo, cilindraje, anio, categoria, marca_repuesto, soloStock, stock, orden, totalGeneral } = req.query;
    const conditions = [];
    const params = [];

    if (categoria) { conditions.push('r.id_categoria = ?'); params.push(categoria); }
    if (marca_repuesto) { conditions.push('r.id_marca_repuesto = ?'); params.push(marca_repuesto); }
    if (soloStock === 'true') conditions.push('r.stock > 0');
    if (stock === 'disponible') conditions.push('r.stock > 10');
    else if (stock === 'bajo') conditions.push('r.stock BETWEEN 1 AND 10');
    else if (stock === 'agotado') conditions.push('r.stock <= 0');

    // Compatibilidad: todas las condiciones se evalúan sobre la misma fila de
    // modelo para que marca, modelo, cilindraje y año correspondan al mismo vehiculo.
    const compatConds = [];
    const compatParams = [];
    if (modelo) { compatConds.push('mo.id_modelo = ?'); compatParams.push(modelo); }
    if (marca) { compatConds.push('mo.id_marca_vehiculo = ?'); compatParams.push(marca); }
    if (cilindraje) { compatConds.push('mo.cilindraje = ?'); compatParams.push(cilindraje); }
    if (anio) {
      const anioNum = parseInt(anio, 10);
      if (Number.isFinite(anioNum)) {
        compatConds.push('mo.anio_inicio IS NOT NULL AND mo.anio_fin IS NOT NULL AND ? BETWEEN mo.anio_inicio AND mo.anio_fin');
        compatParams.push(anioNum);
      }
    }
    if (compatConds.length) {
      conditions.push(`EXISTS (
        SELECT 1 FROM repuesto_compatibilidad rc
        JOIN modelos_vehiculo mo ON rc.id_modelo = mo.id_modelo
        WHERE rc.id_repuesto = r.id_repuesto AND ${compatConds.join(' AND ')}
      )`);
      params.push(...compatParams);
    }

    const where = conditions.length ? ' WHERE ' + conditions.join(' AND ') : '';
    const joins = `
      FROM repuestos r
      JOIN categorias_repuesto c ON r.id_categoria = c.id_categoria
      JOIN marcas_repuesto mr ON r.id_marca_repuesto = mr.id_marca_repuesto
    `;
    const columnas = `
      SELECT r.id_repuesto, r.codigo, r.nombre, r.precio, r.stock, r.descripcion, r.imagen,
             c.nombre AS categoria, c.id_categoria,
             mr.nombre AS marca_repuesto, mr.id_marca_repuesto, mr.pais_origen AS marca_repuesto_pais
    `;
    const ordenes = {
      precio_asc: 'r.precio ASC',
      precio_desc: 'r.precio DESC',
      nombre_asc: 'r.nombre ASC',
      nombre_desc: 'r.nombre DESC',
      codigo_asc: 'r.codigo ASC',
      stock_asc: 'r.stock ASC',
      stock_desc: 'r.stock DESC',
    };
    const orderBy = (ordenes[orden] || 'r.id_repuesto ASC') + ', r.id_repuesto ASC';

    const paginar = req.query.page !== undefined || req.query.limit !== undefined;
    const pagina = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limite = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const offset = (pagina - 1) * limite;

    // Busqueda difusa: nombre, codigo, categoria, marca del repuesto y sobre todo
    // marca/modelo/año del vehiculo, tolerando errores de escritura.
    const tokensConsulta = q ? tokenizar(String(q), { quitarVacias: true }).slice(0, 12) : [];
    if (tokensConsulta.length) {
      const [candidatos] = await ejecutar(`${columnas}${joins}${where} ORDER BY r.id_repuesto ASC`, params);
      const compatibilidad = await cargarCompatibilidad(candidatos.map((c) => c.id_repuesto));
      let puntuados = candidatos
        .map((item) => {
          const puntaje = puntuarRepuesto(item, tokensConsulta, compatibilidad.get(item.id_repuesto));
          return {
            ...item,
            _relevancia: puntaje.score,
            _identidad: puntaje.identidad,
            _vehiculo: puntaje.vehiculo,
          };
        })
        .filter((item) => item._relevancia > 0);

      puntuados.sort((a, b) => b._relevancia - a._relevancia || a.nombre.localeCompare(b.nombre) || a.id_repuesto - b.id_repuesto);

      // Si la consulta menciona un repuesto, marca o categoria, debe coincidir con
      // ese dato; asi no se llena la lista solo con vehiculos compatibles.
      const totalTokens = tokensConsulta.length;
      const buenos = puntuados.filter((item) =>
        item._relevancia >= 0.45 && (item._identidad > 0 || item._vehiculo === totalTokens));
      puntuados = buenos.length ? buenos : puntuados.slice(0, 8);
      if (orden && orderBy) {
        puntuados.sort((a, b) => {
          if (orden === 'precio_asc') return Number(a.precio) - Number(b.precio) || b._relevancia - a._relevancia;
          if (orden === 'precio_desc') return Number(b.precio) - Number(a.precio) || b._relevancia - a._relevancia;
          if (orden === 'nombre_asc') return a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' });
          if (orden === 'nombre_desc') return b.nombre.localeCompare(a.nombre, 'es', { sensitivity: 'base' });
          if (orden === 'codigo_asc') return a.codigo.localeCompare(b.codigo, 'es', { sensitivity: 'base' });
          if (orden === 'stock_asc') return Number(a.stock) - Number(b.stock);
          if (orden === 'stock_desc') return Number(b.stock) - Number(a.stock);
          return 0;
        });
      }

      const total = puntuados.length;
      const limpiar = ({ _relevancia, _identidad, _vehiculo, ...item }) => item;
      if (!paginar) return res.json(puntuados.map(limpiar));

      const respuesta = {
        items: puntuados.slice(offset, offset + limite).map(limpiar),
        total,
        page: pagina,
        limit: limite,
        paginas: Math.max(1, Math.ceil(total / limite)),
      };
      if (totalGeneral === '1') {
        const [[{ general }]] = await ejecutar('SELECT COUNT(*) AS general FROM repuestos');
        respuesta.totalGeneral = general;
      }
      return res.json(respuesta);
    }

    // Sin page/limit se conserva el comportamiento anterior (arreglo completo)
    if (!paginar) {
      const [rows] = await ejecutar(`${columnas}${joins}${where} ORDER BY ${orderBy}`, params);
      return res.json(rows);
    }

    const [[{ total }]] = await ejecutar(`SELECT COUNT(*) AS total FROM repuestos r${where}`, params);
    const [items] = await ejecutar(`${columnas}${joins}${where} ORDER BY ${orderBy} LIMIT ${limite} OFFSET ${offset}`, params);

    const respuesta = {
      items,
      total,
      page: pagina,
      limit: limite,
      paginas: Math.max(1, Math.ceil(total / limite)),
    };
    // El admin necesita el total sin filtros para mostrar "X de Y"
    if (totalGeneral === '1') {
      const [[{ general }]] = await ejecutar('SELECT COUNT(*) AS general FROM repuestos');
      respuesta.totalGeneral = general;
    }
    res.json(respuesta);
  } catch (err) {
    respuestaError(res, err);
  }
});

/* ========== REPUESTO POR ID (detalle + compatibilidad) ========== */
app.get('/api/repuestos/:id', async (req, res) => {
  try {
    const [rows] = await ejecutar(`
      SELECT r.*, c.nombre AS categoria, mr.nombre AS marca_repuesto, mr.pais_origen AS marca_repuesto_pais
      FROM repuestos r
      JOIN categorias_repuesto c ON r.id_categoria = c.id_categoria
      JOIN marcas_repuesto mr ON r.id_marca_repuesto = mr.id_marca_repuesto
      WHERE r.id_repuesto = ?
    `, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Repuesto no encontrado' });

    const [modelos] = await ejecutar(`
      SELECT mo.id_modelo, mo.id_marca_vehiculo, mo.nombre AS modelo, mo.cilindraje,
             mo.anio_inicio, mo.anio_fin, ma.nombre AS marca
      FROM repuesto_compatibilidad rc
      JOIN modelos_vehiculo mo ON rc.id_modelo = mo.id_modelo
      JOIN marcas_vehiculo ma ON mo.id_marca_vehiculo = ma.id_marca_vehiculo
      WHERE rc.id_repuesto = ?
      ORDER BY ma.nombre, mo.nombre, mo.cilindraje
    `, [req.params.id]);

    res.json({ ...rows[0], modelos });
  } catch (err) {
    respuestaError(res, err);
  }
});

/* ========== CREAR REPUESTO ========== */
app.post('/api/repuestos', requireAuth, async (req, res) => {
  let conn;
  try {
    const { codigo, nombre, id_categoria, id_marca_repuesto, precio, stock, descripcion, imagen, modelos } = req.body || {};
    if (!codigo || !nombre || !id_categoria || !id_marca_repuesto || precio === undefined) {
      return res.status(400).json({ error: 'Faltan campos obligatorios (codigo, nombre, categoria, marca, precio)' });
    }
    conn = await conexion();
    await conn.beginTransaction();
    const [result] = await conn.execute(
      'INSERT INTO repuestos (codigo, nombre, id_categoria, id_marca_repuesto, precio, stock, descripcion, imagen) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [codigo, nombre, id_categoria, id_marca_repuesto, precio, stock || 0, descripcion || null, imagen || null]
    );
    if (Array.isArray(modelos) && modelos.length) {
      const values = modelos.map(id => [result.insertId, id]);
      await conn.query('INSERT INTO repuesto_compatibilidad (id_repuesto, id_modelo) VALUES ?', [values]);
    }
    await conn.commit();
    res.json({ exito: true, mensaje: `Repuesto ${codigo} registrado correctamente.` });
  } catch (err) {
    if (conn) await conn.rollback().catch(() => {});
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: `El codigo ${req.body?.codigo} ya existe.` });
    }
    respuestaError(res, err);
  } finally {
    if (conn) conn.release();
  }
});

/* ========== ACTUALIZAR REPUESTO ========== */
app.put('/api/repuestos/:id', requireAuth, async (req, res) => {
  let conn;
  try {
    const body = req.body || {};
    const allowed = ['codigo', 'nombre', 'id_categoria', 'id_marca_repuesto', 'precio', 'stock', 'descripcion', 'imagen'];
    const sets = [];
    const params = [];
    for (const k of allowed) {
      if (body[k] !== undefined) { sets.push(`${k} = ?`); params.push(body[k]); }
    }
    conn = await conexion();
    await conn.beginTransaction();
    if (sets.length) {
      params.push(req.params.id);
      await conn.execute(`UPDATE repuestos SET ${sets.join(', ')} WHERE id_repuesto = ?`, params);
    }
    if (Array.isArray(body.modelos)) {
      await conn.execute('DELETE FROM repuesto_compatibilidad WHERE id_repuesto = ?', [req.params.id]);
      if (body.modelos.length) {
        const values = body.modelos.map(id => [req.params.id, id]);
        await conn.query('INSERT INTO repuesto_compatibilidad (id_repuesto, id_modelo) VALUES ?', [values]);
      }
    }
    await conn.commit();
    res.json({ exito: true, mensaje: 'Repuesto actualizado correctamente.' });
  } catch (err) {
    if (conn) await conn.rollback().catch(() => {});
    respuestaError(res, err);
  } finally {
    if (conn) conn.release();
  }
});

/* ========== ELIMINAR REPUESTO ========== */
app.delete('/api/repuestos/:id', requireAuth, async (req, res) => {
  try {
    await ejecutar('DELETE FROM repuestos WHERE id_repuesto = ?', [req.params.id]);
    res.json({ exito: true, mensaje: 'Repuesto eliminado correctamente.' });
  } catch (err) {
    respuestaError(res, err);
  }
});

/* ========== ASESORES (contacto por WhatsApp) ========== */
// Publico: catalogo de asesores activos (para el boton flotante)
app.get('/api/asesores', async (req, res) => {
  try {
    const soloActivos = req.query.todos !== 'true';
    const [rows] = await ejecutar(
      `SELECT id_asesor, nombre, cargo, telefono, correo, activo
       FROM asesores ${soloActivos ? 'WHERE activo = 1' : ''}
       ORDER BY nombre`
    );
    res.json(rows);
  } catch (err) {
    respuestaError(res, err);
  }
});

app.post('/api/asesores', requireAuth, async (req, res) => {
  try {
    const { nombre, cargo, telefono, correo, activo } = req.body || {};
    if (!nombre || !telefono) {
      return res.status(400).json({ error: 'El nombre y el teléfono son obligatorios.' });
    }
    const [result] = await ejecutar(
      'INSERT INTO asesores (nombre, cargo, telefono, correo, activo) VALUES (?, ?, ?, ?, ?)',
      [nombre, cargo || null, String(telefono), correo || null, activo === false ? 0 : 1]
    );
    res.json({ exito: true, mensaje: `Asesor ${nombre} registrado correctamente.`, id_asesor: result.insertId });
  } catch (err) {
    respuestaError(res, err);
  }
});

app.put('/api/asesores/:id', requireAuth, async (req, res) => {
  try {
    const body = req.body || {};
    const allowed = ['nombre', 'cargo', 'telefono', 'correo', 'activo'];
    const sets = [];
    const params = [];
    for (const k of allowed) {
      if (body[k] !== undefined) {
        sets.push(`${k} = ?`);
        params.push(k === 'activo' ? (body[k] ? 1 : 0) : body[k]);
      }
    }
    if (!sets.length) return res.status(400).json({ error: 'No hay campos para actualizar.' });
    params.push(req.params.id);
    await ejecutar(`UPDATE asesores SET ${sets.join(', ')} WHERE id_asesor = ?`, params);
    res.json({ exito: true, mensaje: 'Asesor actualizado correctamente.' });
  } catch (err) {
    respuestaError(res, err);
  }
});

app.delete('/api/asesores/:id', requireAuth, async (req, res) => {
  try {
    await ejecutar('DELETE FROM asesores WHERE id_asesor = ?', [req.params.id]);
    res.json({ exito: true, mensaje: 'Asesor eliminado correctamente.' });
  } catch (err) {
    respuestaError(res, err);
  }
});

/* ========== EXPORT ========== */
const SELECT_EXPORT = `
  SELECT r.id_repuesto, r.codigo, r.nombre, c.nombre AS categoria, mr.nombre AS marca,
         r.precio, r.stock, r.descripcion
  FROM repuestos r
  JOIN categorias_repuesto c ON r.id_categoria = c.id_categoria
  JOIN marcas_repuesto mr ON r.id_marca_repuesto = mr.id_marca_repuesto
`;
const TAM_LOTE_EXPORT = 5000;

// Recorre el inventario por lotes: no carga 150k filas en memoria
async function porLotes(procesar) {
  let ultimo = 0;
  while (true) {
    const [filas] = await ejecutar(`${SELECT_EXPORT} WHERE r.id_repuesto > ? ORDER BY r.id_repuesto LIMIT ${TAM_LOTE_EXPORT}`, [ultimo]);
    if (!filas.length) return;
    await procesar(filas);
    ultimo = filas[filas.length - 1].id_repuesto;
    if (filas.length < TAM_LOTE_EXPORT) return;
  }
}

async function escribirConBackpressure(res, texto) {
  if (res.destroyed) return false;
  if (res.write(texto)) return true;
  await new Promise((resolve) => {
    const listo = () => { res.off('drain', listo); res.off('close', listo); resolve(); };
    res.once('drain', listo);
    res.once('close', listo);
  });
  return !res.destroyed;
}

app.post('/api/export/json', requireAuth, async (req, res) => {
  const ruta = path.join(__dirname, 'reporte_inventario.json');
  const salida = fs.createWriteStream(ruta, { encoding: 'utf-8' });
  let total = 0;
  try {
    salida.write('[\n');
    await porLotes(async (filas) => {
      for (const f of filas) {
        const linea = (total === 0 ? '  ' : ',\n  ') + JSON.stringify({
          codigo: f.codigo, nombre: f.nombre, categoria: f.categoria, marca: f.marca,
          precio: f.precio, stock: f.stock, descripcion: f.descripcion,
        });
        total++;
        if (!salida.write(linea)) await new Promise((r) => salida.once('drain', r));
      }
    });
    salida.end('\n]');
    await new Promise((resolve, reject) => { salida.on('finish', resolve); salida.on('error', reject); });
    res.json({ exito: true, mensaje: `Reporte exportado (${total} repuestos) en ${ruta}`, total });
  } catch (err) {
    salida.destroy();
    respuestaError(res, err);
  }
});

const csvEsc = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

app.get('/api/export/csv', requireAuth, async (req, res) => {
  try {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="inventario_la61.csv"');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Accel-Buffering', 'no');
    await escribirConBackpressure(res, '\uFEFFcodigo,nombre,categoria,marca,precio,stock,descripcion\r\n');
    await porLotes(async (filas) => {
      for (const f of filas) {
        const linea = [f.codigo, f.nombre, f.categoria, f.marca, f.precio, f.stock, f.descripcion].map(csvEsc).join(',') + '\r\n';
        if (!(await escribirConBackpressure(res, linea))) return;
      }
    });
    res.end();
  } catch (err) {
    if (!res.headersSent) respuestaError(res, err, 'Exportar CSV');
    else res.end();
  }
});

/* ========== IMPORTAR / EXPORTAR EXCEL ========== */
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

const sinAcentos = (s) => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');

// Convierte "1.234,56" / "$ 45.000" / 45000 en número
function aNumero(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v).trim().replace(/[^\d.,-]/g, '');
  if (!s) return null;
  const punto = s.includes('.');
  const coma = s.includes(',');
  if (punto && coma) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (coma) {
    s = s.replace(',', '.');
  } else if (punto) {
    const partes = s.split('.');
    if (partes.length > 2 || (partes[1] && partes[1].length === 3)) s = s.replace(/\./g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const ALIAS = {
  codigo: ['codigo', 'cod', 'sku', 'referencia', 'ref', 'codigorepuesto', 'codrepuesto'],
  precio: ['precio', 'valor', 'pvp', 'precioventa', 'precioventaunitario', 'preciounitario'],
  stock: ['stock', 'cantidad', 'existencia', 'existencias', 'inventario', 'unidades', 'saldo'],
  nombre: ['nombre', 'descripcion', 'producto', 'detalle'],
};

// Descarga la plantilla que se debe llenar
app.get('/api/import/plantilla', (req, res) => {
  const ejemplo = [
    { codigo: 'EJEMPLO-001', nombre: 'Pastillas de freno delanteras', precio: 45000, stock: 12 },
  ];
  const ws = XLSX.utils.json_to_sheet(ejemplo);
  ws['!cols'] = [{ wch: 16 }, { wch: 34 }, { wch: 12 }, { wch: 10 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Inventario');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="plantilla_inventario.xlsx"');
  res.send(buf);
});

// Exporta el inventario actual a Excel (para editar y volver a subir)
app.get('/api/export/excel', requireAuth, async (req, res) => {
  try {
    const [filas] = await ejecutar(`
      SELECT r.codigo, r.nombre, c.nombre AS categoria, mr.nombre AS marca, r.precio, r.stock
      FROM repuestos r
      JOIN categorias_repuesto c ON r.id_categoria = c.id_categoria
      JOIN marcas_repuesto mr ON r.id_marca_repuesto = mr.id_marca_repuesto
      ORDER BY r.nombre
    `);
    const ws = XLSX.utils.json_to_sheet(filas.map((f) => ({ codigo: f.codigo, nombre: f.nombre, categoria: f.categoria, marca: f.marca, precio: Number(f.precio), stock: f.stock })));
    ws['!cols'] = [{ wch: 16 }, { wch: 34 }, { wch: 16 }, { wch: 16 }, { wch: 12 }, { wch: 10 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inventario');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="inventario_la61.xlsx"');
    res.send(buf);
  } catch (err) {
    respuestaError(res, err, 'Exportar Excel');
  }
});

// Sube un Excel y actualiza precio/stock por código
app.post('/api/import/excel', requireAuth, upload.single('archivo'), async (req, res) => {
  let conn;
  try {
    if (!req.file) return res.status(400).json({ error: 'No se recibió ningún archivo. Selecciona un Excel (.xlsx, .xls o .csv).' });

    const nombreArch = (req.file.originalname || '').toLowerCase();
    const esCsv = nombreArch.endsWith('.csv');
    const wb = XLSX.read(esCsv ? req.file.buffer.toString('utf-8') : req.file.buffer, esCsv ? { type: 'string' } : { type: 'buffer' });
    const hoja = wb.Sheets[wb.SheetNames[0]];
    if (!hoja) return res.status(400).json({ error: 'El archivo no contiene hojas de cálculo.' });
    const filas = XLSX.utils.sheet_to_json(hoja, { defval: '', raw: true });
    if (!filas.length) return res.status(400).json({ error: 'El archivo no tiene filas de datos. ¿Usaste la plantilla?' });

    // Mapea los encabezados reales a los campos esperados
    const encabezados = Object.keys(filas[0]);
    const mapa = {};
    for (const campo of Object.keys(ALIAS)) {
      const encontrado = encabezados.find((h) => ALIAS[campo].includes(sinAcentos(h)));
      if (encontrado) mapa[campo] = encontrado;
    }
    if (!mapa.codigo) {
      return res.status(400).json({ error: `Falta la columna de código. Columnas detectadas: ${encabezados.join(', ')}` });
    }
    if (!mapa.precio && !mapa.stock) {
      return res.status(400).json({ error: 'El archivo debe tener al menos una columna de precio o de stock.' });
    }

    const resumen = { filas: filas.length, actualizados: 0, sinCambios: 0, noEncontrados: 0, errores: 0 };
    const noEncontrados = [];
    const errores = [];
    const validas = [];

    for (let i = 0; i < filas.length; i++) {
      const fila = filas[i];
      const codigo = String(fila[mapa.codigo] ?? '').trim();
      if (!codigo) { resumen.errores++; errores.push(`Fila ${i + 2}: sin código`); continue; }

      let precio = null;
      let stock = null;
      if (mapa.precio) precio = aNumero(fila[mapa.precio]);
      if (mapa.stock) {
        const s = aNumero(fila[mapa.stock]);
        stock = s === null ? null : Math.trunc(s);
      }
      if (precio === null && stock === null) {
        resumen.errores++;
        errores.push(`Fila ${i + 2} (${codigo}): precio/stock vacíos`);
        continue;
      }
      validas.push([codigo, precio, stock]);
    }

    conn = await conexion();
    await conn.beginTransaction();

    // Tabla temporal: carga masiva y luego un solo UPDATE con JOIN (evita 1 viaje por fila)
    await conn.query(`CREATE TEMPORARY TABLE tmp_import (
      codigo VARCHAR(30) NOT NULL PRIMARY KEY,
      precio DECIMAL(10,2) NULL,
      stock INT NULL
    ) ENGINE=InnoDB`);

    const LOTE = 1000;
    for (let i = 0; i < validas.length; i += LOTE) {
      const lote = validas.slice(i, i + LOTE);
      const valores = lote.map(() => '(?, ?, ?)').join(', ');
      await conn.execute(
        `INSERT INTO tmp_import (codigo, precio, stock) VALUES ${valores} AS nuevo
         ON DUPLICATE KEY UPDATE
           precio = COALESCE(nuevo.precio, tmp_import.precio),
           stock  = COALESCE(nuevo.stock,  tmp_import.stock)`,
        lote.flat(),
      );
    }

    const [[conteo]] = await conn.query(`
      SELECT COUNT(*) AS encontrados,
             COALESCE(SUM(
               (t.precio IS NOT NULL AND t.precio <> r.precio)
               OR (t.stock IS NOT NULL AND t.stock <> r.stock)
             ), 0) AS actualizados
      FROM tmp_import t
      JOIN repuestos r ON r.codigo = t.codigo
    `);
    const encontrados = Number(conteo.encontrados) || 0;
    resumen.actualizados = Number(conteo.actualizados) || 0;
    resumen.sinCambios = encontrados - resumen.actualizados;
    resumen.noEncontrados = validas.length - encontrados;

    if (resumen.actualizados > 0) {
      await conn.execute(`
        UPDATE repuestos r
        JOIN tmp_import t ON t.codigo = r.codigo
        SET r.precio = IF(t.precio IS NULL, r.precio, t.precio),
            r.stock  = IF(t.stock  IS NULL, r.stock,  t.stock)
        WHERE (t.precio IS NOT NULL AND t.precio <> r.precio)
           OR (t.stock  IS NOT NULL AND t.stock  <> r.stock)
      `);
    }

    if (resumen.noEncontrados > 0) {
      const [faltantes] = await conn.query(`
        SELECT t.codigo FROM tmp_import t
        LEFT JOIN repuestos r ON r.codigo = t.codigo
        WHERE r.codigo IS NULL
        LIMIT 50
      `);
      faltantes.forEach((f) => noEncontrados.push(f.codigo));
    }

    await conn.query('DROP TEMPORARY TABLE IF EXISTS tmp_import');
    await conn.commit();
    res.json({
      exito: true,
      mensaje: `Inventario actualizado: ${resumen.actualizados} repuesto(s) actualizado(s).`,
      resumen,
      noEncontrados: noEncontrados.slice(0, 50),
      errores: errores.slice(0, 50),
    });
  } catch (err) {
    if (conn) await conn.rollback().catch(() => {});
    respuestaError(res, err, 'Importar Excel');
  } finally {
    if (conn) conn.release();
  }
});

/* ========== FRONTEND COMPILADO (produccion) ========== */
const distDir = path.resolve(__dirname, 'dist');
if (fs.existsSync(path.join(distDir, 'index.html'))) {
  app.use(express.static(distDir, { maxAge: '1h', etag: true }));
  app.get(/^\/(?!api(?:\/|$)).*/, (req, res) => res.sendFile(path.join(distDir, 'index.html')));
}

/* ========== 404 ========== */
app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

/* ========== MANEJO DE ERRORES ========== */
app.use((err, req, res, next) => {
  console.error('[SERVER ERROR]', err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

/* Evita que el servidor muera por errores no capturados */
process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED REJECTION]', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err);
});

// Asegura los indices necesarios para catalogos grandes (150k+ productos)
try {
  await asegurarIndices();
} catch (err) {
  console.error('[DB] No se pudieron verificar los indices:', err.code || err.message);
}

const server = app.listen(PORT, () => {
  console.log(`[OK] TODO REPUESTOS Y FRENOS LA 61 - API v${VERSION} en http://localhost:${PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n[ERROR FATAL] El puerto ${PORT} ya está en uso.`);
    console.error('Cierra la otra instancia (o ejecuta: taskkill /F /IM node.exe) y vuelve a intentar.\n');
    process.exit(1);
  } else {
    console.error('[ERROR]', err);
    process.exit(1);
  }
});

// Verifica la conexión con MySQL al iniciar (sin derribar la app si falla)
(async () => {
  try {
    await pool.query('SELECT 1');
    console.log(`[OK] MySQL conectado -> ${process.env.DB_NAME || 'repuestos_db'} en ${process.env.DB_HOST || 'localhost'}`);
  } catch (err) {
    console.error(`[ERROR MySQL] No se pudo conectar a la base de datos: ${err.code || err.message}`);
    console.error('Revisa que MySQL esté encendido, las credenciales en .env y ejecuta: npm run db:init');
  }
})();
