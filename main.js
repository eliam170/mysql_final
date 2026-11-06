const API = '/api';

const state = {
  vista: 'catalogo',
  filtros: { marca: '', modelo: '', cilindraje: '', anio: '', categoria: '', marca_repuesto: '', q: '', soloStock: false, orden: '' },
  catalogo: { page: 0, limit: 50, total: 0, hayMas: false, cargando: false },
  carrito: [],
  repuestoDetalle: null,
  todosLosModelos: [],
  marcasVehiculo: [],
  asesores: [],
  token: sessionStorage.getItem('la61_token') || '',
  enLinea: true,
  // Panel de administración: datos en memoria + filtros aplicados
  adminRepuestos: [],
  adminFiltros: { q: '', categoria: '', stock: '', orden: '', pagina: 1 },
  adminPaginacion: { total: 0, totalGeneral: 0, paginas: 1, limit: 50 },
  categoriasAdmin: [],
  adminAsesores: [],
  adminFiltroAsesores: { q: '', estado: '' },
  adminCategorias: [],
  adminFiltroCategorias: { q: '' },
};

let adminCargaId = 0;
let catalogoCargaId = 0;
let modelosFiltroActuales = [];

/* ===================== CAPTURA DE ERRORES (diagnóstico) ===================== */
window.__errores = [];
window.addEventListener('error', (e) => {
  const msg = e.message || String(e.error || 'Error');
  window.__errores.push(msg);
  console.error('[ERROR APP]', msg);
});
window.addEventListener('unhandledrejection', (e) => {
  const msg = (e.reason && (e.reason.message || e.reason)) + '';
  window.__errores.push('promesa: ' + msg);
  console.error('[ERROR APP] promesa no manejada:', msg);
});

/* ===================== HELPERS ===================== */
const money = (n) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(n) || 0);

const ICONOS = {
  'Frenos': 'fa-circle-dot',
  'Filtros': 'fa-filter',
  'Suspension': 'fa-car-side',
  'Suspensión': 'fa-car-side',
  'Motor': 'fa-gear',
  'Encendido': 'fa-bolt',
  'Transmision': 'fa-gears',
  'Transmisión': 'fa-gears',
  'Electrico': 'fa-battery-full',
  'Eléctrico': 'fa-battery-full',
  'Direccion': 'fa-road',
  'Dirección': 'fa-road',
};

const iconoCategoria = (cat) => ICONOS[cat] || 'fa-wrench';

// Imagen por defecto segun la categoria (fallback si el repuesto no trae imagen)
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
const IMAGEN_GENERICA = '/img/productos-generico.jpg';
const CATEGORIA_NUEVA = '__nueva_categoria__';

const imagenDe = (r) => r.imagen || IMAGENES[r.categoria] || IMAGEN_GENERICA;

