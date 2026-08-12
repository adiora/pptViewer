const fs = require('fs');
const http = require('http');
const FormData = require('form-data'); // not installed? wait, I can use fetch if Node > 18

async function test() {
  const fileStream = fs.createReadStream('./dummy.pdf');
  const formData = new FormData();
  formData.append('file', fileStream);

  const req = http.request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/upload',
    method: 'POST',
    headers: formData.getHeaders()
  }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => console.log('Status:', res.statusCode, 'Body:', data));
  });

  formData.pipe(req);
}
test();
