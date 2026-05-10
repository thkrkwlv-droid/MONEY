const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const { ZodError } = require('zod');
const { config } = require('./src/config');
const { query, withTransaction } = require('./src/db');
const { initDatabase } = require('./src/initDatabase');
const { runAutomation, startAutomationScheduler } = require('./src/services/automation');
const {
  getInitialRecurringNextRunDate,
  getInitialFixedExpenseNextRunDate,
  getMonthRange,
} = require('./src/services/schedule');
const {
  transactionSchema,
  categorySchema,
  favoriteSchema,
  recurringSchema,
  fixedExpenseSchema,
  budgetSchema,
  assetSchema,
  pinSchema,
} = require('./src/validators');

const app = express();

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        return callback(null, true);
      }

      const allowedOrigins = [config.frontendUrl, 'http://localhost:5173', 'http://127.0.0.1:5173'];
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error('Not allowed by CORS'));
    },
  }),
);
app.use(express.json({ limit: '10mb' }));

function asyncHandler(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      next(error);
    }
  };
}

function normalizeUuid(value) {
  return value || null;
}

function normalizeText(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function normalizeTransactionNoteText(value) {
  return String(value || '')
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizePaymentMethodText(value, type) {
  if (type === 'transfer') return '';

  const text = String(value || '')
    .replace(/\s+/g, '')
    .trim();

  return text || '현금';
}

async function ensureAutomationFresh() {
  await runAutomation(false);
}

async function getUncategorizedCategoryId(client) {
  const existing = await client.query(`select id from categories where name = '미분류' limit 1`);
  if (existing.rows[0]) {
    return existing.rows[0].id;
  }

  const inserted = await client.query(
    `insert into categories (name, type, color, is_default)
     values ('미분류', 'both', '#64748b', true)
     returning id`,
  );
  return inserted.rows[0].id;
}

async function getSettings() {
  const { rows } = await query(`select * from app_settings where id = true limit 1`);
  return rows[0] || {
    dark_mode: false,
    theme_mode: 'light',
    pin_enabled: false,
    currency: 'KRW',
    ledger_name: '가계부',
    target_asset_amount: 0,
  };
}

async function getRecentCategories() {
  const { rows } = await query(
    `select distinct on (t.category_id)
        t.category_id,
        c.name,
        t.transaction_date
     from transactions t
     join categories c on c.id = t.category_id
     where t.category_id is not null
     order by t.category_id, t.transaction_date desc
     limit 8`,
  );
  return rows;
}

async function getCategories() {
  const { rows } = await query(`select * from categories order by is_default desc, name asc`);
  return rows;
}

async function getFavorites() {
  const { rows } = await query(
    `select f.*, c.name as category_name
     from favorites f
     left join categories c on c.id = f.category_id
     order by f.updated_at desc`,
  );
  return rows;
}

async function getRecurringTransactions() {
  const { rows } = await query(
    `select r.*, c.name as category_name
     from recurring_transactions r
     left join categories c on c.id = r.category_id
     order by r.created_at desc`,
  );
  return rows;
}

async function getFixedExpenses() {
  const { rows } = await query(
    `select
        f.*,
        c.name as category_name,
        from_asset.name as from_asset_name,
        to_asset.name as to_asset_name
     from fixed_expenses f
     left join categories c on c.id = f.category_id
     left join asset_accounts from_asset on from_asset.id = f.from_asset_account_id
     left join asset_accounts to_asset on to_asset.id = f.to_asset_account_id
     order by f.created_at desc`,
  );

  return rows;
}

async function getBudgets(month) {
  const { start } = getMonthRange(month);
  const { rows } = await query(
    `select
        b.id,
        b.month_start,
        b.amount,
        b.category_id,
        coalesce(c.name, '전체') as category_name,
        coalesce(sum(case when t.type = 'expense' then t.amount else 0 end), 0) as spent
     from budgets b
     left join categories c on c.id = b.category_id
     left join transactions t
       on t.transaction_date between $1 and ($1::date + interval '1 month - 1 day')
      and t.type = 'expense'
      and (
        (b.category_id is null) or
        (t.category_id = b.category_id)
      )
     where b.month_start = $1
     group by b.id, c.name
     order by category_name asc`,
    [start],
  );
  return rows;
}

async function ensureCashAsset(client = { query }) {
  const existing = await client.query(
    `select id, balance
     from asset_accounts
     where name = '현금 보관함'
     limit 1`,
  );

  if (existing.rows[0]) {
    return existing.rows[0];
  }

  const created = await client.query(
    `insert into asset_accounts (name, asset_type, balance, initial_balance, memo)
     values ('현금 보관함', '현금', 0, 0, '현금 수입/지출 자동 관리용')
     returning id, balance`,
  );

  return created.rows[0];
}

async function getAssets() {
  const { rows } = await query(
    `
    select
      a.*,
    
      (
        select coalesce(sum(cash_unsettled_amount), 0)
        from transactions t
        where t.cash_status = 'unsettled'
      ) as unsettled_cash,
    
      (
        select coalesce(
          sum(
            case
              when t.type = 'income' then t.amount
              when t.type = 'expense' then -t.amount
              when t.type = 'transfer'
                and t.transfer_to_asset_account_id = a.id
                then t.amount
              when t.type = 'transfer'
                and t.asset_account_id = a.id
                then -t.amount
              else 0
            end
          ),
          0
        )
        from transactions t
        where date_trunc('month', t.transaction_date)
          = date_trunc('month', current_date)
          and (
            t.asset_account_id = a.id
            or t.transfer_to_asset_account_id = a.id
          )
      ) as monthly_change
    from asset_accounts a
    order by a.balance desc, a.created_at asc
    `,
  );

  return rows;
}

async function applyCashTransaction(client, type, amount) {
  const cashAsset = await ensureCashAsset(client);
  const transactionAmount = Number(amount || 0);

  if (type === 'income') {
    let remainingIncome = transactionAmount;

    const unsettledResult = await client.query(
      `select id, cash_unsettled_amount
       from transactions
       where payment_method = '현금'
         and cash_status = 'unsettled'
         and cash_unsettled_amount > 0
       order by transaction_date asc, created_at asc`,
    );

    for (const row of unsettledResult.rows) {
      if (remainingIncome <= 0) break;

      const unsettledAmount = Number(row.cash_unsettled_amount || 0);
      const offsetAmount = Math.min(remainingIncome, unsettledAmount);
      const nextUnsettledAmount = unsettledAmount - offsetAmount;

      if (nextUnsettledAmount <= 0) {
        await client.query(
          `update transactions
           set cash_status = 'settled',
               cash_unsettled_amount = 0,
               updated_at = now()
           where id = $1`,
          [row.id],
        );
      } else {
        await client.query(
          `update transactions
           set cash_unsettled_amount = $1,
               updated_at = now()
           where id = $2`,
          [nextUnsettledAmount, row.id],
        );
      }

      remainingIncome -= offsetAmount;
    }

    if (remainingIncome > 0) {
      await client.query(
        `update asset_accounts
         set balance = balance + $1,
             updated_at = now()
         where id = $2`,
        [remainingIncome, cashAsset.id],
      );
    }

    return {
      asset_account_id: cashAsset.id,
      cash_status: remainingIncome > 0 ? 'cashbox' : 'settled',
      cash_unsettled_amount: 0,
    };
  }

  const freshCashAsset = await client.query(
    `select id, balance
     from asset_accounts
     where id = $1`,
    [cashAsset.id],
  );

  const cashBalance = Number(freshCashAsset.rows[0]?.balance || 0);

  if (cashBalance >= transactionAmount) {
    await client.query(
      `update asset_accounts
       set balance = balance - $1,
           updated_at = now()
       where id = $2`,
      [transactionAmount, cashAsset.id],
    );

    return {
      asset_account_id: cashAsset.id,
      cash_status: 'cashbox',
      cash_unsettled_amount: 0,
    };
  }

  if (cashBalance > 0) {
    await client.query(
      `update asset_accounts
       set balance = 0,
           updated_at = now()
       where id = $1`,
      [cashAsset.id],
    );
  }

  return {
    asset_account_id: cashAsset.id,
    cash_status: 'unsettled',
    cash_unsettled_amount: transactionAmount - cashBalance,
  };
}

async function recordTransactionHistory(client, action, beforeData, afterData = null) {
  if (!beforeData?.id) return;

  await client.query(
    `insert into transaction_histories (
      transaction_id, action, before_data, after_data
    ) values (
      $1, $2, $3::jsonb, $4::jsonb
    )`,
    [
      beforeData.id,
      action,
      JSON.stringify(beforeData),
      afterData ? JSON.stringify(afterData) : null,
    ],
  );
}

async function recalculateAllAssets(client) {
  const cashAsset = await ensureCashAsset(client);

  await client.query(
    `update asset_accounts
     set balance = initial_balance,
         updated_at = now()
     where name <> '현금 보관함'`,
  );

  await client.query(
    `update asset_accounts
     set balance = 0,
         updated_at = now()
     where id = $1`,
    [cashAsset.id],
  );

  await client.query(
    `update transactions
     set cash_status = 'none',
         cash_unsettled_amount = 0,
         updated_at = now()
     where payment_method = '현금'`,
  );

  const transactionResult = await client.query(
    `select *
     from transactions
     order by transaction_date asc, created_at asc`,
  );

  for (const tx of transactionResult.rows) {
    if (tx.payment_method === '현금') {
      const cashResult = await applyCashTransaction(client, tx.type, tx.amount);

      await client.query(
        `update transactions
         set cash_status = $1,
             cash_unsettled_amount = $2,
             asset_account_id = $3,
             updated_at = now()
         where id = $4`,
        [
          cashResult.cash_status,
          cashResult.cash_unsettled_amount,
          cashResult.asset_account_id,
          tx.id,
        ],
      );
    } else if (tx.type === 'transfer') {
      if (tx.asset_account_id) {
        await client.query(
          `update asset_accounts
           set balance = balance - $1,
               updated_at = now()
           where id = $2`,
          [tx.amount, tx.asset_account_id],
        );
      }
    
      if (tx.transfer_to_asset_account_id) {
        await client.query(
          `update asset_accounts
           set balance = balance + $1,
               updated_at = now()
           where id = $2`,
          [tx.amount, tx.transfer_to_asset_account_id],
        );
      }
    }
    else if (tx.asset_account_id) {
      const delta = tx.type === 'income'
        ? Number(tx.amount || 0)
        : -Number(tx.amount || 0);

      await client.query(
        `update asset_accounts
         set balance = balance + $1,
             updated_at = now()
         where id = $2`,
        [delta, tx.asset_account_id],
      );
    }
  }
}

async function applyAssetBalance(assetAccountId, type, amount) {
  if (!assetAccountId) return;

  const delta = type === 'income' ? Number(amount || 0) : -Number(amount || 0);

  await query(
    `update asset_accounts
     set balance = balance + $1,
         updated_at = now()
     where id = $2`,
    [delta, assetAccountId],
  );
}

async function reverseAssetBalance(assetAccountId, type, amount) {
  if (!assetAccountId) return;

  const delta = type === 'income' ? -Number(amount || 0) : Number(amount || 0);

  await query(
    `update asset_accounts
     set balance = balance + $1,
         updated_at = now()
     where id = $2`,
    [delta, assetAccountId],
  );
}

async function getTransactions(filters = {}) {
  const conditions = [];
  const params = [];

  if (filters.month) {
    const { start, end } = getMonthRange(filters.month);
    params.push(start, end);
    conditions.push(`t.transaction_date between $${params.length - 1} and $${params.length}`);
  }

  if (filters.startDate && filters.endDate) {
    params.push(filters.startDate, filters.endDate);
    conditions.push(`t.transaction_date between $${params.length - 1} and $${params.length}`);
  }

  if (filters.type) {
    params.push(filters.type);
    conditions.push(`t.type = $${params.length}`);
  }

  if (filters.categoryId) {
    params.push(filters.categoryId);
    conditions.push(`t.category_id = $${params.length}`);
  }

  if (filters.paymentMethod) {
    params.push(filters.paymentMethod);
    conditions.push(`t.payment_method = $${params.length}`);
  }

  if (filters.search) {
    params.push(`%${filters.search}%`);
    conditions.push(`(coalesce(t.note, '') ilike $${params.length} or coalesce(c.name, '') ilike $${params.length})`);
  }

  const whereClause = conditions.length ? `where ${conditions.join(' and ')}` : '';
  const { rows } = await query(
    `select
        t.*,
        c.color as category_color,
        c.name as category_name,
        a.name as asset_account_name,
        a.asset_type as asset_account_type,
        ta.name as transfer_to_asset_account_name,
        ta.asset_type as transfer_to_asset_account_type
     from transactions t
     left join categories c on c.id = t.category_id
     left join asset_accounts a on a.id = t.asset_account_id
     left join asset_accounts ta on ta.id = t.transfer_to_asset_account_id
     ${whereClause}
     order by t.transaction_date desc, t.created_at desc
     limit 300`,
    params,
  );

  return rows;
}

async function getDashboard(month) {
  const { start, end, prevStart, prevEnd, month: monthLabel } = getMonthRange(month);

  const [totalsResult, previousTotalsResult, categoryResult, paymentResult, openingBalanceResult, dailyResult] =
    await Promise.all([
      query(
        `select
            coalesce(sum(case when type = 'income' then amount else 0 end), 0) as income,
            coalesce(sum(case when type = 'expense' then amount else 0 end), 0) as expense
         from transactions
         where transaction_date between $1 and $2
           and type <> 'transfer'`,
        [start, end],
      ),
      query(
        `select
            coalesce(sum(case when type = 'income' then amount else 0 end), 0) as income,
            coalesce(sum(case when type = 'expense' then amount else 0 end), 0) as expense
         from transactions
         where transaction_date between $1 and $2
           and type <> 'transfer'`,
        [prevStart, prevEnd],
      ),
      query(
        `select
            coalesce(c.name, '미분류') as category_name,
            coalesce(c.color, '#64748b') as category_color,
            sum(t.amount)::bigint as total
         from transactions t
         left join categories c on c.id = t.category_id
         where t.transaction_date between $1 and $2
           and t.type = 'expense'
         group by c.name, c.color
         order by total desc`,
        [start, end],
      ),
      query(
        `select payment_method, sum(amount)::bigint as total
          from transactions
          where transaction_date between $1 and $2
            and type <> 'transfer'
          group by payment_method
         order by total desc`,
        [start, end],
      ),
      query(
        `select coalesce(sum(case when type = 'income' then amount else -amount end), 0) as opening_balance
         from transactions
         where transaction_date < $1
           and type <> 'transfer'`,
        [start],
      ),
      query(
        `select
            transaction_date,
            coalesce(sum(case when type = 'income' then amount else -amount end), 0) as net_amount
         from transactions
         where transaction_date between $1 and $2
           and type <> 'transfer'
         group by transaction_date
         order by transaction_date asc`,
        [start, end],
      ),
    ]);

  const totals = totalsResult.rows[0];
  const previous = previousTotalsResult.rows[0];
  let runningBalance = Number(openingBalanceResult.rows[0]?.opening_balance || 0);
  const balanceFlow = dailyResult.rows.map((entry) => {
    runningBalance += Number(entry.net_amount || 0);
    return {
      date: entry.transaction_date,
      balance: runningBalance,
      netAmount: Number(entry.net_amount || 0),
    };
  });

  return {
    month: monthLabel,
    income: Number(totals.income || 0),
    expense: Number(totals.expense || 0),
    balance: runningBalance,
    previousIncome: Number(previous.income || 0),
    previousExpense: Number(previous.expense || 0),
    categorySummary: categoryResult.rows.map((row) => ({
      ...row,
      total: Number(row.total || 0),
    })),
    paymentSummary: paymentResult.rows.map((row) => ({
      ...row,
      total: Number(row.total || 0),
    })),
    balanceFlow,
  };
}

async function getAutocomplete(queryText = '') {
  const keyword = `%${queryText}%`;
  const [noteResult, paymentResult, recommendationResult] = await Promise.all([
    query(
      `select distinct note
       from transactions
       where note is not null and note ilike $1
       order by note asc
       limit 6`,
      [keyword],
    ),
    query(
      `select distinct payment_method
       from transactions
       where payment_method ilike $1
       order by payment_method asc
       limit 6`,
      [keyword],
    ),
    query(
      `select c.id as category_id, c.name, count(*)::int as hits
       from transactions t
       join categories c on c.id = t.category_id
       where $1 <> '%%' and coalesce(t.note, '') ilike $1
       group by c.id, c.name
       order by hits desc
       limit 1`,
      [keyword],
    ),
  ]);

  return {
    notes: noteResult.rows.map((row) => row.note),
    paymentMethods: paymentResult.rows.map((row) => row.payment_method),
    recommendedCategory: recommendationResult.rows[0] || null,
  };
}

async function getBootstrap(month) {
  // await ensureAutomationFresh(); // 주석 처리

  const { prevStart, prevEnd } = getMonthRange(month);

  const categories = await getCategories();
  const favorites = await getFavorites();
  const recurringTransactions = await getRecurringTransactions();
  const fixedExpenses = await getFixedExpenses();
  const settings = await getSettings();
  const transactions = await getTransactions({ month });
  const previousTransactionsResult = await query(
    `select
        t.*,
        c.color as category_color,
        c.name as category_name,
        a.name as asset_account_name,
        a.asset_type as asset_account_type,
        ta.name as transfer_to_asset_account_name,
        ta.asset_type as transfer_to_asset_account_type
     from transactions t
     left join categories c on c.id = t.category_id
     left join asset_accounts a on a.id = t.asset_account_id
     left join asset_accounts ta on ta.id = t.transfer_to_asset_account_id
     where t.transaction_date between $1 and $2
     order by t.transaction_date desc, t.created_at desc
     limit 300`,
    [prevStart, prevEnd],
  );
  const dashboard = await getDashboard(month);
  const recentCategories = await getRecentCategories();
  const budgets = await getBudgets(month);
  const assets = await getAssets();

  return {
    categories,
    favorites,
    recurringTransactions,
    fixedExpenses,
    settings,
    transactions,
    previousTransactions: previousTransactionsResult.rows,
    dashboard,
    recentCategories,
    budgets,
    assets,
  };
}

app.get('/api/health', asyncHandler(async (_req, res) => {
  res.json({ ok: true, service: 'expense-tracker-backend' });
}));

app.get('/api/bootstrap', asyncHandler(async (req, res) => {
  const data = await getBootstrap(req.query.month);
  res.json(data);
}));

app.get('/api/dashboard', asyncHandler(async (req, res) => {
  // await ensureAutomationFresh();
  const dashboard = await getDashboard(req.query.month);
  const budgets = await getBudgets(req.query.month);
  res.json({ dashboard, budgets });
}));

app.get('/api/transactions', asyncHandler(async (req, res) => {
  // await ensureAutomationFresh();
  const rows = await getTransactions({
    month: req.query.month,
    startDate: req.query.startDate,
    endDate: req.query.endDate,
    type: req.query.type,
    categoryId: req.query.categoryId,
    search: req.query.search,
    paymentMethod: req.query.paymentMethod,
  });
  res.json(rows);
}));

app.get('/api/transactions/autocomplete', asyncHandler(async (req, res) => {
  const suggestions = await getAutocomplete(req.query.query || '');
  res.json(suggestions);
}));

app.post('/api/transactions/bulk', asyncHandler(async (req, res) => {
  const transactions = Array.isArray(req.body?.transactions)
    ? req.body.transactions
    : [];

  if (transactions.length === 0) {
    return res.status(400).json({ error: '등록할 거래내역이 없습니다.' });
  }

  if (transactions.length > 500) {
    return res.status(400).json({ error: '한 번에 최대 500건까지만 등록할 수 있습니다.' });
  }

  const allowedTypes = new Set(['income', 'expense', 'transfer']);

  const invalidRows = transactions
    .map((item, index) => {
      const errors = [];

      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(item.transaction_date || ''))) {
        errors.push('날짜');
      }

      if (!allowedTypes.has(item.type)) {
        errors.push('유형');
      }

      if (!Number.isFinite(Number(item.amount)) || Number(item.amount) <= 0) {
        errors.push('금액');
      }

      return errors.length > 0
        ? `${index + 1}번째 거래(${errors.join(', ')})`
        : null;
    })
    .filter(Boolean);

  if (invalidRows.length > 0) {
    return res.status(400).json({
      error: '일부 거래 데이터가 올바르지 않습니다.',
      details: invalidRows,
    });
  }

    const categoryIds = [...new Set(
    transactions
      .map((item) => item.category_id)
      .filter(Boolean)
  )];

  const assetIds = [...new Set(
    transactions
      .flatMap((item) => [
        item.asset_account_id || item.from_asset_account_id,
        item.to_asset_account_id,
      ])
      .filter(Boolean)
  )];

  if (categoryIds.length > 0) {
    const { rows } = await query(
      `select id from categories where id = any($1::uuid[])`,
      [categoryIds],
    );

    if (rows.length !== categoryIds.length) {
      return res.status(400).json({ error: '존재하지 않는 카테고리가 포함되어 있습니다.' });
    }
  }

  if (assetIds.length > 0) {
    const { rows } = await query(
      `select id from asset_accounts where id = any($1::uuid[])`,
      [assetIds],
    );

    if (rows.length !== assetIds.length) {
      return res.status(400).json({ error: '존재하지 않는 자산이 포함되어 있습니다.' });
    }
  }

  const invalidTransferRows = transactions
    .map((item, index) => {
      if (item.type !== 'transfer') return null;

      const fromAssetId = item.asset_account_id || item.from_asset_account_id;
      const toAssetId = item.to_asset_account_id;

      if (!fromAssetId || !toAssetId) {
        return `${index + 1}번째 거래`;
      }

      if (fromAssetId === toAssetId) {
        return `${index + 1}번째 거래`;
      }

      return null;
    })
    .filter(Boolean);

  if (invalidTransferRows.length > 0) {
    return res.status(400).json({
      error: '자산이동 거래의 출금/입금 자산이 올바르지 않습니다.',
      details: invalidTransferRows,
    });
  }

  function makeServerTransactionDuplicateKey(item) {
    return [
      item.transaction_date,
      item.type,
      Number(item.amount || 0),
      item.category_id || '',
      item.asset_account_id || item.from_asset_account_id || '',
      item.to_asset_account_id || '',
      normalizeTransactionNoteText(item.note),
      normalizePaymentMethodText(item.payment_method, item.type),
    ].join('|');
  }

  const seenBulkKeys = new Set();
  const duplicateInRequestRows = [];

  transactions.forEach((item, index) => {
    if (item.allow_duplicate === true) return;

    const key = makeServerTransactionDuplicateKey(item);

    if (seenBulkKeys.has(key)) {
      duplicateInRequestRows.push(`${index + 1}번째 거래`);
      return;
    }

    seenBulkKeys.add(key);
  });

  if (duplicateInRequestRows.length > 0) {
    return res.status(400).json({
      error: '업로드 요청 안에 중복 거래가 포함되어 있습니다.',
      details: duplicateInRequestRows,
    });
  }

  const duplicateCheckRows = [];

  for (const item of transactions) {
    if (item.allow_duplicate === true) {
      continue;
    }

    const duplicateResult = await query(
      `select id
       from transactions
       where transaction_date = $1
         and type = $2
         and amount = $3
         and coalesce(category_id::text, '') = coalesce($4::text, '')
         and coalesce(asset_account_id::text, '') = coalesce($5::text, '')
         and coalesce(transfer_to_asset_account_id::text, '') = coalesce($6::text, '')
         and coalesce(note, '') = coalesce($7, '')
         and coalesce(payment_method, '') = coalesce($8, '')
       limit 1`,
      [
        item.transaction_date,
        item.type,
        Number(item.amount),
        item.category_id || null,
        item.asset_account_id || item.from_asset_account_id || null,
        item.to_asset_account_id || null,
        normalizeTransactionNoteText(item.note),
        normalizePaymentMethodText(item.payment_method, item.type),
      ],
    );

    if (duplicateResult.rows[0]) {
      duplicateCheckRows.push(item.transaction_date);
    }
  }

  if (duplicateCheckRows.length > 0) {
    return res.status(400).json({
      error: '이미 등록된 거래가 포함되어 있습니다.',
      details: duplicateCheckRows,
    });
  }

  const chunkSize = 50; // 한 번에 50건씩 insert
  const inserted = [];
  
  await withTransaction(async (client) => {
    for (let i = 0; i < transactions.length; i += chunkSize) {
      const chunk = transactions.slice(i, i + chunkSize);
      const values = [];
      const params = [];
      let idx = 1;
  
      chunk.forEach((item) => {
        values.push(`($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, false)`);
        params.push(
          item.transaction_date,
          item.type,
          Number(item.amount),
          item.category_id || null,
          item.asset_account_id || item.from_asset_account_id || null,
          item.to_asset_account_id || null,
          item.note || '',
          item.payment_method || ''
        );
      });
  
      const result = await client.query(
        `insert into transactions (
          transaction_date, type, amount, category_id,
          asset_account_id, transfer_to_asset_account_id,
          note, payment_method, auto_generated
        ) values ${values.join(', ')}
        returning *`,
        params,
      );
  
      inserted.push(...result.rows);
    }
  });

  res.status(201).json({
    success: true,
    count: inserted.length,
    transactions: inserted,
  });
}));

