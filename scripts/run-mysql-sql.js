require('dotenv').config({ path: '.env.local' });
const mysql = require('mysql2/promise');

async function runSqlFile() {
  // Parse DATABASE_URL
  const dbUrl = process.env.DATABASE_URL;
  console.log('Using DATABASE_URL:', dbUrl.replace(/:([^:@]+)@/, ':***@')); // Hide password
  
  const match = dbUrl.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
  if (!match) {
    throw new Error('Invalid DATABASE_URL format');
  }
  
  const [, user, password, host, port, database] = match;
  
  const connection = await mysql.createConnection({
    host,
    port: parseInt(port),
    user,
    password,
    database
  });

  try {
    console.log('🔄 Executing MySQL SQL file...\n');
    
    // Read the SQL file
    const fs = require('fs');
    const sql = fs.readFileSync('add-registration-policy.sql', 'utf8');
    
    // Split into individual statements
    const statements = sql.split(';').filter(stmt => stmt.trim() && !stmt.trim().startsWith('--'));
    
    for (const statement of statements) {
      const cleanStatement = statement.trim();
      if (cleanStatement) {
        console.log(`Executing: ${cleanStatement.substring(0, 50)}...`);
        await connection.execute(cleanStatement);
        console.log('✅ Success');
      }
    }
    
    console.log('\n✅ SQL file executed successfully!');
    
  } catch (error) {
    console.error('❌ Error executing SQL:', error.message);
  } finally {
    await connection.end();
  }
}

runSqlFile();
