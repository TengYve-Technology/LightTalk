const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3002;

// In-memory storage
const users = new Map();
const messages = [];
const rooms = new Map();
const connectedClients = new Map();
const userConnections = new Map(); // username -> Set of response objects
const tokens = new Map(); // token -> username

// Default admin
users.set('admin', {
    id: 'admin-uuid',
    username: 'admin',
    passwordHash: 'admin123',
    displayName: '系统管理员',
    role: 'admin',
    status: 'offline'
});

const server = http.createServer((req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    
    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }
    
    // Parse URL
    const url = new URL(req.url, 'http://' + req.headers.host);
    const pathname = url.pathname;
    
    // API endpoints
    if (pathname.startsWith('/api/')) {
        handleApi(req, res, pathname, url);
        return;
    }
    
    // SSE endpoint for real-time updates
    if (pathname === '/events') {
        handleSSE(req, res);
        return;
    }
    
    // Serve static files
    let filePath = path.join(__dirname, '..', 'public', pathname === '/' ? 'index.html' : pathname);
    filePath = path.normalize(filePath);
    if (!filePath.startsWith(path.join(__dirname, '..', 'public'))) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }
    
    fs.readFile(filePath, (err, data) => {
        if (err) {
            if (err.code === 'ENOENT') {
                if (pathname !== '/' && !path.extname(pathname)) {
                    fs.readFile(path.join(__dirname, '..', 'public', 'index.html'), (err2, data2) => {
                        if (err2) {
                            res.writeHead(404);
                            res.end('Not Found');
                        } else {
                            res.setHeader('Content-Type', 'text/html; charset=utf-8');
                            res.writeHead(200);
                            res.end(data2);
                        }
                    });
                } else {
                    res.writeHead(404);
                    res.end('Not Found');
                }
            } else {
                res.writeHead(500);
                res.end('Server Error');
            }
            return;
        }
        
        const ext = path.extname(filePath);
        const mimeTypes = {
            '.html': 'text/html',
            '.css': 'text/css',
            '.js': 'application/javascript',
            '.json': 'application/json',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.gif': 'image/gif',
            '.svg': 'image/svg+xml',
            '.ico': 'image/x-icon'
        };
        const ct = mimeTypes[ext] || 'application/octet-stream'; 
        res.setHeader('Content-Type', ct + (ext ==='.html' || ext ==='.css' || ext ==='.js' ? '; charset=utf-8' : ''));
        res.writeHead(200);
        res.end(data);
    });
});

function getUserFromToken(auth) {
    if (!auth) return null;
    const token = auth.replace('Bearer ', '');
    const username = tokens.get(token);
    if (!username) return null;
    return users.get(username) || null;
}

