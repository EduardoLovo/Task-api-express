function createAuthController(authService) {
  return {
    async register(req, res) {
      const result = await authService.register(req.validated.body);
      res.status(201).json({ data: result });
    },

    async login(req, res) {
      const result = await authService.login(req.validated.body);
      res.json({ data: result });
    },

    me(req, res) {
      res.json({ data: req.user });
    },
  };
}

module.exports = { createAuthController };