// Imagen con carga diferida y respaldo automatico si la ruta falla
function imgProducto(src, alt, clase = '') {
  const principal = escapeHtml(src || IMAGEN_GENERICA);
  const respaldo = escapeHtml(IMAGEN_GENERICA);
  const attr = clase ? ` class="${clase}"` : '';
  return `<img${attr} src="${principal}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='${respaldo}'">`;
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function fetchTimeout(url, options = {}, timeout = 5000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function getJSON(url, timeout = 5000) {
  const res = await fetchTimeout(url, {}, timeout);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function authHeaders() {
  const h = { 'Content-Type': 'application/json' };
  if (state.token) h.Authorization = `Bearer ${state.token}`;
  return h;
}

function guardarToken(token) {
  state.token = token || '';
  if (token) sessionStorage.setItem('la61_token', token);
  else sessionStorage.removeItem('la61_token');
}

function exigirSesion(res, body, enLogin = false) {
  if (res.status !== 401) return;
  guardarToken('');
  if (!enLogin) abrirLogin();
  throw new Error(body.error || 'Sesión requerida. Inicia sesión.');
}

async function sendJSON(url, method, data) {
  const res = await fetchTimeout(url, { method, headers: authHeaders(), body: data ? JSON.stringify(data) : undefined });
  const body = await res.json().catch(() => ({}));
  exigirSesion(res, body, url === `${API}/login`);
  if (!res.ok) throw new Error(body.error || 'Error en la petición');
  return body;
}

async function iniciarSesion(password) {
  const res = await fetchTimeout(`${API}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'No se pudo iniciar sesión');
  return body;
}

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2600);
}

function estadoConexion(texto, error = false) {
  const el = document.getElementById('estadoConexion');
  if (!el) return;
  document.getElementById('estadoConexionTexto').textContent = texto;
  el.classList.toggle('error', error);
  el.querySelector('i').className = error ? 'fa-solid fa-triangle-exclamation' : 'fa-solid fa-circle-notch fa-spin';
  document.getElementById('btnReintentar')?.classList.toggle('oculto', !error);
  el.classList.remove('oculto');
}

function ocultarEstadoConexion() {
  document.getElementById('estadoConexion')?.classList.add('oculto');
  document.getElementById('btnReintentar')?.classList.add('oculto');
}

// Vigilante: comprueba la conexión cada 10 s y auto-recupera la página
let watchdogId = null;

async function recargarDatos() {
  const marcaActual = document.getElementById('filtroMarca')?.value || '';
  await Promise.all([cargarFiltros(), cargarModelos(marcaActual), cargarKPI(), cargarAsesoresCatalogo()]);
  await cargarRepuestos();
}

async function chequearConexion() {
  try {
    await getJSON(`${API}/health`, 4000);
    if (!state.enLinea) {
      state.enLinea = true;
      ocultarEstadoConexion();
      try { await recargarDatos(); } catch (e) { /* noop */ }
      toast('Conexión restablecida');
    }
  } catch (e) {
    if (state.enLinea) {
      state.enLinea = false;
      estadoConexion('Se perdió la conexión con el servidor. Verifica que MySQL y "npm run dev" estén activos.', true);
    }
  }
}

async function esperarServidor(intentos = 20, delay = 1000) {
  for (let i = 0; i < intentos; i++) {
    try {
      await getJSON(`${API}/kpi`, 3000);
      return true;
    } catch (e) {
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  return false;
}

function stockPill(stock) {
  if (stock <= 0) return '<span class="stock-pill out">Agotado</span>';
  if (stock <= 10) return `<span class="stock-pill low">Últimas ${stock} und</span>`;
  return '<span class="stock-pill ok">Disponible</span>';
}

/* ===================== VISTAS ===================== */
async function mostrarVista(vista) {
  if (vista === 'admin') {
    if (!state.token) { abrirLogin(); return; }
    const vigente = await verificarSesion();
    if (!vigente) {
      guardarToken('');
      toast('Tu sesión expiró. Vuelve a iniciar sesión.');
      abrirLogin();
      return;
    }
  }
  state.vista = vista;
  document.querySelectorAll('.nav-link').forEach((b) => b.classList.toggle('active', b.dataset.vista === vista));
  document.getElementById('vista-catalogo').classList.toggle('oculto', vista !== 'catalogo');
  document.getElementById('vista-nosotros').classList.toggle('oculto', vista !== 'nosotros');
  document.getElementById('vista-admin').classList.toggle('oculto', vista !== 'admin');
  document.getElementById('hero').classList.toggle('oculto', vista !== 'catalogo');
  document.getElementById('marcasStrip').classList.toggle('oculto', vista !== 'catalogo');
  if (vista === 'admin') cargarAdmin();
}

/* ===================== FILTROS ===================== */
async function cargarFiltros() {
  const [marcas, categorias, marcasRep] = await Promise.all([
    getJSON(`${API}/marcas-vehiculo`),
    getJSON(`${API}/categorias`),
    getJSON(`${API}/marcas-repuesto`),
  ]);

  const selMarca = document.getElementById('filtroMarca');
  selMarca.innerHTML = '<option value="">Todas las marcas</option>' +
    marcas.map((m) => `<option value="${m.id_marca_vehiculo}">${escapeHtml(m.nombre)}</option>`).join('');

  const listaCat = document.getElementById('listaCategorias');
  listaCat.innerHTML = '<li class="cat-item activo" data-cat="">Todas las categorías</li>' +
    categorias.map((c) => `<li class="cat-item" data-cat="${c.id_categoria}">${escapeHtml(c.nombre)}</li>`).join('');

  const selMR = document.getElementById('filtroMarcaRepuesto');
  selMR.innerHTML = '<option value="">Todas las marcas</option>' +
    marcasRep.map((m) => `<option value="${m.id_marca_repuesto}">${escapeHtml(m.nombre)}</option>`).join('');

  state.marcasVehiculo = marcas;
  prepararChipsMarcas();
}

function normalizarTexto(txt) {
  return String(txt || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function prepararChipsMarcas() {
  const marcas = state.marcasVehiculo || [];
  document.querySelectorAll('#marcasStrip .marca-chip').forEach((chip) => {
    const marca = marcas.find((m) => normalizarTexto(m.nombre) === normalizarTexto(chip.dataset.marca));
    if (!marca) {
      chip.disabled = true;
      chip.title = `${chip.dataset.marca} (sin repuestos disponibles)`;
      return;
    }
    chip.dataset.marcaId = marca.id_marca_vehiculo;
    chip.title = `Ver repuestos ${marca.nombre}`;
    chip.setAttribute('aria-label', `Filtrar repuestos por ${marca.nombre}`);
  });
  actualizarChipsActivos();
}

function actualizarChipsActivos() {
  const actual = document.getElementById('filtroMarca')?.value || '';
  document.querySelectorAll('#marcasStrip .marca-chip').forEach((chip) => {
    const activo = !!actual && String(chip.dataset.marcaId) === String(actual);
    chip.classList.toggle('activo', activo);
    chip.setAttribute('aria-pressed', activo ? 'true' : 'false');
  });
}

async function filtrarPorMarcaChip(chip) {
  const id = chip.dataset.marcaId;
  if (!id) return;
  const selMarca = document.getElementById('filtroMarca');
  const yaActiva = String(selMarca.value) === String(id);
  selMarca.value = yaActiva ? '' : String(id);
  document.getElementById('filtroModelo').innerHTML = '<option value="">Todos los modelos</option>';
  document.getElementById('filtroCilindraje').innerHTML = '<option value="">Todos los cilindrajes</option>';
  document.getElementById('filtroAnio').innerHTML = '<option value="">Todos los años</option>';
  await cargarModelos(selMarca.value);
  actualizarChipsActivos();
  await cargarRepuestos();
  if (!yaActiva) {
    const resultados = document.querySelector('#vista-catalogo .resultados');
    const caja = resultados?.getBoundingClientRect();
    if (caja && caja.top > window.innerHeight - 120) {
      resultados.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
}

async function cargarModelos(marca) {
  const sel = document.getElementById('filtroModelo');
  const selCil = document.getElementById('filtroCilindraje');
  try {
    const url = marca ? `${API}/modelos?marca=${encodeURIComponent(marca)}` : `${API}/modelos`;
    const [modelos, cilindrajes] = await Promise.all([
      getJSON(url),
      getJSON(marca ? `${API}/cilindrajes?marca=${encodeURIComponent(marca)}` : `${API}/cilindrajes`),
    ]);

    modelosFiltroActuales = modelos;
    const unicos = [];
    const vistos = new Set();
    modelos.forEach((m) => {
      const key = `${m.marca}|${m.nombre}|${m.cilindraje}|${m.anio_inicio || ''}|${m.anio_fin || ''}`;
      if (!vistos.has(key)) { vistos.add(key); unicos.push(m); }
    });

    sel.innerHTML = '<option value="">Todos los modelos</option>' +
      unicos.map((m) => {
        const rango = m.anio_inicio && m.anio_fin ? ` (${m.anio_inicio}-${m.anio_fin})` : '';
        const base = marca ? `${m.nombre} ${m.cilindraje}L` : `${m.marca} · ${m.nombre} ${m.cilindraje}L`;
        return `<option value="${m.id_modelo}">${escapeHtml(base + rango)}</option>`;
      }).join('');

    selCil.innerHTML = '<option value="">Todos los cilindrajes</option>' +
      cilindrajes.map((c) => `<option value="${c}">${c} L</option>`).join('');

    actualizarOpcionesAnio(modelos, sel.value);
  } catch (e) {
    modelosFiltroActuales = [];
    sel.innerHTML = '<option value="">Todos los modelos</option>';
    selCil.innerHTML = '<option value="">Todos los cilindrajes</option>';
    actualizarOpcionesAnio([], '');
  }
}

function actualizarOpcionesAnio(modelos, modeloId) {
  const selAnio = document.getElementById('filtroAnio');
  if (!selAnio) return;
  const valorActual = selAnio.value;
  let filas = Array.isArray(modelos) ? modelos : [];
  if (modeloId) filas = filas.filter((m) => String(m.id_modelo) === String(modeloId));

  let min = Infinity;
  let max = -Infinity;
  filas.forEach((m) => {
    const ini = Number(m.anio_inicio);
    const fin = Number(m.anio_fin);
    if (Number.isFinite(ini) && ini > 0) min = Math.min(min, ini);
    if (Number.isFinite(fin) && fin > 0) max = Math.max(max, fin);
  });

  if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) {
    const actual = new Date().getFullYear();
    min = actual - 30;
    max = actual;
  }

  const anios = [];
  for (let a = max; a >= min; a--) anios.push(a);

  selAnio.innerHTML = '<option value="">Todos los años</option>' +
    anios.map((a) => `<option value="${a}">${a}</option>`).join('');
  if (valorActual && anios.includes(Number(valorActual))) selAnio.value = valorActual;
}

function leerFiltros() {
  state.filtros = {
    marca: document.getElementById('filtroMarca').value,
    modelo: document.getElementById('filtroModelo').value,
    cilindraje: document.getElementById('filtroCilindraje').value,
    anio: document.getElementById('filtroAnio').value,
    categoria: document.querySelector('#listaCategorias .cat-item.activo')?.dataset.cat || '',
    marca_repuesto: document.getElementById('filtroMarcaRepuesto').value,
    q: document.getElementById('filtroNombre').value.trim() || document.getElementById('buscadorGlobal').value.trim(),
    soloStock: document.getElementById('filtroStock').checked,
    orden: document.getElementById('ordenSelect').value,
  };
}

function limpiarFiltros() {
  document.getElementById('filtroMarca').value = '';
  document.getElementById('filtroAnio').value = '';
  document.querySelectorAll('#listaCategorias .cat-item').forEach((li, i) => li.classList.toggle('activo', i === 0));
  document.getElementById('filtroMarcaRepuesto').value = '';
  document.getElementById('filtroNombre').value = '';
  document.getElementById('buscadorGlobal').value = '';
  document.getElementById('filtroStock').checked = false;
  document.getElementById('ordenSelect').value = '';
  actualizarChipsActivos();
  cargarModelos('');
  cargarRepuestos();
}

/* ===================== CATALOGO ===================== */
async function cargarRepuestos(reset = true) {
  const reiniciar = reset !== false;
  if (!reiniciar && (!state.catalogo.hayMas || state.catalogo.cargando)) return;

  if (reiniciar) state.catalogo.page = 1;
  else state.catalogo.page += 1;

  leerFiltros();
  const grid = document.getElementById('gridRepuestos');
  const btn = document.getElementById('btnMostrarMas');
  if (reiniciar) grid.innerHTML = '<p style="color:var(--text-muted)">Buscando repuestos...</p>';
  state.catalogo.cargando = true;
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Cargando...';
  }

  const p = new URLSearchParams();
  const f = state.filtros;
  if (f.q) p.set('q', f.q);
  if (f.marca) p.set('marca', f.marca);
  if (f.modelo) p.set('modelo', f.modelo);
  if (f.cilindraje) p.set('cilindraje', f.cilindraje);
  if (f.anio) p.set('anio', f.anio);
  if (f.categoria) p.set('categoria', f.categoria);
  if (f.marca_repuesto) p.set('marca_repuesto', f.marca_repuesto);
  if (f.soloStock) p.set('soloStock', 'true');
  if (f.orden) p.set('orden', f.orden);
  p.set('page', state.catalogo.page);
  p.set('limit', state.catalogo.limit);

  const miId = ++catalogoCargaId;
  try {
    const data = await getJSON(`${API}/repuestos?${p.toString()}`);
    if (miId !== catalogoCargaId) return; // ignora respuestas viejas
    const items = Array.isArray(data) ? data : data.items;
    state.catalogo.total = Array.isArray(data) ? data.length : data.total;
    renderCatalogo(items, !reiniciar);
    const cargados = grid.querySelectorAll('.product-card').length;
    state.catalogo.hayMas = cargados < state.catalogo.total;
    actualizarBotonMostrarMas(cargados, state.catalogo.total);
  } catch (e) {
    if (miId !== catalogoCargaId) return;
    if (reiniciar) grid.innerHTML = `<p style="color:var(--danger)">Error: ${escapeHtml(e.message)}</p>`;
    else state.catalogo.page -= 1;
  } finally {
    if (miId === catalogoCargaId) {
      state.catalogo.cargando = false;
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-chevron-down"></i> Mostrar más repuestos';
      }
    }
  }
}

function actualizarBotonMostrarMas(cargados, total) {
  const wrap = document.getElementById('cargarMasWrap');
  if (!wrap) return;
  wrap.classList.toggle('oculto', cargados >= total);
}

function renderCatalogo(items, append = false) {
  const grid = document.getElementById('gridRepuestos');
  const contador = document.getElementById('contadorResultados');
  const vacio = document.getElementById('sinResultados');
  const total = state.catalogo.total;
  const cargados = (append ? grid.querySelectorAll('.product-card').length : 0) + items.length;

  let contexto = '';
  if (state.filtros.modelo) {
    const opt = document.querySelector(`#filtroModelo option[value="${state.filtros.modelo}"]`);
    if (opt) contexto = ` para <strong>${escapeHtml(opt.textContent)}</strong>`;
  } else if (state.filtros.marca) {
    const opt = document.querySelector(`#filtroMarca option[value="${state.filtros.marca}"]`);
    if (opt) contexto = ` para <strong>${escapeHtml(opt.textContent)}</strong>`;
  }
  contador.innerHTML = `<strong>${cargados}</strong> de <strong>${total}</strong> repuesto${total === 1 ? '' : 's'} encontrado${total === 1 ? '' : 's'}${contexto}`;

  if (!items.length && !append) {
    grid.innerHTML = '';
    vacio.classList.remove('oculto');
    return;
  }
  vacio.classList.add('oculto');

  const html = items.map((r) => {
    const agotado = r.stock <= 0;
    return `
      <article class="product-card${agotado ? ' is-out' : ''}">
        <div class="product-thumb">
          ${imgProducto(imagenDe(r), r.nombre, 'product-img')}
          <span class="product-tag">${escapeHtml(r.categoria)}</span>
          ${stockPill(r.stock)}
        </div>
        <div class="product-body">
          <span class="product-brand"><i class="fa-solid fa-certificate"></i> ${escapeHtml(r.marca_repuesto)}</span>
          <h3 class="product-name">${escapeHtml(r.nombre)}</h3>
          <p class="product-meta">Cód. ${escapeHtml(r.codigo)}</p>
          <p class="product-price">${money(r.precio)}</p>
          <div class="product-actions">
            <button class="btn btn-outline" data-ver="${r.id_repuesto}"><i class="fa-solid fa-eye"></i> Ver</button>
            <button class="btn btn-primary" data-add="${r.id_repuesto}" ${agotado ? 'disabled' : ''}><i class="fa-solid fa-cart-plus"></i> Agregar</button>
          </div>
        </div>
      </article>`;
  }).join('');

  if (append) grid.insertAdjacentHTML('beforeend', html);
  else grid.innerHTML = html;
}

/* ===================== DETALLE ===================== */
function agruparCompatibilidad(modelos) {
  const arbol = new Map();
  (modelos || []).forEach((m) => {
    const marca = String(m.marca || 'Sin marca').trim();
    const modelo = String(m.modelo || 'Sin modelo').trim();
    if (!arbol.has(marca)) arbol.set(marca, new Map());
    const porModelo = arbol.get(marca);
    if (!porModelo.has(modelo)) porModelo.set(modelo, { modelo, versiones: [], vistos: new Set() });
    const entrada = porModelo.get(modelo);
    const cil = m.cilindraje != null ? `${Number(m.cilindraje).toFixed(1)}L` : '';
    const rango = m.anio_inicio && m.anio_fin ? `${m.anio_inicio} - ${m.anio_fin}` : '';
    const clave = `${cil}|${rango}`;
    if (entrada.vistos.has(clave)) return;
    entrada.vistos.add(clave);
    entrada.versiones.push({ cil, rango });
  });

  return [...arbol.entries()].map(([marca, porModelo]) => {
    const modelosMarca = [...porModelo.values()].map(({ modelo, versiones }) => ({
      modelo,
      versiones,
      busqueda: [modelo, ...versiones.map((v) => `${v.cil} ${v.rango}`)].join(' '),
    }));
    return {
      marca,
      modelos: modelosMarca,
      versiones: modelosMarca.reduce((total, m) => total + m.versiones.length, 0),
    };
  });
}

function compatibilidadHtml(modelos) {
  const grupos = agruparCompatibilidad(modelos);
  if (!grupos.length) {
    return `<div class="compat-vacio"><i class="fa-solid fa-car-burst"></i><p>Sin modelos registrados para este repuesto.</p></div>`;
  }
  const totalModelos = grupos.reduce((total, g) => total + g.modelos.length, 0);
  const totalVersiones = grupos.reduce((total, g) => total + g.versiones, 0);

  const tarjetas = grupos.map((g) => `
    <article class="compat-brand" data-marca="${escapeHtml(g.marca)}">
      <header class="compat-brand-head">
        <span class="compat-brand-icon"><i class="fa-solid fa-car"></i></span>
        <strong>${escapeHtml(g.marca)}</strong>
        <span class="compat-brand-count">${g.modelos.length} modelo${g.modelos.length === 1 ? '' : 's'}</span>
      </header>
      <ul class="compat-modelos">
        ${g.modelos.map((m) => `
          <li class="compat-modelo" data-busqueda="${escapeHtml(m.busqueda)}">
            <span class="compat-modelo-nombre">${escapeHtml(m.modelo)}</span>
            <div class="compat-versiones">
              ${m.versiones.map((v) => `
                <span class="compat-version">
                  ${v.cil ? `<span class="compat-version-cil"><i class="fa-solid fa-gauge-high"></i>${escapeHtml(v.cil)}</span>` : ''}
                  <span class="compat-version-anio"><i class="fa-regular fa-calendar"></i>${escapeHtml(v.rango || 'Año no registrado')}</span>
                </span>`).join('')}
            </div>
          </li>`).join('')}
      </ul>
    </article>`).join('');

  return `
    <div class="compat-toolbar">
      <h5>Compatible con</h5>
      <span class="compat-total">${totalModelos} modelo${totalModelos === 1 ? '' : 's'} · ${totalVersiones} versión${totalVersiones === 1 ? '' : 'es'}</span>
    </div>
    <div class="compat-search">
      <i class="fa-solid fa-magnifying-glass"></i>
      <input type="search" id="detalleCompatBuscar" placeholder="Filtrar por marca, modelo, cilindraje o año..." autocomplete="off">
    </div>
    <div class="compat-grupos" id="detalleCompatLista">${tarjetas}</div>
    <p class="compat-sin-resultados oculto" id="detalleCompatVacio"><i class="fa-solid fa-magnifying-glass"></i> No hay coincidencias con ese filtro.</p>`;
}

function activarFiltroCompat() {
  const input = document.getElementById('detalleCompatBuscar');
  const lista = document.getElementById('detalleCompatLista');
  const vacio = document.getElementById('detalleCompatVacio');
  if (!input || !lista) return;
  input.addEventListener('input', () => {
    const texto = normalizarTexto(input.value);
    let visibles = 0;
    lista.querySelectorAll('.compat-brand').forEach((tarjeta) => {
      const marca = normalizarTexto(tarjeta.dataset.marca);
      let modelosVisibles = 0;
      tarjeta.querySelectorAll('.compat-modelo').forEach((fila) => {
        const coincide = !texto || marca.includes(texto) || normalizarTexto(fila.dataset.busqueda).includes(texto);
        fila.classList.toggle('oculto', !coincide);
        if (coincide) modelosVisibles += 1;
      });
      tarjeta.classList.toggle('oculto', modelosVisibles === 0);
      if (modelosVisibles) visibles += 1;
    });
    if (vacio) vacio.classList.toggle('oculto', visibles > 0);
  });
}

async function verDetalle(id) {
  try {
    const r = await getJSON(`${API}/repuestos/${id}`);
    state.repuestoDetalle = r;
    document.getElementById('detalleTitulo').textContent = r.nombre;

    document.getElementById('detalleBody').innerHTML = `
      <div class="detalle-top">
        <div class="detalle-img" title="Clic para ampliar la imagen">
          ${imgProducto(imagenDe(r), r.nombre)}
          <span class="detalle-zoom"><i class="fa-solid fa-magnifying-glass-plus"></i></span>
        </div>
        <div>
          <span class="product-brand"><i class="fa-solid fa-certificate"></i> ${escapeHtml(r.marca_repuesto)} ${r.marca_repuesto_pais ? '· ' + escapeHtml(r.marca_repuesto_pais) : ''}</span>
          <div class="detalle-price">${money(r.precio)}</div>
        </div>
      </div>
      <div class="detalle-grid">
        <div><span>Código</span><strong>${escapeHtml(r.codigo)}</strong></div>
        <div><span>Categoría</span><strong>${escapeHtml(r.categoria)}</strong></div>
        <div><span>Disponibilidad</span><strong>${r.stock > 0 ? r.stock + ' unidades' : 'Agotado'}</strong></div>
        <div><span>Marca del repuesto</span><strong>${escapeHtml(r.marca_repuesto)}</strong></div>
      </div>
      <p style="color:var(--text-muted);font-size:0.88rem">${escapeHtml(r.descripcion || 'Sin descripción.')}</p>
      <div class="detalle-compat">
        ${compatibilidadHtml(r.modelos)}
      </div>
      <div class="form-actions detalle-acciones">
        <button class="btn btn-primary btn-block" data-add="${r.id_repuesto}" ${r.stock <= 0 ? 'disabled' : ''}>
          <i class="fa-solid fa-cart-plus"></i> ${r.stock <= 0 ? 'Producto agotado' : 'Agregar al pedido'}
        </button>
        <button class="btn btn-whatsapp btn-block" data-contactar="${r.id_repuesto}">
          <i class="fa-brands fa-whatsapp"></i> Contactar asesor
        </button>
      </div>`;

    abrirModal('modalDetalle');
    activarFiltroCompat();
  } catch (e) {
    toast('No se pudo cargar el detalle');
  }
}

async function contactarAsesorProducto() {
  const r = state.repuestoDetalle;
  if (!r) return;

  if (!state.asesores.length) await cargarAsesoresCatalogo();
  const asesor = state.asesores[0];
  const saludo = asesor ? `Hola ${asesor.nombre}` : 'Hola TODO REPUESTOS Y FRENOS LA 61';
  const mensaje = `${saludo}, estoy viendo este repuesto y tengo una inquietud:\n\n${r.nombre}\nCódigo: ${r.codigo}\nPrecio: ${money(r.precio)}\n\n¿Me pueden asesorar?`;
  const telefono = asesor ? asesor.telefono : '573156772672';

  window.open(whatsappUrl(telefono, mensaje), '_blank');
  toast(asesor ? `Abriendo WhatsApp con ${asesor.nombre}` : 'Abriendo WhatsApp');
}

/* ===================== CARRITO ===================== */
function abrirCarrito() {
  document.getElementById('drawerCarrito').classList.add('open');
  document.getElementById('drawerOverlay').classList.add('open');
}

function cerrarCarrito() {
  document.getElementById('drawerCarrito').classList.remove('open');
  document.getElementById('drawerOverlay').classList.remove('open');
  toggleAsesorDropdown(false);
}

function textoOpcion(id) {
  const sel = document.getElementById(id);
  if (!sel || !sel.value) return '';
  return (sel.selectedOptions[0]?.textContent || '').trim();
}

function vehiculoSeleccionado() {
  const marca = textoOpcion('filtroMarca');
  const anio = document.getElementById('filtroAnio')?.value || '';
  let modelo = textoOpcion('filtroModelo');
  if (anio) modelo = modelo.replace(/\s*\(\d{4}-\d{4}\)\s*$/, '');
  const cilindraje = modelo ? '' : textoOpcion('filtroCilindraje');
  return [marca, modelo, cilindraje, anio ? `año ${anio}` : ''].filter(Boolean).join(' ');
}

function resumenCompatibilidad(modelos) {
  if (!Array.isArray(modelos) || !modelos.length) return '';
  const vistos = new Set();
  const lista = [];
  modelos.forEach((m) => {
    const rango = m.anio_inicio && m.anio_fin ? ` ${m.anio_inicio}-${m.anio_fin}` : '';
    const cil = m.cilindraje != null ? ` ${m.cilindraje}L` : '';
    const texto = `${m.marca} ${m.modelo}${cil}${rango}`.replace(/\s+/g, ' ').trim();
    if (!vistos.has(texto)) {
      vistos.add(texto);
      lista.push(texto);
    }
  });
  const max = 8;
  return lista.length > max
    ? `${lista.slice(0, max).join(', ')} y ${lista.length - max} más`
    : lista.join(', ');
}

function registrarVehiculo(item, vehiculo) {
  if (!vehiculo) return;
  item.vehiculos = item.vehiculos || [];
  if (!item.vehiculos.includes(vehiculo)) item.vehiculos.push(vehiculo);
}

async function agregarAlCarrito(id) {
  try {
    const vehiculo = vehiculoSeleccionado();
    const r = await getJSON(`${API}/repuestos/${id}`);
    const stock = Number(r.stock || 0);
    if (stock <= 0) {
      toast('Producto agotado');
      await cargarRepuestos();
      return;
    }
    let item = state.carrito.find((i) => i.id === id);
    if (!item) {
      item = {
        id,
        idRepuesto: Number(r.id_repuesto),
        codigo: r.codigo || '',
        nombre: r.nombre,
        marca: r.marca_repuesto,
        categoria: r.categoria,
        descripcion: r.descripcion || '',
        precio: Number(r.precio),
        cantidad: 1,
        stock,
        modelos: Array.isArray(r.modelos) ? r.modelos : [],
        vehiculos: [],
      };
      state.carrito.push(item);
    } else {
      if (item.cantidad >= stock) {
        toast('No hay más unidades disponibles');
        item.stock = stock;
        renderCarrito();
        return;
      }
      item.cantidad++;
      item.stock = stock;
    }
    registrarVehiculo(item, vehiculo);
    renderCarrito();
    toast('Agregado al pedido');
  } catch (e) {
    toast('Error al agregar');
  }
}

function cambiarCantidad(id, delta) {
  const item = state.carrito.find((i) => i.id === id);
  if (!item) return;
  if (delta > 0) {
    const stock = Number(item.stock || 0);
    if (stock > 0 && item.cantidad >= stock) {
      toast('No hay más unidades disponibles');
      renderCarrito();
      return;
    }
    item.cantidad += delta;
  } else {
    item.cantidad += delta;
    if (item.cantidad <= 0) {
      state.carrito = state.carrito.filter((i) => i.id !== id);
    }
  }
  renderCarrito();
}

function quitarDelCarrito(id) {
  state.carrito = state.carrito.filter((i) => i.id !== id);
  renderCarrito();
}

function resumenCarrito() {
  const total = state.carrito.reduce((s, i) => s + i.precio * i.cantidad, 0);
  const detalle = state.carrito.map((i) => {
    const id = i.idRepuesto ?? i.id;
    const vehiculos = (i.vehiculos || []).filter(Boolean);
    const para = vehiculos.length ? ` para ${vehiculos.join(' / ')}` : '';
    const compat = vehiculos.length ? '' : resumenCompatibilidad(i.modelos);
    const especificaciones = [
      i.codigo ? `Código: ${i.codigo}` : '',
      i.marca ? `Marca: ${i.marca}` : '',
      i.categoria ? `Categoría: ${i.categoria}` : '',
    ].filter(Boolean).join(' | ');
    return `• [ID ${id}] ${i.cantidad} x ${i.nombre}${para}` +
      (especificaciones ? `\n   ${especificaciones}` : '') +
      (i.descripcion ? `\n   Descripción: ${i.descripcion}` : '') +
      (compat ? `\n   Compatible con: ${compat}` : '') +
      `\n   Precio: ${money(i.precio)} c/u | Subtotal: ${money(i.precio * i.cantidad)}`;
  }).join('\n\n');
  return { total, detalle };
}

function renderCarrito() {
  const body = document.getElementById('carritoBody');
  const { total } = resumenCarrito();
  const count = state.carrito.reduce((s, i) => s + i.cantidad, 0);

  document.getElementById('carritoCount').textContent = count;
  document.getElementById('carritoTotal').textContent = money(total);

  if (!state.carrito.length) {
    body.innerHTML = '<div class="cart-empty"><i class="fa-solid fa-cart-shopping"></i><p>Tu pedido está vacío</p></div>';
    return;
  }

  body.innerHTML = state.carrito.map((i) => `
    <div class="cart-item">
      <div class="cart-item-icon"><i class="fa-solid ${iconoCategoria(i.categoria)}"></i></div>
      <div class="cart-item-info">
        <h4>${escapeHtml(i.nombre)}</h4>
        <span>${escapeHtml(i.marca)}</span>
        <div class="cart-qty">
          <button data-menos="${i.id}">−</button>
          <span>${i.cantidad}</span>
          <button data-mas="${i.id}">+</button>
          <span class="cart-item-price">${money(i.precio * i.cantidad)}</span>
        </div>
      </div>
      <button class="cart-remove" data-quitar="${i.id}" title="Quitar"><i class="fa-solid fa-xmark"></i></button>
    </div>`).join('');
}

function finalizarCompra() {
  if (!state.carrito.length) return toast('Agrega repuestos a tu pedido');
  const { total, detalle } = resumenCarrito();
  const mensaje = `Hola TODO REPUESTOS Y FRENOS LA 61, quiero hacer este pedido:\n${detalle}\n\nTotal: ${money(total)}`;
  const url = `https://wa.me/573156772672?text=${encodeURIComponent(mensaje)}`;
  window.open(url, '_blank');
  toast('Abriendo WhatsApp con tu pedido');
}

const ASESOR_TURNO_KEY = 'la61_asesor_turno';

// Reparte las ventas en turnos: cada compra se asigna al siguiente asesor
// de la lista. El ultimo asignado se guarda en localStorage para que el
// turno continue aunque se recargue la pagina o se vuelva otro dia.
function siguienteAsesor(asesores) {
  const lista = [...asesores].sort((a, b) => a.id_asesor - b.id_asesor);
  const ultimoId = Number(localStorage.getItem(ASESOR_TURNO_KEY) || 0);
  const indiceUltimo = lista.findIndex((a) => a.id_asesor === ultimoId);
  const asesor = lista[(indiceUltimo + 1) % lista.length];
  localStorage.setItem(ASESOR_TURNO_KEY, String(asesor.id_asesor));
  return asesor;
}

function mensajePedidoAsesor(asesor) {
  const { total, detalle } = resumenCarrito();
  return `Hola ${asesor.nombre}, quiero concretar este pedido contigo:\n${detalle}\n\nTotal: ${money(total)}`;
}

async function finalizarConAsesor() {
  if (!state.carrito.length) return toast('Agrega repuestos a tu pedido');

  const ventana = window.open('', '_blank');

  if (!state.asesores.length) await cargarAsesoresCatalogo();
  if (!state.asesores.length) {
    if (ventana) ventana.close();
    return toast('No hay asesores disponibles en este momento');
  }

  const asesor = siguienteAsesor(state.asesores);
  const url = whatsappUrl(asesor.telefono, mensajePedidoAsesor(asesor));

  if (ventana) ventana.location.href = url;
  else window.open(url, '_blank');

  cerrarCarrito();
  toast(`Abriendo WhatsApp con ${asesor.nombre}`);
}

function renderAsesorDropdown() {
  const cont = document.getElementById('asesorDropdown');
  if (!cont) return;
  if (!state.asesores.length) {
    cont.innerHTML = '<div class="asesor-dropdown-vacio">No hay asesores disponibles</div>';
    return;
  }
  cont.innerHTML = state.asesores.map((a) => `
    <button type="button" class="asesor-dropdown-item" data-asesor-id="${a.id_asesor}">
      <span class="wa-avatar">${escapeHtml(inicialesAsesor(a.nombre))}</span>
      <span class="wa-asesor-info">
        <strong>${escapeHtml(a.nombre)}</strong>
        <small>${escapeHtml(a.cargo || 'Asesor comercial')}</small>
      </span>
      <i class="fa-brands fa-whatsapp wa-asesor-icon"></i>
    </button>`).join('');
}

function toggleAsesorDropdown(abrir) {
  const cont = document.getElementById('asesorDropdown');
  const btn = document.getElementById('btnToggleAsesores');
  if (!cont || !btn) return;
  const forzar = typeof abrir === 'boolean' ? abrir : cont.classList.contains('oculto');
  cont.classList.toggle('oculto', !forzar);
  btn.setAttribute('aria-expanded', String(forzar));
}

function finalizarConAsesorElegido(id) {
  if (!state.carrito.length) return toast('Agrega repuestos a tu pedido');
  const asesor = state.asesores.find((a) => a.id_asesor === Number(id));
  if (!asesor) return toast('Asesor no disponible');

  localStorage.setItem(ASESOR_TURNO_KEY, String(asesor.id_asesor));
  toggleAsesorDropdown(false);
  window.open(whatsappUrl(asesor.telefono, mensajePedidoAsesor(asesor)), '_blank');
  cerrarCarrito();
  toast(`Abriendo WhatsApp con ${asesor.nombre}`);
}

/* ===================== WHATSAPP / ASESORES (catalogo) ===================== */
function inicialesAsesor(nombre) {
  return nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
}

function whatsappUrl(telefono, mensaje = 'Hola, necesito asesoría sobre unos repuestos.') {
  const num = String(telefono || '').replace(/\D/g, '');
  return `https://wa.me/${num}?text=${encodeURIComponent(mensaje)}`;
}

async function cargarAsesoresCatalogo() {
  try {
    state.asesores = await getJSON(`${API}/asesores`);
  } catch (e) {
    state.asesores = [];
  }
  renderListaAsesores();
}

function renderListaAsesores() {
  const lista = document.getElementById('waLista');
  if (!lista) return;
  const q = (document.getElementById('waBuscar')?.value || '').trim().toLowerCase();
  const filtrados = state.asesores.filter((a) =>
    !q || a.nombre.toLowerCase().includes(q) || (a.cargo || '').toLowerCase().includes(q));

  if (!filtrados.length) {
    lista.innerHTML = '<div class="wa-vacio"><i class="fa-solid fa-user-slash"></i><p>No hay asesores disponibles</p></div>';
    return;
  }

  let mensajePedido = '';
  if (state.carrito && state.carrito.length) {
    const { total, detalle } = resumenCarrito();
    mensajePedido = `Hola, quiero hacer este pedido:\n${detalle}\n\nTotal: ${money(total)}`;
  }

  lista.innerHTML = filtrados.map((a) => {
    const url = whatsappUrl(a.telefono, mensajePedido || 'Hola, necesito asesoría sobre unos repuestos.');
    return `
    <a class="wa-asesor" href="${url}" target="_blank" rel="noopener">
      <span class="wa-avatar">${escapeHtml(inicialesAsesor(a.nombre))}</span>
      <span class="wa-asesor-info">
        <strong>${escapeHtml(a.nombre)}</strong>
        <small>${escapeHtml(a.cargo || 'Asesor comercial')}</small>
      </span>
      <i class="fa-brands fa-whatsapp wa-asesor-icon"></i>
    </a>`;
  }).join('');
}

function toggleWaPanel(abrir) {
  const panel = document.getElementById('waPanel');
  const forzar = typeof abrir === 'boolean' ? abrir : panel.classList.contains('oculto');
  panel.classList.toggle('oculto', !forzar);
  document.getElementById('btnWhatsapp').classList.toggle('activo', forzar);
  if (forzar) renderListaAsesores();
}

/* ===================== LOGIN ADMIN ===================== */
function abrirLogin() {
  const err = document.getElementById('loginError');
  err.textContent = '';
  err.classList.add('oculto');
  document.getElementById('formLogin').reset();
  abrirModal('modalLogin');
}

// Comprueba si el token guardado sigue vigente en el servidor.
// Devuelve true si hay red pero falla la petición (no cerramos sesión por un fallo temporal).
async function verificarSesion() {
  if (!state.token) return false;
  try {
    const res = await fetchTimeout(`${API}/session`, { headers: authHeaders() }, 5000);
    if (!res.ok) return false;
    const body = await res.json();
    return !!body.valido;
  } catch (e) {
    return true;
  }
}

async function hacerLogin(e) {
  e.preventDefault();
  const err = document.getElementById('loginError');
  const btn = document.getElementById('btnLogin');
  err.classList.add('oculto');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Entrando...'; }
  try {
    const { token } = await iniciarSesion(document.getElementById('loginPassword').value);
    guardarToken(token);
    cerrarModal('modalLogin');
    toast('Sesión iniciada');
    mostrarVista('admin');
  } catch (error) {
    const esRed = /fetch|abort|network|load failed/i.test(error.message || '');
    err.textContent = esRed
      ? 'No se pudo conectar con el servidor. Verifica que "npm run dev" esté activo.'
      : (error.message || 'Contraseña incorrecta.');
    err.classList.remove('oculto');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Entrar'; }
  }
}

async function cerrarSesion() {
  try { await sendJSON(`${API}/logout`, 'POST'); } catch (e) { /* noop */ }
  guardarToken('');
  toast('Sesión cerrada');
  mostrarVista('catalogo');
}

/* ===================== ADMIN ===================== */
async function cargarAdmin() {
  await prepararSelectsAdmin();
  prepararFiltroCategoriaAdmin();
  await Promise.all([cargarKPI(), cargarTablaAdmin()]);
  // Si la pestaña visible es de asesores o categorias, se refresca esa tabla
  const tabActiva = document.querySelector('.admin-tab.active')?.dataset.adminTab;
  if (tabActiva === 'asesores') cargarAsesoresAdmin();
  if (tabActiva === 'categorias') cargarCategoriasAdmin();
}

/* ===================== ADMIN · ASESORES ===================== */
function cambiarAdminTab(tab) {
  document.querySelectorAll('.admin-tab').forEach((b) => b.classList.toggle('active', b.dataset.adminTab === tab));
  document.getElementById('admin-panel-repuestos').classList.toggle('oculto', tab !== 'repuestos');
  document.getElementById('admin-panel-asesores').classList.toggle('oculto', tab !== 'asesores');
  document.getElementById('admin-panel-categorias').classList.toggle('oculto', tab !== 'categorias');
  if (tab === 'asesores') cargarAsesoresAdmin();
  if (tab === 'categorias') cargarCategoriasAdmin();
}

function abrirModalAsesor() {
  document.getElementById('formAsesor').reset();
  document.getElementById('asesorId').value = '';
  document.getElementById('asActivo').checked = true;
  document.getElementById('modalAsesorTitulo').innerHTML = '<i class="fa-brands fa-whatsapp"></i> Nuevo asesor';
  abrirModal('modalAsesor');
}

function editarAsesor(id) {
  const a = (state.adminAsesores || []).find((x) => x.id_asesor === Number(id));
  if (!a) return;
  document.getElementById('asesorId').value = a.id_asesor;
  document.getElementById('asNombre').value = a.nombre;
  document.getElementById('asCargo').value = a.cargo || '';
  document.getElementById('asTelefono').value = a.telefono;
  document.getElementById('asCorreo').value = a.correo || '';
  document.getElementById('asActivo').checked = !!a.activo;
  document.getElementById('modalAsesorTitulo').innerHTML = '<i class="fa-brands fa-whatsapp"></i> Editar asesor';
  abrirModal('modalAsesor');
}

async function guardarAsesor(e) {
  e.preventDefault();
  const id = document.getElementById('asesorId').value;
  const body = {
    nombre: document.getElementById('asNombre').value.trim(),
    cargo: document.getElementById('asCargo').value.trim() || null,
    telefono: document.getElementById('asTelefono').value.replace(/[^\d]/g, ''),
    correo: document.getElementById('asCorreo').value.trim() || null,
    activo: document.getElementById('asActivo').checked,
  };
  if (!body.nombre || !body.telefono) return toast('Nombre y teléfono son obligatorios');
  try {
    const res = id ? await sendJSON(`${API}/asesores/${id}`, 'PUT', body) : await sendJSON(`${API}/asesores`, 'POST', body);
    toast(res.mensaje || 'Guardado');
    cerrarModal('modalAsesor');
    await cargarAsesoresAdmin();
    await cargarAsesoresCatalogo();
  } catch (err) {
    toast(err.message);
  }
}

async function eliminarAsesor(id) {
  if (!confirm('¿Eliminar este asesor?')) return;
  try {
    const res = await sendJSON(`${API}/asesores/${id}`, 'DELETE');
    toast(res.mensaje || 'Eliminado');
    await cargarAsesoresAdmin();
    await cargarAsesoresCatalogo();
  } catch (e) {
    toast(e.message);
  }
}

// Carga la lista completa (incluye inactivos) y refresca la tabla del panel
async function cargarAsesoresAdmin() {
  try {
    state.adminAsesores = await getJSON(`${API}/asesores?todos=true`);
  } catch (e) {
    state.adminAsesores = [];
  }
  renderTablaAsesores();
}

// Aplica búsqueda y filtro de estado sobre los asesores cargados
function renderTablaAsesores() {
  const tbody = document.getElementById('tablaAsesoresBody');
  const { q, estado } = state.adminFiltroAsesores;
  const texto = q.trim().toLowerCase();

  const filas = state.adminAsesores.filter((a) => {
    if (texto) {
      const coincide = [a.nombre, a.cargo, a.telefono, a.correo]
        .some((v) => String(v ?? '').toLowerCase().includes(texto));
      if (!coincide) return false;
    }
    if (estado === 'activos' && !a.activo) return false;
    if (estado === 'inactivos' && a.activo) return false;
    return true;
  });

  tbody.innerHTML = filas.length ? filas.map((a) => `
      <tr>
        <td><strong>${escapeHtml(a.nombre)}</strong></td>
        <td>${escapeHtml(a.cargo || '—')}</td>
        <td>${escapeHtml(a.telefono)}</td>
        <td>${escapeHtml(a.correo || '—')}</td>
        <td><span class="stock-badge ${a.activo ? 'ok' : 'out'}">${a.activo ? 'Sí' : 'No'}</span></td>
        <td>
          <button class="btn-icon" data-editar-asesor="${a.id_asesor}" title="Editar"><i class="fa-solid fa-pen"></i></button>
          <button class="btn-icon danger" data-eliminar-asesor="${a.id_asesor}" title="Eliminar"><i class="fa-solid fa-trash-can"></i></button>
        </td>
      </tr>`).join('') : `<tr><td colspan="6" class="admin-vacio"><i class="fa-solid fa-magnifying-glass"></i>No se encontraron asesores con los filtros aplicados.</td></tr>`;

  const total = state.adminAsesores.length;
  const cont = document.getElementById('adminContadorAsesores');
  if (cont) cont.textContent = filas.length === total ? `${total} asesores` : `${filas.length} de ${total} asesores`;
  const btnClear = document.getElementById('btnLimpiarBusquedaAdminAsesor');
  if (btnClear) btnClear.classList.toggle('oculto', !texto);
}

function limpiarFiltrosAsesores() {
  state.adminFiltroAsesores = { q: '', estado: '' };
  document.getElementById('adminBuscarAsesor').value = '';
  document.getElementById('adminFiltroEstadoAsesor').value = '';
  renderTablaAsesores();
}

/* ===================== ADMIN · CATEGORÍAS ===================== */
async function cargarCategoriasAdmin() {
  try {
    state.adminCategorias = await getJSON(`${API}/categorias`);
  } catch (e) {
    state.adminCategorias = [];
  }
  renderTablaCategorias();
}

function renderTablaCategorias() {
  const tbody = document.getElementById('tablaCategoriasBody');
  if (!tbody) return;
  const texto = (state.adminFiltroCategorias.q || '').trim().toLowerCase();
  const filas = state.adminCategorias.filter((c) => {
    if (!texto) return true;
    return [c.nombre, c.descripcion].some((v) => String(v ?? '').toLowerCase().includes(texto));
  });

  tbody.innerHTML = filas.length ? filas.map((c) => `
      <tr>
        <td><strong>${escapeHtml(c.nombre)}</strong></td>
        <td>${escapeHtml(c.descripcion || '—')}</td>
        <td><span class="stock-badge ${Number(c.total_repuestos) > 0 ? 'ok' : 'out'}">${Number(c.total_repuestos) || 0}</span></td>
        <td>
          <button class="btn-icon" data-editar-categoria="${c.id_categoria}" title="Editar"><i class="fa-solid fa-pen"></i></button>
          <button class="btn-icon danger" data-eliminar-categoria="${c.id_categoria}" title="Eliminar"><i class="fa-solid fa-trash-can"></i></button>
        </td>
      </tr>`).join('') : `<tr><td colspan="4" class="admin-vacio"><i class="fa-solid fa-tags"></i>No se encontraron categorías.</td></tr>`;

  const total = state.adminCategorias.length;
  const cont = document.getElementById('adminContadorCategorias');
  if (cont) cont.textContent = filas.length === total ? `${total} categorías` : `${filas.length} de ${total} categorías`;
  const btnClear = document.getElementById('btnLimpiarBusquedaAdminCategoria');
  if (btnClear) btnClear.classList.toggle('oculto', !texto);
}

function abrirModalCategoria() {
  document.getElementById('formCategoria').reset();
  document.getElementById('categoriaId').value = '';
  document.getElementById('modalCategoriaTitulo').innerHTML = '<i class="fa-solid fa-tags"></i> Nueva categoría';
  abrirModal('modalCategoria');
}

function editarCategoria(id) {
  const c = (state.adminCategorias || []).find((x) => String(x.id_categoria) === String(id));
  if (!c) return;
  document.getElementById('categoriaId').value = c.id_categoria;
  document.getElementById('catNombre').value = c.nombre;
  document.getElementById('catDescripcion').value = c.descripcion || '';
  document.getElementById('modalCategoriaTitulo').innerHTML = '<i class="fa-solid fa-tags"></i> Editar categoría';
  abrirModal('modalCategoria');
}

async function refrescarCategoriasGlobales() {
  await Promise.all([
    cargarCategoriasAdmin(),
    prepararSelectsAdmin(),
    cargarFiltros(),
  ]);
  prepararFiltroCategoriaAdmin();
  cargarTablaAdmin();
  cargarRepuestos(true);
}

async function guardarCategoria(e) {
  e.preventDefault();
  const id = document.getElementById('categoriaId').value;
  const body = {
    nombre: document.getElementById('catNombre').value.trim(),
    descripcion: document.getElementById('catDescripcion').value.trim() || null,
  };
  if (!body.nombre) return toast('El nombre de la categoría es obligatorio');
  try {
    const res = id
      ? await sendJSON(`${API}/categorias/${id}`, 'PUT', body)
      : await sendJSON(`${API}/categorias`, 'POST', body);
    toast(res.mensaje || (res.existente ? 'Esa categoría ya existía' : 'Categoría creada'));
    cerrarModal('modalCategoria');
    await refrescarCategoriasGlobales();
  } catch (err) {
    toast(err.message);
  }
}

async function eliminarCategoria(id) {
  if (!confirm('¿Eliminar esta categoría?')) return;
  try {
    const res = await sendJSON(`${API}/categorias/${id}`, 'DELETE');
    toast(res.mensaje || 'Categoría eliminada');
    await refrescarCategoriasGlobales();
  } catch (e) {
    toast(e.message);
  }
}

async function cargarKPI() {
  try {
    const d = await getJSON(`${API}/kpi`);
    document.getElementById('kpiRepuestos').textContent = d.totalRepuestos;
    document.getElementById('kpiMarcas').textContent = d.totalMarcas;
    document.getElementById('kpiModelos').textContent = d.totalModelos;
    document.getElementById('kpiAgotados').textContent = d.agotados;
    document.getElementById('kpiInventario').textContent = money(d.valorInventario);
    document.getElementById('heroRepuestos').textContent = d.totalRepuestos;
    document.getElementById('heroMarcas').textContent = d.totalMarcas;
    document.getElementById('heroModelos').textContent = d.totalModelos;
  } catch (e) { /* noop */ }
}

async function cargarTablaAdmin() {
  const f = state.adminFiltros;
  const p = new URLSearchParams();
  if (f.q.trim()) p.set('q', f.q.trim());
  if (f.categoria) p.set('categoria', f.categoria);
  if (f.stock) p.set('stock', f.stock);
  if (f.orden) p.set('orden', f.orden);
  p.set('page', f.pagina);
  p.set('limit', state.adminPaginacion.limit || 50);
  p.set('totalGeneral', '1');

  const miId = ++adminCargaId;
  try {
    const data = await getJSON(`${API}/repuestos?${p.toString()}`);
    if (miId !== adminCargaId) return; // ignora respuestas viejas
    const items = Array.isArray(data) ? data : data.items;
    state.adminRepuestos = items;
    state.adminPaginacion = {
      total: Array.isArray(data) ? data.length : data.total,
      totalGeneral: Array.isArray(data) ? data.length : (data.totalGeneral ?? data.total),
      paginas: Array.isArray(data) ? 1 : data.paginas,
      limit: Array.isArray(data) ? items.length : data.limit,
    };
  } catch (e) {
    if (miId !== adminCargaId) return;
    state.adminRepuestos = [];
    state.adminPaginacion = { total: 0, totalGeneral: 0, paginas: 1, limit: 50 };
    toast(e.message);
  }
  renderTablaAdmin();
}

// Arma el selector de categorías con el catálogo completo (no depende de la página visible)
function prepararFiltroCategoriaAdmin() {
  const sel = document.getElementById('adminFiltroCategoria');
  if (!sel) return;
  const cats = (state.categoriasAdmin || []).slice()
    .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es', { sensitivity: 'base' }));
  sel.innerHTML = '<option value="">Todas las categorías</option>' +
    cats.map((c) => `<option value="${c.id_categoria}">${escapeHtml(c.nombre)}</option>`).join('');
  if (state.adminFiltros.categoria &&
      !cats.some((c) => String(c.id_categoria) === String(state.adminFiltros.categoria))) {
    state.adminFiltros.categoria = '';
  }
  sel.value = state.adminFiltros.categoria ? String(state.adminFiltros.categoria) : '';
}

// Dibuja la página de repuestos que ya filtró y paginó el servidor
function renderTablaAdmin() {
  const tbody = document.getElementById('tablaAdminBody');
  const filas = state.adminRepuestos;

  tbody.innerHTML = filas.length ? filas.map((r) => {
    const cls = r.stock <= 0 ? 'out' : r.stock <= 10 ? 'low' : 'ok';
    return `<tr>
      <td><span class="cell-code">${escapeHtml(r.codigo)}</span></td>
      <td><strong>${escapeHtml(r.nombre)}</strong></td>
      <td>${escapeHtml(r.categoria)}</td>
      <td>${escapeHtml(r.marca_repuesto)}</td>
      <td>${money(r.precio)}</td>
      <td><span class="stock-badge ${cls}">${r.stock}</span></td>
      <td>
        <button class="btn-icon" data-editar="${r.id_repuesto}" title="Editar"><i class="fa-solid fa-pen"></i></button>
        <button class="btn-icon danger" data-eliminar="${r.id_repuesto}" title="Eliminar"><i class="fa-solid fa-trash-can"></i></button>
      </td>
    </tr>`;
  }).join('') : `<tr><td colspan="7" class="admin-vacio"><i class="fa-solid fa-magnifying-glass"></i>No se encontraron repuestos con los filtros aplicados.</td></tr>`;

  const { total, totalGeneral, paginas } = state.adminPaginacion;
  const f = state.adminFiltros;
  const hayFiltro = !!(f.q.trim() || f.categoria || f.stock);

  const cont = document.getElementById('adminContadorRepuestos');
  if (cont) cont.textContent = hayFiltro ? `${total} de ${totalGeneral} repuestos` : `${total} repuestos`;

  const btnClear = document.getElementById('btnLimpiarBusquedaAdmin');
  if (btnClear) btnClear.classList.toggle('oculto', !f.q.trim());

  const paginacion = document.getElementById('adminPaginacion');
  const info = document.getElementById('adminPaginaInfo');
  const anterior = document.getElementById('btnAdminAnterior');
  const siguiente = document.getElementById('btnAdminSiguiente');
  if (paginacion) paginacion.classList.toggle('oculto', paginas <= 1 && total === 0);
  if (info) info.textContent = `Página ${f.pagina} de ${paginas}`;
  if (anterior) anterior.disabled = f.pagina <= 1;
  if (siguiente) siguiente.disabled = f.pagina >= paginas;
}

function cambiarPaginaAdmin(delta) {
  const nueva = state.adminFiltros.pagina + delta;
  if (nueva < 1 || nueva > state.adminPaginacion.paginas) return;
  state.adminFiltros.pagina = nueva;
  cargarTablaAdmin();
}

let adminDebounce = null;
function buscarAdmin(valor) {
  state.adminFiltros.q = valor;
  state.adminFiltros.pagina = 1;
  clearTimeout(adminDebounce);
  adminDebounce = setTimeout(() => cargarTablaAdmin(), 300);
}

function limpiarFiltrosAdmin() {
  state.adminFiltros = { q: '', categoria: '', stock: '', orden: '', pagina: 1 };
  document.getElementById('adminBuscarRepuesto').value = '';
  document.getElementById('adminFiltroCategoria').value = '';
  document.getElementById('adminFiltroStock').value = '';
  document.getElementById('adminOrdenRepuestos').value = '';
  clearTimeout(adminDebounce);
  cargarTablaAdmin();
}

async function prepararSelectsAdmin() {
  const [categorias, marcasRep, modelos, marcasVehiculo] = await Promise.all([
    getJSON(`${API}/categorias`),
    getJSON(`${API}/marcas-repuesto`),
    getJSON(`${API}/modelos`),
    getJSON(`${API}/marcas-vehiculo`),
  ]);
  state.todosLosModelos = modelos;
  state.marcasVehiculo = marcasVehiculo;
  state.categoriasAdmin = categorias;

  document.getElementById('repCategoria').innerHTML =
    categorias.map((c) => `<option value="${c.id_categoria}">${escapeHtml(c.nombre)}</option>`).join('') +
    `<option value="${CATEGORIA_NUEVA}">+ Nueva categoría...</option>`;
  document.getElementById('repMarca').innerHTML =
    marcasRep.map((m) => `<option value="${m.id_marca_repuesto}">${escapeHtml(m.nombre)}</option>`).join('');

  // Refresca las marcas/modelos de las filas de compatibilidad ya abiertas
  refrescarSelectsCompat();
}

function actualizarCategoriaNueva() {
  const sel = document.getElementById('repCategoria');
  const wrap = document.getElementById('repCategoriaNuevaWrap');
  const input = document.getElementById('repCategoriaNueva');
  if (!sel || !wrap || !input) return;
  const creando = sel.value === CATEGORIA_NUEVA;
  wrap.classList.toggle('oculto', !creando);
  if (!creando) {
    input.value = '';
  } else {
    setTimeout(() => input.focus(), 60);
  }
}

/* ===================== ADMIN · COMPATIBILIDAD (marca / modelo) ===================== */
const COMPAT_NUEVA_MARCA = '__nueva_marca__';
const COMPAT_NUEVO_MODELO = '__nuevo_modelo__';

function opcionesMarcasVehiculo(seleccion) {
  const opciones = (state.marcasVehiculo || [])
    .map((m) => `<option value="${m.id_marca_vehiculo}"${String(m.id_marca_vehiculo) === String(seleccion) ? ' selected' : ''}>${escapeHtml(m.nombre)}</option>`)
    .join('');
  return '<option value="">Selecciona una marca...</option>' + opciones +
    `<option value="${COMPAT_NUEVA_MARCA}">+ Nueva marca...</option>`;
}

function modelosDeMarca(idMarca) {
  return (state.todosLosModelos || []).filter((m) => String(m.id_marca_vehiculo) === String(idMarca));
}

function opcionesModelos(idMarca, seleccion) {
  if (!idMarca || String(idMarca).startsWith('__')) return '<option value="">Primero elige una marca</option>';
  const opciones = modelosDeMarca(idMarca)
    .map((m) => {
      const rango = m.anio_inicio && m.anio_fin ? ` (${m.anio_inicio}-${m.anio_fin})` : '';
      return `<option value="${m.id_modelo}"${String(m.id_modelo) === String(seleccion) ? ' selected' : ''}>${escapeHtml(`${m.nombre} · ${m.cilindraje}L${rango}`)}</option>`;
    })
    .join('');
  return '<option value="">Selecciona un modelo...</option>' + opciones +
    `<option value="${COMPAT_NUEVO_MODELO}">+ Nuevo modelo...</option>`;
}

// Agrega una fila marca/modelo al formulario y devuelve el elemento creado
function agregarFilaCompat(idMarca = '', idModelo = '') {
  const cont = document.getElementById('compatLista');
  const fila = document.createElement('div');
  fila.className = 'compat-row';
  fila.innerHTML = `
    <div class="compat-row-campos">
      <select class="compat-marca" title="Marca del vehículo">${opcionesMarcasVehiculo(idMarca)}</select>
      <select class="compat-modelo" title="Modelo del vehículo">${opcionesModelos(idMarca, idModelo)}</select>
      <button type="button" class="btn-icon danger compat-quitar" title="Quitar esta compatibilidad"><i class="fa-solid fa-trash-can"></i></button>
    </div>
    <div class="compat-extra oculto"></div>`;
  cont.appendChild(fila);
  actualizarInfoModelos();
  return fila;
}

function limpiarCompat() {
  const cont = document.getElementById('compatLista');
  if (cont) cont.innerHTML = '';
  actualizarInfoModelos();
}

// Refresca los select de todas las filas conservando la selección actual
function refrescarSelectsCompat() {
  document.querySelectorAll('#compatLista .compat-row').forEach((fila) => {
    const selMarca = fila.querySelector('.compat-marca');
    if (!selMarca) return;
    const marcaActual = selMarca.value;
    selMarca.innerHTML = opcionesMarcasVehiculo(marcaActual);
    selMarca.value = marcaActual;
    const selModelo = fila.querySelector('.compat-modelo');
    if (selModelo) {
      const modeloActual = selModelo.value;
      selModelo.innerHTML = opcionesModelos(marcaActual, modeloActual);
      selModelo.value = modeloActual;
    }
  });
}

// Cuenta los modelos únicos asignados al repuesto
function actualizarInfoModelos() {
  const info = document.getElementById('repModelosInfo');
  if (!info) return;
  const ids = new Set();
  document.querySelectorAll('#compatLista .compat-row').forEach((fila) => {
    const v = fila.querySelector('.compat-modelo')?.value;
    if (v && !String(v).startsWith('__')) ids.add(String(v));
  });
  const n = ids.size;
  info.textContent = `${n} modelo${n === 1 ? '' : 's'} asignado${n === 1 ? '' : 's'} a este repuesto`;
}

// Devuelve los IDs de modelo seleccionados (sin duplicados)
function recolectarModelosCompat() {
  const ids = new Set();
  document.querySelectorAll('#compatLista .compat-row').forEach((fila) => {
    const v = fila.querySelector('.compat-modelo')?.value;
    if (v && !String(v).startsWith('__')) ids.add(Number(v));
  });
  return [...ids];
}

// ¿Quedó alguna marca/modelo por crear sin confirmar?
function hayCompatPendiente() {
  return Array.from(document.querySelectorAll('#compatLista select'))
    .some((s) => String(s.value).startsWith('__'));
}

function mostrarExtra(fila, html) {
  const extra = fila.querySelector('.compat-extra');
  extra.innerHTML = html;
  extra.classList.remove('oculto');
}

function ocultarExtra(fila) {
  const extra = fila.querySelector('.compat-extra');
  extra.classList.add('oculto');
  extra.innerHTML = '';
}

function mostrarFormNuevaMarca(fila, valorPrevio = '') {
  mostrarExtra(fila, `
    <div class="compat-extra-form">
      <input type="text" class="compat-nueva-marca" placeholder="Nombre de la nueva marca (ej: Renault)" value="${escapeHtml(valorPrevio)}">
      <input type="text" class="compat-nueva-marca-pais" placeholder="País de origen (opcional)">
      <div class="compat-extra-acciones">
        <button type="button" class="btn btn-primary btn-sm compat-crear-marca"><i class="fa-solid fa-plus"></i> Crear</button>
        <button type="button" class="btn btn-secondary btn-sm compat-cancelar">Cancelar</button>
      </div>
    </div>`);
  fila.querySelector('.compat-nueva-marca').focus();
}

function mostrarFormNuevoModelo(fila) {
  mostrarExtra(fila, `
    <div class="compat-extra-form">
      <input type="text" class="compat-nuevo-modelo" placeholder="Nombre del modelo (ej: Logan)">
      <input type="number" class="compat-nuevo-cilindraje" step="0.1" min="0.1" max="9.9" placeholder="Cilindraje (L) ej: 1.6">
      <input type="number" class="compat-nuevo-anio-inicio" min="1950" max="2100" placeholder="Año inicio (ej: 2010)">
      <input type="number" class="compat-nuevo-anio-fin" min="1950" max="2100" placeholder="Año fin (ej: 2015)">
      <div class="compat-extra-acciones">
        <button type="button" class="btn btn-primary btn-sm compat-crear-modelo"><i class="fa-solid fa-plus"></i> Crear</button>
        <button type="button" class="btn btn-secondary btn-sm compat-cancelar">Cancelar</button>
      </div>
    </div>`);
  fila.querySelector('.compat-nuevo-modelo').focus();
}

async function crearMarcaDesdeFila(fila, boton) {
  const nombre = fila.querySelector('.compat-nueva-marca').value.trim();
  const pais = fila.querySelector('.compat-nueva-marca-pais').value.trim();
  if (!nombre) return toast('Escribe el nombre de la nueva marca');
  boton.disabled = true;
  try {
    const res = await sendJSON(`${API}/marcas-vehiculo`, 'POST', { nombre, pais_origen: pais });
    const marca = res.marca;
    if (!state.marcasVehiculo.some((m) => m.id_marca_vehiculo === marca.id_marca_vehiculo)) {
      state.marcasVehiculo.push({ ...marca, total_modelos: 0 });
      state.marcasVehiculo.sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es', { sensitivity: 'base' }));
    }
    refrescarSelectsCompat();
    const selMarca = fila.querySelector('.compat-marca');
    selMarca.value = String(marca.id_marca_vehiculo);
    fila.querySelector('.compat-modelo').innerHTML = opcionesModelos(marca.id_marca_vehiculo, '');
    ocultarExtra(fila);
    actualizarInfoModelos();
    toast(res.existente ? `La marca "${marca.nombre}" ya existía y fue seleccionada` : `Marca "${marca.nombre}" creada`);
  } catch (e) {
    toast(e.message);
  } finally {
    boton.disabled = false;
  }
}

async function crearModeloDesdeFila(fila, boton) {
  const selMarca = fila.querySelector('.compat-marca');
  const idMarca = Number(selMarca.value);
  const nombre = fila.querySelector('.compat-nuevo-modelo').value.trim();
  const cilindraje = Number(fila.querySelector('.compat-nuevo-cilindraje').value);
  const anioInicio = Number(fila.querySelector('.compat-nuevo-anio-inicio').value) || null;
  const anioFin = Number(fila.querySelector('.compat-nuevo-anio-fin').value) || null;
  if (!idMarca || String(selMarca.value).startsWith('__')) return toast('Primero selecciona (o crea) la marca');
  if (!nombre) return toast('Escribe el nombre del nuevo modelo');
  if (!Number.isFinite(cilindraje) || cilindraje <= 0) return toast('Escribe un cilindraje válido (ej: 1.6)');
  if (anioInicio && anioFin && anioFin < anioInicio) return toast('El año final no puede ser menor que el año inicial');
  boton.disabled = true;
  try {
    const res = await sendJSON(`${API}/modelos`, 'POST', {
      id_marca_vehiculo: idMarca,
      nombre,
      cilindraje,
      anio_inicio: anioInicio,
      anio_fin: anioFin,
    });
    const modelo = res.modelo;
    if (!state.todosLosModelos.some((m) => m.id_modelo === modelo.id_modelo)) {
      state.todosLosModelos.push(modelo);
    }
    refrescarSelectsCompat();
    fila.querySelector('.compat-modelo').value = String(modelo.id_modelo);
    ocultarExtra(fila);
    actualizarInfoModelos();
    toast(res.existente ? `El modelo "${modelo.nombre}" ya existía y fue seleccionado` : `Modelo "${modelo.nombre} · ${modelo.cilindraje}L" creado`);
  } catch (e) {
    toast(e.message);
  } finally {
    boton.disabled = false;
  }
}

// Previsualizacion de la imagen en el formulario de gestion
function actualizarPreviewImagen(src) {
  const cont = document.getElementById('repImagenPreview');
  if (!cont) return;
  const url = (src || '').trim() || IMAGEN_GENERICA;
  cont.innerHTML = `<img src="${escapeHtml(url)}" alt="Vista previa" onerror="this.onerror=null;this.src='${IMAGEN_GENERICA}'">`;
}

async function abrirModalRepuesto() {
  document.getElementById('formRepuesto').reset();
  document.getElementById('repuestoId').value = '';
  document.getElementById('modalRepuestoTitulo').textContent = 'Nuevo repuesto';
  document.getElementById('repMarcaNueva').value = '';
  actualizarPreviewImagen('');
  try {
    await prepararSelectsAdmin();
  } catch (e) {
    // Si falla la recarga, se usan las marcas/modelos ya cargados en memoria
  }
  actualizarCategoriaNueva();
  limpiarCompat();
  agregarFilaCompat();
  abrirModal('modalRepuesto');
}

async function editarRepuesto(id) {
  const r = await getJSON(`${API}/repuestos/${id}`);
  await prepararSelectsAdmin();
  document.getElementById('repuestoId').value = r.id_repuesto;
  document.getElementById('repCodigo').value = r.codigo;
  document.getElementById('repNombre').value = r.nombre;
  document.getElementById('repCategoria').value = r.id_categoria;
  actualizarCategoriaNueva();
  document.getElementById('repMarca').value = r.id_marca_repuesto;
  document.getElementById('repMarcaNueva').value = '';
  document.getElementById('repPrecio').value = Number(r.precio);
  document.getElementById('repStock').value = r.stock;
  document.getElementById('repDescripcion').value = r.descripcion || '';
  document.getElementById('repImagen').value = r.imagen || '';
  actualizarPreviewImagen(r.imagen || IMAGENES[r.categoria] || IMAGEN_GENERICA);
  limpiarCompat();
  const modelos = r.modelos || [];
  if (modelos.length) {
    modelos.forEach((m) => agregarFilaCompat(m.id_marca_vehiculo, m.id_modelo));
  } else {
    agregarFilaCompat();
  }
  actualizarInfoModelos();
  document.getElementById('modalRepuestoTitulo').textContent = 'Editar repuesto';
  abrirModal('modalRepuesto');
}

async function guardarRepuesto(e) {
  e.preventDefault();
  if (hayCompatPendiente()) {
    return toast('Tienes una marca o modelo sin crear. Créalo o cancélalo antes de guardar.');
  }
  const id = document.getElementById('repuestoId').value;
  const modelos = recolectarModelosCompat();
  const marcaNueva = document.getElementById('repMarcaNueva').value.trim();
  const categoriaSel = document.getElementById('repCategoria').value;
  const categoriaNueva = document.getElementById('repCategoriaNueva').value.trim();
  const body = {
    codigo: document.getElementById('repCodigo').value.trim(),
    nombre: document.getElementById('repNombre').value.trim(),
    id_categoria: categoriaSel === CATEGORIA_NUEVA ? null : Number(categoriaSel),
    id_marca_repuesto: Number(document.getElementById('repMarca').value),
    precio: Number(document.getElementById('repPrecio').value),
    stock: Number(document.getElementById('repStock').value),
    descripcion: document.getElementById('repDescripcion').value.trim() || null,
    imagen: document.getElementById('repImagen').value.trim() || null,
    modelos,
  };
  try {
    // Si el usuario escribio una categoria nueva, se crea (o reutiliza) antes de guardar
    if (categoriaSel === CATEGORIA_NUEVA) {
      if (!categoriaNueva) {
        document.getElementById('repCategoriaNueva').focus();
        return toast('Escribe el nombre de la nueva categoría');
      }
      const resCategoria = await sendJSON(`${API}/categorias`, 'POST', { nombre: categoriaNueva });
      body.id_categoria = resCategoria.categoria.id_categoria;
    }
    // Si el usuario escribio una marca nueva, se crea (o reutiliza) antes de guardar
    if (marcaNueva) {
      const resMarca = await sendJSON(`${API}/marcas-repuesto`, 'POST', { nombre: marcaNueva });
      body.id_marca_repuesto = resMarca.marca.id_marca_repuesto;
    }
    const res = id ? await sendJSON(`${API}/repuestos/${id}`, 'PUT', body) : await sendJSON(`${API}/repuestos`, 'POST', body);
    toast(res.mensaje || 'Guardado');
    cerrarModal('modalRepuesto');
    cargarAdmin();
    cargarRepuestos();
    cargarFiltros();
  } catch (err) {
    toast(err.message);
  }
}

async function eliminarRepuesto(id) {
  if (!confirm('¿Eliminar este repuesto? Esta acción no se puede deshacer.')) return;
  try {
    const res = await sendJSON(`${API}/repuestos/${id}`, 'DELETE');
    toast(res.mensaje || 'Eliminado');
    cargarAdmin();
    cargarRepuestos();
  } catch (e) {
    toast(e.message);
  }
}

/* ===================== IMPORTAR DATOS (EXCEL) ===================== */
async function importarExcel(file) {
  const fd = new FormData();
  fd.append('archivo', file);
  const res = await fetchTimeout(`${API}/import/excel`, {
    method: 'POST',
    headers: state.token ? { Authorization: `Bearer ${state.token}` } : {},
    body: fd,
  }, 90000);
  const body = await res.json().catch(() => ({}));
  exigirSesion(res, body);
  if (!res.ok) throw new Error(body.error || 'No se pudo actualizar el inventario.');
  return body;
}

function mostrarResumenImport(r) {
  const res = r.resumen || {};
  const stat = (titulo, valor, color) =>
    `<div class="import-stat"><span>${titulo}</span><strong style="color:${color}">${valor}</strong></div>`;
  let html = `<p class="form-hint">${escapeHtml(r.mensaje || 'Proceso terminado.')}</p>
    <div class="import-stats">
      ${stat('Filas leídas', res.filas || 0, 'var(--text)')}
      ${stat('Productos creados', res.productosCreados || 0, 'var(--success)')}
      ${stat('Actualizados', res.productosActualizados || 0, 'var(--success)')}
      ${stat('Sin cambios', res.sinCambios || 0, 'var(--text-muted)')}
      ${stat('Categorías nuevas', res.categoriasCreadas || 0, 'var(--success)')}
      ${stat('Marcas nuevas', res.marcasCreadas || 0, 'var(--success)')}
      ${stat('Con error', res.errores || 0, 'var(--danger)')}
    </div>`;
  if (r.errores && r.errores.length) {
    html += `<p class="form-hint" style="color:var(--danger)"><strong>Errores:</strong> ${r.errores.map(escapeHtml).join(', ')}</p>`;
  }
  document.getElementById('importResumen').innerHTML = html;
  abrirModal('modalImport');
}

async function alSeleccionarExcel(e) {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;
  toast('Subiendo y procesando el inventario...');
  try {
    const r = await importarExcel(file);
    mostrarResumenImport(r);
    await cargarAdmin();
    await recargarDatos();
  } catch (error) {
    toast(error.message);
  }
}

async function descargarBlob(res, nombre) {
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function descargarCsv() {
  try {
    const res = await fetchTimeout(`${API}/export/csv`, { headers: authHeaders() }, 120000);
    if (res.status === 401) { guardarToken(''); abrirLogin(); throw new Error('Sesión requerida.'); }
    if (!res.ok) throw new Error('No se pudo exportar el CSV.');
    await descargarBlob(res, 'inventario_la61.csv');
    toast('Inventario exportado en CSV.');
  } catch (e) {
    toast(e.message);
  }
}

async function descargarExcel() {
  try {
    const res = await fetchTimeout(`${API}/export/excel`, { headers: authHeaders() }, 40000);
    if (res.status === 401) { guardarToken(''); abrirLogin(); throw new Error('Sesión requerida.'); }
    if (!res.ok) throw new Error('No se pudo descargar el Excel.');
    await descargarBlob(res, 'inventario_la61.xlsx');
  } catch (e) {
    toast(e.message);
  }
}

/* ===================== MODALES ===================== */
function abrirModal(id) {
  document.getElementById(id).style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function cerrarModal(id) {
  document.getElementById(id).style.display = 'none';
  document.body.style.overflow = '';
}

/* ===================== VISOR DE IMAGEN ===================== */
const visor = { zoom: 1, x: 0, y: 0, arrastrando: false, inicioX: 0, inicioY: 0 };

function abrirVisorImagen(src, alt = '') {
  const overlay = document.getElementById('visorImagen');
  const img = document.getElementById('visorImg');
  if (!overlay || !img) return;
  img.src = src;
  img.alt = alt;
  document.getElementById('visorTitulo').textContent = alt || 'Vista ampliada';
  visor.zoom = 1;
  visor.x = 0;
  visor.y = 0;
  aplicarTransformVisor();
  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function cerrarVisorImagen() {
  const overlay = document.getElementById('visorImagen');
  if (!overlay) return;
  overlay.classList.remove('open');
  overlay.setAttribute('aria-hidden', 'true');
  const detalle = document.getElementById('modalDetalle');
  document.body.style.overflow = detalle && detalle.style.display === 'flex' ? 'hidden' : '';
}

function aplicarTransformVisor() {
  const img = document.getElementById('visorImg');
  const nivel = document.getElementById('visorZoomNivel');
  if (img) {
    img.style.transform = `translate(${visor.x}px, ${visor.y}px) scale(${visor.zoom})`;
    img.style.cursor = visor.zoom > 1 ? 'grab' : 'zoom-in';
  }
  if (nivel) nivel.textContent = `${Math.round(visor.zoom * 100)}%`;
}

function cambiarZoomVisor(delta) {
  visor.zoom = Math.min(5, Math.max(1, Math.round((visor.zoom + delta) * 100) / 100));
  if (visor.zoom === 1) {
    visor.x = 0;
    visor.y = 0;
  }
  aplicarTransformVisor();
}

function restablecerZoomVisor() {
  visor.zoom = 1;
  visor.x = 0;
  visor.y = 0;
  aplicarTransformVisor();
}

/* ===================== BARRA DE DESPLAZAMIENTO ===================== */
const barraScroll = { arrastrando: false };

function alturaDocumento() {
  return Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
}

function actualizarBarraScroll() {
  const rail = document.getElementById('scrollRail');
  const track = document.getElementById('scrollTrack');
  const thumb = document.getElementById('scrollThumb');
  const btn = document.getElementById('btnIrArriba');
  if (!rail || !track || !thumb) return;
  const total = alturaDocumento();
  const visible = window.innerHeight;
  const max = Math.max(0, total - visible);
  const progreso = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
  const trackH = track.clientHeight;
  const thumbH = Math.min(trackH, Math.max(42, trackH * (visible / Math.max(total, visible))));
  thumb.style.height = `${thumbH}px`;
  thumb.style.transform = `translateY(${progreso * Math.max(0, trackH - thumbH)}px)`;
  track.setAttribute('aria-valuenow', String(Math.round(progreso * 100)));
  rail.classList.toggle('activa', window.scrollY > 40);
  rail.classList.toggle('sin-scroll', max <= 0);
  if (btn) btn.classList.toggle('visible', window.scrollY > 420);
}

function desplazarDesdeBarra(clientY) {
  const track = document.getElementById('scrollTrack');
  const thumb = document.getElementById('scrollThumb');
  if (!track || !thumb) return;
  const rect = track.getBoundingClientRect();
  const recorrido = Math.max(1, rect.height - thumb.offsetHeight);
  const ratio = Math.min(1, Math.max(0, (clientY - rect.top - thumb.offsetHeight / 2) / recorrido));
  const max = Math.max(0, alturaDocumento() - window.innerHeight);
  window.scrollTo(0, ratio * max);
}

/* ===================== INIT ===================== */
async function arrancar() {
  estadoConexion('Conectando con el servidor...');
  document.getElementById('gridRepuestos').innerHTML =
    '<p style="color:var(--text-muted)">Cargando repuestos...</p>';

  if (!(await esperarServidor())) {
    state.enLinea = false;
    estadoConexion('No se pudo conectar con la API. Verifica que MySQL esté encendido y ejecuta "npm run db:init" y "npm run dev".', true);
    document.getElementById('gridRepuestos').innerHTML =
      '<p style="color:var(--danger)">Sin conexión con el servidor.</p>';
    return;
  }

  try {
    await Promise.all([cargarFiltros(), cargarModelos(''), cargarKPI(), cargarAsesoresCatalogo()]);
    await cargarRepuestos();
    state.enLinea = true;
    ocultarEstadoConexion();
  } catch (e) {
    state.enLinea = false;
    estadoConexion('El servidor respondió con un error: ' + e.message, true);
    document.getElementById('gridRepuestos').innerHTML =
      '<p style="color:var(--danger)">No se pudieron cargar los repuestos.</p>';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // Navegación
  document.querySelectorAll('[data-vista]').forEach((el) => el.addEventListener('click', () => mostrarVista(el.dataset.vista)));

  // Cerrar modales
  document.querySelectorAll('[data-cerrar]').forEach((b) => b.addEventListener('click', () => cerrarModal(b.dataset.cerrar)));
  document.querySelectorAll('.modal-overlay').forEach((ov) => ov.addEventListener('click', (e) => { if (e.target === ov) cerrarModal(ov.id); }));
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const visorAbierto = document.getElementById('visorImagen')?.classList.contains('open');
    if (visorAbierto) return cerrarVisorImagen();
    document.querySelectorAll('.modal-overlay').forEach((ov) => (ov.style.display = 'none'));
    document.body.style.overflow = '';
  });

  // Visor de imagen del detalle
  document.getElementById('detalleBody').addEventListener('click', (e) => {
    const cont = e.target.closest('.detalle-img');
    if (!cont) return;
    const img = cont.querySelector('img');
    if (img) abrirVisorImagen(img.currentSrc || img.src, img.alt);
  });
  document.getElementById('visorCerrar').addEventListener('click', cerrarVisorImagen);
  document.getElementById('visorZoomIn').addEventListener('click', () => cambiarZoomVisor(0.5));
  document.getElementById('visorZoomOut').addEventListener('click', () => cambiarZoomVisor(-0.5));
  document.getElementById('visorZoomNivel').addEventListener('click', restablecerZoomVisor);
  document.getElementById('visorImagen').addEventListener('click', (e) => { if (e.target.id === 'visorImagen') cerrarVisorImagen(); });

  const visorStage = document.getElementById('visorStage');
  visorStage.addEventListener('wheel', (e) => {
    if (!document.getElementById('visorImagen').classList.contains('open')) return;
    e.preventDefault();
    cambiarZoomVisor(e.deltaY < 0 ? 0.35 : -0.35);
  }, { passive: false });
  visorStage.addEventListener('dblclick', () => cambiarZoomVisor(visor.zoom > 1 ? -visor.zoom + 1 : 1));
  visorStage.addEventListener('pointerdown', (e) => {
    if (visor.zoom <= 1) return;
    visor.arrastrando = true;
    visor.inicioX = e.clientX - visor.x;
    visor.inicioY = e.clientY - visor.y;
    visorStage.classList.add('dragging');
    visorStage.setPointerCapture(e.pointerId);
  });
  visorStage.addEventListener('pointermove', (e) => {
    if (!visor.arrastrando) return;
    visor.x = e.clientX - visor.inicioX;
    visor.y = e.clientY - visor.inicioY;
    aplicarTransformVisor();
  });
  const soltarArrastre = () => {
    visor.arrastrando = false;
    visorStage.classList.remove('dragging');
  };
  visorStage.addEventListener('pointerup', soltarArrastre);
  visorStage.addEventListener('pointercancel', soltarArrastre);

  // Barra de desplazamiento personalizada
  const railScroll = document.getElementById('scrollRail');
  const trackScroll = document.getElementById('scrollTrack');
  trackScroll.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    barraScroll.arrastrando = true;
    railScroll.classList.add('arrastrando');
    trackScroll.setPointerCapture(e.pointerId);
    desplazarDesdeBarra(e.clientY);
  });
  trackScroll.addEventListener('pointermove', (e) => {
    if (barraScroll.arrastrando) desplazarDesdeBarra(e.clientY);
  });
  const soltarBarra = () => {
    barraScroll.arrastrando = false;
    railScroll.classList.remove('arrastrando');
  };
  trackScroll.addEventListener('pointerup', soltarBarra);
  trackScroll.addEventListener('pointercancel', soltarBarra);
  trackScroll.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'PageDown') {
      e.preventDefault();
      window.scrollBy({ top: window.innerHeight * 0.85, behavior: 'smooth' });
    }
    if (e.key === 'ArrowUp' || e.key === 'PageUp') {
      e.preventDefault();
      window.scrollBy({ top: -window.innerHeight * 0.85, behavior: 'smooth' });
    }
    if (e.key === 'Home') {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    if (e.key === 'End') {
      e.preventDefault();
      window.scrollTo({ top: alturaDocumento(), behavior: 'smooth' });
    }
  });
  document.getElementById('scrollPasoArriba').addEventListener('click', () =>
    window.scrollBy({ top: -window.innerHeight * 0.85, behavior: 'smooth' }));
  document.getElementById('scrollPasoAbajo').addEventListener('click', () =>
    window.scrollBy({ top: window.innerHeight * 0.85, behavior: 'smooth' }));
  document.getElementById('btnIrArriba').addEventListener('click', () =>
    window.scrollTo({ top: 0, behavior: 'smooth' }));
  window.addEventListener('scroll', actualizarBarraScroll, { passive: true });
  window.addEventListener('resize', actualizarBarraScroll);
  if ('ResizeObserver' in window) {
    new ResizeObserver(actualizarBarraScroll).observe(document.body);
  }
  window.addEventListener('load', actualizarBarraScroll);
  actualizarBarraScroll();

  // Filtros (cascada marca -> modelo -> cilindraje / año)
  document.getElementById('filtroMarca').addEventListener('change', async (e) => {
    document.getElementById('filtroModelo').innerHTML = '<option value="">Todos los modelos</option>';
    document.getElementById('filtroCilindraje').innerHTML = '<option value="">Todos los cilindrajes</option>';
    document.getElementById('filtroAnio').innerHTML = '<option value="">Todos los años</option>';
    await cargarModelos(e.target.value);
    actualizarChipsActivos();
    cargarRepuestos();
  });

  // Logos de marcas: filtran el catálogo al hacer clic
  document.getElementById('marcasStrip').addEventListener('click', (e) => {
    const chip = e.target.closest('.marca-chip');
    if (!chip || chip.disabled) return;
    filtrarPorMarcaChip(chip);
  });
  document.getElementById('filtroModelo').addEventListener('change', (e) => {
    actualizarOpcionesAnio(modelosFiltroActuales, e.target.value);
    cargarRepuestos();
  });
  ['filtroCilindraje', 'filtroAnio', 'filtroMarcaRepuesto', 'ordenSelect'].forEach((id) =>
    document.getElementById(id).addEventListener('change', cargarRepuestos));
  document.getElementById('filtroStock').addEventListener('change', cargarRepuestos);
  document.getElementById('listaCategorias').addEventListener('click', (e) => {
    const li = e.target.closest('.cat-item');
    if (!li) return;
    document.querySelectorAll('#listaCategorias .cat-item').forEach((i) => i.classList.toggle('activo', i === li));
    cargarRepuestos();
  });
  document.getElementById('btnAplicarFiltros').addEventListener('click', () => cargarRepuestos(true));
  document.getElementById('btnLimpiarFiltros').addEventListener('click', limpiarFiltros);
  document.getElementById('btnMostrarMas').addEventListener('click', () => cargarRepuestos(false));
  document.getElementById('filtroNombre').addEventListener('keyup', (e) => { if (e.key === 'Enter') cargarRepuestos(); });

  const buscar = () => { document.getElementById('filtroNombre').value = document.getElementById('buscadorGlobal').value; cargarRepuestos(); };
  document.getElementById('btnBuscarGlobal').addEventListener('click', buscar);
  document.getElementById('buscadorGlobal').addEventListener('keyup', (e) => { if (e.key === 'Enter') buscar(); });

  // Delegación de eventos en tarjetas y tablas
  document.addEventListener('click', (e) => {
    const ver = e.target.closest('[data-ver]');
    if (ver) return verDetalle(ver.dataset.ver);
    const add = e.target.closest('[data-add]');
    if (add) { agregarAlCarrito(Number(add.dataset.add)); if (add.closest('.modal')) cerrarModal('modalDetalle'); return; }
    const contactar = e.target.closest('[data-contactar]');
    if (contactar) return contactarAsesorProducto();
    const ed = e.target.closest('[data-editar]');
    if (ed) return editarRepuesto(ed.dataset.editar);
    const del = e.target.closest('[data-eliminar]');
    if (del) return eliminarRepuesto(del.dataset.eliminar);
    const mas = e.target.closest('[data-mas]');
    if (mas) return cambiarCantidad(Number(mas.dataset.mas), 1);
    const menos = e.target.closest('[data-menos]');
    if (menos) return cambiarCantidad(Number(menos.dataset.menos), -1);
    const quitar = e.target.closest('[data-quitar]');
    if (quitar) return quitarDelCarrito(Number(quitar.dataset.quitar));
    const edA = e.target.closest('[data-editar-asesor]');
    if (edA) return editarAsesor(edA.dataset.editarAsesor);
    const delA = e.target.closest('[data-eliminar-asesor]');
    if (delA) return eliminarAsesor(delA.dataset.eliminarAsesor);
    const edC = e.target.closest('[data-editar-categoria]');
    if (edC) return editarCategoria(edC.dataset.editarCategoria);
    const delC = e.target.closest('[data-eliminar-categoria]');
    if (delC) return eliminarCategoria(delC.dataset.eliminarCategoria);
  });

  // WhatsApp / asesores
  document.getElementById('btnWhatsapp').addEventListener('click', () => toggleWaPanel());
  document.getElementById('btnCerrarWa').addEventListener('click', () => toggleWaPanel(false));
  document.getElementById('waBuscar').addEventListener('input', renderListaAsesores);
  document.addEventListener('click', (e) => {
    const w = document.querySelector('.wa-widget');
    if (w && !w.contains(e.target)) toggleWaPanel(false);
  });

  // Carrito
  document.getElementById('btnCarrito').addEventListener('click', abrirCarrito);
  document.getElementById('btnCerrarCarrito').addEventListener('click', cerrarCarrito);
  document.getElementById('drawerOverlay').addEventListener('click', cerrarCarrito);
  document.getElementById('btnFinalizarCompra').addEventListener('click', finalizarCompra);
  const btnFinalizarConAsesor = document.getElementById('btnFinalizarConAsesor');
  if (btnFinalizarConAsesor) {
    btnFinalizarConAsesor.addEventListener('click', finalizarConAsesor);
  }
  const btnToggleAsesores = document.getElementById('btnToggleAsesores');
  if (btnToggleAsesores) {
    btnToggleAsesores.addEventListener('click', async (e) => {
      e.stopPropagation();
      const abriendo = document.getElementById('asesorDropdown').classList.contains('oculto');
      if (abriendo) {
        if (!state.carrito.length) return toast('Agrega repuestos a tu pedido');
        if (!state.asesores.length) await cargarAsesoresCatalogo();
        renderAsesorDropdown();
      }
      toggleAsesorDropdown(abriendo);
    });
  }
  const asesorDropdown = document.getElementById('asesorDropdown');
  if (asesorDropdown) {
    asesorDropdown.addEventListener('click', (e) => {
      const item = e.target.closest('[data-asesor-id]');
      if (item) finalizarConAsesorElegido(item.dataset.asesorId);
    });
  }
  document.addEventListener('click', (e) => {
    const grupo = document.querySelector('.finalizar-asesor');
    if (grupo && !grupo.contains(e.target)) toggleAsesorDropdown(false);
  });

  // Admin
  document.getElementById('btnNuevoRepuesto').addEventListener('click', abrirModalRepuesto);
  document.getElementById('formRepuesto').addEventListener('submit', guardarRepuesto);
  document.getElementById('repCategoria').addEventListener('change', actualizarCategoriaNueva);
  document.getElementById('btnLogout').addEventListener('click', cerrarSesion);
  document.getElementById('btnAgregarCompat').addEventListener('click', () => {
    const fila = agregarFilaCompat();
    fila.querySelector('.compat-marca').focus();
  });
  // Compatibilidad: cambios en los select de marca/modelo y botones de las filas
  document.getElementById('compatLista').addEventListener('change', (e) => {
    const fila = e.target.closest('.compat-row');
    if (!fila) return;
    if (e.target.classList.contains('compat-marca')) {
      const valor = e.target.value;
      const selModelo = fila.querySelector('.compat-modelo');
      if (valor === COMPAT_NUEVA_MARCA) {
        selModelo.innerHTML = '<option value="">Primero crea la marca</option>';
        mostrarFormNuevaMarca(fila);
      } else {
        const modeloActual = selModelo.value;
        selModelo.innerHTML = opcionesModelos(valor, modeloActual);
        if (selModelo.value !== modeloActual) selModelo.value = '';
        ocultarExtra(fila);
      }
      actualizarInfoModelos();
    } else if (e.target.classList.contains('compat-modelo')) {
      if (e.target.value === COMPAT_NUEVO_MODELO) {
        const selMarca = fila.querySelector('.compat-marca');
        if (!selMarca.value || String(selMarca.value).startsWith('__')) {
          e.target.value = '';
          return toast('Primero selecciona o crea la marca');
        }
        mostrarFormNuevoModelo(fila);
      } else {
        ocultarExtra(fila);
      }
      actualizarInfoModelos();
    }
  });
  document.getElementById('compatLista').addEventListener('click', (e) => {
    const fila = e.target.closest('.compat-row');
    if (!fila) return;
    if (e.target.closest('.compat-quitar')) {
      fila.remove();
      actualizarInfoModelos();
      return;
    }
    if (e.target.closest('.compat-cancelar')) {
      // Devuelve los select a su estado válido
      const selMarca = fila.querySelector('.compat-marca');
      if (String(selMarca.value).startsWith('__')) selMarca.value = '';
      const selModelo = fila.querySelector('.compat-modelo');
      if (String(selModelo.value).startsWith('__')) selModelo.value = '';
      ocultarExtra(fila);
      actualizarInfoModelos();
      return;
    }
    if (e.target.closest('.compat-crear-marca')) {
      crearMarcaDesdeFila(fila, e.target.closest('.compat-crear-marca'));
      return;
    }
    if (e.target.closest('.compat-crear-modelo')) {
      crearModeloDesdeFila(fila, e.target.closest('.compat-crear-modelo'));
      return;
    }
  });
  document.getElementById('repImagen').addEventListener('input', (e) => actualizarPreviewImagen(e.target.value));
  document.getElementById('repMarcaNueva').addEventListener('input', (e) => {
    const inp = e.target;
    const valor = inp.value.trim();
    inp.classList.toggle('activo', valor.length > 0);
    if (!valor) return;
    // Si coincide con una marca existente, la seleccionamos automaticamente
    const sel = document.getElementById('repMarca');
    const match = Array.from(sel.options).find((o) => o.textContent.toLowerCase() === valor.toLowerCase());
    if (match) { sel.value = match.value; inp.classList.remove('activo'); }
  });
  document.getElementById('btnExportar').addEventListener('click', async () => {
    try { const r = await sendJSON(`${API}/export/json`, 'POST'); toast(r.mensaje); } catch (e) { toast(e.message); }
  });
  document.getElementById('btnActualizarDatos').addEventListener('click', () => document.getElementById('inputExcel').click());
  document.getElementById('inputExcel').addEventListener('change', alSeleccionarExcel);
  document.getElementById('btnDescargarExcel').addEventListener('click', descargarExcel);
  document.getElementById('btnExportarCsv').addEventListener('click', descargarCsv);
  document.getElementById('btnPlantilla').addEventListener('click', () => window.open(`${API}/import/plantilla`, '_blank'));

  // Admin · filtros de la tabla de repuestos (server-side, con debounce)
  document.getElementById('adminBuscarRepuesto').addEventListener('input', (e) => buscarAdmin(e.target.value));
  document.getElementById('adminFiltroCategoria').addEventListener('change', (e) => {
    state.adminFiltros.categoria = e.target.value;
    state.adminFiltros.pagina = 1;
    cargarTablaAdmin();
  });
  document.getElementById('adminFiltroStock').addEventListener('change', (e) => {
    state.adminFiltros.stock = e.target.value;
    state.adminFiltros.pagina = 1;
    cargarTablaAdmin();
  });
  document.getElementById('adminOrdenRepuestos').addEventListener('change', (e) => {
    state.adminFiltros.orden = e.target.value;
    state.adminFiltros.pagina = 1;
    cargarTablaAdmin();
  });
  document.getElementById('btnLimpiarFiltrosAdmin').addEventListener('click', limpiarFiltrosAdmin);
  document.getElementById('btnLimpiarBusquedaAdmin').addEventListener('click', () => {
    document.getElementById('adminBuscarRepuesto').value = '';
    state.adminFiltros.q = '';
    state.adminFiltros.pagina = 1;
    clearTimeout(adminDebounce);
    cargarTablaAdmin();
    document.getElementById('adminBuscarRepuesto').focus();
  });
  document.getElementById('btnAdminAnterior').addEventListener('click', () => cambiarPaginaAdmin(-1));
  document.getElementById('btnAdminSiguiente').addEventListener('click', () => cambiarPaginaAdmin(1));

  // Admin · pestañas y asesores
  document.querySelectorAll('[data-admin-tab]').forEach((b) => b.addEventListener('click', () => cambiarAdminTab(b.dataset.adminTab)));
  document.getElementById('btnNuevoAsesor').addEventListener('click', abrirModalAsesor);
  document.getElementById('formAsesor').addEventListener('submit', guardarAsesor);
  document.getElementById('btnLogout2').addEventListener('click', cerrarSesion);

  // Admin · filtros de la tabla de asesores
  document.getElementById('adminBuscarAsesor').addEventListener('input', (e) => {
    state.adminFiltroAsesores.q = e.target.value;
    renderTablaAsesores();
  });
  document.getElementById('adminFiltroEstadoAsesor').addEventListener('change', (e) => {
    state.adminFiltroAsesores.estado = e.target.value;
    renderTablaAsesores();
  });
  document.getElementById('btnLimpiarFiltrosAsesores').addEventListener('click', limpiarFiltrosAsesores);
  document.getElementById('btnLimpiarBusquedaAdminAsesor').addEventListener('click', () => {
    document.getElementById('adminBuscarAsesor').value = '';
    state.adminFiltroAsesores.q = '';
    renderTablaAsesores();
    document.getElementById('adminBuscarAsesor').focus();
  });

  // Admin · categorías
  document.getElementById('btnNuevaCategoria').addEventListener('click', abrirModalCategoria);
  document.getElementById('formCategoria').addEventListener('submit', guardarCategoria);
  document.getElementById('btnLogout3').addEventListener('click', cerrarSesion);
  document.getElementById('adminBuscarCategoria').addEventListener('input', (e) => {
    state.adminFiltroCategorias.q = e.target.value;
    renderTablaCategorias();
  });
  document.getElementById('btnLimpiarBusquedaAdminCategoria').addEventListener('click', () => {
    document.getElementById('adminBuscarCategoria').value = '';
    state.adminFiltroCategorias.q = '';
    renderTablaCategorias();
    document.getElementById('adminBuscarCategoria').focus();
  });

  // Login
  document.getElementById('formLogin').addEventListener('submit', hacerLogin);
  document.getElementById('btnVerPass').addEventListener('click', () => {
    const inp = document.getElementById('loginPassword');
    const ver = inp.type === 'password';
    inp.type = ver ? 'text' : 'password';
    document.querySelector('#btnVerPass i').className = ver ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
  });

  // Reintento de conexión
  document.getElementById('btnReintentar').addEventListener('click', arrancar);

  // Arranque (espera a que la API esté lista: evita la carrera al abrir el navegador)
  arrancar();

  // Vigilante de conexión: auto-recupera la página si el API se cae y vuelve
  if (!watchdogId) watchdogId = setInterval(chequearConexion, 10000);
});