app.post('/api/transactions', asyncHandler(async (req, res) => {
  const payload = transactionSchema.parse({
  ...req.body,
  category_id: normalizeUuid(req.body.category_id),
  asset_account_id: normalizeUuid(req.body.asset_account_id),
  from_asset_account_id: normalizeUuid(req.body.from_asset_account_id),
  to_asset_account_id: normalizeUuid(req.body.to_asset_account_id),
  note: normalizeText(req.body.note),
});

  const inserted = await withTransaction(async (client) => {
    let assetAccountId = payload.asset_account_id;
    let cashStatus = 'none';
    let cashUnsettledAmount = 0;

    if (payload.type === 'transfer') {
      if (!payload.from_asset_account_id || !payload.to_asset_account_id) {
        throw new Error('출금 자산과 입금 자산을 모두 선택해주세요.');
      }
    
      if (payload.from_asset_account_id === payload.to_asset_account_id) {
        throw new Error('출금 자산과 입금 자산은 다르게 선택해주세요.');
      }
    
      await client.query(
        `update asset_accounts
         set balance = balance - $1,
             updated_at = now()
         where id = $2`,
        [payload.amount, payload.from_asset_account_id],
      );
    
      await client.query(
        `update asset_accounts
         set balance = balance + $1,
             updated_at = now()
         where id = $2`,
        [payload.amount, payload.to_asset_account_id],
      );
    
      const result = await client.query(
        `insert into transactions (
          transaction_date, type, amount, category_id, asset_account_id, transfer_to_asset_account_id, note, payment_method, source_type, auto_generated
        )
        values ($1, 'transfer', $2, null, $3, $4, $5, '자산이동', 'manual', false)
        returning *`,
        [
          payload.transaction_date,
          payload.amount,
          payload.from_asset_account_id,
          payload.to_asset_account_id,
          payload.note,
        ],
        );
        
        return result.rows[0];
    }

    if (payload.payment_method === '현금' && !assetAccountId) {
      const cashResult = await applyCashTransaction(client, payload.type, payload.amount);
      assetAccountId = cashResult.asset_account_id;
      cashStatus = cashResult.cash_status;
      cashUnsettledAmount = cashResult.cash_unsettled_amount;
    } else if (assetAccountId) {
      const delta = payload.type === 'income' ? Number(payload.amount || 0) : -Number(payload.amount || 0);

      await client.query(
        `update asset_accounts
         set balance = balance + $1,
             updated_at = now()
         where id = $2`,
        [delta, assetAccountId],
      );
    }

    const result = await client.query(
      `insert into transactions (
        transaction_date, type, amount, category_id, asset_account_id, cash_status, cash_unsettled_amount, note, payment_method, source_type, auto_generated
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'manual', false)
      returning *`,
      [
        payload.transaction_date,
        payload.type,
        payload.amount,
        payload.category_id,
        assetAccountId,
        cashStatus,
        cashUnsettledAmount,
        payload.note,
        payload.payment_method,
      ],
    );

    return result.rows[0];
  });

  res.status(201).json(inserted);
}));

