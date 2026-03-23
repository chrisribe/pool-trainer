var http = require('http');
var fs = require('fs');
var path = require('path');
var os = require('os');
var crypto = require('crypto');
var QRCode = require('qrcode');
var { Server } = require('socket.io');

var PORT = parseInt(process.env.PORT, 10) || 3001;
var PIN = process.env.PIN || '';     // empty = no auth
var COOKIE_SECRET = process.env.COOKIE_SECRET || crypto.randomBytes(32).toString('hex');
var COOKIE_NAME = 'pt_auth';
var COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days in seconds
var MIME = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.svg': 'image/svg+xml'
};

// ── PIN Auth ──
function signValue(val) {
    return val + '.' + crypto.createHmac('sha256', COOKIE_SECRET).update(val).digest('base64url');
}

function verifySignedValue(signed) {
    if (!signed) return null;
    var idx = signed.lastIndexOf('.');
    if (idx < 1) return null;
    var val = signed.substring(0, idx);
    if (signValue(val) === signed) return val;
    return null;
}

function parseCookies(req) {
    var cookies = {};
    var header = req.headers.cookie || '';
    header.split(';').forEach(function (part) {
        var eq = part.indexOf('=');
        if (eq > 0) cookies[part.substring(0, eq).trim()] = decodeURIComponent(part.substring(eq + 1).trim());
    });
    return cookies;
}

function isAuthed(req) {
    if (!PIN) return true;  // no PIN configured = open access
    var cookies = parseCookies(req);
    var val = verifySignedValue(cookies[COOKIE_NAME]);
    return val === 'ok';
}

function setAuthCookie(res) {
    var signed = signValue('ok');
    var cookie = COOKIE_NAME + '=' + signed + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + COOKIE_MAX_AGE;
    if (process.env.NODE_ENV === 'production') cookie += '; Secure';
    res.setHeader('Set-Cookie', cookie);
}

function serveLogin(res, error, returnTo) {
    var loginPath = path.join(__dirname, 'views', 'login.html');
    fs.readFile(loginPath, 'utf8', function (err, html) {
        if (err) { res.writeHead(500); res.end('Login page not found'); return; }
        html = html.replace('{{ERROR}}', error ? '<div class="err">' + error + '</div>' : '');
        html = html.replace('{{RETURN_TO}}', returnTo || '/');
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(html);
    });
}

function parseFormBody(req, cb) {
    var body = '';
    req.on('data', function (chunk) {
        if (body.length > 2000) { req.destroy(); return; }
        body += chunk;
    });
    req.on('end', function () {
        var params = {};
        body.split('&').forEach(function (pair) {
            var eq = pair.indexOf('=');
            if (eq > 0) params[decodeURIComponent(pair.substring(0, eq))] = decodeURIComponent(pair.substring(eq + 1).replace(/\+/g, ' '));
        });
        cb(params);
    });
}

var server = http.createServer(function (req, res) {
    // ── Login POST ──
    if (req.url === '/login' && req.method === 'POST') {
        parseFormBody(req, function (params) {
            // Only allow relative redirects
            var returnTo = (params.return_to && params.return_to.startsWith('/')) ? params.return_to : '/';
            if (params.pin === PIN) {
                setAuthCookie(res);
                res.writeHead(302, { 'Location': returnTo });
                res.end();
            } else {
                serveLogin(res, 'Wrong PIN', returnTo);
            }
        });
        return;
    }

    // ── Auth gate (skip socket.io path) ──
    if (PIN && !req.url.startsWith('/socket.io') && !isAuthed(req)) {
        serveLogin(res, null, req.url);
        return;
    }

    // API: QR code for remote control URL
    if (req.url.startsWith('/api/remote-qr')) {
        var qrParams = new URL(req.url, 'http://localhost').searchParams;
        var session = qrParams.get('session') || '';
        var baseUrl = process.env.PUBLIC_URL || ('http://' + getLocalIP() + ':' + PORT);
        var remoteUrl = baseUrl + '/remote' + (session ? '?session=' + encodeURIComponent(session) : '');
        QRCode.toDataURL(remoteUrl, { width: 256, margin: 1, color: { dark: '#ffffff', light: '#00000000' } }, function (err, dataUrl) {
            if (err) {
                res.writeHead(500);
                res.end('QR generation failed');
                return;
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ qr: dataUrl, url: remoteUrl }));
        });
        return;
    }

    // API: Save drill (PUT = update existing, POST = add new)
    var drillMatch = req.url.match(/^\/api\/drills\/([a-z0-9-]+)(?:\/(\d+))?$/);
    if (drillMatch && (req.method === 'PUT' || req.method === 'POST')) {
        var catId = drillMatch[1];
        var drillIdx = drillMatch[2] !== undefined ? parseInt(drillMatch[2], 10) : null;
        var drillFile = path.join(__dirname, 'drills', catId + '.json');

        // Validate category file exists
        if (!fs.existsSync(drillFile)) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Category not found' }));
            return;
        }

        var body = '';
        req.on('data', function (chunk) {
            if (body.length > 100000) { req.destroy(); return; } // 100KB limit
            body += chunk;
        });
        req.on('end', function () {
            try {
                var drillData = JSON.parse(body);
                var raw = fs.readFileSync(drillFile, 'utf8').replace(/^\uFEFF/, '');
                var existing = JSON.parse(raw);

                if (req.method === 'PUT' && drillIdx !== null) {
                    // Update existing drill at index
                    if (drillIdx < 0 || drillIdx >= existing.length) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Invalid drill index' }));
                        return;
                    }
                    existing[drillIdx] = drillData;
                } else {
                    // Append new drill
                    existing.push(drillData);
                    drillIdx = existing.length - 1;
                }

                fs.writeFileSync(drillFile, JSON.stringify(existing, null, 2) + '\n');
                console.log((req.method === 'PUT' ? 'Updated' : 'Added') + ' drill ' + catId + '[' + drillIdx + ']: ' + drillData.name);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true, index: drillIdx }));
            } catch (e) {
                console.error('Drill save error:', e.message);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: e.message }));
            }
        });
        return;
    }

    // Remote control page
    var rawUrl = req.url.split('?')[0];
    if (rawUrl === '/remote') {
        var remotePath = path.join(__dirname, 'views', 'remote.html');
        fs.readFile(remotePath, function (err, data) {
            if (err) { res.writeHead(500); res.end('Remote page not found'); return; }
            res.writeHead(200, {
                'Content-Type': 'text/html',
                'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
                'Pragma': 'no-cache'
            });
            res.end(data);
        });
        return;
    }

    // Static files
    var url = rawUrl === '/' ? '/index.html' : rawUrl;
    // Prevent path traversal
    var safePath = path.normalize(url).replace(/^(\.\.[\/\\])+/, '');
    var filePath = path.join(__dirname, safePath);

    // Ensure the resolved path is within the project directory
    if (!filePath.startsWith(__dirname)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    fs.readFile(filePath, function (err, data) {
        if (err) {
            res.writeHead(404);
            res.end('Not found');
            return;
        }
        var ext = path.extname(filePath).toLowerCase();
        var headers = { 'Content-Type': MIME[ext] || 'application/octet-stream' };
        res.writeHead(200, headers);
        res.end(data);
    });
});

