let token = localStorage.getItem('token');
let userInfo = JSON.parse(localStorage.getItem('userInfo') || 'null');
let clientesData = [];
let templatesData = [];
let vendedorasData = [];

if (token && userInfo) {
  showApp();
} else {
  showLogin();
}

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const celular = document.getElementById('celular').value.trim();
  const password = document.getElementById('password').value;
  try {
    const res = await api('/api/login', 'POST', { celular, password }, false);
    token = res.token;
    userInfo = { nombre: res.nombre, rol: res.rol };
    localStorage.setItem('token', token);
    localStorage.setItem('userInfo', JSON.stringify(userInfo));
    showApp();
  } catch (err) {
    document.getElementById('login-error').textContent = err.message || 'Error al ingresar';
  }
});

document.getElementById('logout-btn').addEventListener('click', () => {
  localStorage.clear();
  token = null;
  userInfo = null;
  showLogin();
});

document.querySelectorAll('.nav-btn[data-tab]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn[data-tab]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.tab-content').forEach(t => t.classList.add('hidden'));
    document.getElementById('tab-' + btn.dataset.tab).classList.remove('hidden');
    if (btn.dataset.tab === 'clientes') loadClientes();
    if (btn.dataset.tab === 'templates') loadTemplates();
    if (btn.dataset.tab === 'vendedoras') loadVendedoras();
    if (btn.dataset.tab === 'productos') loadProductosTab();
    if (btn.dataset.tab === 'revendedoras') loadRevendedorasTab();
    if (btn.dataset.tab === 'config') loadConfig();
  });
});

document.getElementById('search-cliente').addEventListener('input', renderClientes);
document.getElementById('filter-estado').addEventListener('change', renderClientes);
document.getElementById('filter-con-mensajes').addEventListener('change', renderClientes);
document.getElementById('filter-hoy').addEventListener('change', renderClientes);
document.getElementById('filter-producto').addEventListener('change', renderTemplates);

document.getElementById('btn-filtrar').addEventListener('click', loadClientes);
document.getElementById('btn-limpiar').addEventListener('click', () => {
  document.getElementById('filter-desde').value = '';
  document.getElementById('filter-hasta').value = '';
  loadClientes();
});

document.getElementById('modal-close').addEventListener('click', closeModal);
document.getElementById('modal').addEventListener('click', (e) => {
  if (e.target === document.getElementById('modal')) closeModal();
});

document.getElementById('cambiar-password-btn').addEventListener('click', () => {
  openModal('Cambiar contraseña', `
    <div class="form-group">
      <label>Contraseña actual</label>
      <input type="password" id="pwd-actual">
    </div>
    <div class="form-group">
      <label>Nueva contraseña</label>
      <input type="password" id="pwd-nuevo">
    </div>
    <div class="form-group">
      <label>Confirmar nueva contraseña</label>
      <input type="password" id="pwd-confirmar">
    </div>
    <p id="pwd-error" class="error-msg"></p>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="guardarPassword()">Guardar</button>
    </div>
  `);
});

async function guardarPassword() {
  const actual = document.getElementById('pwd-actual').value;
  const nuevo = document.getElementById('pwd-nuevo').value;
  const confirmar = document.getElementById('pwd-confirmar').value;
  if (nuevo !== confirmar) {
    document.getElementById('pwd-error').textContent = 'Las contraseñas no coinciden';
    return;
  }
  if (nuevo.length < 6) {
    document.getElementById('pwd-error').textContent = 'La contraseña debe tener al menos 6 caracteres';
    return;
  }
  try {
    await api('/api/mi-password', 'PUT', { password_actual: actual, password_nuevo: nuevo });
    closeModal();
    alert('Contraseña actualizada correctamente');
  } catch (err) {
    document.getElementById('pwd-error').textContent = err.message;
  }
}

function showLogin() {
  document.getElementById('login-page').classList.remove('hidden');
  document.getElementById('app-page').classList.add('hidden');
}

function showApp() {
  document.getElementById('login-page').classList.add('hidden');
  document.getElementById('app-page').classList.remove('hidden');
  document.getElementById('nav-user').textContent = userInfo.nombre;
  if (userInfo.rol !== 'superadmin') {
    // La vendedora SÍ puede: clientes, templates, y VER revendedoras
    document.getElementById('nav-vendedoras').style.display = 'none';
    document.getElementById('nav-productos').style.display = 'none';
    document.getElementById('nav-config').style.display = 'none';
    // Botón de crear revendedora manual: solo admin (la vendedora solo ve la lista)
    const btnNuevaRev = document.getElementById('nueva-revendedora-btn');
    if (btnNuevaRev) btnNuevaRev.style.display = 'none';
  }
  loadClientes();
}

