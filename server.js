const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const files = {'/':'index.html','/index.html':'index.html','/app.js':'app.js','/drawings.js':'drawings.js','/style.css':'style.css','/features.css':'features.css'};
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
http.createServer((req,res)=>{
  const file = files[req.url.split('?')[0]];
  if (!file) { res.writeHead(404);res.end('Introuvable');return; }
  fs.readFile(path.join(__dirname,file),(err,data)=>{
    if (err) {res.writeHead(500);res.end('Erreur de lecture');return;}
    res.writeHead(200,{'Content-Type':mime[path.extname(file)],'Cache-Control':'no-store'});res.end(data);
  });
}).listen(4173,'127.0.0.1',()=>console.log('System Diagram : http://127.0.0.1:4173'));
