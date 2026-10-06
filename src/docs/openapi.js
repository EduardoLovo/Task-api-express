const { STATUSES, PRIORITIES, SORT_FIELDS } = require('../modules/tasks/task.schemas');

const errorResponse = (description, example) => ({
  description,
  content: {
    'application/json': {
      schema: { $ref: '#/components/schemas/Error' },
      example: { error: { requestId: 'b3f1c2d4-5e6f-7a8b-9c0d-1e2f3a4b5c6d', details: [], ...example } },
    },
  },
});

const responses = {
  ValidationError: errorResponse('Dados inválidos', {
    status: 400,
    code: 'VALIDATION_ERROR',
    message: 'Dados da requisição inválidos',
    details: [{ location: 'body', field: 'title', message: 'Título é obrigatório' }],
  }),
  InvalidJson: errorResponse('JSON malformado', {
    status: 400,
    code: 'INVALID_JSON',
    message: 'JSON malformado no corpo da requisição',
  }),
  Unauthorized: errorResponse('Não autenticado (MISSING_TOKEN, INVALID_AUTH_HEADER, INVALID_TOKEN, TOKEN_EXPIRED)', {
    status: 401,
    code: 'MISSING_TOKEN',
    message: 'Token de autenticação não informado',
  }),
  Forbidden: errorResponse('A tarefa pertence a outro usuário', {
    status: 403,
    code: 'FORBIDDEN',
    message: 'Você não tem permissão para acessar esta tarefa',
  }),
  TaskNotFound: errorResponse('Tarefa não encontrada', {
    status: 404,
    code: 'TASK_NOT_FOUND',
    message: 'Tarefa não encontrada',
  }),
  PayloadTooLarge: errorResponse('Corpo maior que o limite', {
    status: 413,
    code: 'PAYLOAD_TOO_LARGE',
    message: 'Corpo da requisição excede o tamanho máximo permitido',
  }),
  UnsupportedMediaType: errorResponse('Content-Type diferente de application/json', {
    status: 415,
    code: 'UNSUPPORTED_MEDIA_TYPE',
    message: 'Content-Type deve ser application/json',
  }),
  TooManyRequests: errorResponse('Limite de requisições excedido', {
    status: 429,
    code: 'TOO_MANY_REQUESTS',
    message: 'Muitas requisições, tente novamente mais tarde',
  }),
  InternalError: errorResponse('Erro inesperado', {
    status: 500,
    code: 'INTERNAL_ERROR',
    message: 'Erro interno do servidor',
  }),
};

const bodyErrors = {
  400: { $ref: '#/components/responses/ValidationError' },
  413: { $ref: '#/components/responses/PayloadTooLarge' },
  415: { $ref: '#/components/responses/UnsupportedMediaType' },
};

const commonErrors = {
  429: { $ref: '#/components/responses/TooManyRequests' },
  500: { $ref: '#/components/responses/InternalError' },
};

const json = (schema) => ({ content: { 'application/json': { schema } } });
const dataOf = (ref) => ({ type: 'object', properties: { data: { $ref: ref } } });
const taskIdParam = { name: 'id', in: 'path', required: true, schema: { type: 'integer', minimum: 1 } };

