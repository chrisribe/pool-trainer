var http = require('http');
var fs = require('fs');
var path = require('path');
var WebSocket = require('ws');
var os = require('os');
var QRCode = require('qrcode');

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

    var url = req.url === '/' ? '/index.html' : req.url;
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
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
        res.end(data);
    });
});

// ── WebSocket relay ──
// Remote controllers send commands → broadcast to all main app clients
var wss = new WebSocket.Server({ server: server });
var clients = new Set();

wss.on('connection', function (ws, req) {
    clients.add(ws);
    var from = req.url === '/ws/remote' ? 'remote' : 'main';
    console.log('WS connected: ' + from);

    ws.on('message', function (data) {
        // Relay messages from remotes to all other clients
        var msg = data.toString();
        clients.forEach(function (c) {
            if (c !== ws && c.readyState === WebSocket.OPEN) {
                c.send(msg);
            }
        });
    });

    ws.on('close', function () {
        clients.delete(ws);
        console.log('WS disconnected: ' + from);
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
