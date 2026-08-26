# FlowForge

**Visual Workflow Automation Platform**

FlowForge is a full-stack workflow automation and execution platform. Users define workflows by connecting triggers, conditions, transformations, API calls, database operations, and notifications into executable automation pipelines — and FlowForge actually executes them: asynchronously, through a job queue, with retries, persistent execution logs, and real-time monitoring.

> **Define a workflow → execute it asynchronously → monitor execution → handle failures → inspect logs**

The workflow execution engine is the heart of the application. Nothing is simulated: every execution record, node state, log line, retry attempt, and webhook trigger originates from the backend.

---

## Overview

**Problem** — Teams repeatedly perform the same multi-step operations across APIs, databases, notifications, and internal systems. Doing this by hand is slow and error-prone, and ad-hoc scripts are hard to monitor and debug.

**Solution** — FlowForge lets you describe those operations as a visual graph of nodes and edges, then runs the graph for you in the background. Because execution is queue-based, long-running workflows never block API requests, retries are handled automatically with backoff, and every step is recorded so failures are easy to diagnose.

---

## Architecture

```text
                 ┌─────────────────────┐
                 │   React Frontend    │
                 │ Workflow Builder    │
                 └──────────┬──────────┘
                            │
                            │ REST API
                            ▼
                 ┌─────────────────────┐
                 │    Express API      │
                 │ Authentication      │
                 │ Workflow API        │
                 │ Execution API       │
                 └──────────┬──────────┘
                            │
             ┌──────────────┼──────────────┐
             │              │              │
             ▼              ▼              ▼
        PostgreSQL       Redis        WebSocket
        + Prisma        + BullMQ       Updates
             │              │
             │              ▼
             │       ┌──────────────┐
             │       │   Workers    │
             │       │              │
             │       │ Workflow     │
             │       │ Execution    │
             │       └──────┬───────┘
             │              │
             │              ▼
             │       Node Execution
             │              │
             └──────────────┘
                    Execution Logs
```

The backend is split into clearly separated responsibilities:

1. **API** — Express routes + controllers, business logic lives in services
2. **Persistence** — PostgreSQL via Prisma (`Workflow`, `WorkflowVersion`, `WorkflowExecution`, `ExecutionNode`, `ExecutionLog`, `Webhook`, `User`)
3. **Execution** — the workflow engine interprets saved definitions and drives node execution
4. **Queues** — BullMQ queues on Redis (`workflow-execution`, `node-continuation`)
5. **Workers** — independent processes that consume jobs and run the engine
6. **Logging** — every engine event is persisted as an `ExecutionLog` row

Long-running work never happens inside an HTTP request handler.

---

## Features

- **Visual workflow builder** — React Flow canvas with drag-and-drop nodes, node configuration panels, conditional branch handles, JSON import/export, and a per-workflow run history tab
- **Workflow engine** — interprets stored node/edge definitions, resolves dependencies, evaluates conditions, tracks execution state per node, and runs independent branches in parallel
- **Parallel branch execution** — all runnable nodes execute concurrently (wave-based); joins still gate on every incoming edge, so shared downstream nodes run exactly once
- **Queue-based execution** — Redis + BullMQ workers execute workflows asynchronously; multiple workers can run concurrently
- **Retries with exponential backoff** — retryable failures are re-queued with `delay × 2^n` backoff via delayed continuation jobs
- **Delay nodes** — implemented as delayed jobs so workers never block
- **Webhook triggers** — public `POST /api/webhooks/:workflowId` endpoints with optional signature secrets
- **Scheduled triggers** — cron-based repeatable jobs (BullMQ repeatables) re-synced on worker boot
- **HTTP Request node** — GET/POST/PUT/PATCH/DELETE with headers, query params, body, auth (Basic/Bearer), timeouts, and retryable error classification
- **Email node** — real SMTP delivery, with an honest mock mode when SMTP is not configured
- **Slack node** — posts a message to a Slack incoming webhook URL
- **Database node** — safe, allow-listed operations (insert / update / upsert / delete) — no arbitrary SQL
- **Data flow** — `{{webhook.email}}` / `{{variables.name}}` / `{{nodes.<id>.data}}` template resolution across nodes
- **Conditional branching** — conditions (TRUE/FALSE) and multi-case switch nodes are actually evaluated server-side; the engine follows the matching branch
- **Workflow versioning** — every save creates a new version; executions pin the version they started with
- **Workflow duplication** — one-click copies with their own ID and editable definition
- **Execution history & detail** — status, duration, per-node input/output/error, retry counts, and persisted logs
- **Real-time updates** — Socket.IO pushes execution/node/log events to the frontend
- **Dashboard** — automation metrics, 24h activity, recent executions and failures
- **Authentication** — register/login/logout, bcrypt password hashing, JWT, protected routes

---

## Tech Stack

