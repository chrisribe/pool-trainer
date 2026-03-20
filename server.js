var http = require('http');
var fs = require('fs');
var path = require('path');

var PORT = 3001;
var MIME = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.svg': 'image/svg+xml'
};

http.createServer(function (req, res) {
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
}).listen(PORT, function () {
    console.log('Pool Trainer running at http://localhost:' + PORT);
});
