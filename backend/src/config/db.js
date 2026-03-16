const { Pool } = require('pg');
require('dotenv').config();

/* const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME     || 'rental_management',
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD,
}); */

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME     || 'rental_management',
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false,
});

pool.connect((err, client, release) => {
  if (err) {
    console.error('❌  Database connection failed:', err.message);
    process.exit(1);
  }
  release();
  console.log('✅  Connected to PostgreSQL:', process.env.DB_NAME);
});

module.exports = pool;