| Layer        | Technology                                    |
| ------------ | --------------------------------------------- |
| Frontend     | React 18, TypeScript, Tailwind CSS, React Flow |
| Backend      | Node.js, Express, TypeScript                  |
| Database     | PostgreSQL, Prisma ORM                        |
| Queues       | Redis, BullMQ                                 |
| Real-time    | Socket.IO                                     |
| Infrastructure | Docker, Docker Compose                      |

Every technology listed here is actually implemented and exercised by the codebase.

---

## Workflow Engine

A saved workflow is a JSON definition of `nodes` and `edges`:

```json
{
  "nodes": [{ "id": "node_123", "type": "http_request", "label": "Get Customer", "config": { "method": "GET", "url": "https://api.example.com/customer" } }],
  "edges": [{ "id": "e1", "source": "trigger", "target": "node_123" }]
}
```

When a workflow is triggered (manual run, webhook, or schedule):

1. An execution record is created and a **BullMQ job** is enqueued
2. A **worker** picks the job and hands it to the engine
3. The engine loads the pinned workflow **version**, builds an execution **context**, and resolves the graph
4. Nodes run in dependency order; each node's output is stored in the context and becomes addressable by downstream nodes
5. **Branch nodes** (condition, switch) emit a branch selection that picks which outgoing edge fires; independent branches execute **in parallel** within the same run
6. Failures are captured; retryable ones schedule a delayed continuation; terminal failures mark the execution failed and skip downstream nodes
7. Every state change, log line, and the final status are persisted and broadcast over WebSockets

Because the engine executes **waves** of runnable nodes concurrently, two independent branches of a workflow genuinely run at the same time — while a node with multiple incoming edges only fires once every branch has resolved. Retry/delay pauses, stale continuations, and concurrent resumes are made safe by treating a completed node as terminal (a node is never executed twice).

Node implementations are **modular** — each node type registers a schema (for the UI) and a handler (for the engine). Adding a node type requires no engine changes.

---

## Queue Architecture

Two BullMQ queues on a shared Redis connection:

- **`workflow-execution`** — one job per execution (`execute-<executionId>`), consumed by the execution worker which calls `engine.run(executionId)`. Repeatable `schedule` jobs for cron-triggered workflows live on the same queue.
- **`node-continuation`** — delayed jobs that resume an execution at a specific node after a retry backoff or a delay node. The continuation worker calls `engine.run(executionId, nodeId)`.

Multiple worker processes can run concurrently; each execution is processed independently. Scheduling is re-synced from the database on worker boot so restarts never lose or duplicate schedules.

---

## Retry Strategy

- Each node can configure `retries` and `retryDelayMs` (defaults: 2 retries, 1s base delay)
- Failures are classified **retryable** or not (e.g. network errors, timeouts, 5xx and 429 responses are retryable; validation errors are not)
- Retryable failures schedule a delayed continuation with **exponential backoff**: `delay × 2^(attempt-1)`
- The execution status becomes `retrying`, the retry count is recorded per node, and when retries are exhausted the node — and then the execution — is marked `failed`
- All of this happens in the backend queue system, never in the frontend

---

## API

Public:

```
POST   /api/auth/register
POST   /api/auth/login
POST   /api/webhooks/:workflowId        (webhook triggers, optional signature)
GET    /api/health
```

Authenticated (Bearer token):

```
POST   /api/auth/logout
GET    /api/auth/me
PUT    /api/auth/me
PUT    /api/auth/me/password

GET    /api/workflows
POST   /api/workflows
GET    /api/workflows/:id
PUT    /api/workflows/:id
DELETE /api/workflows/:id
POST   /api/workflows/:id/execute
POST   /api/workflows/:id/duplicate
POST   /api/workflows/:id/enable
POST   /api/workflows/:id/disable
GET    /api/workflows/:id/versions
POST   /api/workflows/:id/versions/activate
GET    /api/workflows/node-types

GET    /api/executions
GET    /api/executions/:id
GET    /api/executions/:id/logs
POST   /api/executions/:id/cancel
POST   /api/executions/:id/rerun

GET    /api/dashboard
GET    /api/integrations
GET    /api/templates
POST   /api/templates/use
```

Responses follow a consistent envelope:

```json
{ "success": true, "data": { } }
```

Errors:

```json
{ "success": false, "error": { "code": "WORKFLOW_NOT_FOUND", "message": "Workflow not found" } }
```

---

## Local Development

Prerequisites: Node.js ≥ 20, PostgreSQL, Redis (or use Docker below).

```bash
# 1. Install dependencies (npm workspaces)
npm install

# 2. Configure environment
cp .env.example .env
# edit .env — at minimum DATABASE_URL, REDIS_URL, JWT_SECRET

# 3. Start PostgreSQL and Redis
#    either run them locally, or:
docker compose up -d postgres redis

# 4. Generate the Prisma client, push the schema, seed demo data
npm run db:generate
npm run db:push
npm run db:seed

# 5. Run API + worker + web (concurrently)
npm run dev
```

- Web: http://localhost:5173
- API: http://localhost:4000
- Health: http://localhost:4000/api/health

