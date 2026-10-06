const { forbidden, notFound } = require('../../errors/AppError');

function toPublicTask(task) {
  const { userId, ...rest } = task;
  return rest;
}

function createTaskService({ taskRepository }) {
  function getOwnedTask(userId, taskId) {
    const task = taskRepository.findById(taskId);
    if (!task) {
      throw notFound('TASK_NOT_FOUND', 'Tarefa não encontrada');
    }
    if (task.userId !== userId) {
      throw forbidden('FORBIDDEN', 'Você não tem permissão para acessar esta tarefa');
    }
    return task;
  }

  return {
    list(userId, query) {
      const { items, total } = taskRepository.list({ userId, ...query });
      return {
        data: items.map(toPublicTask),
        meta: {
          page: query.page,
          limit: query.limit,
          total,
          totalPages: Math.ceil(total / query.limit),
        },
      };
    },

    get(userId, taskId) {
      return toPublicTask(getOwnedTask(userId, taskId));
    },

    create(userId, data) {
      return toPublicTask(taskRepository.create(userId, data));
    },

    update(userId, taskId, data) {
      getOwnedTask(userId, taskId);
      return toPublicTask(taskRepository.update(taskId, data));
    },

    remove(userId, taskId) {
      getOwnedTask(userId, taskId);
      taskRepository.delete(taskId);
    },
  };
}

module.exports = { createTaskService };
