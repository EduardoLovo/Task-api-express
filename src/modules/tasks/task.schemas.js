const { z } = require('../../lib/zod');

const STATUSES = ['pending', 'in_progress', 'done'];
const PRIORITIES = ['low', 'medium', 'high'];
const SORT_FIELDS = ['createdAt', 'dueDate', 'priority', 'title'];

const status = z.enum(STATUSES, { error: `Status deve ser um de: ${STATUSES.join(', ')}` });
const priority = z.enum(PRIORITIES, { error: `Prioridade deve ser uma de: ${PRIORITIES.join(', ')}` });

const title = z
  .string({ error: (iss) => (iss.input === undefined ? 'Título é obrigatório' : 'Título deve ser um texto') })
  .trim()
  .min(1, 'Título não pode ser vazio')
  .max(120, 'Título deve ter no máximo 120 caracteres');

const description = z
  .string({ error: 'Descrição deve ser um texto ou null' })
  .trim()
  .max(1000, 'Descrição deve ter no máximo 1000 caracteres')
  .nullable();

const dueDate = z.iso.date({ error: 'Data de entrega deve estar no formato YYYY-MM-DD' }).nullable();

const createTaskSchema = z.strictObject({
  title,
  description: description.optional(),
  status: status.default('pending'),
  priority: priority.default('medium'),
  dueDate: dueDate.optional(),
});

const updateTaskSchema = z
  .strictObject({
    title: title.optional(),
    description: description.optional(),
    status: status.optional(),
    priority: priority.optional(),
    dueDate: dueDate.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, 'Informe ao menos um campo para atualizar');

const listTasksQuerySchema = z.strictObject({
  status: status.optional(),
  priority: priority.optional(),
  search: z
    .string({ error: 'search deve ser informado uma única vez' })
    .trim()
    .min(1, 'search não pode ser vazio')
    .max(100, 'search deve ter no máximo 100 caracteres')
    .optional(),
  page: z.coerce
    .number({ error: 'page deve ser um número' })
    .int('page deve ser um inteiro')
    .min(1, 'page deve ser maior ou igual a 1')
    .default(1),
  limit: z.coerce
    .number({ error: 'limit deve ser um número' })
    .int('limit deve ser um inteiro')
    .min(1, 'limit deve ser maior ou igual a 1')
    .max(100, 'limit deve ser no máximo 100')
    .default(10),
  sortBy: z.enum(SORT_FIELDS, { error: `sortBy deve ser um de: ${SORT_FIELDS.join(', ')}` }).default('createdAt'),
  order: z.enum(['asc', 'desc'], { error: 'order deve ser asc ou desc' }).default('desc'),
});

const taskIdParamsSchema = z.object({
  id: z
    .string()
    .regex(/^[1-9]\d{0,14}$/, 'ID deve ser um número inteiro positivo')
    .transform(Number),
});

module.exports = {
  STATUSES,
  PRIORITIES,
  SORT_FIELDS,
  createTaskSchema,
  updateTaskSchema,
  listTasksQuerySchema,
  taskIdParamsSchema,
};