app.put('/api/transactions/:id', asyncHandler(async (req, res) => {
  const payload = transactionSchema.parse({
    ...req.body,
    category_id: normalizeUuid(req.body.category_id),
    asset_account_id: normalizeUuid(req.body.asset_account_id),
    from_asset_account_id: normalizeUuid(req.body.from_asset_account_id),
    to_asset_account_id: normalizeUuid(req.body.to_asset_account_id),
    note: normalizeText(req.body.note),
  });

    const updated = await withTransaction(async (client) => {
      const previousResult = await client.query(
        `select * from transactions where id = $1`,
        [req.params.id],
      );
  
      const previousTransaction = previousResult.rows[0];
  
      let result;

    if (payload.type === 'transfer') {
      if (!payload.from_asset_account_id || !payload.to_asset_account_id) {
        throw new Error('출금 자산과 입금 자산을 모두 선택해주세요.');
      }

      if (payload.from_asset_account_id === payload.to_asset_account_id) {
        throw new Error('출금 자산과 입금 자산은 다르게 선택해주세요.');
      }

      result = await client.query(
        `update transactions
         set transaction_date = $1,
             type = 'transfer',
             amount = $2,
             category_id = null,
             asset_account_id = $3,
             transfer_to_asset_account_id = $4,
             note = $5,
             payment_method = '자산이동',
             cash_status = 'none',
             cash_unsettled_amount = 0,
             updated_at = now()
         where id = $6
         returning *`,
        [
          payload.transaction_date,
          payload.amount,
          payload.from_asset_account_id,
          payload.to_asset_account_id,
          payload.note,
          req.params.id,
        ],
      );
    } else {
      result = await client.query(
        `update transactions
         set transaction_date = $1,
             type = $2,
             amount = $3,
             category_id = $4,
             asset_account_id = $5,
             transfer_to_asset_account_id = null,
             note = $6,
             payment_method = $7,
             updated_at = now()
         where id = $8
         returning *`,
        [
          payload.transaction_date,
          payload.type,
          payload.amount,
          payload.category_id,
          payload.asset_account_id,
          payload.note,
          payload.payment_method,
          req.params.id,
        ],
      );
    }

    const updatedTransaction = result.rows[0];

    await recordTransactionHistory(client, 'update', previousTransaction, updatedTransaction);

    return updatedTransaction;
  });

  res.json(updated);
}));