// ── Socket.IO relay ──
var io = new Server(server, {
    cors: { origin: '*' },
    pingInterval: 10000,
    pingTimeout: 5000
});

function clientSummary() {
    var mains = 0, remotes = 0;
    io.sockets.sockets.forEach(function (s) {
        if (s.role === 'main') mains++;
        else if (s.role === 'remote') remotes++;
    });
    return mains + ' main, ' + remotes + ' remote (' + io.sockets.sockets.size + ' total)';
}

io.on('connection', function (socket) {
    var role = socket.handshake.query.role || 'unknown';
    var session = socket.handshake.query.session || '';
    socket.role = role;
    socket.session = session;

    // Join session-scoped rooms for isolation
    if (session) {
        socket.join(session + '-' + role);
    } else {
        socket.join(role);
    }
    console.log('+ ' + role + (session ? ' [' + session + ']' : '') + '  ' + clientSummary());

    // Relay: remote → main, main → remote (scoped to session)
    socket.on('cmd', function (data) {
        var target = role === 'remote' ? 'main' : 'remote';
        var room = session ? (session + '-' + target) : target;
        socket.to(room).emit('cmd', data);
    });

    // Test echo
    socket.on('ping-test', function (data) {
        socket.emit('pong-test', { n: data.n, t: data.t, serverT: Date.now() });
    });

    socket.on('disconnect', function (reason) {
        console.log('- ' + role + (session ? ' [' + session + ']' : '') + '  reason=' + reason + '  ' + clientSummary());
    });
});

// Get local network IP for QR code / remote URL
// Skip virtual adapters (WSL, Docker, VPN) — prefer real WiFi/Ethernet
function getLocalIP() {
    var interfaces = os.networkInterfaces();
    var candidates = [];
    for (var name in interfaces) {
        // Skip virtual/internal adapters
        if (/loopback|vethernet|wsl|docker|vmware|virtualbox|hyper-v/i.test(name)) continue;
        var iface = interfaces[name];
        for (var i = 0; i < iface.length; i++) {
            if (iface[i].family === 'IPv4' && !iface[i].internal && !iface[i].address.startsWith('169.254.')) {
                candidates.push(iface[i].address);
            }
        }
    }
    // Prefer 192.168.x.x or 10.x.x.x (typical home/office networks)
    for (var j = 0; j < candidates.length; j++) {
        if (candidates[j].startsWith('192.168.') || candidates[j].startsWith('10.')) return candidates[j];
    }
    return candidates[0] || 'localhost';
}

server.listen(PORT, function () {
    var ip = getLocalIP();
    console.log('Pool Trainer running at http://localhost:' + PORT);
    console.log('Remote control: http://' + ip + ':' + PORT + '/remote');
    if (PIN) console.log('PIN auth enabled');
    if (process.env.PUBLIC_URL) console.log('Public URL: ' + process.env.PUBLIC_URL);
});
