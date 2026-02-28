const mysql = require('mysql2/promise');
const path = require('path');
const fs = require('fs');

async function main() {
    // Try to find DATABASE_URL in .env.local manually since we are running as a raw script
    let dbUrl = process.env.DATABASE_URL;
    const envPath = path.join(__dirname, '..', '.env.local');
    if (!dbUrl && fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        const match = envContent.match(/DATABASE_URL=["']?([^"'\n]+)["']?/);
        if (match) dbUrl = match[1];
    }

    if (!dbUrl) {
        console.error('❌ DATABASE_URL not found in environment or .env.local');
        process.exit(1);
    }

    console.log('Using DB URL:', dbUrl);

    // Parse URL: mysql://root:pass@host:port/dbname
    const urlPattern = /mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/;
    const parts = dbUrl.match(urlPattern);

    if (!parts) {
        console.error('❌ Could not parse DATABASE_URL');
        process.exit(1);
    }

    const [_, user, password, host, port, dbName] = parts;

    console.log(`Connecting to MySQL at ${host}:${port} as ${user}...`);

    try {
        const connection = await mysql.createConnection({
            host,
            port: parseInt(port),
            user,
            password,
        });

        console.log(`Creating database "${dbName}" if it doesn't exist...`);
        await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
        console.log('✅ Database checked/created successfully!');
        await connection.end();
    } catch (err) {
        console.error('❌ Failed to connect/create database:');
        console.error(err.message);
        process.exit(1);
    }
}

main();