app.delete('/api/transactions/:id', asyncHandler(async (req, res) => {
  await withTransaction(async (client) => {
    const previousResult = await client.query(
      `select * from transactions where id = $1`,
      [req.params.id],
    );

    const previousTransaction = previousResult.rows[0];

    await recordTransactionHistory(client, 'delete', previousTransaction, null);

    await client.query(
      `delete from transactions where id = $1`,
      [req.params.id],
    );

  });

  res.json({ success: true });
}));

app.get('/api/categories', asyncHandler(async (_req, res) => {
  res.json(await getCategories());
}));

app.post('/api/categories', asyncHandler(async (req, res) => {
  const payload = categorySchema.parse(req.body);
  const result = await query(
    `insert into categories (name, type, color)
     values ($1, $2, $3)
     returning *`,
    [payload.name, payload.type, payload.color],
  );
  res.status(201).json(result.rows[0]);
}));

app.put('/api/categories/:id', asyncHandler(async (req, res) => {
  const payload = categorySchema.parse(req.body);
  const result = await query(
    `update categories
     set name = $1,
         type = $2,
         color = $3,
         updated_at = now()
     where id = $4
     returning *`,
    [payload.name, payload.type, payload.color, req.params.id],
  );
  res.json(result.rows[0]);
}));

app.delete('/api/categories/:id', asyncHandler(async (req, res) => {
  await withTransaction(async (client) => {
    const fallbackId = await getUncategorizedCategoryId(client);
    await client.query(`update transactions set category_id = $1 where category_id = $2`, [fallbackId, req.params.id]);
    await client.query(`update favorites set category_id = $1 where category_id = $2`, [fallbackId, req.params.id]);
    await client.query(`update recurring_transactions set category_id = $1 where category_id = $2`, [fallbackId, req.params.id]);
    await client.query(`update fixed_expenses set category_id = $1 where category_id = $2`, [fallbackId, req.params.id]);
    await client.query(`update budgets set category_id = $1 where category_id = $2`, [fallbackId, req.params.id]);
    await client.query(`delete from categories where id = $1`, [req.params.id]);
  });

  res.json({ success: true });
}));

