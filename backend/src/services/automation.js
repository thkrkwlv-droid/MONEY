const dayjs = require('dayjs');
const cron = require('node-cron');
const { withTransaction } = require('../db');
const { getNextRecurringDate, getNextFixedExpenseDate, toIsoDate } = require('./schedule');

let isRunning = false;
let lastRunAt = 0;

async function processRecurringTransactions(client, todayIso) {
  const { rows } = await client.query(
    `select * from recurring_transactions
     where is_active = true and next_run_date <= $1
     order by next_run_date asc`,
    [todayIso],
  );

  for (const item of rows) {
    let cursor = dayjs(item.next_run_date).startOf('day');
    const today = dayjs(todayIso).startOf('day');
    let lastGeneratedOn = null;

    while (!cursor.isAfter(today, 'day')) {
      const dueDate = cursor.format('YYYY-MM-DD');
      await client.query(
        `insert into transactions (
          transaction_date, type, amount, category_id, note, payment_method,
          source_type, source_id, auto_generated
        )
        values ($1, $2, $3, $4, $5, $6, 'recurring', $7, true)
        on conflict (source_type, source_id, transaction_date) do nothing`,
        [
          dueDate,
          item.type,
          item.amount,
          item.category_id,
          item.note,
          item.payment_method,
          item.id,
        ],
      );
      lastGeneratedOn = dueDate;
      cursor = dayjs(getNextRecurringDate(item, dueDate));
    }

    if (lastGeneratedOn) {
      await client.query(
        `update recurring_transactions
         set last_generated_on = $1,
             next_run_date = $2,
             updated_at = now()
         where id = $3`,
        [lastGeneratedOn, cursor.format('YYYY-MM-DD'), item.id],
      );
    }
  }
}

async function processFixedExpenses(client, todayIso) {
  const { rows } = await client.query(
    `select * from fixed_expenses
     where is_active = true and next_run_date <= $1
     order by next_run_date asc`,
    [todayIso],
  );

  for (const item of rows) {
    let cursor = dayjs(item.next_run_date).startOf('day');
    const today = dayjs(todayIso).startOf('day');
    let lastGeneratedOn = null;

    while (!cursor.isAfter(today, 'day')) {
      const dueDate = cursor.format('YYYY-MM-DD');
      await client.query(
        `insert into transactions (
          transaction_date, type, amount, category_id, note, payment_method,
          source_type, source_id, auto_generated
        )
        values ($1, 'expense', $2, $3, $4, $5, 'fixed_expense', $6, true)
        on conflict (source_type, source_id, transaction_date) do nothing`,
        [
          dueDate,
          item.amount,
          item.category_id,
          item.note || item.name,
          item.payment_method,
          item.id,
        ],
      );
      lastGeneratedOn = dueDate;
      cursor = dayjs(getNextFixedExpenseDate(item, dueDate));
    }

    if (lastGeneratedOn) {
      await client.query(
        `update fixed_expenses
         set last_generated_on = $1,
             next_run_date = $2,
             updated_at = now()
         where id = $3`,
        [lastGeneratedOn, cursor.format('YYYY-MM-DD'), item.id],
      );
    }
  }
}

async function runAutomation(force = false) {
  if (isRunning) {
    return;
  }

  const now = Date.now();
  if (!force && now - lastRunAt < 60 * 1000) {
    return;
  }

  isRunning = true;
  try {
    const todayIso = toIsoDate(new Date());
    await withTransaction(async (client) => {
      await processRecurringTransactions(client, todayIso);
      await processFixedExpenses(client, todayIso);
    });
    lastRunAt = Date.now();
  } finally {
    isRunning = false;
  }
}

function startAutomationScheduler() {
  cron.schedule('0 * * * *', async () => {
    try {
      await runAutomation(true);
      console.log('[Automation] scheduled run completed at', toIsoDate(new Date()));
    } catch (error) {
      console.error('[Automation] scheduled run failed', error);
    }
  });
}

module.exports = {
  runAutomation,
  startAutomationScheduler,
};
