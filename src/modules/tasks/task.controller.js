function createTaskController(taskService) {
  return {
    list(req, res) {
      res.json(taskService.list(req.user.id, req.validated.query));
    },

    get(req, res) {
      res.json({ data: taskService.get(req.user.id, req.validated.params.id) });
    },

    create(req, res) {
      const task = taskService.create(req.user.id, req.validated.body);
      res.status(201).location(`${req.baseUrl}/${task.id}`).json({ data: task });
    },

    update(req, res) {
      const task = taskService.update(req.user.id, req.validated.params.id, req.validated.body);
      res.json({ data: task });
    },

    remove(req, res) {
      taskService.remove(req.user.id, req.validated.params.id);
      res.status(204).end();
    },
  };
}

module.exports = { createTaskController };