app.get('/api/favorites', asyncHandler(async (_req, res) => {
  res.json(await getFavorites());
}));

app.post('/api/favorites', asyncHandler(async (req, res) => {
  const payload = favoriteSchema.parse({
    ...req.body,
    category_id: normalizeUuid(req.body.category_id),
    note: normalizeText(req.body.note),
  });

  const result = await query(
    `insert into favorites (name, type, amount, category_id, note, payment_method)
     values ($1, $2, $3, $4, $5, $6)
     returning *`,
    [payload.name, payload.type, payload.amount, payload.category_id, payload.note, payload.payment_method],
  );
  res.status(201).json(result.rows[0]);
}));

app.put('/api/favorites/:id', asyncHandler(async (req, res) => {
  const payload = favoriteSchema.parse({
    ...req.body,
    category_id: normalizeUuid(req.body.category_id),
    note: normalizeText(req.body.note),
  });

  const result = await query(
    `update favorites
     set name = $1,
         type = $2,
         amount = $3,
         category_id = $4,
         note = $5,
         payment_method = $6,
         updated_at = now()
     where id = $7
     returning *`,
    [payload.name, payload.type, payload.amount, payload.category_id, payload.note, payload.payment_method, req.params.id],
  );
  res.json(result.rows[0]);
}));

app.delete('/api/favorites/:id', asyncHandler(async (req, res) => {
  await query(`delete from favorites where id = $1`, [req.params.id]);
  res.json({ success: true });
}));

app.get('/api/recurring-transactions', asyncHandler(async (_req, res) => {
  res.json(await getRecurringTransactions());
}));

app.post('/api/recurring-transactions', asyncHandler(async (req, res) => {
  const payload = recurringSchema.parse({
    ...req.body,
    category_id: normalizeUuid(req.body.category_id),
    note: normalizeText(req.body.note),
  });

  const nextRunDate = getInitialRecurringNextRunDate(payload);
  const result = await query(
    `insert into recurring_transactions (
      name, type, amount, category_id, note, payment_method,
      frequency, interval_count, start_date, weekday, day_of_month, next_run_date, is_active
    )
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    returning *`,
    [
      payload.name,
      payload.type,
      payload.amount,
      payload.category_id,
      payload.note,
      payload.payment_method,
      payload.frequency,
      payload.interval_count,
      payload.start_date,
      payload.weekday,
      payload.day_of_month,
      nextRunDate,
      payload.is_active,
    ],
  );

// await ensureAutomationFresh();
  res.status(201).json(result.rows[0]);
}));

app.put('/api/recurring-transactions/:id', asyncHandler(async (req, res) => {
  const payload = recurringSchema.parse({
    ...req.body,
    category_id: normalizeUuid(req.body.category_id),
    note: normalizeText(req.body.note),
  });

  const nextRunDate = getInitialRecurringNextRunDate(payload);
  const result = await query(
    `update recurring_transactions
     set name = $1,
         type = $2,
         amount = $3,
         category_id = $4,
         note = $5,
         payment_method = $6,
         frequency = $7,
         interval_count = $8,
         start_date = $9,
         weekday = $10,
         day_of_month = $11,
         next_run_date = $12,
         is_active = $13,
         updated_at = now()
     where id = $14
     returning *`,
    [
      payload.name,
      payload.type,
      payload.amount,
      payload.category_id,
      payload.note,
      payload.payment_method,
      payload.frequency,
      payload.interval_count,
      payload.start_date,
      payload.weekday,
      payload.day_of_month,
      nextRunDate,
      payload.is_active,
      req.params.id,
    ],
  );

// await ensureAutomationFresh();
  res.json(result.rows[0]);
}));

app.delete('/api/recurring-transactions/:id', asyncHandler(async (req, res) => {
  await query(`delete from recurring_transactions where id = $1`, [req.params.id]);
  res.json({ success: true });
}));

app.get('/api/fixed-expenses', asyncHandler(async (_req, res) => {
  res.json(await getFixedExpenses());
}));

