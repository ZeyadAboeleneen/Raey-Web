const mysql = require('mysql2/promise');

async function main() {
    const connection = await mysql.createConnection({
        host: '127.0.0.1',
        user: 'root',
        password: 'password', // trying with the dummy one first
    });

    try {
        console.log('Creating database "elraey" if it doesn't exist...');
    await connection.query('CREATE DATABASE IF NOT EXISTS elraey');
        console.log('✅ Database created or already exists!');
    } catch (err) {
        console.error('❌ Failed to create database:');
        console.error(err);
        process.exit(1);
    } finally {
        await connection.end();
    }
}

main();