function handleApi(req, res, pathname, url) {
    const method = req.method;
    
    let body = '';
    req.on('data', chunk => { body += chunk.toString('utf8'); });
    req.on('end', () => {
        try {
            const data = body ? JSON.parse(body) : {};
            
            if (pathname === '/api/auth/login' && method === 'POST') {
                const { username, password } = data;
                const user = users.get(username);
                if (user && user.passwordHash === password) {
                    user.status = 'online';
                    users.set(username, user);
                    broadcastUserStatus(username, 'online');
                    const token = 'token-' + crypto.randomUUID();
                    tokens.set(token, username);
                    sendJson(res, {
                        success: true,
                        user: { id: user.id, username: user.username, displayName: user.displayName, role: user.role },
                        token: token
                    });
                } else {
                    sendJson(res, { success: false, error: '用户名或密码错误' }, 401);
                }
            }
            else if (pathname === '/api/auth/register' && method === 'POST') {
                const { username, password, displayName } = data;
                if (!username || !password) return sendJson(res, { success: false, error: '请填写用户名和密码' }, 400);
                if (username.length < 3 || username.length > 20) return sendJson(res, { success: false, error: '用户名长度3-20位' }, 400);
                if (users.has(username)) return sendJson(res, { success: false, error: '用户名已存在' }, 400);
                const newUser = {
                    id: crypto.randomUUID(),
                    username,
                    passwordHash: password,
                    displayName: displayName || username,
                    role: 'user',
                    status: 'online'
                };
                users.set(username, newUser);
                broadcastUserStatus(username, 'online');
                const token = 'token-' + crypto.randomUUID();
                tokens.set(token, username);
                sendJson(res, {
                    success: true,
                    user: { id: newUser.id, username: newUser.username, displayName: newUser.displayName, role: newUser.role },
                    token: token
                });
            }
            else if (pathname === '/api/auth/logout' && method === 'POST') {
                const auth = req.headers.authorization;
                if (auth) {
                    const token = auth.replace('Bearer ', '');
                    const username = tokens.get(token);
                    if (username) {
                        tokens.delete(token);
                        const user = users.get(username);
                        if (user) {
                            user.status = 'offline';
                            users.set(username, user);
                            broadcastUserStatus(username, 'offline');
                        }
                    }
                }
                sendJson(res, { success: true });
            }
            else if (pathname === '/api/rooms' && method === 'GET') {
                const user = getUserFromToken(req.headers.authorization);
                if (!user) return sendJson(res, { success: false, error: '未授权' }, 401);
                const roomList = Array.from(rooms.values()).map(r => ({
                    id: r.id,
                    name: r.name,
                    description: r.description,
                    userCount: r.users ? r.users.size : 0,
                    createdAt: r.createdAt
                }));
                sendJson(res, { success: true, rooms: roomList });
            }
            else if (pathname === '/api/rooms' && method === 'POST') {
                const user = getUserFromToken(req.headers.authorization);
                if (!user) return sendJson(res, { success: false, error: '未授权' }, 401);
                const { name, description } = data;
                if (!name) return sendJson(res, { success: false, error: '房间名称不能为空' }, 400);
                const room = {
                    id: crypto.randomUUID(),
                    name,
                    description: description || '',
                    users: new Set(),
                    createdAt: new Date().toISOString()
                };
                rooms.set(room.id, room);
                sendJson(res, { success: true, room });
            }
            else if (pathname.startsWith('/api/rooms/') && method === 'DELETE') {
                const user = getUserFromToken(req.headers.authorization);
                if (!user) return sendJson(res, { success: false, error: '未授权' }, 401);
                if (user.role !== 'admin') return sendJson(res, { success: false, error: '无权限' }, 403);
                const roomId = pathname.split('/')[3];
                if (rooms.has(roomId)) {
                    rooms.delete(roomId);
                    sendJson(res, { success: true });
                } else {
                    sendJson(res, { success: false, error: '房间不存在' }, 404);
                }
            }
            else if (pathname === '/api/messages' && method === 'GET') {
                const user = getUserFromToken(req.headers.authorization);
                if (!user) return sendJson(res, { success: false, error: '未授权' }, 401);
                const roomId = url.searchParams.get('roomId') || 'lobby';
                const offset = parseInt(url.searchParams.get('offset')) || 0;
                const limit = parseInt(url.searchParams.get('limit')) || 50;
                const roomMessages = messages.filter(m => m.roomId === roomId && !m.deleted)
                    .slice(offset, offset + limit)
                    .map(m => ({
                        id: m.id,
                        roomId: m.roomId,
                        username: m.username,
                        displayName: m.displayName,
                        content: m.content,
                        type: m.type,
                        replyTo: m.replyTo,
                        createdAt: m.createdAt
                    }));
                sendJson(res, { success: true, messages: roomMessages });
            }
            else if (pathname === '/api/messages' && method === 'POST') {
                const user = getUserFromToken(req.headers.authorization);
                if (!user) return sendJson(res, { success: false, error: '未授权' }, 401);
                
                const roomId = data.roomId || 'lobby';
                const content = data.content || '';
                const replyToId = data.replyTo;
                let replyTo = null;
                if (replyToId) {
                    replyTo = messages.find(m => m.id === replyToId);
                }
                
                const message = {
                    id: crypto.randomUUID(),
                    roomId,
                    username: user.username,
                    displayName: user.displayName,
                    content,
                    type: 'text',
                    replyTo: replyTo ? { id: replyTo.id, username: replyTo.username, displayName: replyTo.displayName, content: replyTo.content } : null,
                    createdAt: new Date().toISOString()
                };
                messages.push(message);
                broadcastMessage(message);
                sendJson(res, { success: true, message });
            }
            else if (pathname === '/api/messages/upload' && method === 'POST') {
                // File upload handling would need multipart/form-data parsing
                // Simplified for now
                sendJson(res, { success: false, error: '文件上传暂未实现' }, 501);
            }
            else if (pathname.startsWith('/api/messages/') && method === 'DELETE') {
                const user = getUserFromToken(req.headers.authorization);
                if (!user) return sendJson(res, { success: false, error: '未授权' }, 401);
                
                const messageId = pathname.split('/')[3];
                const msg = messages.find(m => m.id === messageId);
                if (!msg) return sendJson(res, { success: false, error: '消息不存在' }, 404);
                if (msg.username !== user.username && user.role !== 'admin') {
                    return sendJson(res, { success: false, error: '无权限删除' }, 403);
                }
                msg.deleted = true;
                broadcastMessage({ ...msg, deleted: true });
                sendJson(res, { success: true });
            }
            else if (pathname === '/api/users' && method === 'GET') {
                const user = getUserFromToken(req.headers.authorization);
                if (!user) return sendJson(res, { success: false, error: '未授权' }, 401);
                const userList = Array.from(users.values()).map(u => ({
                    username: u.username,
                    displayName: u.displayName,
                    role: u.role,
                    status: u.status
                }));
                sendJson(res, { success: true, users: userList });
            }
            else if (pathname === '/api/user/profile' && method === 'GET') {
                const user = getUserFromToken(req.headers.authorization);
                if (!user) return sendJson(res, { success: false, error: '未授权' }, 401);
                sendJson(res, { success: true, user: { id: user.id, username: user.username, displayName: user.displayName, role: user.role, avatar: user.avatar } });
            }
            else if (pathname === '/api/user/profile' && method === 'PUT') {
                const user = getUserFromToken(req.headers.authorization);
                if (!user) return sendJson(res, { success: false, error: '未授权' }, 401);
                const { displayName } = data;
                if (displayName) {
                    user.displayName = displayName;
                    users.set(user.username, user);
                }
                sendJson(res, { success: true, user: { id: user.id, username: user.username, displayName: user.displayName, role: user.role } });
            }
            else if (pathname === '/api/user/password' && method === 'PUT') {
                const user = getUserFromToken(req.headers.authorization);
                if (!user) return sendJson(res, { success: false, error: '未授权' }, 401);
                const { currentPassword, newPassword } = data;
                if (user.passwordHash !== currentPassword) {
                    return sendJson(res, { success: false, error: '当前密码错误' }, 400);
                }
                if (newPassword.length < 6) {
                    return sendJson(res, { success: false, error: '新密码至少6位' }, 400);
                }
                user.passwordHash = newPassword;
                users.set(user.username, user);
                sendJson(res, { success: true });
            }
            else if (pathname === '/api/user/avatar' && method === 'POST') {
                // Avatar upload handling would need multipart/form-data parsing
                sendJson(res, { success: false, error: '头像上传暂未实现' }, 501);
            }
            else {
                sendJson(res, { success: false, error: 'Not Found' }, 404);
            }
        } catch (e) {
            console.error('API Error:', e);
            sendJson(res, { success: false, error: '服务器错误' }, 500);
        }
    });
}