app.post('/api/fixed-expenses', asyncHandler(async (req, res) => {
  const payload = fixedExpenseSchema.parse({
    ...req.body,
    category_id: normalizeUuid(req.body.category_id),
    from_asset_account_id: normalizeUuid(req.body.from_asset_account_id),
    to_asset_account_id: normalizeUuid(req.body.to_asset_account_id),
    note: normalizeText(req.body.note),
  });

  if (payload.type === 'transfer') {
    if (!payload.from_asset_account_id || !payload.to_asset_account_id) {
      throw new Error('자산이동 자동 거래는 출금 자산과 입금 자산을 모두 선택해주세요.');
    }
  
    if (payload.from_asset_account_id === payload.to_asset_account_id) {
      throw new Error('출금 자산과 입금 자산은 다르게 선택해주세요.');
    }
  }
  
  const nextRunDate = getInitialFixedExpenseNextRunDate(payload);
  const result = await query(
    `insert into fixed_expenses (
      name, type, amount, category_id, from_asset_account_id, to_asset_account_id, note, payment_method,
      day_of_month, start_date, next_run_date, is_active
    )
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    returning *`,
    [
      payload.name,
      payload.type,
      payload.amount,
      payload.category_id,
      payload.from_asset_account_id,
      payload.to_asset_account_id,
      payload.note,
      payload.payment_method,
      payload.day_of_month,
      payload.start_date,
      nextRunDate,
      payload.is_active,
    ],
  );

// await ensureAutomationFresh();
  res.status(201).json(result.rows[0]);
}));

app.put('/api/fixed-expenses/:id', asyncHandler(async (req, res) => {
  const payload = fixedExpenseSchema.parse({
    ...req.body,
    category_id: normalizeUuid(req.body.category_id),
    from_asset_account_id: normalizeUuid(req.body.from_asset_account_id),
    to_asset_account_id: normalizeUuid(req.body.to_asset_account_id),
    note: normalizeText(req.body.note),
  });

  if (payload.type === 'transfer') {
    if (!payload.from_asset_account_id || !payload.to_asset_account_id) {
      throw new Error('자산이동 자동 거래는 출금 자산과 입금 자산을 모두 선택해주세요.');
    }
  
    if (payload.from_asset_account_id === payload.to_asset_account_id) {
      throw new Error('출금 자산과 입금 자산은 다르게 선택해주세요.');
    }
  }
  
  const nextRunDate = getInitialFixedExpenseNextRunDate(payload);
  const result = await query(
    `update fixed_expenses
     set name = $1,
         type = $2,
         amount = $3,
         category_id = $4,
         from_asset_account_id = $5,
         to_asset_account_id = $6,
         note = $7,
         payment_method = $8,
         day_of_month = $9,
         start_date = $10,
         next_run_date = $11,
         is_active = $12,
         updated_at = now()
     where id = $13
     returning *`,
    [
      payload.name,
      payload.type,
      payload.amount,
      payload.category_id,
      payload.from_asset_account_id,
      payload.to_asset_account_id,
      payload.note,
      payload.payment_method,
      payload.day_of_month,
      payload.start_date,
      nextRunDate,
      payload.is_active,
      req.params.id,
    ],
  );

// await ensureAutomationFresh();
  res.json(result.rows[0]);
}));

app.delete('/api/fixed-expenses/:id', asyncHandler(async (req, res) => {
  await query(`delete from fixed_expenses where id = $1`, [req.params.id]);
  res.json({ success: true });
}));

app.get('/api/budgets', asyncHandler(async (req, res) => {
  res.json(await getBudgets(req.query.month));
}));

app.post('/api/budgets', asyncHandler(async (req, res) => {
  const payload = budgetSchema.parse({
    ...req.body,
    category_id: normalizeUuid(req.body.category_id),
  });

  const result = await query(
    `insert into budgets (month_start, category_id, amount)
     values ($1, $2, $3)
     on conflict (month_start, category_id)
     do update set amount = excluded.amount, updated_at = now()
     returning *`,
    [payload.month_start, payload.category_id, payload.amount],
  );
  res.status(201).json(result.rows[0]);
}));

app.put('/api/budgets/:id', asyncHandler(async (req, res) => {
  const payload = budgetSchema.parse({
    ...req.body,
    category_id: normalizeUuid(req.body.category_id),
  });

  const result = await query(
    `update budgets
     set month_start = $1,
         category_id = $2,
         amount = $3,
         updated_at = now()
     where id = $4
     returning *`,
    [payload.month_start, payload.category_id, payload.amount, req.params.id],
  );
  res.json(result.rows[0]);
}));

app.delete('/api/budgets/:id', asyncHandler(async (req, res) => {
  await query(`delete from budgets where id = $1`, [req.params.id]);
  res.json({ success: true });
}));

app.get('/api/assets', asyncHandler(async (_req, res) => {
  res.json(await getAssets());
}));

app.post('/api/assets', asyncHandler(async (req, res) => {
  const payload = assetSchema.parse({
    ...req.body,
    memo: normalizeText(req.body.memo),
  });

  const result = await query(
    `insert into asset_accounts (name, asset_type, balance, initial_balance, display_order, memo)
 values ($1, $2, $3, $4, $5, $6)
 returning *`,
[
  payload.name,
  payload.asset_type,
  payload.balance,
  payload.initial_balance ?? payload.balance,
  payload.display_order,
  payload.memo,
],
);
  res.status(201).json(result.rows[0]);
}));

app.put('/api/assets/:id', asyncHandler(async (req, res) => {
  const payload = assetSchema.parse({
    ...req.body,
    memo: normalizeText(req.body.memo),
  });

  const result = await query(
    `update asset_accounts
 set name = $1,
     asset_type = $2,
     balance = $3,
     initial_balance = $4,
     display_order = $5,
     memo = $6,
     updated_at = now()
 where id = $7
 returning *`,
[
  payload.name,
  payload.asset_type,
  payload.balance,
  payload.initial_balance ?? payload.balance,
  payload.display_order,
  payload.memo,
  req.params.id,
],
  );

  res.json(result.rows[0]);
}));

app.delete('/api/assets/:id', asyncHandler(async (req, res) => {
  await query(`delete from asset_accounts where id = $1`, [req.params.id]);
  res.json({ success: true });
}));

app.get('/api/settings', asyncHandler(async (_req, res) => {
  const settings = await getSettings();
  res.json({
    dark_mode: settings.dark_mode,
    theme_mode: settings.theme_mode || (settings.dark_mode ? 'dark' : 'light'),
    pin_enabled: settings.pin_enabled,
    currency: settings.currency,
    ledger_name: settings.ledger_name || '가계부',
    target_asset_amount: Number(settings.target_asset_amount || 0),
  });
}));

app.get('/api/upload-logs', asyncHandler(async (req, res) => {
  const limit = Math.min(
    Math.max(Number(req.query.limit || 30), 1),
    100,
  );

  const { rows } = await query(
    `select *
     from upload_logs
     order by created_at desc
     limit $1`,
    [limit],
  );

  res.json(rows);
}));