Seeded demo account: `demo@flowforge.app` / `flowforge123` (workflows: **Lead Processing**, **API Data Sync**, **Webhook Notification**).

Useful one-liners:

```bash
npm run dev:api      # API only
npm run dev:worker   # worker only
npm run dev:web      # frontend only
npm run typecheck    # typecheck API + web
npm test             # engine, API, and queue tests
```

---

## Environment Variables

See [`.env.example`](./.env.example) for the full list with comments. Key variables:

| Variable          | Purpose                                            |
| ----------------- | -------------------------------------------------- |
| `DATABASE_URL`    | PostgreSQL connection string used by Prisma        |
| `REDIS_URL`       | Redis connection used by BullMQ queues             |
| `JWT_SECRET`      | Secret used to sign auth tokens                    |
| `WEB_ORIGIN`      | Comma-separated allowed CORS origins               |
| `EMAIL_MODE`      | `mock` (default, logs emails) or `smtp`            |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` | SMTP credentials for real email delivery |
| `WEBHOOK_BASE_URL`| Public base URL shown for webhook endpoints        |

Never commit real secrets — `.env` is gitignored.

---

## Docker

`docker compose up` starts the full development environment:

```bash
docker compose up            # postgres, redis, api, worker, web
docker compose --profile seed run --rm seed   # seed demo data
```

Services: `postgres` (16), `redis` (7), `api` (Express, port 4000), `worker` (BullMQ workers), `web` (Vite, port 5173), plus a one-shot `seed` service behind the `seed` profile. The API container runs `prisma generate` + `prisma db push` on boot, so schema changes apply automatically in development.

---

## Project Structure

```text
apps/
├── api/
│   ├── prisma/
│   │   ├── schema.prisma          # data model
│   │   └── seed.ts                # demo user + workflows
│   ├── src/
│   │   ├── app.ts                 # Express app factory
│   │   ├── index.ts               # API entrypoint (HTTP + sockets)
│   │   ├── worker.ts              # worker entrypoint
│   │   ├── config/                # env parsing
│   │   ├── controllers/           # thin HTTP handlers
│   │   ├── routes/                # REST route definitions + validation
│   │   ├── services/              # business logic (workflow, execution, schedule, email, …)
│   │   ├── workers/               # BullMQ workers (execution, continuation)
│   │   ├── queues/                # BullMQ queue definitions
│   │   ├── engine/                # WorkflowEngine, conditions, repository
│   │   ├── nodes/                 # modular node implementations (registry-driven)
│   │   ├── middleware/            # auth, validation, rate limiting, error handling
│   │   ├── sockets/               # Socket.IO server + event emitter
│   │   ├── templates/             # seed workflow templates
│   │   └── utils/                 # template resolution, errors, serializers, ids
│   └── tests/                     # engine, API, and queue tests
└── web/
    └── src/
        ├── pages/                 # dashboard, workflows, builder, executions, …
        ├── components/builder/    # React Flow nodes, palette, config panel, execution panel
        ├── components/layout/     # sidebar + app shell
        ├── components/ui/         # badges, dialogs, toasts, empty states
        ├── lib/                   # API client, types, socket client, formatting
        └── store/                 # zustand auth store
```

---

## Testing

The test suite demonstrates that the backend actually works (engine, API, and queue wiring):

```bash
npm test
```

- **Workflow engine** — linear workflows, conditional branching (both directions), switch routing (match + default), parallel branch execution with joins, simultaneous retries across branches, permanent failure, non-retryable failures, retries with backoff to completion, retry-limit exhaustion, delay nodes as continuation jobs, unknown node types, no-entry-point graphs
- **API** — registration, login, invalid credentials, protected routes, workflow CRUD, version creation, end-to-end execution through the engine, execution history, webhook triggering with signature validation, duplication, input validation
- **Queue** — executions enqueued onto `workflow-execution`, continuation jobs with delays, workers driving the engine
- **Frontend** — formatting helpers, node icon registry, execution panel (timeline/logs/history), node config panel field rendering and update propagation

The engine tests run against an in-memory repository harness (no services needed). The API tests run against PostgreSQL when it is available and skip gracefully otherwise. The frontend tests run in jsdom with Vitest + Testing Library.

---

## Future Improvements

- More integrations (Stripe, Twilio, file storage) via the extensible node registry
- Conditional loops and iterate-over-array nodes
- Workflow templates marketplace / sharing
- Horizontally scaled, distributed workers
- Per-workflow rate limiting and throttling
- Advanced scheduling (time windows, calendar-based triggers)
- Idempotency keys for webhook and schedule triggers
- Observability (OpenTelemetry tracing, metrics on queue depth and node latency)

---

## Case Study

A deep dive into the engineering decisions behind the execution engine is available at the in-app **Case Study** page (`/case-study`) — covering the workflow model, engine design, queue architecture, retry strategy, failure handling, execution logs, and lessons learned.
