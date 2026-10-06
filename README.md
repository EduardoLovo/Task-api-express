# Task API — Express

API REST de gerenciamento de tarefas com autenticação JWT, feita em **Node.js + Express 5**.
O foco é **tratamento de erros completo**: toda falha, esperada ou não, devolve uma resposta JSON no mesmo formato.

> Projeto irmão: `task-api-flask`, com os mesmos endpoints e contratos em Python + Flask.

## Stack

| Item | Escolha |
|---|---|
| Runtime | Node.js ≥ 22.13 (usa o `node:sqlite` nativo) |
| Framework | Express 5 |
| Validação | Zod 4 (mensagens em português) |
| Auth | JWT (HS256) + bcryptjs |
| Banco | SQLite (arquivo local, sem servidor) |
| Segurança | helmet, cors, express-rate-limit |
| Docs | OpenAPI 3 + Swagger UI |
| Testes | Jest + Supertest |

## Como rodar

```bash
npm install
cp .env.example .env   # edite o JWT_SECRET
npm run dev            # reinicia ao salvar
```

- API: http://localhost:3000
- Documentação interativa: http://localhost:3000/docs
- Especificação: http://localhost:3000/openapi.json

```bash
npm test               # roda a suíte
npm run test:coverage  # com relatório de cobertura
```

## Endpoints

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| GET | `/health` | — | Status da API e do banco |
| POST | `/auth/register` | — | Cria conta e devolve token |
| POST | `/auth/login` | — | Autentica e devolve token |
| GET | `/auth/me` | ✔ | Dados do usuário logado |
| GET | `/tasks` | ✔ | Lista tarefas (filtros e paginação) |
| POST | `/tasks` | ✔ | Cria tarefa |
| GET | `/tasks/:id` | ✔ | Busca tarefa |
| PATCH | `/tasks/:id` | ✔ | Atualiza parcialmente |
| DELETE | `/tasks/:id` | ✔ | Remove tarefa |

Rotas autenticadas exigem `Authorization: Bearer <token>`.

### Tarefa

```json
{
  "id": 1,
  "title": "Estudar Express",
  "description": null,
  "status": "pending",
  "priority": "medium",
  "dueDate": "2026-12-31",
  "createdAt": "2026-10-06T15:00:00.000Z",
  "updatedAt": "2026-10-06T15:00:00.000Z"
}
```

| Campo | Regras |
|---|---|
| `title` | obrigatório na criação, 1–120 caracteres |
| `description` | opcional, até 1000 caracteres, aceita `null` |
| `status` | `pending` (padrão), `in_progress`, `done` |
| `priority` | `low`, `medium` (padrão), `high` |
| `dueDate` | opcional, `YYYY-MM-DD` (data real), aceita `null` |

Campos fora dessa lista são rejeitados.

### Query de `GET /tasks`

| Parâmetro | Padrão | Valores |
|---|---|---|
| `status` | — | `pending`, `in_progress`, `done` |
| `priority` | — | `low`, `medium`, `high` |
| `search` | — | texto buscado em título e descrição |
| `page` | `1` | inteiro ≥ 1 |
| `limit` | `10` | 1–100 |
| `sortBy` | `createdAt` | `createdAt`, `dueDate`, `priority`, `title` |
| `order` | `desc` | `asc`, `desc` |

Resposta: `{ "data": [...], "meta": { "page", "limit", "total", "totalPages" } }`.

## Formato de erro

**Toda** resposta de erro tem este formato:

```json
{
  "error": {
    "status": 400,
    "code": "VALIDATION_ERROR",
    "message": "Dados da requisição inválidos",
    "details": [
      { "location": "body", "field": "title", "message": "Título é obrigatório" }
    ],
    "requestId": "b3f1c2d4-5e6f-7a8b-9c0d-1e2f3a4b5c6d"
  }
}
```

- `code` é estável e serve para o cliente tomar decisões; `message` é para humanos.
- `details` é sempre um array, vazio quando não há o que detalhar.
- `requestId` também vem no cabeçalho `X-Request-Id` e aparece nos logs, para facilitar o rastreio.

### Códigos

| Status | `code` | Quando |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Body, query ou params inválidos (todos os problemas listados em `details`) |
| 400 | `INVALID_JSON` | JSON malformado, ou que não é objeto/array |
| 400 | `BAD_REQUEST` | Requisição HTTP malformada |
| 400 | `REQUEST_ABORTED` / `INVALID_CONTENT_LENGTH` | Corpo interrompido ou de tamanho incoerente |
| 401 | `MISSING_TOKEN` | Sem cabeçalho `Authorization` |
| 401 | `INVALID_AUTH_HEADER` | Cabeçalho fora do formato `Bearer <token>` |
| 401 | `INVALID_TOKEN` | Token inválido, adulterado ou de usuário inexistente |
| 401 | `TOKEN_EXPIRED` | Token expirado |
| 401 | `INVALID_CREDENTIALS` | E-mail ou senha incorretos (mesma resposta para os dois casos) |
| 403 | `FORBIDDEN` | Tarefa pertence a outro usuário |
| 404 | `TASK_NOT_FOUND` | Tarefa não existe |
| 404 | `ROUTE_NOT_FOUND` | Rota não existe |
| 405 | `METHOD_NOT_ALLOWED` | Método não suportado (cabeçalho `Allow` informa os válidos) |
| 409 | `EMAIL_ALREADY_EXISTS` | E-mail já cadastrado |
| 413 | `PAYLOAD_TOO_LARGE` | Corpo acima de `BODY_LIMIT` |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | Corpo com Content-Type diferente de `application/json` |
| 415 | `UNSUPPORTED_CHARSET` / `UNSUPPORTED_ENCODING` | Charset ou Content-Encoding não suportados |
| 429 | `TOO_MANY_REQUESTS` | Rate limit excedido (cabeçalho `Retry-After`) |
| 500 | `INTERNAL_ERROR` | Erro inesperado; detalhes só no log (e em `debug` quando `NODE_ENV=development`) |
| 503 | `DATABASE_UNAVAILABLE` | Health check sem acesso ao banco |

### Fora das requisições

- **Configuração inválida** (ex.: `JWT_SECRET` ausente): o processo não sobe e lista o problema.
- **Porta ocupada ou sem permissão**: mensagem clara e saída com código 1.
- **`unhandledRejection` / `uncaughtException`**: são logados e o servidor encerra de forma controlada.
- **SIGINT / SIGTERM**: graceful shutdown, que para de aceitar conexões, fecha o banco e força a saída após 10 s.

## Estrutura

```
src/
├── app.js                  # monta o app (injeção de db/config, facilita testes)
├── server.js               # sobe o HTTP, sinais e erros de processo
├── config/env.js           # leitura e validação das variáveis de ambiente
├── db/database.js          # conexão SQLite + schema
├── docs/openapi.js         # especificação OpenAPI
├── errors/AppError.js      # erro padrão da aplicação
├── lib/                    # logger e setup do Zod
├── middlewares/            # auth, validação, 404/405, 415, rate limit, error handler
└── modules/
    ├── auth/               # rotas, controller, service, schemas
    ├── tasks/              # rotas, controller, service, repository, schemas
    ├── users/              # repository
    └── health/
tests/                      # auth, tasks, erros/infra
```

## Variáveis de ambiente

Veja [.env.example](.env.example). Só `JWT_SECRET` (mín. 32 caracteres) é obrigatória.