app.post('/api/upload-logs', asyncHandler(async (req, res) => {
  const result = await query(
    `insert into upload_logs (
      upload_type,
      file_name,
      total_rows,
      imported_rows,
      excluded_rows,
      transfer_rows,
      status,
      error_message
    ) values (
      $1, $2, $3, $4, $5, $6, $7, $8
    )
    returning *`,
    [
      'transaction_excel',
      req.body.file_name
        ? String(req.body.file_name).slice(0, 255)
        : null,
      Number(req.body.total_rows || 0),
      Number(req.body.imported_rows || 0),
      Number(req.body.excluded_rows || 0),
      Number(req.body.transfer_rows || 0),
      req.body.status === 'fail' ? 'fail' : 'success',
      req.body.error_message
        ? String(req.body.error_message).slice(0, 1000)
        : null,
    ],
  );

  res.status(201).json(result.rows[0]);
}));

app.get('/api/transaction-histories', asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit || 50), 200);

  const { rows } = await query(
    `select *
     from transaction_histories
     order by created_at desc
     limit $1`,
    [limit],
  );

  res.json(rows);
}));

app.post('/api/system/cleanup-cache', asyncHandler(async (_req, res) => {
  const snapshotResult = await query(
    `delete from asset_snapshots
     where snapshot_date < current_date - interval '24 months'
     returning id`,
  );

  const uploadLogResult = await query(
    `delete from upload_logs
     where created_at < now() - interval '6 months'
     returning id`,
  );

  const historyResult = await query(
    `delete from transaction_histories
     where created_at < now() - interval '12 months'
     returning id`,
  );

  res.json({
    success: true,
    deleted: {
      asset_snapshots: snapshotResult.rowCount,
      transaction_histories: historyResult.rowCount,
      upload_logs: uploadLogResult.rowCount,
    },
    message: '오래된 캐시/히스토리 데이터를 정리했습니다.',
  });
}));

app.get('/api/assets/snapshots', asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit || 90), 365);

  const { rows } = await query(
    `select *
     from asset_snapshots
     order by snapshot_date desc
     limit $1`,
    [limit],
  );

  res.json(rows);
}));

app.put('/api/settings/theme', asyncHandler(async (req, res) => {
  const allowedThemes = ['light', 'dark', 'pastel-pink', 'pastel-blue', 'pastel-purple', 'mint', 'yellow', 'beige', 'gray'];
  const themeMode = allowedThemes.includes(req.body.theme_mode) ? req.body.theme_mode : 'light';
  const darkMode = themeMode === 'dark';

  const result = await query(
    `update app_settings
     set dark_mode = $1,
         theme_mode = $2,
         updated_at = now()
     where id = true
     returning dark_mode, theme_mode, pin_enabled, currency`,
    [darkMode, themeMode],
  );

  res.json(result.rows[0]);
}));

app.put('/api/settings/ledger-name', asyncHandler(async (req, res) => {
  const ledgerName = String(req.body.ledger_name || '가계부').trim().slice(0, 80) || '가계부';

  const result = await query(
    `update app_settings
     set ledger_name = $1,
         updated_at = now()
     where id = true
     returning dark_mode, theme_mode, pin_enabled, currency, ledger_name`,
    [ledgerName],
  );

  res.json(result.rows[0]);
}));

app.put('/api/settings/target-asset', asyncHandler(async (req, res) => {
  const targetAssetAmount = Math.max(
    0,
    Number(req.body.target_asset_amount || 0),
  );

  const result = await query(
    `update app_settings
     set target_asset_amount = $1,
         updated_at = now()
     where id = true
     returning dark_mode,
               theme_mode,
               pin_enabled,
               currency,
               ledger_name,
               target_asset_amount`,
    [targetAssetAmount],
  );

  res.json(result.rows[0]);
}));

app.put('/api/settings/pin', asyncHandler(async (req, res) => {
  const enabled = Boolean(req.body.enabled);
  let hash = null;

  if (enabled) {
    const payload = pinSchema.parse({ pin: req.body.pin });
    hash = await bcrypt.hash(payload.pin, 10);
  }

  const result = await query(
    `update app_settings
     set pin_enabled = $1,
         pin_hash = $2,
         updated_at = now()
     where id = true
     returning dark_mode, pin_enabled, currency`,
    [enabled, hash],
  );
  res.json(result.rows[0]);
}));

app.post('/api/settings/unlock', asyncHandler(async (req, res) => {
  const payload = pinSchema.parse({ pin: req.body.pin });
  const settings = await getSettings();

  if (!settings.pin_enabled || !settings.pin_hash) {
    return res.json({ success: true });
  }

  const isValid = await bcrypt.compare(payload.pin, settings.pin_hash);
  if (!isValid) {
    return res.status(401).json({ message: 'PIN이 올바르지 않습니다.' });
  }

  return res.json({ success: true });
}));

app.get('/api/system/backup', asyncHandler(async (_req, res) => {
  const [categories, transactions, favorites, recurringTransactions, fixedExpenses, budgets, assets, assetSnapshots, transactionHistories, uploadLogs, settings] = await Promise.all([
    query(`select * from categories order by created_at asc`),
    query(`select * from transactions order by transaction_date asc, created_at asc`),
    query(`select * from favorites order by created_at asc`),
    query(`select * from recurring_transactions order by created_at asc`),
    query(`select * from fixed_expenses order by created_at asc`),
    query(`select * from budgets order by month_start asc`),
    query(`select * from asset_accounts order by display_order asc, created_at asc`),
    query(`select * from asset_snapshots order by snapshot_date asc`),
    query(`select * from transaction_histories order by created_at asc`),
    query(`select * from upload_logs order by created_at asc`),
    query(`select * from app_settings where id = true`),
  ]);

  res.json({
    exported_at: new Date().toISOString(),
    categories: categories.rows,
    transactions: transactions.rows,
    favorites: favorites.rows,
    recurring_transactions: recurringTransactions.rows,
    fixed_expenses: fixedExpenses.rows,
    budgets: budgets.rows,
    asset_accounts: assets.rows,
    asset_snapshots: assetSnapshots.rows,
    transaction_histories: transactionHistories.rows,
    upload_logs: uploadLogs.rows,
    app_settings: settings.rows,
  });
}));