function traducirError(msg) {
  if (!msg) return 'Ocurrió un error.';
  const m = msg.toLowerCase();
  if (m.includes('duplicate key') || m.includes('unique constraint')) return 'Ese registro ya existe (valor duplicado).';
  if (m.includes('foreign key')) return 'No se puede completar: el registro está en uso por otros datos.';
  if (m.includes('null value') || m.includes('not-null')) return 'Faltan campos obligatorios.';
  if (m.includes('invalid input syntax')) return 'Hay un dato con formato inválido.';
  if (m.includes('failed to fetch') || m.includes('networkerror') || m.includes('load failed')) return 'Error de conexión con el servidor.';
  if (m.includes('no autorizado') || m.includes('token')) return 'Sesión expirada. Volvé a iniciar sesión.';
  if (m.includes('credenciales')) return 'Credenciales incorrectas.';
  if (m.includes('solo superadmin')) return 'Solo un administrador puede hacer esta acción.';
  return msg; // ya viene en español desde el backend
}

async function api(url, method = 'GET', body = null, auth = true) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth && token) headers['Authorization'] = 'Bearer ' + token;
  let res, data;
  try {
    res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : null });
    data = await res.json();
  } catch {
    throw new Error('Error de conexión con el servidor.');
  }
  if (!res.ok) throw new Error(traducirError(data.error));
  return data;
}

async function loadClientes() {
  try {
    const desde = document.getElementById('filter-desde').value;
    const hasta = document.getElementById('filter-hasta').value;
    let url = '/api/clientes';
    const params = [];
    if (desde) params.push('desde=' + desde);
    if (hasta) params.push('hasta=' + hasta);
    if (params.length) url += '?' + params.join('&');
    clientesData = await api(url);
    renderClientes();
  } catch (err) {
    document.getElementById('clientes-list').innerHTML = `<p class="error-msg">${err.message}</p>`;
  }
}

function diasParaProximo(c) {
  if (c.mensaje_hoy != null) return 0; // hay un mensaje que se envía HOY
  if (c.proximo_dia_envio === null || c.proximo_dia_envio === undefined) return null;
  if (c.dias_transcurridos === null || c.dias_transcurridos === undefined) return null;
  return c.proximo_dia_envio - c.dias_transcurridos;
}

function semaforo(dias) {
  if (dias === null) return { clase: 'sem-gris', icono: '⚪', texto: 'Sin mensajes pendientes' };
  if (dias <= 0) return { clase: 'sem-rojo', icono: '🔴', texto: 'Se envía HOY' };
  if (dias === 1) return { clase: 'sem-rojo', icono: '🔴', texto: 'Le toca mañana' };
  if (dias <= 3) return { clase: 'sem-amarillo', icono: '🟡', texto: `Faltan ${dias} días` };
  return { clase: 'sem-verde', icono: '🟢', texto: `Faltan ${dias} días` };
}