function handleSSE(req, res) {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
    });
    
    res.write('retry: 3000\n\n');
    
    const url = new URL(req.url, 'http://' + req.headers.host);
    const username = url.searchParams.get('username');
    
    if (username) {
        if (!userConnections.has(username)) userConnections.set(username, new Set());
        userConnections.get(username).add(res);
    }
    
    if (username) {
        const user = users.get(username);
        if (user) {
            const recentMessages = messages.filter(m => m.roomId === 'lobby' && !m.deleted).slice(-50);
            sendSSE(res, 'message_history', recentMessages);
            
            const onlineUsers = Array.from(users.values()).filter(u => u.status === 'online' && u.username !== username)
                .map(u => ({ username: u.username, displayName: u.displayName, role: u.role }));
            sendSSE(res, 'online_users', onlineUsers);
        }
    }
    
    req.on('close', () => {
        if (username && userConnections.has(username)) {
            userConnections.get(username).delete(res);
            if (userConnections.get(username).size === 0) userConnections.delete(username);
        }
    });
}

function sendJson(res, data, status) {
    status = status || 200;
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(data));
}

function sendSSE(res, event, data) {
    res.write('event: ' + event + '\n');
    res.write('data: ' + JSON.stringify(data) + '\n\n');
}

function broadcastMessage(message) {
    userConnections.forEach((connections) => {
        connections.forEach(res => {
            sendSSE(res, 'new_message', message);
        });
    });
}

function broadcastUserStatus(username, status) {
    const data = { username, status };
    userConnections.forEach((connections) => {
        connections.forEach(res => {
            sendSSE(res, 'user_status', data);
        });
    });
}

function broadcastToUser(targetUsername, event, data) {
    const connections = userConnections.get(targetUsername);
    if (connections) {
        connections.forEach(res => {
            sendSSE(res, event, data);
        });
    }
}

setInterval(() => {
    if (messages.length > 500) {
        messages.splice(0, messages.length - 500);
    }
}, 60000);

server.listen(PORT, '0.0.0.0', () => {
    const os = require('os');
    const interfaces = os.networkInterfaces();
    const ips = [];
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) ips.push(iface.address);
        }
    }
    console.log('');
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║                   LAN Chat Server v2.0                       ║');
    console.log('╠══════════════════════════════════════════════════════════════╣');
    console.log('║  本地访问: http://localhost:' + PORT);
    ips.forEach(ip => console.log('║  局域网访问: http://' + ip + ':' + PORT));
    console.log('║                                                              ║');
    console.log('║  管理员账号: admin / admin123                                ║');
    console.log('║  请登录后修改默认密码                                        ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log('');
});

process.on('SIGINT', () => {
    console.log('\n正在关闭服务器...');
    server.close(() => process.exit(0));
});
