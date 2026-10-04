'use strict';
const fs = require('node:fs');
const path = require('node:path');
const output = path.join(__dirname, 'dist');
fs.mkdirSync(output, {recursive:true});
for (const name of ['index.html','app.js','drawings.js','style.css','features.css']) {
  fs.copyFileSync(path.join(__dirname,name),path.join(output,name));
}
console.log('Les 5 fichiers publics sont prêts dans dist.');
