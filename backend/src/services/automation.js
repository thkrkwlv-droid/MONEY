const dayjs = require('dayjs');
const cron = require('node-cron');
const { withTransaction } = require('../db');
const { getNextRecurringDate, getNextFixedExpenseDate, toIsoDate } = require('./schedule');

let isRunning = false;
let lastRunAt = 0;

async function processRecurringTransactions(client, todayIso) {
  const { rows } = await client.query(
    `select
        r.*
     from recurring_transactions r
     where r.is_active = true
       and r.next_run_date <= $1
     order by r.next_run_date asc`,
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
           user_id,
           transaction_date,
           type,
           amount,
           category_id,
           note,
           payment_method,
           source_type,
           source_id,
           auto_generated
        )
        values ($1, $2, $3, $4, $5, $6, $7, 'recurring', $8, true)
        on conflict (source_type, source_id, transaction_date) do nothing`,
        [
          item.user_id,
          dueDate,
          item.type,
          item.amount,
          item.category_id,
          item.note,
          item.payment_method,
          item.id,
        ]
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
    `select
        f.*
     from fixed_expenses f
     where f.is_active = true
       and f.next_run_date <= $1
     order by f.next_run_date asc`,
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
          user_id,
          transaction_date,
          type,
          amount,
          category_id,
          asset_account_id,
          transfer_to_asset_account_id,
          note,
          payment_method,
          source_type,
          source_id,
          auto_generated
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'fixed_expense', $10, true)
        on conflict (source_type, source_id, transaction_date) do nothing`,
        [
          item.user_id,
          dueDate,
          item.type || 'expense',
          item.amount,
          item.type === 'transfer' ? null : item.category_id,
          item.type === 'transfer' ? item.from_asset_account_id : null,
          item.type === 'transfer' ? item.to_asset_account_id : null,
          item.note || item.name,
          item.type === 'transfer' ? '자산이동' : item.payment_method,
          item.id,
        ]
      );

      if (item.type === 'transfer') {
        await client.query(
          `update asset_accounts
           set balance = balance - $1,
               updated_at = now()
           where id = $2`,
          [item.amount, item.from_asset_account_id],
        );
      
        await client.query(
          `update asset_accounts
           set balance = balance + $1,
               updated_at = now()
           where id = $2`,
          [item.amount, item.to_asset_account_id],
        );
      } else if (item.type === 'income' && item.from_asset_account_id) {
        await client.query(
          `update asset_accounts
           set balance = balance + $1,
               updated_at = now()
           where id = $2`,
          [item.amount, item.from_asset_account_id],
        );
      } else if (item.type === 'expense' && item.from_asset_account_id) {
        await client.query(
          `update asset_accounts
           set balance = balance - $1,
               updated_at = now()
           where id = $2`,
          [item.amount, item.from_asset_account_id],
        );
      }
      
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
