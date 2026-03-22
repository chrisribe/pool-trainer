var http = require('http');
var fs = require('fs');
var path = require('path');
var os = require('os');
var QRCode = require('qrcode');
var { Server } = require('socket.io');

var PORT = 3001;
var MIME = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.svg': 'image/svg+xml'
};

var server = http.createServer(function (req, res) {
    // API: QR code for remote control URL
    if (req.url === '/api/remote-qr') {
        var ip = getLocalIP();
        var remoteUrl = 'http://' + ip + ':' + PORT + '/remote.html';
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

    var rawUrl = req.url.split('?')[0];
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
        if (safePath === '/remote.html' || safePath === '/remote.js') {
            headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0';
            headers['Pragma'] = 'no-cache';
            headers['Expires'] = '0';
        }
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
    socket.role = role;
    socket.join(role);
    console.log('+ ' + role + '  ' + clientSummary());

    // Relay: remote → main, main → remote
    socket.on('cmd', function (data) {
        socket.to(role === 'remote' ? 'main' : 'remote').emit('cmd', data);
    });

    // Test echo
    socket.on('ping-test', function (data) {
        socket.emit('pong-test', { n: data.n, t: data.t, serverT: Date.now() });
    });

    socket.on('disconnect', function (reason) {
        console.log('- ' + role + '  reason=' + reason + '  ' + clientSummary());
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
    console.log('Remote control: http://' + ip + ':' + PORT + '/remote.html');
});