const openapi = {
  openapi: '3.0.3',
  info: {
    title: 'Task API (Express)',
    version: '1.0.0',
    description:
      'API de gerenciamento de tarefas com autenticação JWT. Todos os erros seguem o formato `Error`.',
  },
  servers: [{ url: '/' }],
  tags: [{ name: 'Health' }, { name: 'Auth' }, { name: 'Tasks' }],
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    responses,
    schemas: {
      Error: {
        type: 'object',
        required: ['error'],
        properties: {
          error: {
            type: 'object',
            required: ['status', 'code', 'message', 'details', 'requestId'],
            properties: {
              status: { type: 'integer' },
              code: { type: 'string' },
              message: { type: 'string' },
              details: { type: 'array', items: { type: 'object' } },
              requestId: { type: 'string' },
            },
          },
        },
      },
      User: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          name: { type: 'string' },
          email: { type: 'string', format: 'email' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      AuthResult: {
        type: 'object',
        properties: {
          user: { $ref: '#/components/schemas/User' },
          accessToken: { type: 'string' },
          tokenType: { type: 'string', example: 'Bearer' },
          expiresIn: { type: 'string', example: '1h' },
        },
      },
      Task: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          title: { type: 'string' },
          description: { type: 'string', nullable: true },
          status: { type: 'string', enum: STATUSES },
          priority: { type: 'string', enum: PRIORITIES },
          dueDate: { type: 'string', format: 'date', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      CreateTask: {
        type: 'object',
        required: ['title'],
        additionalProperties: false,
        properties: {
          title: { type: 'string', minLength: 1, maxLength: 120 },
          description: { type: 'string', maxLength: 1000, nullable: true },
          status: { type: 'string', enum: STATUSES, default: 'pending' },
          priority: { type: 'string', enum: PRIORITIES, default: 'medium' },
          dueDate: { type: 'string', format: 'date', nullable: true },
        },
      },
      UpdateTask: {
        type: 'object',
        minProperties: 1,
        additionalProperties: false,
        properties: {
          title: { type: 'string', minLength: 1, maxLength: 120 },
          description: { type: 'string', maxLength: 1000, nullable: true },
          status: { type: 'string', enum: STATUSES },
          priority: { type: 'string', enum: PRIORITIES },
          dueDate: { type: 'string', format: 'date', nullable: true },
        },
      },
    },
  },
  paths: {
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Verifica se a API e o banco estão no ar',
        responses: {
          200: { description: 'OK' },
          503: errorResponse('Banco indisponível', {
            status: 503,
            code: 'DATABASE_UNAVAILABLE',
            message: 'Banco de dados indisponível',
          }),
          ...commonErrors,
        },
      },
    },
    '/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Cria uma conta e devolve um token',
        requestBody: {
          required: true,
          ...json({
            type: 'object',
            required: ['name', 'email', 'password'],
            additionalProperties: false,
            properties: {
              name: { type: 'string', minLength: 2, maxLength: 100 },
              email: { type: 'string', format: 'email' },
              password: { type: 'string', minLength: 8, maxLength: 72 },
            },
          }),
        },
        responses: {
          201: { description: 'Conta criada', ...json(dataOf('#/components/schemas/AuthResult')) },
          ...bodyErrors,
          409: errorResponse('E-mail já cadastrado', {
            status: 409,
            code: 'EMAIL_ALREADY_EXISTS',
            message: 'Este e-mail já está cadastrado',
          }),
          ...commonErrors,
        },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Autentica e devolve um token',
        requestBody: {
          required: true,
          ...json({
            type: 'object',
            required: ['email', 'password'],
            additionalProperties: false,
            properties: { email: { type: 'string', format: 'email' }, password: { type: 'string' } },
          }),
        },
        responses: {
          200: { description: 'Autenticado', ...json(dataOf('#/components/schemas/AuthResult')) },
          ...bodyErrors,
          401: errorResponse('Credenciais inválidas', {
            status: 401,
            code: 'INVALID_CREDENTIALS',
            message: 'E-mail ou senha inválidos',
          }),
          ...commonErrors,
        },
      },
    },
    '/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'Dados do usuário autenticado',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'OK', ...json(dataOf('#/components/schemas/User')) },
          401: { $ref: '#/components/responses/Unauthorized' },
          ...commonErrors,
        },
      },
    },
    '/tasks': {
      get: {
        tags: ['Tasks'],
        summary: 'Lista as tarefas do usuário (com filtros e paginação)',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string', enum: STATUSES } },
          { name: 'priority', in: 'query', schema: { type: 'string', enum: PRIORITIES } },
          { name: 'search', in: 'query', schema: { type: 'string', maxLength: 100 } },
          { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 10 } },
          { name: 'sortBy', in: 'query', schema: { type: 'string', enum: SORT_FIELDS, default: 'createdAt' } },
          { name: 'order', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'], default: 'desc' } },
        ],
        responses: {
          200: {
            description: 'OK',
            ...json({
              type: 'object',
              properties: {
                data: { type: 'array', items: { $ref: '#/components/schemas/Task' } },
                meta: {
                  type: 'object',
                  properties: {
                    page: { type: 'integer' },
                    limit: { type: 'integer' },
                    total: { type: 'integer' },
                    totalPages: { type: 'integer' },
                  },
                },
              },
            }),
          },
          400: { $ref: '#/components/responses/ValidationError' },
          401: { $ref: '#/components/responses/Unauthorized' },
          ...commonErrors,
        },
      },
      post: {
        tags: ['Tasks'],
        summary: 'Cria uma tarefa',
        security: [{ bearerAuth: [] }],
        requestBody: { required: true, ...json({ $ref: '#/components/schemas/CreateTask' }) },
        responses: {
          201: { description: 'Criada', ...json(dataOf('#/components/schemas/Task')) },
          ...bodyErrors,
          401: { $ref: '#/components/responses/Unauthorized' },
          ...commonErrors,
        },
      },
    },
    '/tasks/{id}': {
      parameters: [taskIdParam],
      get: {
        tags: ['Tasks'],
        summary: 'Busca uma tarefa',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'OK', ...json(dataOf('#/components/schemas/Task')) },
          400: { $ref: '#/components/responses/ValidationError' },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { $ref: '#/components/responses/Forbidden' },
          404: { $ref: '#/components/responses/TaskNotFound' },
          ...commonErrors,
        },
      },
      patch: {
        tags: ['Tasks'],
        summary: 'Atualiza parcialmente uma tarefa',
        security: [{ bearerAuth: [] }],
        requestBody: { required: true, ...json({ $ref: '#/components/schemas/UpdateTask' }) },
        responses: {
          200: { description: 'Atualizada', ...json(dataOf('#/components/schemas/Task')) },
          ...bodyErrors,
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { $ref: '#/components/responses/Forbidden' },
          404: { $ref: '#/components/responses/TaskNotFound' },
          ...commonErrors,
        },
      },
      delete: {
        tags: ['Tasks'],
        summary: 'Remove uma tarefa',
        security: [{ bearerAuth: [] }],
        responses: {
          204: { description: 'Removida' },
          400: { $ref: '#/components/responses/ValidationError' },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { $ref: '#/components/responses/Forbidden' },
          404: { $ref: '#/components/responses/TaskNotFound' },
          ...commonErrors,
        },
      },
    },
  },
};

module.exports = { openapi };
