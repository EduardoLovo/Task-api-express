const { Router } = require('express');
const { validate } = require('../../middlewares/validate');
const { allowMethods } = require('../../middlewares/methodNotAllowed');
const { createTaskSchema, updateTaskSchema, listTasksQuerySchema, taskIdParamsSchema } = require('./task.schemas');
const { createTaskController } = require('./task.controller');

function createTaskRouter({ taskService, authenticate }) {
  const router = Router();
  const controller = createTaskController(taskService);

  // Autenticação por rota (e não router.use) para que rota inexistente (404) e
  // método não suportado (405) sejam respondidos antes de exigir token.
  router
    .route('/')
    .get(authenticate, validate({ query: listTasksQuerySchema }), controller.list)
    .post(authenticate, validate({ body: createTaskSchema }), controller.create)
    .all(allowMethods('GET', 'POST'));

  router
    .route('/:id')
    .get(authenticate, validate({ params: taskIdParamsSchema }), controller.get)
    .patch(authenticate, validate({ params: taskIdParamsSchema, body: updateTaskSchema }), controller.update)
    .delete(authenticate, validate({ params: taskIdParamsSchema }), controller.remove)
    .all(allowMethods('GET', 'PATCH', 'DELETE'));

  return router;
}

module.exports = { createTaskRouter };
