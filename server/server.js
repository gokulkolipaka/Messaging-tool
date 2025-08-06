const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const cors = require('cors');
const helmet = require('helmet');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../')));

// File upload configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = path.join(__dirname, '../uploads');
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({ storage });

// Database setup
const db = new sqlite3.Database('messenger.db');

db.serialize(() => {
    // Users table
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        phone TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        password TEXT NOT NULL,
        isAdmin BOOLEAN DEFAULT 0,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    
    // Groups table
    db.run(`CREATE TABLE IF NOT EXISTS groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        icon TEXT,
        createdBy INTEGER,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (createdBy) REFERENCES users(id)
    )`);
    
    // Group members table
    db.run(`CREATE TABLE IF NOT EXISTS group_members (
        groupId INTEGER,
        userId INTEGER,
        joinedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (groupId, userId),
        FOREIGN KEY (groupId) REFERENCES groups(id),
        FOREIGN KEY (userId) REFERENCES users(id)
    )`);
    
    // Messages table
    db.run(`CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chatId INTEGER NOT NULL,
        senderId INTEGER NOT NULL,
        type TEXT DEFAULT 'text',
        content TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (senderId) REFERENCES users(id)
    )`);
    
    // Settings table
    db.run(`CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
    )`);
    
    // Insert default admin user if not exists
    const adminPassword = bcrypt.hashSync('admin123', 10);
    db.run(`INSERT OR IGNORE INTO users (phone, name, password, isAdmin) VALUES ('admin', 'Administrator', ?, 1)`, [adminPassword]);
});

// JWT verification middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) return res.sendStatus(401);
    
    jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

// Check intranet access
const checkIntranet = (req) => {
    // Check if request is from company intranet
    const clientIP = req.ip || req.connection.remoteAddress;
    // Add your company IP ranges here
    const companyRanges = ['192.168.', '10.0.', '172.16.'];
    return companyRanges.some(range => clientIP.startsWith(range));
};

// API Routes

// Auth routes
app.post('/api/auth/login', (req, res) => {
    const { phone, password } = req.body;
    
    if (!checkIntranet(req)) {
        return res.status(403).json({ success: false, message: 'Access denied. Not on company intranet.' });
    }
    
    db.get('SELECT * FROM users WHERE phone = ?', [phone], (err, user) => {
        if (err) return res.status(500).json({ success: false, message: 'Database error' });
        
        if (!user || !bcrypt.compareSync(password, user.password)) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
        
        const token = jwt.sign(
            { userId: user.id, phone: user.phone, isAdmin: user.isAdmin },
            process.env.JWT_SECRET || 'your-secret-key',
            { expiresIn: '24h' }
        );
        
        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                phone: user.phone,
                name: user.name,
                isAdmin: user.isAdmin
            }
        });
    });
});

app.get('/api/auth/check-intranet', (req, res) => {
    res.json({ isIntranet: checkIntranet(req) });
});

// Chat routes
app.get('/api/chats', authenticateToken, (req, res) => {
    // Get user's chats (both direct and group chats)
    const query = `
        SELECT g.id as chatId, g.name, g.icon as avatar,
               (SELECT content FROM messages WHERE chatId = g.id ORDER BY timestamp DESC LIMIT 1) as lastMessage,
               (SELECT COUNT(*) FROM messages WHERE chatId = g.id AND id > 
                (SELECT lastReadMessageId FROM user_chat_status WHERE userId = ? AND chatId = g.id)) as unreadCount
        FROM groups g
        JOIN group_members gm ON g.id = gm.groupId
        WHERE gm.userId = ?
        ORDER BY lastMessage DESC
    `;
    
    db.all(query, [req.user.userId, req.user.userId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.get('/api/chats/:chatId/messages', authenticateToken, (req, res) => {
    const chatId = req.params.chatId;
    
    db.all(
        `SELECT m.*, u.name as sender, u.phone as senderPhone
         FROM messages m
         JOIN users u ON m.senderId = u.id
         WHERE m.chatId = ?
         ORDER BY m.timestamp ASC`,
        [chatId],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        }
    );
});

// Contacts routes
app.get('/api/contacts', authenticateToken, (req, res) => {
    db.all(
        'SELECT id, name, phone FROM users WHERE id != ?',
        [req.user.userId],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        }
    );
});

app.get('/api/contacts/search', authenticateToken, (req, res) => {
    const query = req.query.q;
    db.all(
        'SELECT id, name, phone FROM users WHERE name LIKE ? OR phone LIKE ?',
        [`%${query}%`, `%${query}%`],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        }
    );
});

// Groups routes
app.post('/api/groups', authenticateToken, upload.single('icon'), (req, res) => {
    const { name, members } = req.body;
    const memberIds = JSON.parse(members);
    
    db.run(
        'INSERT INTO groups (name, icon, createdBy) VALUES (?, ?, ?)',
        [name, req.file ? req.file.filename : null, req.user.userId],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            
            const groupId = this.lastID;
            
            // Add creator as member
            memberIds.push(req.user.userId);
            
            const stmt = db.prepare('INSERT INTO group_members (groupId, userId) VALUES (?, ?)');
            memberIds.forEach(userId => {
                stmt.run(groupId, userId);
            });
            stmt.finalize();
            
            res.json({ success: true, groupId });
        }
    );
});

