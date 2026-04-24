const { createClient } = require('@supabase/supabase-js');

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
  console.warn('[DB] Supabase 환경변수가 설정되지 않았습니다.');
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// 기존 query 함수 대체
async function query(table, action, payload = {}) {
  let result;

  try {
    if (action === 'select') {
      result = await supabase.from(table).select('*');
    }

    if (action === 'insert') {
      result = await supabase.from(table).insert(payload);
    }

    if (action === 'update') {
      const { id, ...rest } = payload;
      result = await supabase.from(table).update(rest).eq('id', id);
    }

    if (action === 'delete') {
      result = await supabase.from(table).delete().eq('id', payload.id);
    }

    if (result.error) {
      throw result.error;
    }

    return result.data;
  } catch (error) {
    console.error('[DB ERROR]', error);
    throw error;
  }
}

// transaction은 Supabase에서는 따로 안 씀 (단순 처리)
async function withTransaction(callback) {
  return callback();
}

module.exports = {
  supabase,
  query,
  withTransaction,
};
