const http = require('http');

http.get('http://localhost:3000/api/items?limit=500&includeNoImages=true&includeInactive=true', (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    try {
      const items = JSON.parse(data);
      const total = items.length;
      const nonNull = items.filter(item => item.branch !== null).length;
      const nullBranches = items.filter(item => item.branch === null).length;
      const branches = {};
      items.forEach(item => {
        branches[item.branch] = (branches[item.branch] || 0) + 1;
      });

      console.log(`Total items checked: ${total}`);
      console.log(`Non-null branches: ${nonNull}`);
      console.log(`Null branches: ${nullBranches}`);
      console.log('Branch distribution:', branches);
    } catch (e) {
      console.error('Error parsing JSON:', e.message);
      console.log('Response status:', res.statusCode);
      // console.log('Raw data:', data.slice(0, 500));
    }
  });
}).on('error', (err) => {
  console.error('Error fetching API:', err.message);
});
