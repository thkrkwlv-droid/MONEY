const { Pool } = require('pg');
const { config } = require('./config');

// 안정화 Pool 옵션 적용
const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: { rejectUnauthorized: false },

  max: 20,                   // 동시에 사용할 최대 연결 수
  idleTimeoutMillis: 30000,  // 30초 동안 사용 안 하면 연결 반환
  connectionTimeoutMillis: 10000, // 연결 시도 10초 후 타임아웃
});

// 일반 쿼리 실행
async function query(text, params = []) {
  const client = await pool.connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

// 트랜잭션 실행
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
