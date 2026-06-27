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
      { id: user.id, nombre: user.nombre_visible, rol: user.rol, nombre_odoo: user.nombre_odoo },
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
    let conditions = req.user.rol === 'superadmin' ? [] : [`cs.vendedora = $1`];
    let params = req.user.rol === 'superadmin' ? [] : [req.user.nombre_odoo];

    if (desde) { params.push(desde); conditions.push(`cs.updated_at >= $${params.length}`); }
    if (hasta) { params.push(hasta + ' 23:59:59'); conditions.push(`cs.updated_at <= $${params.length}`); }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const query = `
      SELECT cs.*,
        (SELECT COUNT(*) FROM mensajes_enviados me WHERE me.nro_factura = cs.nro_factura AND me.producto_id = cs.producto_id) as mensajes_enviados,
        (SELECT me.mensaje FROM mensajes_enviados me WHERE me.nro_factura = cs.nro_factura AND me.producto_id = cs.producto_id ORDER BY me.n_mensaje DESC LIMIT 1) as ultimo_mensaje
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

app.put('/api/templates/:id', authMiddleware, adminOnly, async (req, res) => {
  const { texto_mensaje, activo } = req.body;
  try {
    await pool.query(
      'UPDATE mensajes_templates SET texto_mensaje = $1, activo = $2 WHERE id = $3',
      [texto_mensaje, activo, req.params.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Vendedoras (solo superadmin)
app.get('/api/vendedoras', authMiddleware, adminOnly, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, nombre_visible, nombre_odoo, instancia_evolution, celular_wp, activa, rol FROM vendedoras ORDER BY nombre_visible'
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/vendedoras', authMiddleware, adminOnly, async (req, res) => {
  const { nombre_visible, nombre_odoo, instancia_evolution, celular_wp, password, rol } = req.body;
  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO vendedoras (nombre_visible, nombre_odoo, instancia_evolution, celular_wp, activa, password_hash, rol) VALUES ($1,$2,$3,$4,true,$5,$6) RETURNING id',
      [nombre_visible, nombre_odoo, instancia_evolution, celular_wp, hash, rol || 'vendedora']
    );
    res.json({ id: result.rows[0].id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/vendedoras/:id', authMiddleware, adminOnly, async (req, res) => {
  const { nombre_visible, nombre_odoo, instancia_evolution, celular_wp, activa, password, rol } = req.body;
  try {
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      await pool.query(
        'UPDATE vendedoras SET nombre_visible=$1, nombre_odoo=$2, instancia_evolution=$3, celular_wp=$4, activa=$5, password_hash=$6, rol=$7 WHERE id=$8',
        [nombre_visible, nombre_odoo, instancia_evolution, celular_wp, activa, hash, rol, req.params.id]
      );
    } else {
      await pool.query(
        'UPDATE vendedoras SET nombre_visible=$1, nombre_odoo=$2, instancia_evolution=$3, celular_wp=$4, activa=$5, rol=$6 WHERE id=$7',
        [nombre_visible, nombre_odoo, instancia_evolution, celular_wp, activa, rol, req.params.id]
      );
    }
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
    const result = await pool.query('SELECT id, nombre FROM productos ORDER BY nombre');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(process.env.PORT || 3000, () => console.log('Servidor corriendo en puerto 3000'));
