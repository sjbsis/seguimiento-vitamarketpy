const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: false
});

const JWT_SECRET = process.env.JWT_SECRET;

function authMiddleware(req, res, next) {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No autorizado' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido' });
  }
}

function adminOnly(req, res, next) {
  if (req.user.rol !== 'superadmin') return res.status(403).json({ error: 'Solo superadmin' });
  next();
}

// Login
app.post('/api/login', async (req, res) => {
  const { celular, password } = req.body;
  try {
    const result = await pool.query(
      'SELECT * FROM vendedoras WHERE celular_wp = $1 AND activa = true LIMIT 1',
      [celular]
    );
    const user = result.rows[0];
    if (!user || !user.password_hash) return res.status(401).json({ error: 'Credenciales incorrectas' });
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Credenciales incorrectas' });
    const token = jwt.sign(
      { id: user.id, nombre: user.nombre_visible, rol: user.rol },
      JWT_SECRET,
      { expiresIn: '8h' }
    );
    res.json({ token, nombre: user.nombre_visible, rol: user.rol });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Clientes en seguimiento
app.get('/api/clientes', authMiddleware, async (req, res) => {
  const { desde, hasta } = req.query;
  try {
    let conditions = req.user.rol === 'superadmin' ? [] : [`cs.vendedora IN (SELECT nombre_odoo FROM vendedores_odoo WHERE vendedora_id = $1)`];
    let params = req.user.rol === 'superadmin' ? [] : [req.user.id];

    if (desde) { params.push(desde); conditions.push(`cs.updated_at >= $${params.length}`); }
    if (hasta) { params.push(hasta + ' 23:59:59'); conditions.push(`cs.updated_at <= $${params.length}`); }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const query = `
      SELECT cs.*,
        (SELECT COUNT(*) FROM mensajes_enviados me WHERE me.nro_factura = cs.nro_factura AND me.producto_id = cs.producto_id) as mensajes_enviados,
        (SELECT me.mensaje FROM mensajes_enviados me WHERE me.nro_factura = cs.nro_factura AND me.producto_id = cs.producto_id ORDER BY me.n_mensaje DESC LIMIT 1) as ultimo_mensaje,
        (SELECT COALESCE(MAX(me.n_mensaje), 0) FROM mensajes_enviados me WHERE me.nro_factura = cs.nro_factura AND me.producto_id = cs.producto_id) as ultimo_n_mensaje_real,
        (SELECT MAX(me.fecha_envio) FROM mensajes_enviados me WHERE me.nro_factura = cs.nro_factura AND me.producto_id = cs.producto_id) as ultimo_envio,
        CASE WHEN cs.fecha_factura IS NOT NULL THEN (CURRENT_DATE - cs.fecha_factura) END as dias_transcurridos,
        (SELECT MIN(mt.dia_envio) FROM mensajes_templates mt
           WHERE mt.producto_id = cs.producto_id
           AND mt.n_mensaje > 1
           AND mt.activo = true
           AND cs.fecha_factura IS NOT NULL
           AND mt.dia_envio > (CURRENT_DATE - cs.fecha_factura)
        ) as proximo_dia_envio
      FROM clientes_seguimiento cs
      ${where}
      ORDER BY cs.updated_at DESC`;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Actualizar estado cliente
app.put('/api/clientes/:nro_factura/:producto_id/estado', authMiddleware, async (req, res) => {
  const { nro_factura, producto_id } = req.params;
  const { estado } = req.body;
  const estadosValidos = ['activo', 'recompro', 'no_quiere', 'suspendido'];
  if (!estadosValidos.includes(estado)) return res.status(400).json({ error: 'Estado inválido' });
  try {
    await pool.query(
      'UPDATE clientes_seguimiento SET estado = $1, updated_at = NOW() WHERE nro_factura = $2 AND producto_id = $3',
      [estado, nro_factura, producto_id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Templates
app.get('/api/templates', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT mt.*, p.nombre as producto_nombre
       FROM mensajes_templates mt
       JOIN productos p ON p.id = mt.producto_id
       ORDER BY p.nombre, mt.n_mensaje`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/templates', authMiddleware, adminOnly, async (req, res) => {
  const { producto_id, n_mensaje, dia_envio, tipo_mensaje, texto_mensaje, activo } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO mensajes_templates (producto_id, n_mensaje, dia_envio, tipo_mensaje, texto_mensaje, activo) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
      [producto_id, n_mensaje, dia_envio, tipo_mensaje, texto_mensaje, activo !== false]
    );
    res.json({ id: result.rows[0].id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/templates/:id', authMiddleware, adminOnly, async (req, res) => {
  const { producto_id, n_mensaje, dia_envio, tipo_mensaje, texto_mensaje, activo } = req.body;
  try {
    await pool.query(
      'UPDATE mensajes_templates SET producto_id=$1, n_mensaje=$2, dia_envio=$3, tipo_mensaje=$4, texto_mensaje=$5, activo=$6 WHERE id=$7',
      [producto_id, n_mensaje, dia_envio, tipo_mensaje, texto_mensaje, activo, req.params.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/templates/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    await pool.query('DELETE FROM mensajes_templates WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Vendedoras (solo superadmin)
app.get('/api/vendedoras', authMiddleware, adminOnly, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, nombre_visible, instancia_evolution, celular_wp, activa, rol FROM vendedoras ORDER BY nombre_visible'
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/vendedoras', authMiddleware, adminOnly, async (req, res) => {
  const { nombre_visible, instancia_evolution, celular_wp, password, rol } = req.body;
  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO vendedoras (nombre_visible, instancia_evolution, celular_wp, activa, password_hash, rol) VALUES ($1,$2,$3,true,$4,$5) RETURNING id',
      [nombre_visible, instancia_evolution, celular_wp, hash, rol || 'vendedora']
    );
    res.json({ id: result.rows[0].id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/vendedoras/:id', authMiddleware, adminOnly, async (req, res) => {
  const { nombre_visible, instancia_evolution, celular_wp, activa, password, rol } = req.body;
  try {
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      await pool.query(
        'UPDATE vendedoras SET nombre_visible=$1, instancia_evolution=$2, celular_wp=$3, activa=$4, password_hash=$5, rol=$6 WHERE id=$7',
        [nombre_visible, instancia_evolution, celular_wp, activa, hash, rol, req.params.id]
      );
    } else {
      await pool.query(
        'UPDATE vendedoras SET nombre_visible=$1, instancia_evolution=$2, celular_wp=$3, activa=$4, rol=$5 WHERE id=$6',
        [nombre_visible, instancia_evolution, celular_wp, activa, rol, req.params.id]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Vendedores Odoo (mapeo)
app.get('/api/vendedores-odoo', authMiddleware, adminOnly, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT vo.id, vo.nombre_odoo, vo.activo, vo.vendedora_id, v.nombre_visible
      FROM vendedores_odoo vo
      JOIN vendedoras v ON v.id = vo.vendedora_id
      ORDER BY v.nombre_visible, vo.nombre_odoo
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/vendedores-odoo', authMiddleware, adminOnly, async (req, res) => {
  const { nombre_odoo, vendedora_id } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO vendedores_odoo (nombre_odoo, vendedora_id) VALUES ($1, $2) RETURNING id',
      [nombre_odoo.trim(), vendedora_id]
    );
    res.json({ id: result.rows[0].id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/vendedores-odoo/:id', authMiddleware, adminOnly, async (req, res) => {
  const { nombre_odoo, vendedora_id, activo } = req.body;
  try {
    await pool.query(
      'UPDATE vendedores_odoo SET nombre_odoo = $1, vendedora_id = $2, activo = $3 WHERE id = $4',
      [nombre_odoo.trim(), vendedora_id, activo, req.params.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/vendedores-odoo/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    await pool.query('DELETE FROM vendedores_odoo WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Cambiar contraseña propia
app.put('/api/mi-password', authMiddleware, async (req, res) => {
  const { password_actual, password_nuevo } = req.body;
  try {
    const result = await pool.query('SELECT password_hash FROM vendedoras WHERE id = $1', [req.user.id]);
    const user = result.rows[0];
    const valid = await bcrypt.compare(password_actual, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Contraseña actual incorrecta' });
    const hash = await bcrypt.hash(password_nuevo, 10);
    await pool.query('UPDATE vendedoras SET password_hash = $1 WHERE id = $2', [hash, req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Productos
app.get('/api/productos', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, nombre, nombre_odoo FROM productos ORDER BY nombre');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/productos/:id', authMiddleware, adminOnly, async (req, res) => {
  const { nombre } = req.body;
  try {
    await pool.query('UPDATE productos SET nombre = $1 WHERE id = $2', [nombre, req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/productos', authMiddleware, adminOnly, async (req, res) => {
  const { nombre } = req.body;
  try {
    const result = await pool.query('INSERT INTO productos (nombre) VALUES ($1) RETURNING id', [nombre]);
    res.json({ id: result.rows[0].id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Productos Odoo (mapeo)
app.get('/api/productos-odoo', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT po.id, po.nombre_odoo, po.activo, po.producto_id, p.nombre as producto_nombre
      FROM productos_odoo po
      JOIN productos p ON p.id = po.producto_id
      ORDER BY p.nombre, po.nombre_odoo
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/productos-odoo', authMiddleware, adminOnly, async (req, res) => {
  const { nombre_odoo, producto_id } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO productos_odoo (nombre_odoo, producto_id) VALUES ($1, $2) RETURNING id',
      [nombre_odoo.trim(), producto_id]
    );
    res.json({ id: result.rows[0].id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/productos-odoo/:id', authMiddleware, adminOnly, async (req, res) => {
  const { nombre_odoo, producto_id, activo } = req.body;
  try {
    await pool.query(
      'UPDATE productos_odoo SET nombre_odoo = $1, producto_id = $2, activo = $3 WHERE id = $4',
      [nombre_odoo.trim(), producto_id, activo, req.params.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/productos-odoo/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    await pool.query('DELETE FROM productos_odoo WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Revendedoras (NO reciben mensajes de seguimiento)
app.get('/api/revendedoras', authMiddleware, adminOnly, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, nombre_odoo, numerotelefono, activo FROM revendedoras ORDER BY nombre_odoo');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/revendedoras', authMiddleware, adminOnly, async (req, res) => {
  const { nombre_odoo, numerotelefono } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO revendedoras (nombre_odoo, numerotelefono) VALUES ($1, $2) RETURNING id',
      [nombre_odoo.trim(), numerotelefono || null]
    );
    res.json({ id: result.rows[0].id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/revendedoras/:id', authMiddleware, adminOnly, async (req, res) => {
  const { nombre_odoo, numerotelefono, activo } = req.body;
  try {
    await pool.query(
      'UPDATE revendedoras SET nombre_odoo = $1, numerotelefono = $2, activo = $3 WHERE id = $4',
      [nombre_odoo.trim(), numerotelefono || null, activo, req.params.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Marcar un cliente del seguimiento como revendedora (la agrega y la saca del seguimiento)
app.post('/api/revendedoras/desde-cliente', authMiddleware, adminOnly, async (req, res) => {
  const { cliente } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'INSERT INTO revendedoras (nombre_odoo) VALUES ($1) ON CONFLICT (nombre_odoo) DO NOTHING',
      [cliente.trim()]
    );
    await client.query(
      `DELETE FROM mensajes_enviados WHERE seguimiento_id IN (SELECT id FROM clientes_seguimiento WHERE cliente = $1)`,
      [cliente]
    );
    await client.query('DELETE FROM clientes_seguimiento WHERE cliente = $1', [cliente]);
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

app.delete('/api/revendedoras/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    await pool.query('DELETE FROM revendedoras WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Tipos de mensaje (catálogo)
app.get('/api/tipos-mensaje', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, nombre, activo FROM tipos_mensaje ORDER BY nombre');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/tipos-mensaje', authMiddleware, adminOnly, async (req, res) => {
  const { nombre } = req.body;
  try {
    const result = await pool.query('INSERT INTO tipos_mensaje (nombre) VALUES ($1) RETURNING id', [nombre.trim()]);
    res.json({ id: result.rows[0].id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/tipos-mensaje/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    await pool.query('DELETE FROM tipos_mensaje WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Configuracion (variables de mensajes)
app.get('/api/config', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query('SELECT clave, valor, descripcion FROM config ORDER BY clave');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/config', authMiddleware, adminOnly, async (req, res) => {
  const valores = req.body; // { clave: valor, ... }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const [clave, valor] of Object.entries(valores)) {
      await client.query('UPDATE config SET valor = $1 WHERE clave = $2', [valor, clave]);
    }
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

app.listen(process.env.PORT || 3000, () => console.log('Servidor corriendo en puerto 3000'));
