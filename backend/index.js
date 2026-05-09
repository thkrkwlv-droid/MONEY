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
  return rows[0] || { dark_mode: false, theme_mode: 'light', pin_enabled: false, currency: 'KRW', ledger_name: '가계부' };
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
    `select f.*, c.name as category_name
     from fixed_expenses f
     left join categories c on c.id = f.category_id
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
      ) as unsettled_cash
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
  await ensureAutomationFresh();
const [categories, favorites, recurringTransactions, fixedExpenses, settings, transactions, dashboard, recentCategories, budgets, assets] =    await Promise.all([
      getCategories(),
      getFavorites(),
      getRecurringTransactions(),
      getFixedExpenses(),
      getSettings(),
      getTransactions({ month }),
      getDashboard(month),
      getRecentCategories(),
      getBudgets(month),
      getAssets(),
    ]);

  return {
    categories,
    favorites,
    recurringTransactions,
    fixedExpenses,
    settings,
    transactions,
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
  await ensureAutomationFresh();
  const dashboard = await getDashboard(req.query.month);
  const budgets = await getBudgets(req.query.month);
  res.json({ dashboard, budgets });
}));

app.get('/api/transactions', asyncHandler(async (req, res) => {
  await ensureAutomationFresh();
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
    note: normalizeText(req.body.note),
  });

  const updated = await withTransaction(async (client) => {
    const result = await client.query(
      `update transactions
       set transaction_date = $1,
           type = $2,
           amount = $3,
           category_id = $4,
           asset_account_id = $5,
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

    await recalculateAllAssets(client);

    return result.rows[0];
  });

  res.json(updated);
}));

app.delete('/api/transactions/:id', asyncHandler(async (req, res) => {
  await withTransaction(async (client) => {
    await client.query(
      `delete from transactions where id = $1`,
      [req.params.id],
    );

    await recalculateAllAssets(client);
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

  await ensureAutomationFresh();
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

  await ensureAutomationFresh();
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
    note: normalizeText(req.body.note),
  });

  const nextRunDate = getInitialFixedExpenseNextRunDate(payload);
  const result = await query(
    `insert into fixed_expenses (
      name, amount, category_id, note, payment_method,
      day_of_month, start_date, next_run_date, is_active
    )
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    returning *`,
    [
      payload.name,
      payload.amount,
      payload.category_id,
      payload.note,
      payload.payment_method,
      payload.day_of_month,
      payload.start_date,
      nextRunDate,
      payload.is_active,
    ],
  );

  await ensureAutomationFresh();
  res.status(201).json(result.rows[0]);
}));

app.put('/api/fixed-expenses/:id', asyncHandler(async (req, res) => {
  const payload = fixedExpenseSchema.parse({
    ...req.body,
    category_id: normalizeUuid(req.body.category_id),
    note: normalizeText(req.body.note),
  });

  const nextRunDate = getInitialFixedExpenseNextRunDate(payload);
  const result = await query(
    `update fixed_expenses
     set name = $1,
         amount = $2,
         category_id = $3,
         note = $4,
         payment_method = $5,
         day_of_month = $6,
         start_date = $7,
         next_run_date = $8,
         is_active = $9,
         updated_at = now()
     where id = $10
     returning *`,
    [
      payload.name,
      payload.amount,
      payload.category_id,
      payload.note,
      payload.payment_method,
      payload.day_of_month,
      payload.start_date,
      nextRunDate,
      payload.is_active,
      req.params.id,
    ],
  );

  await ensureAutomationFresh();
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
  });
}));

app.post('/api/assets/recalculate', asyncHandler(async (_req, res) => {
  await withTransaction(async (client) => {
  await recalculateAllAssets(client);
});

  res.json({ success: true });
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
  const [categories, transactions, favorites, recurringTransactions, fixedExpenses, budgets, settings] = await Promise.all([
    query(`select * from categories order by created_at asc`),
    query(`select * from transactions order by transaction_date asc, created_at asc`),
    query(`select * from favorites order by created_at asc`),
    query(`select * from recurring_transactions order by created_at asc`),
    query(`select * from fixed_expenses order by created_at asc`),
    query(`select * from budgets order by month_start asc`),
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
    app_settings: settings.rows,
  });
}));

app.post('/api/system/restore', asyncHandler(async (req, res) => {
  const payload = req.body;

  await withTransaction(async (client) => {
    await client.query('delete from transactions');
    await client.query('delete from favorites');
    await client.query('delete from recurring_transactions');
    await client.query('delete from fixed_expenses');
    await client.query('delete from budgets');
    await client.query('delete from categories');

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
          id, transaction_date, type, amount, category_id, note, payment_method,
          source_type, source_id, auto_generated, created_at, updated_at
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, coalesce($11, now()), coalesce($12, now()))`,
        [
          row.id,
          row.transaction_date,
          row.type,
          row.amount,
          row.category_id,
          row.note,
          row.payment_method,
          row.source_type || 'restore',
          row.source_id,
          Boolean(row.auto_generated),
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
          id, name, amount, category_id, note, payment_method,
          day_of_month, start_date, next_run_date, last_generated_on,
          is_active, created_at, updated_at
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, coalesce($12, now()), coalesce($13, now()))`,
        [
          row.id,
          row.name,
          row.amount,
          row.category_id,
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

    const settings = (payload.app_settings || [])[0] || { id: true, dark_mode: false, pin_enabled: false, pin_hash: null, currency: 'KRW' };
    await client.query(`delete from app_settings`);
    await client.query(
      `insert into app_settings (id, dark_mode, pin_enabled, pin_hash, currency, updated_at)
       values (true, $1, $2, $3, $4, now())`,
      [Boolean(settings.dark_mode), Boolean(settings.pin_enabled), settings.pin_hash || null, settings.currency || 'KRW'],
    );
  });

  await ensureAutomationFresh();
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
