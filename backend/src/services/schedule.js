const dayjs = require('dayjs');

function toIsoDate(dateLike) {
  return dayjs(dateLike).format('YYYY-MM-DD');
}

function monthlyDate(baseDate, dayOfMonth) {
  const base = dayjs(baseDate);
  const safeDay = Math.min(dayOfMonth, base.daysInMonth());
  return base.date(safeDay);
}

function getInitialRecurringNextRunDate(payload) {
  const start = dayjs(payload.start_date).startOf('day');
  const frequency = payload.frequency;
  const intervalCount = Number(payload.interval_count || 1);

  if (frequency === 'daily') {
    return toIsoDate(start);
  }

  if (frequency === 'weekly') {
    const targetWeekday = Number(payload.weekday ?? start.day());
    let cursor = start;
    while (cursor.day() !== targetWeekday) {
      cursor = cursor.add(1, 'day');
    }
    return toIsoDate(cursor);
  }

  const targetDay = Number(payload.day_of_month || start.date());
  let cursor = monthlyDate(start.date(1), targetDay);
  if (cursor.isBefore(start, 'day')) {
    cursor = monthlyDate(start.add(intervalCount, 'month').date(1), targetDay);
  }
  return toIsoDate(cursor);
}

function getInitialFixedExpenseNextRunDate(payload) {
  const start = dayjs(payload.start_date).startOf('day');
  const targetDay = Number(payload.day_of_month);
  let cursor = monthlyDate(start.date(1), targetDay);
  if (cursor.isBefore(start, 'day')) {
    cursor = monthlyDate(start.add(1, 'month').date(1), targetDay);
  }
  return toIsoDate(cursor);
}

function getNextRecurringDate(item, baseDate) {
  const base = dayjs(baseDate).startOf('day');
  const intervalCount = Number(item.interval_count || 1);

  if (item.frequency === 'daily') {
    return toIsoDate(base.add(intervalCount, 'day'));
  }

  if (item.frequency === 'weekly') {
    return toIsoDate(base.add(intervalCount, 'week'));
  }

  const targetDay = Number(item.day_of_month || base.date());
  const nextBase = base.add(intervalCount, 'month').date(1);
  return toIsoDate(monthlyDate(nextBase, targetDay));
}

function getNextFixedExpenseDate(item, baseDate) {
  const base = dayjs(baseDate).startOf('day');
  const nextBase = base.add(1, 'month').date(1);
  return toIsoDate(monthlyDate(nextBase, Number(item.day_of_month)));
}

function getMonthRange(month) {
  const current = month ? dayjs(`${month}-01`) : dayjs().startOf('month');
  return {
    month: current.format('YYYY-MM'),
    start: current.startOf('month').format('YYYY-MM-DD'),
    end: current.endOf('month').format('YYYY-MM-DD'),
    prevStart: current.subtract(1, 'month').startOf('month').format('YYYY-MM-DD'),
    prevEnd: current.subtract(1, 'month').endOf('month').format('YYYY-MM-DD'),
  };
}

module.exports = {
  toIsoDate,
  getInitialRecurringNextRunDate,
  getInitialFixedExpenseNextRunDate,
  getNextRecurringDate,
  getNextFixedExpenseDate,
  getMonthRange,
};
