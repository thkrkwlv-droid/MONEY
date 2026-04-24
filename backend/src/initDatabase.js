const fs = require('fs');
const path = require('path');
const { pool } = require('./db');

async function initDatabase() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  await pool.query(schemaSql);
  console.log('[DB] schema ensured successfully');
}

module.exports = { initDatabase };
