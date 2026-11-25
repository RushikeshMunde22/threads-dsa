const http = require('http');

const routes = ['/', '/login', '/search', '/dsa-lab', '/admin', '/blocked'];

function testRoute(route) {
  return new Promise((resolve) => {
    const start = Date.now();
    http.get('http://localhost:3000' + route, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const ms = Date.now() - start;
        console.log(`Route ${route.padEnd(12)} -> Status: ${res.statusCode} in ${ms}ms (bytes: ${data.length})`);
        resolve({ route, status: res.statusCode, ms });
      });
    }).on('error', (err) => {
      console.log(`Route ${route} error: ${err.message}`);
      resolve({ route, error: err.message });
    });
  });
}

async function run() {
  console.log('--- Initial Compilation / Cold Request ---');
  for (const r of routes) {
    await testRoute(r);
  }
  console.log('\n--- Second Pass / Cached Warm Request ---');
  for (const r of routes) {
    await testRoute(r);
  }
  process.exit(0);
}

run();
