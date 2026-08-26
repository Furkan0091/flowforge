# FlowForge

Visual workflow automation platform. Define workflows by connecting triggers, conditions, transformations, API calls, database operations, and notifications into executable pipelines — then run them asynchronously through a job queue, with retries, persistent execution logs, and real-time monitoring.

## Features

- **Visual workflow builder** — React Flow canvas with drag-and-drop nodes, config panels, JSON import/export, and per-workflow run history
- **Workflow engine** — interprets stored node/edge definitions, evaluates conditions, tracks per-node state, and executes independent branches in parallel
- **Queue-based execution** — Redis + BullMQ workers run workflows asynchronously; multiple workers can run concurrently
- **Retries with exponential backoff** — retryable failures are re-queued with `delay × 2^n` backoff
- **Webhook & scheduled triggers** — public webhook endpoints with optional signature secrets; cron-based repeatable jobs
- **Integrations** — HTTP requests, SMTP email (with honest mock mode), Slack webhooks, and safe allow-listed database operations (no arbitrary SQL)
- **Data flow** — `{{webhook.email}}` / `{{variables.name}}` / `{{nodes.<id>.data}}` template resolution between nodes
- **Conditional branching** — condition (TRUE/FALSE) and multi-case switch nodes evaluated server-side
- **Workflow versioning & duplication** — every save creates a new version; executions pin the version they ran with
- **Execution history & detail** — status, duration, per-node input/output/error, retry counts, persisted logs
- **Real-time updates** — Socket.IO pushes execution and node events to the frontend
- **Auth** — register/login/logout, bcrypt hashing, JWT, protected routes

## Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | React, TypeScript, Tailwind CSS, React Flow |
| Backend | Node.js, Express, TypeScript |
| Database | PostgreSQL, Prisma ORM |
| Queues | Redis, BullMQ |
| Real-time | Socket.IO |
| Infrastructure | Docker, Docker Compose |

## Architecture

```text
React Frontend (Workflow Builder)
        │  REST API
        ▼
     Express API ──► PostgreSQL / Prisma
        │
        ├──► Redis + BullMQ ──► Workers ──► Execution Engine ──► Node Execution
        └──► WebSocket Updates ──► Execution Logs (PostgreSQL)
```

Backend responsibilities are separated into API routes/controllers, persistence, the execution engine, queues, workers, and execution logging. Long-running work never runs inside HTTP request handlers.

Two BullMQ queues on Redis:

- **`workflow-execution`** — one job per execution, consumed by the execution worker
- **`node-continuation`** — delayed jobs that resume an execution after retry backoff or a delay node

## Getting Started

Prerequisites: Node.js ≥ 20, PostgreSQL, Redis.

```bash
npm install
cp .env.example .env        # set DATABASE_URL, REDIS_URL, JWT_SECRET
docker compose up -d postgres redis
npm run db:generate
npm run db:push
npm run db:seed             # demo user + workflows
npm run dev                 # API (:4000), worker, web (:5173)
```

Demo account: `demo@flowforge.app` / `flowforge123`

| Script | Description |
| --- | --- |
| `npm run dev:api` | API only |
| `npm run dev:worker` | worker only |
| `npm run dev:web` | frontend only |
| `npm run typecheck` | typecheck API + web |
| `npm test` | API, engine, queue, and frontend tests |

## Docker

```bash
docker compose up                          # postgres, redis, api, worker, web
docker compose --profile seed run --rm seed  # seed demo data
```

## Environment Variables

See [`.env.example`](./.env.example) for the full list.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection for BullMQ |
| `JWT_SECRET` | Auth token signing secret |
| `WEB_ORIGIN` | Allowed CORS origins |
| `EMAIL_MODE` | `mock` (default) or `smtp` |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` | SMTP credentials |
| `WEBHOOK_BASE_URL` | Public base URL for webhook endpoints |

## API

```text
POST /api/auth/register          POST /api/auth/login
POST /api/webhooks/:workflowId   GET  /api/health

GET    /api/workflows            POST /api/workflows
GET    /api/workflows/:id        PUT  /api/workflows/:id
DELETE /api/workflows/:id        POST /api/workflows/:id/execute
POST   /api/workflows/:id/duplicate
POST   /api/workflows/:id/enable POST /api/workflows/:id/disable
GET    /api/workflows/:id/versions
POST   /api/workflows/:id/versions/activate
GET    /api/workflows/node-types

GET    /api/executions           GET /api/executions/:id
GET    /api/executions/:id/logs
POST   /api/executions/:id/cancel   POST /api/executions/:id/rerun

GET    /api/dashboard            GET /api/integrations
GET    /api/templates            POST /api/templates/use
```

Responses use a consistent envelope: `{ "success": true, "data": { } }`, with errors as `{ "success": false, "error": { "code", "message" } }`.

## Project Structure

```text
apps/
├── api/
│   ├── prisma/            # schema + seed
│   ├── src/
│   │   ├── engine/        # WorkflowEngine, conditions, repository
│   │   ├── nodes/         # modular node implementations (registry-driven)
│   │   ├── queues/        # BullMQ queue definitions
│   │   ├── workers/       # execution + continuation workers
│   │   ├── services/      # business logic
│   │   ├── controllers/   # thin HTTP handlers
│   │   ├── routes/        # REST routes + validation
│   │   ├── middleware/    # auth, validation, rate limiting, errors
│   │   ├── sockets/       # Socket.IO server
│   │   ├── templates/     # seed workflow templates
│   │   └── utils/
│   └── tests/             # engine, API, queue tests
└── web/
    └── src/
        ├── pages/         # dashboard, workflows, builder, executions
        ├── components/    # builder, layout, ui
        ├── lib/           # API client, types, socket client, formatting
        └── store/         # auth store
```

## Testing

```bash
npm test
```

- **Engine** — linear/conditional/parallel workflows, switch routing, retries and backoff, failure handling, delay nodes
- **API** — auth, workflow CRUD, versioning, execution, webhooks, validation
- **Queue** — job enqueueing, delayed continuations, worker-driven execution
- **Frontend** — formatting helpers, node registry, execution panel, config panel

## Future Improvements

- More integrations via the extensible node registry
- Conditional loops and iterate-over-array nodes
- Distributed workers across processes
- Advanced scheduling and per-workflow rate limiting
- Idempotency keys for webhook and schedule triggers
- Observability (tracing, queue-depth and node-latency metrics)
