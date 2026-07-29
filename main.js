const API = '/api';
let tabActual = 'dashboard';
let filtroActual = {};

async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) { const t = await res.text(); throw new Error(t); }
  return res.json();
}

async function postJSON(url, data) {
  const res = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
  if (!res.ok) { const t = await res.text(); throw new Error(t); }
  return res.json();
}

async function putJSON(url, data) {
  const res = await fetch(url, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
  if (!res.ok) { const t = await res.text(); throw new Error(t); }
  return res.json();
}

async function deleteJSON(url) {
  const res = await fetch(url, { method:'DELETE' });
  if (!res.ok) { const t = await res.text(); throw new Error(t); }
  return res.json();
}

function badgeHTML(estado) {
  const m = {
    'Pendiente':'badge badge-warning','En Transito':'badge badge-warning',
    'Aprobado':'badge badge-success','Rechazado':'badge badge-danger',
    'En Ruta':'badge badge-warning','Entregado':'badge badge-success','Cancelado':'badge badge-danger'
  };
  return `<span class="${m[estado]||'badge'}">${estado}</span>`;
}

function accionesHTML(recurso, id) {
  return `<button class="btn-icon" onclick="editarRecurso('${recurso}',${id})" title="Editar"><i class="fa-solid fa-pen"></i></button>
<button class="btn-icon danger" onclick="eliminarRecurso('${recurso}',${id})" title="Eliminar"><i class="fa-solid fa-trash-can"></i></button>`;
}

/* ========== FILTROS ========== */
const filtrosConfig = {
  dashboard: { id:'filtroDashboard', endpoint:'lotes', campo:'estado', opciones:['Pendiente','En Transito','Aprobado','Rechazado'] },
  lotes:     { id:'filtroLotes',     endpoint:'lotes', campo:'estado', opciones:['Pendiente','En Transito','Aprobado','Rechazado'] },
  despachos: { id:'filtroDespachos',  endpoint:'despachos', campo:'estado', opciones:['En Ruta','Entregado','Cancelado'] },
  auditoria: { id:'filtroAuditoria',  endpoint:'dictamenes', campo:'veredicto', opciones:['Aprobado','Rechazado'] },
};

function renderFiltros(tab) {
  const cfg = filtrosConfig[tab];
  if (!cfg) return;
  const cont = document.getElementById(cfg.id);
  if (!cont) return;
  const activo = filtroActual[tab] || '';
  let html = `<button class="pill ${!activo?'active':''}" data-val="">Todos</button>`;
  for (const o of cfg.opciones) {
    html += `<button class="pill ${activo===o?'active':''}" data-val="${o}">${o}</button>`;
  }
  cont.innerHTML = html;
  cont.querySelectorAll('.pill').forEach(b => {
    b.addEventListener('click', () => {
      filtroActual[tab] = b.dataset.val;
      renderFiltros(tab);
      cargarTab(tab);
    });
  });
}

/* ========== NAVEGACION ========== */
function cambiarTab(tabId) {
  tabActual = tabId;
  document.querySelectorAll('.nav-menu li').forEach(l => l.classList.remove('active'));
  document.querySelector(`.nav-menu li[data-tab="${tabId}"]`)?.classList.add('active');
  document.querySelectorAll('.tab-content').forEach(s => s.classList.remove('active'));
  const sec = document.getElementById(`tab-${tabId}`);
  if (sec) sec.classList.add('active');
  const titles = {
    dashboard:'Dashboard Principal|Monitoreo y Trazabilidad de Vacunas',
    laboratorios:'CU01 - Laboratorios Fabricantes|Gestión de Laboratorios',
    vacunas:'CU02 - Vacunas Registradas|Catálogo de Vacunas',
    lotes:'CU03 - Control de Lotes|Lotes de Producción',
    logistica:'CU04/CU05 - Logística|Operadores y Vehículos',
    despachos:'CU06 - Envíos|Despachos y Rutas',
    telemetria:'CU07 - Monitoreo IoT|Telemetría de Temperatura',
    auditoria:'CU09 - Auditoría|Dictámenes y Certificaciones',
  };
  const [sub, tit] = (titles[tabId]||'|').split('|');
  document.getElementById('headerTitle').textContent = tit;
  document.getElementById('headerSubtitle').textContent = sub;
  document.getElementById('globalSearchBox').style.display = (tabId==='dashboard'||tabId==='lotes')?'flex':'none';
  renderFiltros(tabId);
  cargarTab(tabId);
}

function cargarTab(tabId) {
  const f = filtroActual[tabId] || '';
  switch (tabId) {
    case 'dashboard':    cargarKPI(); cargarLotes(f); break;
    case 'laboratorios': cargarLaboratorios(); break;
    case 'vacunas':      cargarVacunasTabla(); break;
    case 'lotes':        cargarLotesFull(f); break;
    case 'logistica':    cargarOperadores(); break;
    case 'despachos':    cargarDespachos(f); break;
    case 'telemetria':   cargarTelemetria(); break;
    case 'auditoria':    cargarDictamenes(f); break;
  }
}

/* ========== KPI ========== */
async function cargarKPI() {
  try {
    const d = await getJSON(`${API}/kpi`);
    document.getElementById('kpiLotesActivos').textContent = d.lotesActivos;
    document.getElementById('kpiEnTransito').textContent = d.enTransito;
    document.getElementById('kpiAlertas').textContent = d.alertasTermicas;
  } catch (e) { console.error(e); }
}

/* ========== LOTES ========== */
async function cargarLotes(estado) {
  try {
    const u = estado ? `${API}/lotes?estado=${encodeURIComponent(estado)}` : `${API}/lotes`;
    const d = await getJSON(u);
    document.getElementById('tablaBodyLotes').innerHTML = d.map(l => `<tr>
      <td><strong>${l.codigo_lote}</strong></td><td>${l.vacuna}</td><td>${l.laboratorio}</td>
      <td>${Number(l.cantidad_dosis).toLocaleString()}</td><td>${l.rango_temp}</td>
      <td>${badgeHTML(l.estado)}</td>
      <td><button class="btn-icon" onclick="verDetalle(${l.id_lote})" title="Ver"><i class="fa-solid fa-eye"></i></button>
          <button class="btn-icon danger" onclick="verTelemetria(${l.id_lote})" title="Alertas"><i class="fa-solid fa-temperature-high"></i></button>
          ${accionesHTML('lotes',l.id_lote)}</td>
    </tr>`).join('');
  } catch (e) { console.error(e); }
}

async function cargarLotesFull(estado) {
  try {
    const u = estado ? `${API}/lotes?estado=${encodeURIComponent(estado)}` : `${API}/lotes`;
    const d = await getJSON(u);
    document.getElementById('tablaBodyLotesFull').innerHTML = d.map(l => `<tr>
      <td><strong>${l.codigo_lote}</strong></td><td>${l.vacuna}</td><td>${l.laboratorio}</td>
      <td>${Number(l.cantidad_dosis).toLocaleString()}</td><td>${l.fecha_fabricacion}</td><td>${l.fecha_vencimiento}</td>
      <td>${badgeHTML(l.estado)}</td><td>${l.creador}</td>
      <td>${accionesHTML('lotes',l.id_lote)}</td>
    </tr>`).join('');
  } catch (e) { console.error(e); }
}

/* ========== LABORATORIOS ========== */
async function cargarLaboratorios() {
  try {
    const d = await getJSON(`${API}/laboratorios`);
    document.getElementById('tablaBodyLaboratorios').innerHTML = d.map(l => `<tr>
      <td>${l.id_laboratorio}</td><td><strong>${l.nombre}</strong></td><td>${l.licencia_sanitaria}</td>
      <td>${l.pais_origen}</td><td>${l.telefono||'-'}</td><td>${l.email||'-'}</td>
      <td>${(l.fecha_registro||'').slice(0,10)}</td>
      <td>${accionesHTML('laboratorios',l.id_laboratorio)}</td>
    </tr>`).join('');
  } catch (e) { console.error(e); }
}

/* ========== VACUNAS ========== */
async function cargarVacunasTabla() {
  try {
    const d = await getJSON(`${API}/vacunas`);
    document.getElementById('tablaBodyVacunas').innerHTML = d.map(v => `<tr>
      <td>${v.id_vacuna}</td><td><strong>${v.nombre_comercial}</strong></td><td>${v.tecnologia}</td>
      <td>${v.temp_minima_c}°C</td><td>${v.temp_maxima_c}°C</td><td>${v.dosis_recomendadas}</td>
      <td>${v.laboratorio}</td><td>${v.pais_origen}</td>
      <td>${accionesHTML('vacunas',v.id_vacuna)}</td>
    </tr>`).join('');
  } catch (e) { console.error(e); }
}

/* ========== OPERADORES + VEHICULOS ========== */
async function cargarOperadores() {
  try {
    const d = await getJSON(`${API}/operadores`);
    document.getElementById('tablaBodyOperadores').innerHTML = d.operadores.map(o => `<tr>
      <td>${o.id_operador}</td><td><strong>${o.razon_social}</strong></td><td>${o.nit_taxid}</td>
      <td>${o.tipo_transporte}</td><td>${o.telefono_soporte||'-'}</td>
      <td>${accionesHTML('operadores',o.id_operador)}</td>
    </tr>`).join('');
    document.getElementById('tablaBodyVehiculos').innerHTML = d.vehiculos.map(v => `<tr>
      <td>${v.id_vehiculo}</td><td>${v.placa_identificador}</td><td>${v.tipo_vehiculo}</td>
      <td>${v.capacidad_lotes}</td><td>${v.operador}</td>
      <td>${accionesHTML('vehiculos',v.id_vehiculo)}</td>
    </tr>`).join('');
  } catch (e) { console.error(e); }
}

/* ========== DESPACHOS ========== */
async function cargarDespachos(estado) {
  try {
    const u = estado ? `${API}/despachos?estado=${encodeURIComponent(estado)}` : `${API}/despachos`;
    const d = await getJSON(u);
    document.getElementById('tablaBodyDespachos').innerHTML = d.map(dp => `<tr>
      <td>${dp.id_despacho}</td><td><strong>${dp.codigo_lote}</strong></td><td>${dp.vacuna}</td>
      <td>${dp.origen}</td><td>${dp.destino}</td><td>${(dp.fecha_salida||'').replace('T',' ')}</td>
      <td>${(dp.fecha_llegada_estimada||'').replace('T',' ')}</td>
      <td>${badgeHTML(dp.estado_despacho)}</td><td>${dp.placa_identificador}</td><td>${dp.operador}</td>
      <td>${accionesHTML('despachos',dp.id_despacho)}</td>
    </tr>`).join('');
  } catch (e) { console.error(e); }
}

/* ========== TELEMETRIA ========== */
async function cargarTelemetria() {
  try {
    const lotes = await getJSON(`${API}/lotes`);
    const todas = [];
    for (const l of lotes.slice(0,10)) {
      try { const r = await getJSON(`${API}/telemetria/${l.id_lote}`); todas.push(...r); } catch {}
    }
    todas.sort((a,b) => new Date(b.fecha_hora)-new Date(a.fecha_hora));
    document.getElementById('tablaBodyTelemetria').innerHTML = todas.slice(0,50).map(t => `<tr>
      <td>${t.id_lectura}</td><td><strong>${t.codigo_lote}</strong></td><td>${t.codigo_mac} (${t.modelo_sensor})</td>
      <td>${t.temperatura_registrada}°C</td><td>${t.humedad_relativa??'-'}</td>
      <td>${(t.fecha_hora||'').replace('T',' ')}</td>
      <td>${t.alerta_cadena_frio?'<span class="badge badge-danger">⚠️ ALERTA</span>':'<span class="badge badge-success">OK</span>'}</td>
    </tr>`).join('');
  } catch (e) { console.error(e); }
}

/* ========== DICTAMENES ========== */
async function cargarDictamenes(veredicto) {
  try {
    const u = veredicto ? `${API}/dictamenes?veredicto=${encodeURIComponent(veredicto)}` : `${API}/dictamenes`;
    const d = await getJSON(u);
    document.getElementById('tablaBodyDictamenes').innerHTML = d.map(dc => `<tr>
      <td>${dc.id_dictamen}</td><td><strong>${dc.codigo_lote}</strong></td><td>${dc.vacuna}</td>
      <td>${badgeHTML(dc.veredicto)}</td><td>${dc.observaciones||'-'}</td>
      <td>${(dc.fecha_dictamen||'').slice(0,10)}</td><td>${dc.auditor}</td>
      <td>${accionesHTML('dictamenes',dc.id_dictamen)}</td>
    </tr>`).join('');
  } catch (e) { console.error(e); }
}

/* ========== MODAL DINAMICO ========== */
const camposModal = {
  lotes: {
    titulo: (id) => id ? 'Editar Lote' : 'Registrar Nuevo Lote',
    campos: (datos) => {
      if (datos?.id) { // edicion
        return `<div class="form-group"><label>Estado</label><select id="mf_estado" required>
          ${['Pendiente','En Transito','Aprobado','Rechazado'].map(e => `<option ${datos.estado===e?'selected':''}>${e}</option>`).join('')}</select></div>
          <div class="form-group"><label>Cantidad de Dosis</label><input type="number" id="mf_cantidad_dosis" value="${datos.cantidad_dosis}" required></div>
          <div class="form-group"><label>Fabricación</label><input type="date" id="mf_fecha_fabricacion" value="${datos.fecha_fabricacion}"></div>
          <div class="form-group"><label>Vencimiento</label><input type="date" id="mf_fecha_vencimiento" value="${datos.fecha_vencimiento}"></div>`;
      }
      return `<div class="form-group"><label>Código de Lote</label><input type="text" id="mf_codigo_lote" placeholder="LOT-2026-ABC" required></div>
        <div class="form-group"><label>Vacuna</label><select id="mf_id_vacuna" required><option value="">Cargando...</option></select></div>
        <div class="form-group"><label>Creador</label><select id="mf_id_usuario_creador" required><option value="">Cargando...</option></select></div>
        <div class="form-group"><label>Cantidad de Dosis</label><input type="number" id="mf_cantidad_dosis" required></div>
        <div class="form-group"><label>Fabricación</label><input type="date" id="mf_fecha_fabricacion"></div>
        <div class="form-group"><label>Vencimiento</label><input type="date" id="mf_fecha_vencimiento"></div>`;
    },
    load: async (id) => id ? getJSON(`${API}/lotes/${id}`) : (async () => { await Promise.all([cargarSelect('/api/vacunas','mf_id_vacuna'), cargarSelect('/api/usuarios','mf_id_usuario_creador')]); })(),
    submit: async (id, body) => id ? putJSON(`${API}/lotes/${id}`, body) : postJSON(`${API}/lotes`, body),
    body: (id) => id ? { estado:g('mf_estado'), cantidad_dosis:parseInt(g('mf_cantidad_dosis')), fecha_fabricacion:g('mf_fecha_fabricacion')||null, fecha_vencimiento:g('mf_fecha_vencimiento')||null }
      : { codigo_lote:g('mf_codigo_lote'), id_vacuna:parseInt(g('mf_id_vacuna')), cantidad_dosis:parseInt(g('mf_cantidad_dosis')), id_usuario_creador:parseInt(g('mf_id_usuario_creador')), fecha_fabricacion:g('mf_fecha_fabricacion')||null, fecha_vencimiento:g('mf_fecha_vencimiento')||null },
  },
  laboratorios: {
    titulo: (id) => id ? 'Editar Laboratorio' : 'Nuevo Laboratorio',
    campos: (d) => `<div class="form-group"><label>Nombre</label><input type="text" id="mf_nombre" value="${d?.nombre||''}" required></div>
      <div class="form-group"><label>Licencia Sanitaria</label><input type="text" id="mf_licencia_sanitaria" value="${d?.licencia_sanitaria||''}" required></div>
      <div class="form-group"><label>País</label><input type="text" id="mf_pais_origen" value="${d?.pais_origen||''}" required></div>
      <div class="form-group"><label>Teléfono</label><input type="text" id="mf_telefono" value="${d?.telefono||''}"></div>
      <div class="form-group"><label>Email</label><input type="email" id="mf_email" value="${d?.email||''}"></div>`,
    load: async (id) => id ? getJSON(`${API}/laboratorios`).then(a => a.find(l=>l.id_laboratorio==id)) : null,
    submit: async (id, b) => id ? putJSON(`${API}/laboratorios/${id}`, b) : postJSON(`${API}/laboratorios`, b),
    body: () => ({ nombre:g('mf_nombre'), licencia_sanitaria:g('mf_licencia_sanitaria'), pais_origen:g('mf_pais_origen'), telefono:g('mf_telefono')||null, email:g('mf_email')||null }),
  },
  vacunas: {
    titulo: (id) => id ? 'Editar Vacuna' : 'Nueva Vacuna',
    campos: (d) => `<div class="form-group"><label>Nombre Comercial</label><input type="text" id="mf_nombre_comercial" value="${d?.nombre_comercial||''}" required></div>
      <div class="form-group"><label>Tecnología</label><input type="text" id="mf_tecnologia" value="${d?.tecnologia||''}"></div>
      <div class="form-group"><label>Temp. Mínima (°C)</label><input type="number" step="0.1" id="mf_temp_minima_c" value="${d?.temp_minima_c||''}" required></div>
      <div class="form-group"><label>Temp. Máxima (°C)</label><input type="number" step="0.1" id="mf_temp_maxima_c" value="${d?.temp_maxima_c||''}" required></div>
      <div class="form-group"><label>Dosis Recomendadas</label><input type="number" id="mf_dosis_recomendadas" value="${d?.dosis_recomendadas||1}"></div>
      <div class="form-group"><label>Laboratorio</label><select id="mf_id_laboratorio" required><option value="">Cargando...</option></select></div>`,
    load: async (id) => { const lab = await getJSON(`${API}/laboratorios`); const sel = document.getElementById('mf_id_laboratorio'); if(sel) sel.innerHTML = '<option value="">Seleccione</option>'+lab.map(l=>`<option value="${l.id_laboratorio}">${l.nombre}</option>`).join(''); if(id) return getJSON(`${API}/vacunas`).then(a => a.find(v=>v.id_vacuna==id)); },
    submit: async (id, b) => id ? putJSON(`${API}/vacunas/${id}`, b) : postJSON(`${API}/vacunas`, b),
    body: () => ({ nombre_comercial:g('mf_nombre_comercial'), tecnologia:g('mf_tecnologia'), temp_minima_c:parseFloat(g('mf_temp_minima_c')), temp_maxima_c:parseFloat(g('mf_temp_maxima_c')), dosis_recomendadas:parseInt(g('mf_dosis_recomendadas'))||1, id_laboratorio:parseInt(g('mf_id_laboratorio')) }),
  },
  operadores: {
    titulo: (id) => id ? 'Editar Operador' : 'Nuevo Operador',
    campos: (d) => `<div class="form-group"><label>Razón Social</label><input type="text" id="mf_razon_social" value="${d?.razon_social||''}" required></div>
      <div class="form-group"><label>NIT</label><input type="text" id="mf_nit_taxid" value="${d?.nit_taxid||''}" required></div>
      <div class="form-group"><label>Tipo Transporte</label><input type="text" id="mf_tipo_transporte" value="${d?.tipo_transporte||''}"></div>
      <div class="form-group"><label>Teléfono Soporte</label><input type="text" id="mf_telefono_soporte" value="${d?.telefono_soporte||''}"></div>`,
    load: async (id) => id ? getJSON(`${API}/operadores`).then(a => a.operadores.find(o=>o.id_operador==id)) : null,
    submit: async (id, b) => id ? putJSON(`${API}/operadores/${id}`, b) : postJSON(`${API}/operadores`, b),
    body: () => ({ razon_social:g('mf_razon_social'), nit_taxid:g('mf_nit_taxid'), tipo_transporte:g('mf_tipo_transporte')||'', telefono_soporte:g('mf_telefono_soporte')||null }),
  },
  vehiculos: {
    titulo: () => 'Editar Vehículo',
    campos: (d) => `<div class="form-group"><label>Placa</label><input type="text" id="mf_placa_identificador" value="${d?.placa_identificador||''}" required></div>
      <div class="form-group"><label>Tipo</label><input type="text" id="mf_tipo_vehiculo" value="${d?.tipo_vehiculo||''}"></div>
      <div class="form-group"><label>Capacidad (lotes)</label><input type="number" id="mf_capacidad_lotes" value="${d?.capacidad_lotes||''}"></div>
      <div class="form-group"><label>Operador</label><select id="mf_id_operador" required><option value="">Cargando...</option></select></div>`,
    load: async (id) => { const op = await getJSON(`${API}/operadores`); const sel = document.getElementById('mf_id_operador'); if(sel) sel.innerHTML = '<option value="">Seleccione</option>'+op.operadores.map(o=>`<option value="${o.id_operador}">${o.razon_social}</option>`).join(''); if(id) return getJSON(`${API}/operadores`).then(a => a.vehiculos.find(v=>v.id_vehiculo==id)); },
    submit: async (id, b) => id ? putJSON(`${API}/vehiculos/${id}`, b) : null,
    body: () => ({ placa_identificador:g('mf_placa_identificador'), tipo_vehiculo:g('mf_tipo_vehiculo'), capacidad_lotes:parseInt(g('mf_capacidad_lotes')), id_operador:parseInt(g('mf_id_operador')) }),
  },
  despachos: {
    titulo: (id) => id ? 'Editar Despacho' : 'Nuevo Despacho',
    campos: (d, id) => id
      ? `<div class="form-group"><label>Origen</label><input type="text" id="mf_origen" value="${d?.origen||''}" required></div>
        <div class="form-group"><label>Destino</label><input type="text" id="mf_destino" value="${d?.destino||''}" required></div>
        <div class="form-group"><label>Estado</label><select id="mf_estado_despacho">${['En Ruta','Entregado','Cancelado'].map(e => `<option ${d?.estado_despacho===e?'selected':''}>${e}</option>`).join('')}</select></div>
        <div class="form-group"><label>Salida</label><input type="datetime-local" id="mf_fecha_salida" value="${(d?.fecha_salida||'').slice(0,16)}"></div>
        <div class="form-group"><label>Llegada Est.</label><input type="datetime-local" id="mf_fecha_llegada_estimada" value="${(d?.fecha_llegada_estimada||'').slice(0,16)}"></div>`
      : `<div class="form-group"><label>Lote</label><select id="mf_id_lote" required><option value="">Cargando...</option></select></div>
        <div class="form-group"><label>Vehículo</label><select id="mf_id_vehiculo" required><option value="">Cargando...</option></select></div>
        <div class="form-group"><label>Origen</label><input type="text" id="mf_origen" required></div>
        <div class="form-group"><label>Destino</label><input type="text" id="mf_destino" required></div>
        <div class="form-group"><label>Salida</label><input type="datetime-local" id="mf_fecha_salida"></div>
        <div class="form-group"><label>Llegada Est.</label><input type="datetime-local" id="mf_fecha_llegada_estimada"></div>`,
    load: async (id) => {
      if (!id) {
        const [lotes, op] = await Promise.all([getJSON(`${API}/lotes`), getJSON(`${API}/operadores`)]);
        const s1 = document.getElementById('mf_id_lote'); if(s1) s1.innerHTML = '<option value="">Seleccione lote</option>'+lotes.map(l=>`<option value="${l.id_lote}">${l.codigo_lote} - ${l.vacuna}</option>`).join('');
        const s2 = document.getElementById('mf_id_vehiculo'); if(s2) s2.innerHTML = '<option value="">Seleccione vehículo</option>'+op.vehiculos.map(v=>`<option value="${v.id_vehiculo}">${v.placa_identificador} (${v.operador})</option>`).join('');
      }
      if (id) return getJSON(`${API}/despachos`).then(a => a.find(d=>d.id_despacho==id));
    },
    submit: async (id, b) => id ? putJSON(`${API}/despachos/${id}`, b) : postJSON(`${API}/despachos`, b),
    body: (id) => id ? { origen:g('mf_origen'), destino:g('mf_destino'), estado_despacho:g('mf_estado_despacho'), fecha_salida:g('mf_fecha_salida')||null, fecha_llegada_estimada:g('mf_fecha_llegada_estimada')||null }
      : { id_lote:parseInt(g('mf_id_lote')), id_vehiculo:parseInt(g('mf_id_vehiculo')), origen:g('mf_origen'), destino:g('mf_destino'), fecha_salida:g('mf_fecha_salida')||null, fecha_llegada_estimada:g('mf_fecha_llegada_estimada')||null },
  },
  dictamenes: {
    titulo: () => 'Editar Dictamen',
    campos: (d) => `<div class="form-group"><label>Veredicto</label><select id="mf_veredicto">${['Aprobado','Rechazado'].map(e => `<option ${d?.veredicto===e?'selected':''}>${e}</option>`).join('')}</select></div>
      <div class="form-group"><label>Observaciones</label><textarea id="mf_observaciones" rows="3" style="width:100%;padding:0.6rem;border-radius:8px;border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.05);color:var(--text-color);font-family:var(--font-family);">${d?.observaciones||''}</textarea></div>`,
    load: async (id) => id ? getJSON(`${API}/dictamenes`).then(a => a.find(d=>d.id_dictamen==id)) : null,
    submit: async (id, b) => id ? putJSON(`${API}/dictamenes/${id}`, b) : null,
    body: () => ({ veredicto:g('mf_veredicto'), observaciones:g('mf_observaciones')||null }),
  },
};

function g(id) { const el = document.getElementById(id); return el ? el.value : ''; }

async function cargarSelect(url, id) {
  try {
    const d = await getJSON(url);
    const sel = document.getElementById(id);
    if (!sel) return;
    let html = '<option value="">Seleccione</option>';
    if (url.includes('vacunas')) d.forEach(v => { html += `<option value="${v.id_vacuna}">${v.nombre_comercial}</option>`; });
    else if (url.includes('usuarios')) d.filter(u=>u.estado==='Activo').forEach(u => { html += `<option value="${u.id_usuario}">${u.nombre_completo} (${u.rol})</option>`; });
    sel.innerHTML = html;
  } catch (e) { console.error(e); }
}

window.abrirModalCrear = async (recurso) => {
  const cfg = camposModal[recurso];
  if (!cfg) return alert('Recurso no soportado');
  document.getElementById('modalDinamicoTitulo').textContent = cfg.titulo(false);
  document.getElementById('modalDinamicoRecurso').value = recurso;
  document.getElementById('modalDinamicoId').value = '';
  document.getElementById('modalDinamicoCampos').innerHTML = cfg.campos(null, false);
  document.getElementById('modalDinamico').style.display = 'flex';
  if (cfg.load) await cfg.load(false);
};

window.editarRecurso = async (recurso, id) => {
  const cfg = camposModal[recurso];
  if (!cfg) return alert('Recurso no soportado');
  document.getElementById('modalDinamicoTitulo').textContent = cfg.titulo(true);
  document.getElementById('modalDinamicoRecurso').value = recurso;
  document.getElementById('modalDinamicoId').value = id;
  let datos = {};
  if (cfg.load) datos = await cfg.load(id);
  document.getElementById('modalDinamicoCampos').innerHTML = cfg.campos(datos, true);
  if (datos && cfg.load && id) {
    // set select values
    for (const k of Object.keys(datos)) {
      const el = document.getElementById(`mf_${k}`);
      if (el) el.value = datos[k];
    }
  }
  document.getElementById('modalDinamico').style.display = 'flex';
};

window.eliminarRecurso = async (recurso, id) => {
  if (!confirm(`¿Eliminar este ${recurso.slice(0,-1)}? Esta acción no se puede deshacer.`)) return;
  try {
    const res = await deleteJSON(`${API}/${recurso}/${id}`);
    alert(res.mensaje || res.exito || 'Eliminado');
    cargarTab(tabActual);
  } catch (e) {
    alert('Error: ' + e.message);
  }
};

document.getElementById('formDinamico').addEventListener('submit', async (e) => {
  e.preventDefault();
  const recurso = document.getElementById('modalDinamicoRecurso').value;
  const id = document.getElementById('modalDinamicoId').value;
  const cfg = camposModal[recurso];
  if (!cfg) return;
  try {
    const body = cfg.body(!!id);
    const res = await cfg.submit(id || null, body);
    alert(res.mensaje || 'Operación exitosa');
    document.getElementById('modalDinamico').style.display = 'none';
    document.getElementById('formDinamico').reset();
    cargarTab(tabActual);
  } catch (e) {
    alert('Error: ' + e.message);
  }
});

document.getElementById('btnCerrarModalDinamico').addEventListener('click', () => {
  document.getElementById('modalDinamico').style.display = 'none';
});
document.getElementById('btnCancelarModalDinamico').addEventListener('click', () => {
  document.getElementById('modalDinamico').style.display = 'none';
});

/* ========== ACCIONES GLOBALES ========== */
window.verDetalle = async (id) => {
  try {
    const l = await getJSON(`${API}/lotes/${id}`);
    alert(`Lote: ${l.codigo_lote}\nVacuna: ${l.vacuna} (${l.tecnologia})\nLaboratorio: ${l.laboratorio} - ${l.pais_origen}\nCreador: ${l.creador}\nEstado: ${l.estado}\nDosis: ${l.cantidad_dosis.toLocaleString()}\nTemp: ${l.temp_minima_c}°C a ${l.temp_maxima_c}°C\nFabricación: ${l.fecha_fabricacion}\nVencimiento: ${l.fecha_vencimiento}`);
  } catch (e) { alert('Error al obtener detalle'); }
};

window.verTelemetria = async (id) => {
  try {
    const rows = await getJSON(`${API}/telemetria/${id}`);
    if (!rows.length) return alert('Sin lecturas de telemetría para este lote.');
    const msj = rows.map(r => `  ${r.fecha_hora} | ${r.temperatura_registrada}°C | ${r.humedad_relativa}% | ${r.modelo_sensor} | ${r.alerta_cadena_frio?'⚠️ ALERTA':'OK'}`).join('\n');
    alert(`Telemetría del lote ${rows[0].codigo_lote} (destino: ${rows[0].destino}):\n${msj}`);
  } catch (e) { alert('Error al obtener telemetría'); }
};

/* ========== INIT ========== */
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.nav-menu li[data-tab]').forEach(li => {
    li.addEventListener('click', (e) => { e.preventDefault(); cambiarTab(li.dataset.tab); });
  });

  document.getElementById('btnBuscarLote').addEventListener('click', () => {
    const q = document.getElementById('inputBuscarLote').value.trim();
    if (tabActual==='dashboard') cargarLotes(q);
    else if (tabActual==='lotes') cargarLotesFull(q);
  });
  document.getElementById('inputBuscarLote').addEventListener('keyup', (e) => {
    if (e.key==='Enter') document.getElementById('btnBuscarLote').click();
  });

  document.getElementById('btnExportarJSON').addEventListener('click', async () => {
    try { const res = await postJSON(`${API}/export/json`, {}); alert(res.mensaje); } catch (e) { alert('Error: '+e.message); }
  });

  cambiarTab('dashboard');
});
