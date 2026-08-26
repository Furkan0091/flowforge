import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

// Mock the queue so executions are processed inline by the real engine —
// this exercises the full API → service → engine → Prisma path without Redis.
vi.mock("../src/queues/execution.queue", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/queues/execution.queue")>();
  return {
    ...actual,
    enqueueExecution: async (executionId: string) => {
      const { getEngine } = await import("../src/engine/instance");
      await getEngine().run(executionId);
    },
  };
});

import request from "supertest";
import { createApp } from "../src/app";
import { registerBuiltinNodes } from "../src/nodes/registry";
import { prisma } from "../src/lib/prisma";

registerBuiltinNodes();

const app = createApp();

async function dbAvailable(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

const hasDb = await dbAvailable();
const describeDb = hasDb ? describe : describe.skip;
const itDb = hasDb ? it : it.skip;

describeDb("API integration (requires PostgreSQL)", () => {
  let token = "";
  let workflowId = "";

  beforeAll(async () => {
    await prisma.executionLog.deleteMany();
    await prisma.executionNode.deleteMany();
    await prisma.workflowExecution.deleteMany();
    await prisma.webhook.deleteMany();
    await prisma.workflowVersion.deleteMany();
    await prisma.workflow.deleteMany();
    await prisma.lead.deleteMany();
    await prisma.user.deleteMany();

    const res = await request(app).post("/api/auth/register").send({
      email: "test@flowforge.test",
      password: "password123",
      name: "Tester",
    });
    expect(res.status).toBe(201);
    token = res.body.data.token;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("logs in with valid credentials", async () => {
    const res = await request(app).post("/api/auth/login").send({
      email: "test@flowforge.test",
      password: "password123",
    });
    expect(res.status).toBe(200);
    expect(res.body.data.token).toBeTruthy();
  });

  it("rejects invalid credentials", async () => {
    const res = await request(app).post("/api/auth/login").send({
      email: "test@flowforge.test",
      password: "wrong-password",
    });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it("rejects unauthenticated requests", async () => {
    const res = await request(app).get("/api/workflows");
    expect(res.status).toBe(401);
  });

  it("creates a workflow", async () => {
    const res = await request(app)
      .post("/api/workflows")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "My First Workflow", description: "A test workflow" });
    expect(res.status).toBe(201);
    workflowId = res.body.data.workflow.id;
    expect(res.body.data.workflow.name).toBe("My First Workflow");
  });

  it("lists workflows", async () => {
    const res = await request(app).get("/api/workflows").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.workflows.length).toBeGreaterThanOrEqual(1);
  });

  it("retrieves a workflow by id", async () => {
    const res = await request(app).get(`/api/workflows/${workflowId}`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.workflow.id).toBe(workflowId);
    expect(res.body.data.workflow.activeVersion.version).toBe(1);
  });

  it("saves a definition as a new version", async () => {
    const definition = {
      nodes: [
        { id: "start", type: "manual", label: "Manual", config: {} },
        { id: "set", type: "set_variable", label: "Set", config: { variable: "greeting", value: "Hello {{manual.name}}" } },
        { id: "log", type: "log", label: "Log", config: { message: "{{variables.greeting}}", level: "info" } },
      ],
      edges: [
        { id: "e1", source: "start", target: "set" },
        { id: "e2", source: "set", target: "log" },
      ],
    };
    const res = await request(app)
      .put(`/api/workflows/${workflowId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ definition });
    expect(res.status).toBe(200);
    expect(res.body.data.workflow.activeVersion.version).toBe(2);
    expect(res.body.data.workflow.versions).toHaveLength(2);
  });

  it("executes a workflow end to end through the engine", async () => {
    const run = await request(app)
      .post(`/api/workflows/${workflowId}/execute`)
      .set("Authorization", `Bearer ${token}`)
      .send({ payload: { name: "Ada" } });
    expect(run.status).toBe(202);

    const execId = run.body.data.executionId;
    const detail = await request(app).get(`/api/executions/${execId}`).set("Authorization", `Bearer ${token}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.execution.status).toBe("completed");
    expect(detail.body.data.execution.triggerType).toBe("manual");
    expect(detail.body.data.execution.nodes).toHaveLength(3);
    expect(detail.body.data.execution.nodes.every((n: { status: string }) => n.status === "success")).toBe(true);
    expect(detail.body.data.execution.logs.length).toBeGreaterThan(0);
  });

  it("lists execution history with the workflow name", async () => {
    const res = await request(app).get("/api/executions").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBeGreaterThanOrEqual(1);
    expect(res.body.data.executions[0].workflow.name).toBeTruthy();
  });

  it("triggers a webhook workflow and receives the payload", async () => {
    const webhookDefinition = {
      nodes: [
        { id: "wh", type: "webhook", label: "Webhook", config: { method: "POST", secret: "s3cret" } },
        { id: "tx", type: "transform", label: "Extract", config: { mode: "mapping", output: { email: "{{webhook.email}}" } } },
        { id: "log", type: "log", label: "Log", config: { message: "webhook email: {{tx.data.email}}", level: "info" } },
      ],
      edges: [
        { id: "e1", source: "wh", target: "tx" },
        { id: "e2", source: "tx", target: "log" },
      ],
    };
    const created = await request(app)
      .post("/api/workflows")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Webhook Flow", definition: webhookDefinition });
    const webhookWorkflowId = created.body.data.workflow.id;

    await request(app).post(`/api/workflows/${webhookWorkflowId}/enable`).set("Authorization", `Bearer ${token}`);

    const bad = await request(app)
      .post(`/api/webhooks/${webhookWorkflowId}`)
      .send({ email: "x@example.com" });
    expect(bad.status).toBe(401); // wrong/missing signature

    const res = await request(app)
      .post(`/api/webhooks/${webhookWorkflowId}`)
      .set("X-FlowForge-Signature", "s3cret")
      .send({ email: "john@gmail.com" });
    expect(res.status).toBe(202);
    expect(res.body.data.executionId).toBeTruthy();

    const detail = await request(app)
      .get(`/api/executions/${res.body.data.executionId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(detail.body.data.execution.status).toBe("completed");
    expect(detail.body.data.execution.triggerType).toBe("webhook");
    expect(detail.body.data.execution.triggerData.webhook.email).toBe("john@gmail.com");
    const log = detail.body.data.execution.logs.find((l: { message: string }) => l.message.includes("webhook email"));
    expect(log?.message).toContain("john@gmail.com");
  });

  it("does not trigger disabled workflows", async () => {
    const res = await request(app).post(`/api/webhooks/${workflowId}`).send({});
    expect(res.status).toBe(404);
  });

  it("duplicates a workflow", async () => {
    const res = await request(app)
      .post(`/api/workflows/${workflowId}/duplicate`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(201);
    expect(res.body.data.workflow.name).toBe("My First Workflow Copy");
    expect(res.body.data.workflow.activeVersion.version).toBe(1);
  });

  it("validates input", async () => {
    const res = await request(app)
      .post("/api/workflows")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});
