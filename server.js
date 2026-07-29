import express from 'express';
import cors from 'cors';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'vacunas_db',
  waitForConnections: true,
  connectionLimit: 10,
});

function buildUpdate(table, idCol, fields, body) {
  const set = Object.keys(fields)
    .filter(k => body[k] !== undefined)
    .map(k => `${fields[k]} = ?`);
  if (!set.length) return null;
  const params = Object.keys(fields)
    .filter(k => body[k] !== undefined)
    .map(k => body[k]);
  params.push(body.id || idCol === idCol); // dummy for WHERE
  const sql = `UPDATE ${table} SET ${set.join(', ')} WHERE ${idCol} = ?`;
  return { sql, params };
}

app.get('/api/kpi', async (req, res) => {
  try {
    const [[{ total: lotesActivos }]] = await pool.execute(
      "SELECT COUNT(*) AS total FROM lotes WHERE estado NOT IN ('Rechazado')"
    );
    const [[{ total: enTransito }]] = await pool.execute(
      "SELECT COUNT(*) AS total FROM lotes WHERE estado = 'En Transito'"
    );
    const [[{ total: alertas }]] = await pool.execute(
      "SELECT COUNT(*) AS total FROM lecturas_telemetria WHERE alerta_cadena_frio = TRUE"
    );
    res.json({ lotesActivos, enTransito, alertasTermicas: alertas });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ========== LOTES ========== */
app.get('/api/lotes', async (req, res) => {
  try {
    const { q, estado } = req.query;
    let sql = `
      SELECT l.id_lote, l.codigo_lote, v.nombre_comercial AS vacuna,
             lab.nombre AS laboratorio, l.cantidad_dosis,
             CONCAT(v.temp_minima_c, '°C a ', v.temp_maxima_c, '°C') AS rango_temp,
             l.estado, l.fecha_fabricacion, l.fecha_vencimiento,
             u.nombre_completo AS creador
      FROM lotes l
      JOIN vacunas v ON l.id_vacuna = v.id_vacuna
      JOIN laboratorios lab ON v.id_laboratorio = lab.id_laboratorio
      JOIN usuarios u ON l.id_usuario_creador = u.id_usuario
    `;
    const conditions = [];
    const params = [];
    if (q) {
      conditions.push('(l.codigo_lote LIKE ? OR v.nombre_comercial LIKE ? OR lab.nombre LIKE ?)');
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }
    if (estado) {
      conditions.push('l.estado = ?');
      params.push(estado);
    }
    if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY l.id_lote DESC';
    const [rows] = await pool.execute(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/lotes/:id', async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT l.*, v.nombre_comercial AS vacuna, v.tecnologia,
             lab.nombre AS laboratorio, lab.pais_origen,
             v.temp_minima_c, v.temp_maxima_c, v.dosis_recomendadas,
             u.nombre_completo AS creador
      FROM lotes l
      JOIN vacunas v ON l.id_vacuna = v.id_vacuna
      JOIN laboratorios lab ON v.id_laboratorio = lab.id_laboratorio
      JOIN usuarios u ON l.id_usuario_creador = u.id_usuario
      WHERE l.id_lote = ?
    `, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Lote no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/lotes', async (req, res) => {
  try {
    const { codigo_lote, id_vacuna, cantidad_dosis, id_usuario_creador, fecha_fabricacion, fecha_vencimiento } = req.body;
    if (!codigo_lote || !id_vacuna || !cantidad_dosis) {
      return res.status(400).json({ error: 'Faltan campos obligatorios (codigo_lote, id_vacuna, cantidad_dosis)' });
    }
    const uid = id_usuario_creador || 1;
    const ffab = fecha_fabricacion || new Date().toISOString().slice(0, 10);
    const fven = fecha_vencimiento || new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10);
    await pool.execute(`
      INSERT INTO lotes (codigo_lote, id_vacuna, id_usuario_creador, cantidad_dosis, fecha_fabricacion, fecha_vencimiento, estado)
      VALUES (?, ?, ?, ?, ?, ?, 'Pendiente')
    `, [codigo_lote, id_vacuna, uid, cantidad_dosis, ffab, fven]);
    res.json({ exito: true, mensaje: `Lote ${codigo_lote} registrado correctamente.` });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: `El código ${req.body.codigo_lote} ya existe.` });
    }
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/lotes/:id', async (req, res) => {
  try {
    const allowed = ['estado', 'cantidad_dosis', 'fecha_fabricacion', 'fecha_vencimiento'];
    const sets = [];
    const params = [];
    for (const k of allowed) {
      if (req.body[k] !== undefined) {
        sets.push(`${k} = ?`);
        params.push(req.body[k]);
      }
    }
    if (!sets.length) return res.status(400).json({ error: 'Sin campos para actualizar' });
    params.push(req.params.id);
    await pool.execute(`UPDATE lotes SET ${sets.join(', ')} WHERE id_lote = ?`, params);
    res.json({ exito: true, mensaje: 'Lote actualizado correctamente.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/lotes/:id', async (req, res) => {
  try {
    await pool.execute('DELETE FROM lotes WHERE id_lote = ?', [req.params.id]);
    res.json({ exito: true, mensaje: 'Lote eliminado correctamente.' });
  } catch (err) {
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(409).json({ error: 'No se puede eliminar: el lote tiene despachos o dictámenes asociados.' });
    }
    res.status(500).json({ error: err.message });
  }
});

/* ========== VACUNAS ========== */
app.get('/api/vacunas', async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT v.id_vacuna, v.nombre_comercial, v.tecnologia,
             v.temp_minima_c, v.temp_maxima_c, v.dosis_recomendadas,
             lab.nombre AS laboratorio, lab.pais_origen
      FROM vacunas v
      JOIN laboratorios lab ON v.id_laboratorio = lab.id_laboratorio
      ORDER BY v.nombre_comercial
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/vacunas', async (req, res) => {
  try {
    const { nombre_comercial, id_laboratorio, tecnologia, temp_minima_c, temp_maxima_c, dosis_recomendadas } = req.body;
    if (!nombre_comercial || !id_laboratorio || temp_minima_c === undefined || temp_maxima_c === undefined) {
      return res.status(400).json({ error: 'Faltan campos obligatorios' });
    }
    await pool.execute(
      'INSERT INTO vacunas (nombre_comercial, id_laboratorio, tecnologia, temp_minima_c, temp_maxima_c, dosis_recomendadas) VALUES (?, ?, ?, ?, ?, ?)',
      [nombre_comercial, id_laboratorio, tecnologia || '', temp_minima_c, temp_maxima_c, dosis_recomendadas || 1]
    );
    res.json({ exito: true, mensaje: 'Vacuna registrada correctamente.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/vacunas/:id', async (req, res) => {
  try {
    const allowed = ['nombre_comercial', 'id_laboratorio', 'tecnologia', 'temp_minima_c', 'temp_maxima_c', 'dosis_recomendadas'];
    const sets = [];
    const params = [];
    for (const k of allowed) {
      if (req.body[k] !== undefined) {
        sets.push(`${k} = ?`);
        params.push(req.body[k]);
      }
    }
    if (!sets.length) return res.status(400).json({ error: 'Sin campos para actualizar' });
    params.push(req.params.id);
    await pool.execute(`UPDATE vacunas SET ${sets.join(', ')} WHERE id_vacuna = ?`, params);
    res.json({ exito: true, mensaje: 'Vacuna actualizada correctamente.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/vacunas/:id', async (req, res) => {
  try {
    await pool.execute('DELETE FROM vacunas WHERE id_vacuna = ?', [req.params.id]);
    res.json({ exito: true, mensaje: 'Vacuna eliminada correctamente.' });
  } catch (err) {
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(409).json({ error: 'No se puede eliminar: hay lotes asociados a esta vacuna.' });
    }
    res.status(500).json({ error: err.message });
  }
});

/* ========== USUARIOS ========== */
app.get('/api/usuarios', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT id_usuario, nombre_completo, email, rol, estado FROM usuarios ORDER BY nombre_completo'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ========== TELEMETRIA ========== */
app.get('/api/telemetria/:id_lote', async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT lt.id_lectura, lt.temperatura_registrada, lt.humedad_relativa,
             lt.fecha_hora, lt.alerta_cadena_frio,
             s.codigo_mac, s.modelo_sensor,
             d.codigo_lote, d.destino
      FROM lecturas_telemetria lt
      JOIN sensores_iot s ON lt.id_sensor = s.id_sensor
      JOIN despachos dp ON lt.id_despacho = dp.id_despacho
      JOIN lotes d ON dp.id_lote = d.id_lote
      WHERE d.id_lote = ?
      ORDER BY lt.fecha_hora DESC
    `, [req.params.id_lote]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ========== DESPACHOS ========== */
app.get('/api/despachos', async (req, res) => {
  try {
    const { q, estado } = req.query;
    let sql = `
      SELECT dp.id_despacho, l.codigo_lote, v.nombre_comercial AS vacuna,
             dp.origen, dp.destino, dp.fecha_salida, dp.fecha_llegada_estimada,
             dp.estado_despacho, veh.placa_identificador,
             op.razon_social AS operador
      FROM despachos dp
      JOIN lotes l ON dp.id_lote = l.id_lote
      JOIN vacunas v ON l.id_vacuna = v.id_vacuna
      JOIN vehiculos veh ON dp.id_vehiculo = veh.id_vehiculo
      JOIN operadores_logisticos op ON veh.id_operador = op.id_operador
    `;
    const conditions = [];
    const params = [];
    if (q) {
      conditions.push('(l.codigo_lote LIKE ? OR dp.destino LIKE ? OR op.razon_social LIKE ?)');
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }
    if (estado) {
      conditions.push('dp.estado_despacho = ?');
      params.push(estado);
    }
    if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY dp.fecha_salida DESC';
    const [rows] = await pool.execute(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/despachos', async (req, res) => {
  try {
    const { id_lote, id_vehiculo, origen, destino, fecha_salida, fecha_llegada_estimada } = req.body;
    if (!id_lote || !id_vehiculo || !origen || !destino) {
      return res.status(400).json({ error: 'Faltan campos obligatorios' });
    }
    await pool.execute(
      'INSERT INTO despachos (id_lote, id_vehiculo, origen, destino, fecha_salida, fecha_llegada_estimada, estado_despacho) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id_lote, id_vehiculo, origen, destino, fecha_salida || new Date(), fecha_llegada_estimada || new Date(), 'En Ruta']
    );
    res.json({ exito: true, mensaje: 'Despacho creado correctamente.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/despachos/:id', async (req, res) => {
  try {
    const allowed = ['origen', 'destino', 'estado_despacho', 'fecha_salida', 'fecha_llegada_estimada', 'id_vehiculo'];
    const sets = [];
    const params = [];
    for (const k of allowed) {
      if (req.body[k] !== undefined) {
        sets.push(`${k} = ?`);
        params.push(req.body[k]);
      }
    }
    if (!sets.length) return res.status(400).json({ error: 'Sin campos para actualizar' });
    params.push(req.params.id);
    await pool.execute(`UPDATE despachos SET ${sets.join(', ')} WHERE id_despacho = ?`, params);
    res.json({ exito: true, mensaje: 'Despacho actualizado correctamente.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/despachos/:id', async (req, res) => {
  try {
    await pool.execute('DELETE FROM despachos WHERE id_despacho = ?', [req.params.id]);
    res.json({ exito: true, mensaje: 'Despacho eliminado correctamente.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ========== LABORATORIOS ========== */
app.get('/api/laboratorios', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM laboratorios ORDER BY nombre');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/laboratorios', async (req, res) => {
  try {
    const { nombre, licencia_sanitaria, pais_origen, telefono, email } = req.body;
    if (!nombre || !licencia_sanitaria || !pais_origen) {
      return res.status(400).json({ error: 'Faltan campos obligatorios (nombre, licencia_sanitaria, pais_origen)' });
    }
    await pool.execute(
      'INSERT INTO laboratorios (nombre, licencia_sanitaria, pais_origen, telefono, email) VALUES (?, ?, ?, ?, ?)',
      [nombre, licencia_sanitaria, pais_origen, telefono || null, email || null]
    );
    res.json({ exito: true, mensaje: 'Laboratorio creado correctamente.' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'La licencia sanitaria ya existe.' });
    }
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/laboratorios/:id', async (req, res) => {
  try {
    const allowed = ['nombre', 'licencia_sanitaria', 'pais_origen', 'telefono', 'email'];
    const sets = [];
    const params = [];
    for (const k of allowed) {
      if (req.body[k] !== undefined) {
        sets.push(`${k} = ?`);
        params.push(req.body[k]);
      }
    }
    if (!sets.length) return res.status(400).json({ error: 'Sin campos para actualizar' });
    params.push(req.params.id);
    await pool.execute(`UPDATE laboratorios SET ${sets.join(', ')} WHERE id_laboratorio = ?`, params);
    res.json({ exito: true, mensaje: 'Laboratorio actualizado correctamente.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/laboratorios/:id', async (req, res) => {
  try {
    await pool.execute('DELETE FROM laboratorios WHERE id_laboratorio = ?', [req.params.id]);
    res.json({ exito: true, mensaje: 'Laboratorio eliminado correctamente.' });
  } catch (err) {
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(409).json({ error: 'No se puede eliminar: hay vacunas asociadas a este laboratorio.' });
    }
    res.status(500).json({ error: err.message });
  }
});

/* ========== OPERADORES + VEHICULOS ========== */
app.get('/api/operadores', async (req, res) => {
  try {
    const [operadores] = await pool.execute('SELECT * FROM operadores_logisticos ORDER BY razon_social');
    const [vehiculos] = await pool.execute(`
      SELECT v.*, o.razon_social AS operador
      FROM vehiculos v
      JOIN operadores_logisticos o ON v.id_operador = o.id_operador
      ORDER BY v.id_vehiculo
    `);
    res.json({ operadores, vehiculos });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/operadores', async (req, res) => {
  try {
    const { razon_social, nit_taxid, tipo_transporte, telefono_soporte } = req.body;
    if (!razon_social || !nit_taxid) {
      return res.status(400).json({ error: 'Faltan campos obligatorios (razon_social, nit_taxid)' });
    }
    await pool.execute(
      'INSERT INTO operadores_logisticos (razon_social, nit_taxid, tipo_transporte, telefono_soporte) VALUES (?, ?, ?, ?)',
      [razon_social, nit_taxid, tipo_transporte || '', telefono_soporte || null]
    );
    res.json({ exito: true, mensaje: 'Operador creado correctamente.' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'El NIT ya existe.' });
    }
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/operadores/:id', async (req, res) => {
  try {
    const allowed = ['razon_social', 'nit_taxid', 'tipo_transporte', 'telefono_soporte'];
    const sets = [];
    const params = [];
    for (const k of allowed) {
      if (req.body[k] !== undefined) {
        sets.push(`${k} = ?`);
        params.push(req.body[k]);
      }
    }
    if (!sets.length) return res.status(400).json({ error: 'Sin campos para actualizar' });
    params.push(req.params.id);
    await pool.execute(`UPDATE operadores_logisticos SET ${sets.join(', ')} WHERE id_operador = ?`, params);
    res.json({ exito: true, mensaje: 'Operador actualizado correctamente.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/operadores/:id', async (req, res) => {
  try {
    await pool.execute('DELETE FROM operadores_logisticos WHERE id_operador = ?', [req.params.id]);
    res.json({ exito: true, mensaje: 'Operador eliminado correctamente.' });
  } catch (err) {
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(409).json({ error: 'No se puede eliminar: tiene vehículos asociados.' });
    }
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/vehiculos/:id', async (req, res) => {
  try {
    const allowed = ['placa_identificador', 'tipo_vehiculo', 'capacidad_lotes', 'id_operador'];
    const sets = [];
    const params = [];
    for (const k of allowed) {
      if (req.body[k] !== undefined) {
        sets.push(`${k} = ?`);
        params.push(req.body[k]);
      }
    }
    if (!sets.length) return res.status(400).json({ error: 'Sin campos para actualizar' });
    params.push(req.params.id);
    await pool.execute(`UPDATE vehiculos SET ${sets.join(', ')} WHERE id_vehiculo = ?`, params);
    res.json({ exito: true, mensaje: 'Vehículo actualizado correctamente.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/vehiculos/:id', async (req, res) => {
  try {
    await pool.execute('DELETE FROM vehiculos WHERE id_vehiculo = ?', [req.params.id]);
    res.json({ exito: true, mensaje: 'Vehículo eliminado correctamente.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ========== DICTAMENES ========== */
app.get('/api/dictamenes', async (req, res) => {
  try {
    const { veredicto } = req.query;
    let sql = `
      SELECT cd.id_dictamen, l.codigo_lote, v.nombre_comercial AS vacuna,
             cd.veredicto, cd.observaciones, cd.fecha_dictamen,
             u.nombre_completo AS auditor
      FROM cert_dictamenes cd
      JOIN lotes l ON cd.id_lote = l.id_lote
      JOIN vacunas v ON l.id_vacuna = v.id_vacuna
      JOIN usuarios u ON cd.id_auditor = u.id_usuario
    `;
    const params = [];
    if (veredicto) {
      sql += ' WHERE cd.veredicto = ?';
      params.push(veredicto);
    }
    sql += ' ORDER BY cd.fecha_dictamen DESC';
    const [rows] = await pool.execute(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/dictamenes/:id', async (req, res) => {
  try {
    const { veredicto, observaciones } = req.body;
    if (!veredicto) return res.status(400).json({ error: 'Falta el veredicto' });
    await pool.execute(
      'UPDATE cert_dictamenes SET veredicto = ?, observaciones = ? WHERE id_dictamen = ?',
      [veredicto, observaciones || null, req.params.id]
    );
    res.json({ exito: true, mensaje: 'Dictamen actualizado correctamente.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/dictamenes/:id', async (req, res) => {
  try {
    await pool.execute('DELETE FROM cert_dictamenes WHERE id_dictamen = ?', [req.params.id]);
    res.json({ exito: true, mensaje: 'Dictamen eliminado correctamente.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ========== EXPORT ========== */
app.post('/api/export/json', async (req, res) => {
  try {
    const [lotes] = await pool.execute(`
      SELECT l.codigo_lote, v.nombre_comercial AS vacuna, lab.nombre AS laboratorio,
             l.cantidad_dosis, l.estado, l.fecha_fabricacion, l.fecha_vencimiento,
             u.nombre_completo AS creador
      FROM lotes l
      JOIN vacunas v ON l.id_vacuna = v.id_vacuna
      JOIN laboratorios lab ON v.id_laboratorio = lab.id_laboratorio
      JOIN usuarios u ON l.id_usuario_creador = u.id_usuario
      ORDER BY l.id_lote
    `);
    const ruta = path.join(__dirname, 'reporte_operaciones.json');
    fs.writeFileSync(ruta, JSON.stringify(lotes, null, 4), 'utf-8');
    res.json({ exito: true, mensaje: `Reporte exportado en ${ruta}`, datos: lotes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.use((err, req, res, next) => {
  console.error('[SERVER ERROR]', err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

app.listen(PORT, () => {
  console.log(`[OK] Servidor Express corriendo en http://localhost:${PORT}`);
});
