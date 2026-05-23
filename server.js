require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static('.'));

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const JWT_SECRET = process.env.JWT_SECRET;

// Middleware to authenticate JWT
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

// Auth Routes
app.post('/api/register', async (req, res) => {
    try {
        const { username, password, role, phone } = req.body || {};
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await pool.query(
            'INSERT INTO users (username, password, role, phone) VALUES ($1, $2, $3, $4) RETURNING id, username, role',
            [username, hashedPassword, role, phone]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Register error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body || {};
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' });
        }
        const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        const user = result.rows[0];
        if (!user) return res.status(400).json({ error: 'User not found' });

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) return res.status(400).json({ error: 'Invalid password' });

        const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET);
        res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Rider Management (Admin only)
app.get('/api/riders', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    try {
        const result = await pool.query("SELECT id, username, phone, created_at FROM users WHERE role = 'rider' ORDER BY created_at DESC");
        res.json(result.rows);
    } catch (err) {
        console.error('Fetch riders error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/riders', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    const { username, password, phone } = req.body || {};
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
    }
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await pool.query(
            "INSERT INTO users (username, password, role, phone) VALUES ($1, $2, 'rider', $3) RETURNING id, username, role, phone",
            [username, hashedPassword, phone]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Create rider error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/riders/:id', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    const { username, password, phone } = req.body || {};
    try {
        let query, params;
        if (password) {
            const hashedPassword = await bcrypt.hash(password, 10);
            query = "UPDATE users SET username = $1, password = $2, phone = $3 WHERE id = $4 AND role = 'rider' RETURNING id, username, phone";
            params = [username, hashedPassword, phone, req.params.id];
        } else {
            query = "UPDATE users SET username = $1, phone = $2 WHERE id = $3 AND role = 'rider' RETURNING id, username, phone";
            params = [username, phone, req.params.id];
        }
        const result = await pool.query(query, params);
        if (result.rowCount === 0) return res.status(404).json({ error: 'Rider not found' });
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Update rider error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/riders/:id', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    try {
        await pool.query("UPDATE errands SET rider_id = NULL WHERE rider_id = $1", [req.params.id]);
        await pool.query("DELETE FROM users WHERE id = $1 AND role = 'rider'", [req.params.id]);
        res.sendStatus(204);
    } catch (err) {
        console.error('Delete rider error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Errand Routes
app.post('/api/errands', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    const { client_name, client_phone, pickup_location, delivery_location, delivery_lat, delivery_lng, notes } = req.body || {};
    try {
        const result = await pool.query(
            'INSERT INTO errands (admin_id, client_name, client_phone, pickup_location, delivery_location, delivery_lat, delivery_lng, notes) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
            [req.user.id, client_name, client_phone, pickup_location, delivery_location, parseFloat(delivery_lat), parseFloat(delivery_lng), notes]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Create errand error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/errands', authenticateToken, async (req, res) => {
    try {
        let result;
        if (req.user.role === 'admin') {
            result = await pool.query('SELECT * FROM errands ORDER BY created_at DESC');
        } else {
            result = await pool.query("SELECT * FROM errands WHERE status = 'pending' OR rider_id = $1 ORDER BY created_at DESC", [req.user.id]);
        }
        res.json(result.rows);
    } catch (err) {
        console.error('Fetch errands error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/errands/:id/accept', authenticateToken, async (req, res) => {
    if (req.user.role !== 'rider') return res.sendStatus(403);
    try {
        const result = await pool.query(
            "UPDATE errands SET rider_id = $1, status = 'accepted' WHERE id = $2 AND status = 'pending' RETURNING *",
            [req.user.id, req.params.id]
        );
        if (result.rowCount === 0) return res.status(400).json({ error: 'Errand not available' });
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Accept errand error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/errands/:id/complete', authenticateToken, async (req, res) => {
    if (req.user.role !== 'rider') return res.sendStatus(403);
    try {
        const result = await pool.query(
            "UPDATE errands SET status = 'completed' WHERE id = $1 AND rider_id = $2 AND status = 'accepted' RETURNING *",
            [req.params.id, req.user.id]
        );
        if (result.rowCount === 0) return res.status(400).json({ error: 'Errand cannot be completed' });
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Complete errand error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Contact Routes
app.post('/api/contacts', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    const { name, phone, lat, lng, address } = req.body || {};
    try {
        const result = await pool.query(
            'INSERT INTO contacts (admin_id, name, phone, lat, lng, address) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
            [req.user.id, name, phone, parseFloat(lat), parseFloat(lng), address]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Create contact error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/contacts', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    try {
        const result = await pool.query('SELECT * FROM contacts WHERE admin_id = $1 ORDER BY name ASC', [req.user.id]);
        res.json(result.rows);
    } catch (err) {
        console.error('Fetch contacts error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/contacts/:id', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    const { name, phone, lat, lng, address } = req.body || {};
    try {
        const result = await pool.query(
            'UPDATE contacts SET name = $1, phone = $2, lat = $3, lng = $4, address = $5 WHERE id = $6 AND admin_id = $7 RETURNING *',
            [name, phone, parseFloat(lat), parseFloat(lng), address, req.params.id, req.user.id]
        );
        if (result.rowCount === 0) return res.status(404).json({ error: 'Contact not found' });
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Update contact error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/contacts/:id', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    try {
        const result = await pool.query('DELETE FROM contacts WHERE id = $1 AND admin_id = $2', [req.params.id, req.user.id]);
        if (result.rowCount === 0) return res.status(404).json({ error: 'Contact not found' });
        res.sendStatus(204);
    } catch (err) {
        console.error('Delete contact error:', err);
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));