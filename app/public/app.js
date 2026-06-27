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
  });
});

document.getElementById('search-cliente').addEventListener('input', renderClientes);
document.getElementById('filter-estado').addEventListener('change', renderClientes);
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
    document.getElementById('nav-templates').style.display = 'none';
    document.getElementById('nav-vendedoras').style.display = 'none';
  }
  loadClientes();
}

async function api(url, method = 'GET', body = null, auth = true) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth && token) headers['Authorization'] = 'Bearer ' + token;
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : null });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error');
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

function renderClientes() {
  const search = document.getElementById('search-cliente').value.toLowerCase();
  const estado = document.getElementById('filter-estado').value;
  let filtered = clientesData.filter(c => {
    const matchSearch = c.cliente.toLowerCase().includes(search) || (c.nombre_producto || '').toLowerCase().includes(search);
    const matchEstado = !estado || c.estado === estado;
    return matchSearch && matchEstado;
  });

  const container = document.getElementById('clientes-list');
  if (!filtered.length) {
    container.innerHTML = '<div class="empty-state"><p>No hay clientes que mostrar</p></div>';
    return;
  }
  container.innerHTML = filtered.map(c => `
    <div class="card estado-${c.estado}">
      <div class="card-left">
        <div class="card-title">${c.cliente}</div>
        <div class="card-sub">${c.nombre_producto || c.producto_id}</div>
        <div class="card-info">📱 ${c.telefono}</div>
        <div class="card-info">👤 ${c.vendedora}</div>
        <div class="card-info">📨 Mensajes enviados: ${c.mensajes_enviados || 0} | Último: #${c.ultimo_n_mensaje || 0}</div>
        <div class="card-info" style="margin-top:8px">
          <span class="badge badge-${c.estado}">${estadoLabel(c.estado)}</span>
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
      </div>
    </div>
  `).join('');
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
  const isAdmin = userInfo.rol === 'superadmin';

  document.getElementById('templates-list').innerHTML = filtered.map(t => `
    <div class="template-card" id="template-${t.id}">
      <div class="template-header">
        <div>
          <strong>${t.producto_nombre}</strong>
          <span class="template-meta"> — Mensaje #${t.n_mensaje} | Día ${t.dia_envio} | ${t.tipo_mensaje}</span>
          <span class="badge ${t.activo ? 'badge-activo' : 'badge-suspendido'}" style="margin-left:8px">${t.activo ? 'Activo' : 'Inactivo'}</span>
        </div>
        ${isAdmin ? `<button class="btn btn-secondary btn-sm" onclick="editTemplate(${t.id})">Editar</button>` : ''}
      </div>
      <div class="template-texto" id="texto-${t.id}">${t.texto_mensaje}</div>
    </div>
  `).join('');
}

function editTemplate(id) {
  const t = templatesData.find(x => x.id === id);
  openModal('Editar Template', `
    <div class="form-group">
      <label>${t.producto_nombre} — Mensaje #${t.n_mensaje} (Día ${t.dia_envio})</label>
    </div>
    <div class="form-group">
      <label>Texto del mensaje</label>
      <textarea class="template-textarea" id="edit-texto" rows="6">${t.texto_mensaje}</textarea>
    </div>
    <div class="form-group">
      <label>Estado</label>
      <select id="edit-activo">
        <option value="true" ${t.activo ? 'selected' : ''}>Activo</option>
        <option value="false" ${!t.activo ? 'selected' : ''}>Inactivo</option>
      </select>
    </div>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="saveTemplate(${id})">Guardar</button>
    </div>
  `);
}

async function saveTemplate(id) {
  const texto_mensaje = document.getElementById('edit-texto').value;
  const activo = document.getElementById('edit-activo').value === 'true';
  try {
    await api(`/api/templates/${id}`, 'PUT', { texto_mensaje, activo });
    closeModal();
    loadTemplates();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function loadVendedoras() {
  try {
    vendedorasData = await api('/api/vendedoras');
    renderVendedoras();
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
  container.innerHTML = vendedorasData.map(v => `
    <div class="vendedora-card ${!v.activa ? 'vendedora-inactive' : ''}">
      <div class="card-title" style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        ${v.nombre_visible}
        <span class="badge ${v.rol === 'superadmin' ? 'badge-recompro' : 'badge-activo'}">${v.rol}</span>
        ${!v.activa ? '<span class="badge badge-no_quiere">Inactiva</span>' : ''}
      </div>
      <div class="card-info">👤 Odoo: ${v.nombre_odoo}</div>
      <div class="card-info">📱 ${v.celular_wp}</div>
      <div class="card-info">🤳 Instancia: ${v.instancia_evolution || '—'}</div>
      <div class="card-actions" style="margin-top:12px">
        <button class="btn btn-secondary btn-sm" onclick="editVendedora(${v.id})">Editar</button>
      </div>
    </div>
  `).join('');
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
      <label>Nombre en Odoo</label>
      <input type="text" id="v-odoo" value="${v?.nombre_odoo || ''}">
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
    nombre_odoo: document.getElementById('v-odoo').value,
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

function openModal(title, body) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = body;
  document.getElementById('modal').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal').classList.add('hidden');
}