app.post('/api/system/restore', asyncHandler(async (req, res) => {
  const payload = req.body;

  await withTransaction(async (client) => {
    await client.query('delete from transaction_histories');
    await client.query('delete from upload_logs');
    await client.query('delete from asset_snapshots');
    await client.query('delete from transactions');
    await client.query('delete from favorites');
    await client.query('delete from recurring_transactions');
    await client.query('delete from fixed_expenses');
    await client.query('delete from budgets');
    await client.query('delete from categories');
    await client.query('delete from asset_accounts');

    for (const row of payload.asset_snapshots || []) {
      await client.query(
        `insert into asset_snapshots (
          id, snapshot_date, total_asset_amount,
          cash_amount, bank_amount, saving_amount,
          investment_amount, card_amount, etc_amount,
          created_at
        ) values (
          $1, $2, $3,
          $4, $5, $6,
          $7, $8, $9,
          coalesce($10, now())
        )
        on conflict (snapshot_date)
        do update set
          total_asset_amount = excluded.total_asset_amount,
          cash_amount = excluded.cash_amount,
          bank_amount = excluded.bank_amount,
          saving_amount = excluded.saving_amount,
          investment_amount = excluded.investment_amount,
          card_amount = excluded.card_amount,
          etc_amount = excluded.etc_amount`,
        [
          row.id,
          row.snapshot_date,
          row.total_asset_amount || 0,
          row.cash_amount || 0,
          row.bank_amount || 0,
          row.saving_amount || 0,
          row.investment_amount || 0,
          row.card_amount || 0,
          row.etc_amount || 0,
          row.created_at,
        ],
      );
    }

    for (const row of payload.asset_accounts || []) {
      await client.query(
        `insert into asset_accounts (
          id, name, asset_type, balance, initial_balance,
          display_order, memo, created_at, updated_at
        ) values (
          $1, $2, $3, $4, $5,
          $6, $7, coalesce($8, now()), coalesce($9, now())
        )`,
        [
          row.id,
          row.name,
          row.asset_type || '입출금',
          row.balance || 0,
          row.initial_balance ?? row.balance ?? 0,
          row.display_order || 0,
          row.memo || null,
          row.created_at,
          row.updated_at,
        ],
      );
    }

    for (const row of payload.categories || []) {
      await client.query(
        `insert into categories (id, name, type, color, is_default, created_at, updated_at)
         values ($1, $2, $3, $4, $5, coalesce($6, now()), coalesce($7, now()))`,
        [row.id, row.name, row.type, row.color, row.is_default, row.created_at, row.updated_at],
      );
    }

    for (const row of payload.transactions || []) {
      await client.query(
        `insert into transactions (
          id,
          transaction_date,
          type,
          amount,
          category_id,
          asset_account_id,
          transfer_to_asset_account_id,
          note,
          payment_method,
          cash_status,
          cash_unsettled_amount,
          created_at,
          updated_at
        ) values (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8,
            $9,
            $10,
            $11,
            coalesce($12, now()),
            coalesce($13, now())
          )`,
        [
        row.id,
        row.transaction_date,
        row.type,
        row.amount,
        row.category_id,
        row.asset_account_id,
        row.transfer_to_asset_account_id || null,
        row.note,
        row.payment_method,
        row.cash_status || 'none',
        row.cash_unsettled_amount || 0,
        row.created_at,
        row.updated_at,
      ],
      );
    }

    for (const row of payload.favorites || []) {
      await client.query(
        `insert into favorites (id, name, type, amount, category_id, note, payment_method, created_at, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, coalesce($8, now()), coalesce($9, now()))`,
        [row.id, row.name, row.type, row.amount, row.category_id, row.note, row.payment_method, row.created_at, row.updated_at],
      );
    }

    for (const row of payload.recurring_transactions || []) {
      await client.query(
        `insert into recurring_transactions (
          id, name, type, amount, category_id, note, payment_method, frequency,
          interval_count, start_date, weekday, day_of_month, next_run_date,
          last_generated_on, is_active, created_at, updated_at
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, coalesce($16, now()), coalesce($17, now()))`,
        [
          row.id,
          row.name,
          row.type,
          row.amount,
          row.category_id,
          row.note,
          row.payment_method,
          row.frequency,
          row.interval_count,
          row.start_date,
          row.weekday,
          row.day_of_month,
          row.next_run_date,
          row.last_generated_on,
          row.is_active,
          row.created_at,
          row.updated_at,
        ],
      );
    }

    for (const row of payload.fixed_expenses || []) {
      await client.query(
        `insert into fixed_expenses (
          id, name, type, amount, category_id,
          from_asset_account_id, to_asset_account_id,
          note, payment_method,
          day_of_month, start_date, next_run_date, last_generated_on,
          is_active, created_at, updated_at
        ) values (
          $1, $2, $3, $4, $5,
          $6, $7,
          $8, $9,
          $10, $11, $12, $13,
          $14, coalesce($15, now()), coalesce($16, now())
        )`,
        [
          row.id,
          row.name,
          row.type || 'expense',
          row.amount,
          row.category_id,
          row.from_asset_account_id || null,
          row.to_asset_account_id || null,
          row.note,
          row.payment_method,
          row.day_of_month,
          row.start_date,
          row.next_run_date,
          row.last_generated_on,
          row.is_active,
          row.created_at,
          row.updated_at,
        ],
      );
    }

    for (const row of payload.budgets || []) {
      await client.query(
        `insert into budgets (id, month_start, category_id, amount, created_at, updated_at)
         values ($1, $2, $3, $4, coalesce($5, now()), coalesce($6, now()))`,
        [row.id, row.month_start, row.category_id, row.amount, row.created_at, row.updated_at],
      );
    }

    for (const row of payload.upload_logs || []) {
  await client.query(
    `insert into upload_logs (
      id,
      upload_type,
      file_name,
      total_rows,
      imported_rows,
      excluded_rows,
      transfer_rows,
      status,
      error_message,
      created_at
    ) values (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, coalesce($10, now())
    )`,
    [
      row.id,
      row.upload_type || 'transaction_excel',
      row.file_name || null,
      row.total_rows || 0,
      row.imported_rows || 0,
      row.excluded_rows || 0,
      row.transfer_rows || 0,
      row.status || 'success',
      row.error_message || null,
      row.created_at,
    ],
  );
}

    for (const row of payload.transaction_histories || []) {
      await client.query(
        `insert into transaction_histories (
          id, transaction_id, action, before_data, after_data, created_at
        ) values (
          $1, $2, $3, $4::jsonb, $5::jsonb, coalesce($6, now())
        )`,
        [
          row.id,
          row.transaction_id || null,
          row.action,
          JSON.stringify(row.before_data || {}),
          row.after_data ? JSON.stringify(row.after_data) : null,
          row.created_at,
        ],
      );
    }

    const settings = (payload.app_settings || [])[0] || {
      id: true,
      dark_mode: false,
      theme_mode: 'light',
      pin_enabled: false,
      pin_hash: null,
      currency: 'KRW',
      ledger_name: '가계부',
      target_asset_amount: 0,
    };
    
    await client.query(`delete from app_settings`);
    
    await client.query(
      `insert into app_settings (
        id, dark_mode, theme_mode, pin_enabled, pin_hash,
        currency, ledger_name, target_asset_amount, updated_at
      )
      values (true, $1, $2, $3, $4, $5, $6, $7, now())`,
      [
        Boolean(settings.dark_mode),
        settings.theme_mode || (settings.dark_mode ? 'dark' : 'light'),
        Boolean(settings.pin_enabled),
        settings.pin_hash || null,
        settings.currency || 'KRW',
        settings.ledger_name || '가계부',
        Number(settings.target_asset_amount || 0),
      ],
    );
  });

// await ensureAutomationFresh();
  res.json({ success: true });
}));

app.post('/api/system/run-automation', asyncHandler(async (_req, res) => {
  await runAutomation(true);
  res.json({ success: true });
}));

app.use((error, _req, res, _next) => {
  console.error(error);

  if (error instanceof ZodError) {
    return res.status(400).json({
      message: '입력값이 올바르지 않습니다.',
      details: error.flatten(),
    });
  }

  if (error.message === 'Not allowed by CORS') {
    return res.status(403).json({ message: error.message });
  }

  return res.status(500).json({
    message: error.message || '서버 오류가 발생했습니다.',
  });
});

async function start() {
  try {
    if (config.databaseUrl) {
      await initDatabase();
      await runAutomation(true);
      startAutomationScheduler();
    } else {
      console.warn('[DB] DATABASE_URL is missing. Schema initialization skipped.');
    }

    app.listen(config.port, () => {
      console.log(`Backend server listening on http://localhost:${config.port}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();

// ===== DB 풀 상태 확인용 테스트 API =====
app.use(cors({ origin: '*' })); // 이미 상단에서 선언되어 있으면 삭제 가능

app.get('/api/test-pool', asyncHandler(async (_req, res) => {
  res.json({
    ok: true,
    pool: {
      total: pool.totalCount,
      idle: pool.idleCount,
      waiting: pool.waitingCount
    }
  });
}));
