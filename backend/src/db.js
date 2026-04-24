const { Pool } = require('pg');
const { config } = require('./config');

if (!config.databaseUrl) {
  console.warn('[DB] DATABASE_URL is not set yet. The server will fail until you add it.');
}

const shouldUseSsl = config.databaseUrl && !/localhost|127\.0\.0\.1/.test(config.databaseUrl);

const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: shouldUseSsl ? { rejectUnauthorized: false } : false,
});

async function query(text, params = []) {
  return pool.query(text, params);
}

async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await callback(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  pool,
  query,
  withTransaction,
};
