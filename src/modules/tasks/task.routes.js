const { Router } = require('express');
const { validate } = require('../../middlewares/validate');
const { allowMethods } = require('../../middlewares/methodNotAllowed');
const {
  createTaskSchema,
  updateTaskSchema,
  listTasksQuerySchema,
  taskIdParamsSchema,
} = require('./task.schemas');
const { createTaskController } = require('./task.controller');

function createTaskRouter({ taskService, authenticate }) {
  const router = Router();
  const controller = createTaskController(taskService);

  router.use(authenticate);

  router
    .route('/')
    .get(validate({ query: listTasksQuerySchema }), controller.list)
    .post(validate({ body: createTaskSchema }), controller.create)
    .all(allowMethods('GET', 'POST'));

  router
    .route('/:id')
    .get(validate({ params: taskIdParamsSchema }), controller.get)
    .patch(validate({ params: taskIdParamsSchema, body: updateTaskSchema }), controller.update)
    .delete(validate({ params: taskIdParamsSchema }), controller.remove)
    .all(allowMethods('GET', 'PATCH', 'DELETE'));

  return router;
}

module.exports = { createTaskRouter };