function renderClientes() {
  const search = document.getElementById('search-cliente').value.toLowerCase();
  const estado = document.getElementById('filter-estado').value;
  const soloConMensajes = document.getElementById('filter-con-mensajes')?.checked;
  const soloHoy = document.getElementById('filter-hoy')?.checked;
  let filtered = clientesData.filter(c => {
    const matchSearch = c.cliente.toLowerCase().includes(search) || (c.nombre_producto || '').toLowerCase().includes(search);
    const matchEstado = !estado || c.estado === estado;
    const matchMensajes = !soloConMensajes || (c.mensajes_enviados || 0) > 0;
    const matchHoy = !soloHoy || c.mensaje_hoy != null;
    return matchSearch && matchEstado && matchMensajes && matchHoy;
  });

  // Contador de los que se envían hoy (sobre todo el universo de clientes activos)
  const totalHoy = clientesData.filter(c => c.mensaje_hoy != null && c.estado === 'activo').length;
  const banner = document.getElementById('hoy-banner');
  if (banner) {
    banner.innerHTML = totalHoy > 0
      ? `📨 <strong>${totalHoy}</strong> mensaje${totalHoy !== 1 ? 's' : ''} se ${totalHoy !== 1 ? 'enviarán' : 'enviará'} hoy a las 9 AM`
      : '✅ Hoy no hay mensajes para enviar';
  }

  // Ordenar por proximidad del próximo mensaje (los que menos faltan primero; los sin pendientes al final)
  filtered.sort((a, b) => {
    const da = diasParaProximo(a), db = diasParaProximo(b);
    if (da === null && db === null) return 0;
    if (da === null) return 1;
    if (db === null) return -1;
    return da - db;
  });

  const container = document.getElementById('clientes-list');
  if (!filtered.length) {
    container.innerHTML = '<div class="empty-state"><p>No hay clientes que mostrar</p></div>';
    return;
  }
  container.innerHTML = filtered.map(c => {
    const dias = diasParaProximo(c);
    const sem = semaforo(dias);
    return `
    <div class="card estado-${c.estado} ${sem.clase}">
      <div class="card-left">
        <div class="card-title">${c.cliente}</div>
        <div class="card-sub">${c.nombre_producto || c.producto_id}</div>
        <div class="card-info">📱 ${c.telefono}</div>
        <div class="card-info">👤 ${c.vendedora}</div>
        <div class="card-info">🧾 Factura: ${c.nro_factura}</div>
        <div class="card-info">📅 Compra: ${formatFecha(c.fecha_factura)}</div>
        <div class="card-info">📨 Mensajes enviados: ${c.mensajes_enviados || 0} | Último: #${c.ultimo_n_mensaje_real ?? c.ultimo_n_mensaje ?? 0}</div>
        <div class="card-info">📤 Último envío: ${c.ultimo_envio ? formatFecha(c.ultimo_envio) : '—'}</div>
        <div class="card-info">⏭️ Próximo envío: ${c.proximo_dia_envio != null ? formatFecha(sumarDias(c.fecha_factura, c.proximo_dia_envio)) : 'Sin pendientes'}</div>
        <div class="card-info" style="margin-top:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <span class="badge badge-${c.estado}">${estadoLabel(c.estado)}</span>
          <span class="badge sem-badge ${sem.clase}">${sem.icono} ${sem.texto}</span>
          ${c.mensaje_hoy != null ? `<span class="badge sem-badge sem-rojo">📨 Hoy: mensaje #${c.mensaje_hoy}</span>` : ''}
        </div>
      </div>
      <div class="card-right">
        <div class="card-mensaje-label">Último mensaje enviado</div>
        <div class="card-mensaje-texto">${c.ultimo_mensaje || 'Sin mensajes aún'}</div>
      </div>
      <div class="card-actions">
        ${c.estado !== 'recompro' ? `<button class="btn btn-success btn-sm" onclick="cambiarEstado('${c.nro_factura}', ${c.producto_id}, 'recompro')">✅ Recompró</button>` : ''}
        ${c.estado !== 'no_quiere' ? `<button class="btn btn-danger btn-sm" onclick="cambiarEstado('${c.nro_factura}', ${c.producto_id}, 'no_quiere')">🚫 No quiere más</button>` : ''}
        ${c.estado !== 'activo' ? `<button class="btn btn-secondary btn-sm" onclick="cambiarEstado('${c.nro_factura}', ${c.producto_id}, 'activo')">↩ Reactivar</button>` : ''}
        <button class="btn btn-purple btn-sm" onclick="marcarRevendedora('${c.cliente.replace(/'/g, "\\'")}')">🔁 Es revendedora</button>
      </div>
    </div>
  `;
  }).join('');
}

async function marcarRevendedora(cliente) {
  if (!confirm(`¿Marcar a "${cliente}" como revendedora? Dejará de recibir mensajes y se quitará del seguimiento.`)) return;
  try {
    await api('/api/revendedoras/desde-cliente', 'POST', { cliente });
    await loadClientes();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

function formatFecha(f) {
  if (!f) return '—';
  if (typeof f === 'string') {
    if (f.includes('/')) return f; // ya viene dd/mm/yyyy (texto de Odoo)
    const m = f.match(/^(\d{4})-(\d{2})-(\d{2})/); // ISO o YYYY-MM-DD → sin desfase de zona horaria
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  }
  const d = new Date(f);
  if (isNaN(d)) return typeof f === 'string' ? f : '—';
  return d.toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function sumarDias(fechaBase, dias) {
  if (!fechaBase || dias === null || dias === undefined) return null;
  let y, mo, da;
  if (typeof fechaBase === 'string') {
    const m = fechaBase.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) { y = +m[1]; mo = +m[2]; da = +m[3]; }
  }
  let base;
  if (y) {
    base = new Date(Date.UTC(y, mo - 1, da));
  } else {
    const tmp = new Date(fechaBase);
    if (isNaN(tmp)) return null;
    base = new Date(Date.UTC(tmp.getFullYear(), tmp.getMonth(), tmp.getDate()));
  }
  base.setUTCDate(base.getUTCDate() + Number(dias));
  const yy = base.getUTCFullYear();
  const mm = String(base.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(base.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`; // formatFecha lo convierte a dd/mm/yyyy
}

function estadoLabel(estado) {
  const labels = { activo: 'Activo', recompro: 'Recompró', no_quiere: 'No quiere más', suspendido: 'Suspendido' };
  return labels[estado] || estado;
}

async function cambiarEstado(nro_factura, producto_id, estado) {
  try {
    await api(`/api/clientes/${encodeURIComponent(nro_factura)}/${producto_id}/estado`, 'PUT', { estado });
    await loadClientes();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function loadTemplates() {
  try {
    templatesData = await api('/api/templates');
    const productos = [...new Set(templatesData.map(t => t.producto_nombre))].sort();
    const select = document.getElementById('filter-producto');
    select.innerHTML = '<option value="">Todos los productos</option>' +
      productos.map(p => `<option value="${p}">${p}</option>`).join('');
    renderTemplates();
  } catch (err) {
    document.getElementById('templates-list').innerHTML = `<p class="error-msg">${err.message}</p>`;
  }
}

function renderTemplates() {
  const filtroProducto = document.getElementById('filter-producto').value;
  const filtered = filtroProducto ? templatesData.filter(t => t.producto_nombre === filtroProducto) : templatesData;

  document.getElementById('templates-list').innerHTML = filtered.map(t => `
    <div class="template-card" id="template-${t.id}">
      <div class="template-header">
        <div>
          <strong>${t.producto_nombre}</strong>
          <span class="template-meta"> — Mensaje #${t.n_mensaje} | Día ${t.dia_envio} | ${t.tipo_mensaje}</span>
          <span class="badge ${t.activo ? 'badge-activo' : 'badge-suspendido'}" style="margin-left:8px">${t.activo ? 'Activo' : 'Inactivo'}</span>
        </div>
        <button class="btn btn-secondary btn-sm" onclick="editTemplate(${t.id})">Editar</button>
      </div>
      <div class="template-texto" id="texto-${t.id}">${t.texto_mensaje}</div>
    </div>
  `).join('');
}

let productosData = [];

async function loadProductos() {
  if (productosData.length) return;
  productosData = await api('/api/productos');
}

let tiposMensajeData = [];
async function loadTiposMensaje(force) {
  if (tiposMensajeData.length && !force) return;
  tiposMensajeData = await api('/api/tipos-mensaje');
}

document.getElementById('nuevo-template-btn')?.addEventListener('click', async () => {
  await loadProductos();
  await loadTiposMensaje(true);
  openModal('Nuevo Template', templateForm(null));
});

function templateForm(t) {
  const productosOpts = productosData.map(p =>
    `<option value="${p.id}" ${t?.producto_id == p.id ? 'selected' : ''}>${p.nombre}</option>`
  ).join('');
  return `
    <div class="form-group">
      <label>Producto</label>
      <select id="t-producto">${productosOpts}</select>
    </div>
    <div class="form-group">
      <label>N° Mensaje (1-5)</label>
      <input type="number" id="t-n_mensaje" value="${t?.n_mensaje || 1}" min="1" max="5">
    </div>
    <div class="form-group">
      <label>Día de envío</label>
      <input type="number" id="t-dia_envio" value="${t?.dia_envio || 0}" min="0">
    </div>
    <div class="form-group">
      <label>Tipo de mensaje</label>
      <select id="t-tipo_mensaje">
        ${tiposMensajeData.map(tm => `<option value="${tm.nombre}" ${t?.tipo_mensaje === tm.nombre ? 'selected' : ''}>${tm.nombre}</option>`).join('')}
      </select>
    </div>
    <div class="form-group">
      <label>Texto del mensaje</label>
      <textarea class="template-textarea" id="t-texto" rows="7">${t?.texto_mensaje || ''}</textarea>
    </div>
    <div class="form-group">
      <label>Estado</label>
      <select id="t-activo">
        <option value="true" ${t?.activo !== false ? 'selected' : ''}>Activo</option>
        <option value="false" ${t?.activo === false ? 'selected' : ''}>Inactivo</option>
      </select>
    </div>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
      ${t ? `<button class="btn btn-danger btn-sm" onclick="deleteTemplate(${t.id})">Eliminar</button>` : ''}
      <button class="btn btn-primary" onclick="saveTemplate(${t?.id || 'null'})">${t ? 'Guardar' : 'Crear'}</button>
    </div>
  `;
}

async function editTemplate(id) {
  await loadProductos();
  await loadTiposMensaje(true);
  const t = templatesData.find(x => x.id === id);
  openModal('Editar Template', templateForm(t));
}

async function saveTemplate(id) {
  const data = {
    producto_id: document.getElementById('t-producto').value,
    n_mensaje: parseInt(document.getElementById('t-n_mensaje').value),
    dia_envio: parseInt(document.getElementById('t-dia_envio').value),
    tipo_mensaje: document.getElementById('t-tipo_mensaje').value,
    texto_mensaje: document.getElementById('t-texto').value,
    activo: document.getElementById('t-activo').value === 'true'
  };
  try {
    if (id === null) {
      await api('/api/templates', 'POST', data);
    } else {
      await api(`/api/templates/${id}`, 'PUT', data);
    }
    closeModal();
    loadTemplates();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function deleteTemplate(id) {
  if (!confirm('¿Eliminar este template?')) return;
  try {
    await api(`/api/templates/${id}`, 'DELETE');
    closeModal();
    loadTemplates();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

let vendedoresOdooData = [];

async function loadVendedoras() {
  try {
    [vendedorasData, vendedoresOdooData] = await Promise.all([
      api('/api/vendedoras'),
      api('/api/vendedores-odoo')
    ]);
    renderVendedoras();
    renderVendedoresOdoo();
  } catch (err) {
    document.getElementById('vendedoras-list').innerHTML = `<p class="error-msg">${err.message}</p>`;
  }
}

function renderVendedoras() {
  const container = document.getElementById('vendedoras-list');
  if (!vendedorasData.length) {
    container.innerHTML = '<div class="empty-state"><p>No hay vendedoras</p></div>';
    return;
  }
  container.innerHTML = vendedorasData.map(v => {
    const countOdoo = vendedoresOdooData.filter(vo => vo.vendedora_id === v.id).length;
    return `
    <div class="vendedora-card ${!v.activa ? 'vendedora-inactive' : ''}">
      <div class="card-title" style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        ${v.nombre_visible}
        <span class="badge ${v.rol === 'superadmin' ? 'badge-recompro' : 'badge-activo'}">${v.rol}</span>
        ${!v.activa ? '<span class="badge badge-no_quiere">Inactiva</span>' : ''}
      </div>
      <div class="card-info">📱 ${v.celular_wp}</div>
      <div class="card-info">🤳 Instancia: ${v.instancia_evolution || '—'}</div>
      <div class="card-info">🔗 ${countOdoo} nombre${countOdoo !== 1 ? 's' : ''} de Odoo asignado${countOdoo !== 1 ? 's' : ''}</div>
      <div class="card-actions" style="margin-top:12px">
        <button class="btn btn-secondary btn-sm" onclick="editVendedora(${v.id})">Editar</button>
      </div>
    </div>
  `;
  }).join('');
}

function renderVendedoresOdoo() {
  const container = document.getElementById('vendedores-odoo-list');
  if (!vendedoresOdooData.length) {
    container.innerHTML = '<div class="empty-state"><p>No hay nombres de Odoo cargados</p></div>';
    return;
  }
  container.innerHTML = `
    <table class="productos-table">
      <thead>
        <tr>
          <th>Nombre del vendedor en Odoo</th>
          <th>Vendedora real (recibe el mensaje)</th>
          <th>Estado</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${vendedoresOdooData.map(vo => `
          <tr>
            <td><code class="odoo-name">${vo.nombre_odoo}</code></td>
            <td><strong>${vo.nombre_visible}</strong></td>
            <td><span class="badge ${vo.activo ? 'badge-activo' : 'badge-suspendido'}">${vo.activo ? 'Activo' : 'Inactivo'}</span></td>
            <td><button class="btn btn-secondary btn-sm" onclick="editVendedorOdoo(${vo.id})">Editar</button></td>
          </tr>`).join('')}
      </tbody>
    </table>
  `;
}

document.getElementById('nuevo-vendedor-odoo-btn')?.addEventListener('click', () => {
  openModal('Agregar Nombre de Odoo', vendedorOdooForm(null));
});

function editVendedorOdoo(id) {
  const vo = vendedoresOdooData.find(x => x.id === id);
  openModal('Editar Nombre Odoo', vendedorOdooForm(vo));
}

function vendedorOdooForm(vo) {
  const opts = vendedorasData.map(v =>
    `<option value="${v.id}" ${vo?.vendedora_id == v.id ? 'selected' : ''}>${v.nombre_visible}</option>`
  ).join('');
  return `
    <div class="form-group">
      <label>Nombre exacto del vendedor en Odoo</label>
      <small style="color:#888;display:block;margin-bottom:6px">Tal como aparece en el campo "vendedor" de la factura (ej: Administrator)</small>
      <input type="text" id="vo-nombre" value="${vo?.nombre_odoo || ''}" placeholder="Ej: Administrator">
    </div>
    <div class="form-group">
      <label>Vendedora real que recibe el mensaje</label>
      <select id="vo-vendedora">${opts}</select>
    </div>
    <div class="form-group">
      <label>Estado</label>
      <select id="vo-activo">
        <option value="true" ${vo?.activo !== false ? 'selected' : ''}>Activo</option>
        <option value="false" ${vo?.activo === false ? 'selected' : ''}>Inactivo</option>
      </select>
    </div>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
      ${vo ? `<button class="btn btn-danger btn-sm" onclick="deleteVendedorOdoo(${vo.id})">Eliminar</button>` : ''}
      <button class="btn btn-primary" onclick="saveVendedorOdoo(${vo?.id || 'null'})">${vo ? 'Guardar' : 'Agregar'}</button>
    </div>
  `;
}

async function saveVendedorOdoo(id) {
  const data = {
    nombre_odoo: document.getElementById('vo-nombre').value,
    vendedora_id: parseInt(document.getElementById('vo-vendedora').value),
    activo: document.getElementById('vo-activo').value === 'true'
  };
  if (!data.nombre_odoo.trim()) { alert('El nombre de Odoo no puede estar vacío'); return; }
  try {
    if (id === null) {
      await api('/api/vendedores-odoo', 'POST', data);
    } else {
      await api(`/api/vendedores-odoo/${id}`, 'PUT', data);
    }
    closeModal();
    loadVendedoras();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function deleteVendedorOdoo(id) {
  if (!confirm('¿Eliminar este nombre de Odoo?')) return;
  try {
    await api(`/api/vendedores-odoo/${id}`, 'DELETE');
    closeModal();
    loadVendedoras();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

document.getElementById('nueva-vendedora-btn').addEventListener('click', () => {
  openModal('Nueva Vendedora', vendedoraForm(null));
});

function editVendedora(id) {
  const v = vendedorasData.find(x => x.id === id);
  openModal('Editar Vendedora', vendedoraForm(v));
}

function vendedoraForm(v) {
  return `
    <div class="form-group">
      <label>Nombre visible</label>
      <input type="text" id="v-nombre" value="${v?.nombre_visible || ''}">
    </div>
    <div class="form-group">
      <label>Celular WhatsApp (para login)</label>
      <input type="text" id="v-celular" value="${v?.celular_wp || ''}">
    </div>
    <div class="form-group">
      <label>Instancia Evolution</label>
      <input type="text" id="v-instancia" value="${v?.instancia_evolution || ''}">
    </div>
    <div class="form-group">
      <label>Rol</label>
      <select id="v-rol">
        <option value="vendedora" ${v?.rol !== 'superadmin' ? 'selected' : ''}>Vendedora</option>
        <option value="superadmin" ${v?.rol === 'superadmin' ? 'selected' : ''}>Superadmin</option>
      </select>
    </div>
    ${v ? `
    <div class="form-group">
      <label>Estado</label>
      <select id="v-activa">
        <option value="true" ${v.activa ? 'selected' : ''}>Activa</option>
        <option value="false" ${!v.activa ? 'selected' : ''}>Inactiva</option>
      </select>
    </div>` : ''}
    <div class="form-group">
      <label>${v ? 'Nueva contraseña (dejar vacío para no cambiar)' : 'Contraseña'}</label>
      <input type="password" id="v-password">
    </div>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="saveVendedora(${v?.id || 'null'})">${v ? 'Guardar' : 'Crear'}</button>
    </div>
  `;
}

async function saveVendedora(id) {
  const data = {
    nombre_visible: document.getElementById('v-nombre').value,
    celular_wp: document.getElementById('v-celular').value,
    instancia_evolution: document.getElementById('v-instancia').value,
    rol: document.getElementById('v-rol').value,
    password: document.getElementById('v-password').value || undefined
  };
  if (id !== null) {
    data.activa = document.getElementById('v-activa').value === 'true';
  }
  try {
    if (id === null) {
      await api('/api/vendedoras', 'POST', data);
    } else {
      await api(`/api/vendedoras/${id}`, 'PUT', data);
    }
    closeModal();
    loadVendedoras();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

// PRODUCTOS
let productosOdooData = [];

async function loadProductosTab() {
  try {
    [productosData, productosOdooData] = await Promise.all([
      api('/api/productos'),
      api('/api/productos-odoo')
    ]);
    renderProductosSistema();
    renderProductosOdoo();
  } catch (err) {
    document.getElementById('productos-list').innerHTML = `<p class="error-msg">${err.message}</p>`;
  }
}

function renderProductosSistema() {
  const container = document.getElementById('productos-list');
  container.innerHTML = `
    <table class="productos-table">
      <thead>
        <tr>
          <th>ID</th>
          <th>Nombre en el Sistema</th>
          <th>Nombres Odoo mapeados</th>
          <th>Templates</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${productosData.map(p => {
          const countTemplates = templatesData.filter(t => t.producto_id === p.id).length;
          const countOdoo = productosOdooData.filter(po => po.producto_id === p.id).length;
          return `
          <tr>
            <td style="color:#888;font-size:12px">${p.id}</td>
            <td><strong>${p.nombre}</strong></td>
            <td><span class="badge ${countOdoo ? 'badge-activo' : 'badge-no_quiere'}">${countOdoo} nombre${countOdoo !== 1 ? 's' : ''} Odoo</span></td>
            <td><span class="badge badge-activo">${countTemplates} template${countTemplates !== 1 ? 's' : ''}</span></td>
            <td><button class="btn btn-secondary btn-sm" onclick="editProducto(${p.id})">Editar</button></td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  `;
}

function renderProductosOdoo() {
  const container = document.getElementById('productos-odoo-list');
  if (!productosOdooData.length) {
    container.innerHTML = '<div class="empty-state"><p>No hay nombres de Odoo cargados</p></div>';
    return;
  }
  container.innerHTML = `
    <table class="productos-table">
      <thead>
        <tr>
          <th>Nombre exacto en Odoo</th>
          <th>Producto del Sistema</th>
          <th>Estado</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${productosOdooData.map(po => `
          <tr>
            <td><code class="odoo-name">${po.nombre_odoo}</code></td>
            <td><strong>${po.producto_nombre}</strong></td>
            <td><span class="badge ${po.activo ? 'badge-activo' : 'badge-suspendido'}">${po.activo ? 'Activo' : 'Inactivo'}</span></td>
            <td><button class="btn btn-secondary btn-sm" onclick="editProductoOdoo(${po.id})">Editar</button></td>
          </tr>`).join('')}
      </tbody>
    </table>
  `;
}

document.getElementById('nuevo-producto-btn')?.addEventListener('click', () => {
  openModal('Nuevo Producto del Sistema', productoForm(null));
});

document.getElementById('nuevo-odoo-btn')?.addEventListener('click', async () => {
  if (!productosData.length) productosData = await api('/api/productos');
  openModal('Agregar Nombre de Odoo', productoOdooForm(null));
});

function editProducto(id) {
  const p = productosData.find(x => x.id === id);
  openModal('Editar Producto', productoForm(p));
}

function editProductoOdoo(id) {
  const po = productosOdooData.find(x => x.id === id);
  openModal('Editar Nombre Odoo', productoOdooForm(po));
}

function productoForm(p) {
  return `
    <div class="form-group">
      <label>Nombre en el Sistema</label>
      <input type="text" id="p-nombre" value="${p?.nombre || ''}">
    </div>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="saveProducto(${p?.id || 'null'})">${p ? 'Guardar' : 'Crear'}</button>
    </div>
  `;
}

function productoOdooForm(po) {
  const opts = productosData.map(p =>
    `<option value="${p.id}" ${po?.producto_id == p.id ? 'selected' : ''}>${p.nombre}</option>`
  ).join('');
  return `
    <div class="form-group">
      <label>Nombre exacto en Odoo</label>
      <small style="color:#888;display:block;margin-bottom:6px">Copiá el texto exacto tal como viene de Odoo (distingue mayúsculas/minúsculas no, pero sí espacios y guiones)</small>
      <input type="text" id="po-nombre" value="${po?.nombre_odoo || ''}" placeholder="Ej: CREATINE EN POLVO - VITAMARKET">
    </div>
    <div class="form-group">
      <label>Producto del Sistema</label>
      <select id="po-producto">${opts}</select>
    </div>
    <div class="form-group">
      <label>Estado</label>
      <select id="po-activo">
        <option value="true" ${po?.activo !== false ? 'selected' : ''}>Activo</option>
        <option value="false" ${po?.activo === false ? 'selected' : ''}>Inactivo</option>
      </select>
    </div>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
      ${po ? `<button class="btn btn-danger btn-sm" onclick="deleteProductoOdoo(${po.id})">Eliminar</button>` : ''}
      <button class="btn btn-primary" onclick="saveProductoOdoo(${po?.id || 'null'})">${po ? 'Guardar' : 'Agregar'}</button>
    </div>
  `;
}

async function saveProducto(id) {
  const data = { nombre: document.getElementById('p-nombre').value };
  try {
    if (id === null) {
      await api('/api/productos', 'POST', data);
    } else {
      await api(`/api/productos/${id}`, 'PUT', data);
    }
    closeModal();
    loadProductosTab();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function saveProductoOdoo(id) {
  const data = {
    nombre_odoo: document.getElementById('po-nombre').value,
    producto_id: parseInt(document.getElementById('po-producto').value),
    activo: document.getElementById('po-activo').value === 'true'
  };
  if (!data.nombre_odoo.trim()) { alert('El nombre de Odoo no puede estar vacío'); return; }
  try {
    if (id === null) {
      await api('/api/productos-odoo', 'POST', data);
    } else {
      await api(`/api/productos-odoo/${id}`, 'PUT', data);
    }
    closeModal();
    loadProductosTab();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function deleteProductoOdoo(id) {
  if (!confirm('¿Eliminar este nombre de Odoo?')) return;
  try {
    await api(`/api/productos-odoo/${id}`, 'DELETE');
    closeModal();
    loadProductosTab();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

// REVENDEDORAS
let revendedorasData = [];

async function loadRevendedorasTab() {
  try {
    revendedorasData = await api('/api/revendedoras');
    renderRevendedoras();
  } catch (err) {
    document.getElementById('revendedoras-list').innerHTML = `<p class="error-msg">${err.message}</p>`;
  }
}

function renderRevendedoras() {
  const container = document.getElementById('revendedoras-list');
  if (!revendedorasData.length) {
    container.innerHTML = '<div class="empty-state"><p>No hay revendedoras cargadas</p></div>';
    return;
  }
  container.innerHTML = `
    <table class="productos-table">
      <thead>
        <tr>
          <th>Nombre del cliente (Odoo)</th>
          <th>Teléfono</th>
          <th>Estado</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${revendedorasData.map(r => `
          <tr>
            <td><strong>${r.nombre_odoo}</strong></td>
            <td>${r.numerotelefono || '—'}</td>
            <td><span class="badge ${r.activo ? 'badge-no_quiere' : 'badge-suspendido'}">${r.activo ? 'Excluida' : 'Inactiva'}</span></td>
            <td>${userInfo.rol === 'superadmin' ? `<button class="btn btn-secondary btn-sm" onclick="editRevendedora(${r.id})">Editar</button>` : ''}</td>
          </tr>`).join('')}
      </tbody>
    </table>
  `;
}

document.getElementById('nueva-revendedora-btn')?.addEventListener('click', () => {
  openModal('Nueva Revendedora', revendedoraForm(null));
});

function editRevendedora(id) {
  const r = revendedorasData.find(x => x.id === id);
  openModal('Editar Revendedora', revendedoraForm(r));
}

function revendedoraForm(r) {
  return `
    <div class="form-group">
      <label>Nombre exacto del cliente en Odoo</label>
      <small style="color:#888;display:block;margin-bottom:6px">Debe coincidir exactamente con el nombre del cliente como viene de Odoo</small>
      <input type="text" id="r-nombre" value="${r?.nombre_odoo || ''}" placeholder="Ej: ADA GONZALEZ">
    </div>
    <div class="form-group">
      <label>Teléfono (opcional)</label>
      <input type="text" id="r-telefono" value="${r?.numerotelefono || ''}">
    </div>
    <div class="form-group">
      <label>Estado</label>
      <select id="r-activo">
        <option value="true" ${r?.activo !== false ? 'selected' : ''}>Excluida (no recibe mensajes)</option>
        <option value="false" ${r?.activo === false ? 'selected' : ''}>Inactiva (sí recibe mensajes)</option>
      </select>
    </div>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
      ${r ? `<button class="btn btn-danger btn-sm" onclick="deleteRevendedora(${r.id})">Eliminar</button>` : ''}
      <button class="btn btn-primary" onclick="saveRevendedora(${r?.id || 'null'})">${r ? 'Guardar' : 'Crear'}</button>
    </div>
  `;
}

async function saveRevendedora(id) {
  const data = {
    nombre_odoo: document.getElementById('r-nombre').value,
    numerotelefono: document.getElementById('r-telefono').value,
    activo: document.getElementById('r-activo').value === 'true'
  };
  if (!data.nombre_odoo.trim()) { alert('El nombre no puede estar vacío'); return; }
  try {
    if (id === null) {
      await api('/api/revendedoras', 'POST', data);
    } else {
      await api(`/api/revendedoras/${id}`, 'PUT', data);
    }
    closeModal();
    loadRevendedorasTab();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function deleteRevendedora(id) {
  if (!confirm('¿Eliminar esta revendedora? Volverá a recibir mensajes de seguimiento.')) return;
  try {
    await api(`/api/revendedoras/${id}`, 'DELETE');
    closeModal();
    loadRevendedorasTab();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

// CONFIGURACION
let configData = [];

async function loadConfig() {
  try {
    configData = await api('/api/config');
    renderConfig();
    await loadTiposMensaje(true);
    renderTiposMensaje();
  } catch (err) {
    document.getElementById('config-list').innerHTML = `<p class="error-msg">${err.message}</p>`;
  }
}

function renderTiposMensaje() {
  const container = document.getElementById('tipos-mensaje-list');
  if (!container) return;
  if (!tiposMensajeData.length) {
    container.innerHTML = '<div class="empty-state"><p>No hay tipos de mensaje cargados</p></div>';
    return;
  }
  container.innerHTML = `
    <table class="productos-table">
      <thead><tr><th>Tipo de mensaje</th><th></th></tr></thead>
      <tbody>
        ${tiposMensajeData.map(tm => `
          <tr>
            <td><strong>${tm.nombre}</strong></td>
            <td><button class="btn btn-danger btn-sm" onclick="eliminarTipoMensaje(${tm.id}, '${tm.nombre.replace(/'/g, "\\'")}')">Eliminar</button></td>
          </tr>`).join('')}
      </tbody>
    </table>
  `;
}

async function agregarTipoMensaje() {
  const input = document.getElementById('nuevo-tipo-input');
  const nombre = input.value.trim();
  if (!nombre) { alert('Escribí un nombre para el tipo de mensaje'); return; }
  try {
    await api('/api/tipos-mensaje', 'POST', { nombre });
    input.value = '';
    await loadTiposMensaje(true);
    renderTiposMensaje();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function eliminarTipoMensaje(id, nombre) {
  if (!confirm(`¿Eliminar el tipo "${nombre}"? Los templates que ya lo usan no se modifican.`)) return;
  try {
    await api(`/api/tipos-mensaje/${id}`, 'DELETE');
    await loadTiposMensaje(true);
    renderTiposMensaje();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

document.getElementById('agregar-tipo-btn')?.addEventListener('click', agregarTipoMensaje);

function renderConfig() {
  const container = document.getElementById('config-list');
  container.innerHTML = configData.map(c => `
    <div class="config-row">
      <label class="config-label">
        <code>[${c.clave === 'x_dias' ? 'X días' : c.clave === 'codigo' ? 'código' : c.clave}]</code>
        <small>${c.descripcion || ''}</small>
      </label>
      <input type="text" class="filter-input config-input" data-clave="${c.clave}" value="${(c.valor || '').replace(/"/g, '&quot;')}">
    </div>
  `).join('');
}

async function guardarConfig() {
  const valores = {};
  document.querySelectorAll('.config-input').forEach(inp => {
    valores[inp.dataset.clave] = inp.value;
  });
  try {
    await api('/api/config', 'PUT', valores);
    alert('Configuración guardada');
    loadConfig();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

document.getElementById('guardar-config-btn')?.addEventListener('click', guardarConfig);

function openModal(title, body) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = body;
  document.getElementById('modal').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal').classList.add('hidden');
}
