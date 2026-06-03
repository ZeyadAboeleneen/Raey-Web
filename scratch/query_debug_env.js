const http = require('http');

http.get('http://localhost:3000/api/debug-env', (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      console.log(JSON.stringify(json, null, 2));
    } catch (e) {
      console.error("Failed to parse JSON:", e.message);
      console.log(data);
    }
  });
}).on('error', (err) => {
  console.error("Error fetching debug env API:", err.message);
});
