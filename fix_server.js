const fs = require('fs');
const f = 'C:/Mine/LightTalk/lan-chat/src/server.js';
let c = fs.readFileSync(f, 'utf8');
c = c.split("res.setHeader('Content-Type', 'text/html')").join("res.setHeader('Content-Type', 'text/html; charset=utf-8')");
fs.writeFileSync(f, c, 'utf8');
console.log('Done');