// Upload routes
app.post('/api/upload', authenticateToken, upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    
    res.json({ url: `/uploads/${req.file.filename}` });
});

// Settings routes
app.get('/api/settings', (req, res) => {
    db.all('SELECT * FROM settings', (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        
        const settings = {};
        rows.forEach(row => {
            settings[row.key] = row.value;
        });
        res.json(settings);
    });
});

// Admin routes
app.get('/api/admin/users', authenticateToken, (req, res) => {
    if (!req.user.isAdmin) return res.sendStatus(403);
    
    db.all('SELECT * FROM users', (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.delete('/api/admin/users/:id', authenticateToken, (req, res) => {
    if (!req.user.isAdmin) return res.sendStatus(403);
    
    db.run('DELETE FROM users WHERE id = ?', [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.post('/api/admin/users/:id/make-admin', authenticateToken, (req, res) => {
    if (!req.user.isAdmin) return res.sendStatus(403);
    
    db.run('UPDATE users SET isAdmin = 1 WHERE id = ?', [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.get('/api/admin/groups', authenticateToken, (req, res) => {
    if (!req.user.isAdmin) return res.sendStatus(403);
    
    const query = `
        SELECT g.*, COUNT(gm.userId) as memberCount
        FROM groups g
        LEFT JOIN group_members gm ON g.id = gm.groupId
        GROUP BY g.id
    `;
    
    db.all(query, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.delete('/api/admin/groups/:id', authenticateToken, (req, res) => {
    if (!req.user.isAdmin) return res.sendStatus(403);
    
    db.run('DELETE FROM groups WHERE id = ?', [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.get('/api/admin/settings', authenticateToken, (req, res) => {
    if (!req.user.isAdmin) return res.sendStatus(403);
    
    db.all('SELECT * FROM settings', (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        
        const settings = {};
        rows.forEach(row => {
            settings[row.key] = row.value;
        });
        res.json(settings);
    });
});

app.post('/api/admin/settings', authenticateToken, (req, res) => {
    if (!req.user.isAdmin) return res.sendStatus(403);
    
    const settings = req.body;
    
    const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    Object.keys(settings).forEach(key => {
        stmt.run(key, settings[key].toString());
    });
    stmt.finalize();
    
    res.json({ success: true });
});

app.post('/api/admin/upload-logo', authenticateToken, upload.single('logo'), (req, res) => {
    if (!req.user.isAdmin) return res.sendStatus(403);
    
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    
    db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', 
        ['logo', `/uploads/logos/${req.file.filename}`], 
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        }
    );
});

// Socket.io connection handling
io.on('connection', (socket) => {
    const token = socket.handshake.auth.token;
    
    if (!token) {
        socket.disconnect();
        return;
    }
    
    jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, user) => {
        if (err) {
            socket.disconnect();
            return;
        }
        
        socket.userId = user.userId;
        
        socket.on('send_message', (data) => {
            const { chatId, type, content } = data;
            
            db.run(
                'INSERT INTO messages (chatId, senderId, type, content) VALUES (?, ?, ?, ?)',
                [chatId, socket.userId, type, content],
                function(err) {
                    if (err) {
                        console.error('Error saving message:', err);
                        return;
                    }
                    
                    // Broadcast to all users in the chat
                    db.all(
                        'SELECT userId FROM group_members WHERE groupId = ?',
                        [chatId],
                        (err, members) => {
                            if (err) return;
                            
                            const message = {
                                id: this.lastID,
                                chatId,
                                senderId: socket.userId,
                                type,
                                content,
                                timestamp: new Date().toISOString()
                            };
                            
                            members.forEach(member => {
                                io.to(`user_${member.userId}`).emit('new_message', { message });
                            });
                        }
                    );
                }
            );
        });
        
        socket.join(`user_${socket.userId}`);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
