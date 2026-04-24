const { z } = require('zod');

const transactionSchema = z.object({
  transaction_date: z.string().min(1),
  type: z.enum(['income', 'expense']).default('expense'),
  amount: z.coerce.number().int().nonnegative(),
  category_id: z.string().uuid().nullable().optional(),
  note: z.string().max(500).nullable().optional(),
  payment_method: z.string().max(50).default('현금'),
});

const categorySchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['income', 'expense', 'both']).default('expense'),
  color: z.string().max(20).default('#6366f1'),
});

const favoriteSchema = z.object({
  name: z.string().min(1).max(120),
  type: z.enum(['income', 'expense']).default('expense'),
  amount: z.coerce.number().int().nonnegative(),
  category_id: z.string().uuid().nullable().optional(),
  note: z.string().max(500).nullable().optional(),
  payment_method: z.string().max(50).default('현금'),
});

const recurringSchema = z.object({
  name: z.string().min(1).max(120),
  type: z.enum(['income', 'expense']).default('expense'),
  amount: z.coerce.number().int().nonnegative(),
  category_id: z.string().uuid().nullable().optional(),
  note: z.string().max(500).nullable().optional(),
  payment_method: z.string().max(50).default('현금'),
  frequency: z.enum(['daily', 'weekly', 'monthly']),
  interval_count: z.coerce.number().int().min(1).default(1),
  start_date: z.string().min(1),
  weekday: z.coerce.number().int().min(0).max(6).nullable().optional(),
  day_of_month: z.coerce.number().int().min(1).max(31).nullable().optional(),
  is_active: z.coerce.boolean().default(true),
});

const fixedExpenseSchema = z.object({
  name: z.string().min(1).max(120),
  amount: z.coerce.number().int().nonnegative(),
  category_id: z.string().uuid().nullable().optional(),
  note: z.string().max(500).nullable().optional(),
  payment_method: z.string().max(50).default('자동이체'),
  day_of_month: z.coerce.number().int().min(1).max(31),
  start_date: z.string().min(1),
  is_active: z.coerce.boolean().default(true),
});

const budgetSchema = z.object({
  month_start: z.string().min(1),
  category_id: z.string().uuid().nullable().optional(),
  amount: z.coerce.number().int().nonnegative(),
});

const pinSchema = z.object({
  pin: z.string().regex(/^\d{4,8}$/),
});

module.exports = {
  transactionSchema,
  categorySchema,
  favoriteSchema,
  recurringSchema,
  fixedExpenseSchema,
  budgetSchema,
  pinSchema,
};
