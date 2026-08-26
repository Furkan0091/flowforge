import { prisma } from "../lib/prisma";
import { ApiError } from "../utils/ApiError";
import { generateWebhookSlug } from "../utils/ids";
import { WorkflowDefinition } from "../nodes/types";
import { syncWorkflowSchedule, removeWorkflowSchedule } from "./schedule.service";
import { logger } from "../lib/logger";

const EMPTY_DEFINITION: WorkflowDefinition = { nodes: [], edges: [] };

function normalizeDefinition(definition: unknown): WorkflowDefinition {
  const def = (definition ?? EMPTY_DEFINITION) as Partial<WorkflowDefinition>;
  return {
    nodes: Array.isArray(def.nodes) ? def.nodes : [],
    edges: Array.isArray(def.edges) ? def.edges : [],
  };
}

/** Upsert the Webhook record to match the workflow's webhook trigger node config. */
export async function syncWebhookRecord(workflowId: string, definition: WorkflowDefinition): Promise<void> {
  const node = definition.nodes.find((n) => n.type === "webhook");
  if (!node) {
    await prisma.webhook.deleteMany({ where: { workflowId } });
    return;
  }
  const method = typeof node.config.method === "string" ? node.config.method : "POST";
  const secret = typeof node.config.secret === "string" && node.config.secret ? node.config.secret : null;
  await prisma.webhook.upsert({
    where: { workflowId },
    create: { workflowId, method, secret, slug: generateWebhookSlug() },
    update: { method, secret },
  });
}

function assertValidDefinition(def: WorkflowDefinition): void {
  const ids = new Set(def.nodes.map((n) => n.id));
  for (const edge of def.edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) {
      throw ApiError.badRequest("INVALID_DEFINITION", "Workflow contains edges referencing missing nodes");
    }
  }
}

export async function createWorkflow(userId: string, input: { name: string; description?: string; definition?: unknown }) {
  const name = input.name?.trim();
  if (!name) throw ApiError.badRequest("NAME_REQUIRED", "Workflow name is required");

  const definition = normalizeDefinition(input.definition);
  assertValidDefinition(definition);

  const workflow = await prisma.workflow.create({
    data: {
      name,
      description: input.description?.trim() || null,
      userId,
      versions: {
        create: { version: 1, definition: definition as object, isActive: true },
      },
    },
  });

  if (definition.nodes.some((n) => n.type === "webhook")) {
    await syncWebhookRecord(workflow.id, definition);
  }

  return workflow;
}

export async function listWorkflows(userId: string) {
  const rows = await prisma.workflow.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    include: {
      versions: {
        where: { isActive: true },
        take: 1,
        select: { definition: true, version: true, createdAt: true },
      },
      executions: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { executionId: true, status: true, createdAt: true, finishedAt: true, startedAt: true },
      },
      _count: { select: { executions: true, versions: true } },
    },
  });

  return rows.map((row) => {
    const definition = (row.versions[0]?.definition ?? EMPTY_DEFINITION) as WorkflowDefinition;
    const last = row.executions[0];
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      status: row.status,
      version: row.versions[0]?.version ?? null,
      nodeCount: definition.nodes.length,
      nodeChain: definition.nodes.map((n) => n.type),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      executionCount: row._count.executions,
      versionCount: row._count.versions,
      lastExecution: last
        ? {
            id: last.executionId,
            status: last.status,
            createdAt: last.createdAt,
            startedAt: last.startedAt,
            finishedAt: last.finishedAt,
          }
        : null,
    };
  });
}

export async function getWorkflow(userId: string, workflowId: string) {
  const row = await prisma.workflow.findFirst({
    where: { id: workflowId, userId },
    include: {
      versions: { orderBy: { version: "desc" } },
      webhook: true,
      executions: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { executionId: true, status: true, createdAt: true, finishedAt: true, startedAt: true },
      },
    },
  });
  if (!row) throw ApiError.notFound("WORKFLOW_NOT_FOUND", "Workflow not found");

  const active = row.versions.find((v) => v.isActive);
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    activeVersion: active
      ? { version: active.version, definition: active.definition, createdAt: active.createdAt }
      : null,
    versions: row.versions.map((v) => ({
      version: v.version,
      isActive: v.isActive,
      nodeCount: ((v.definition as unknown as WorkflowDefinition).nodes ?? []).length,
      createdAt: v.createdAt,
    })),
    webhook: row.webhook
      ? { method: row.webhook.method, secret: row.webhook.secret ? true : false, slug: row.webhook.slug }
      : null,
    lastExecution: row.executions[0] ?? null,
  };
}

export async function updateWorkflow(
  userId: string,
  workflowId: string,
  input: { name?: string; description?: string; definition?: unknown }
) {
  const workflow = await prisma.workflow.findFirst({ where: { id: workflowId, userId } });
  if (!workflow) throw ApiError.notFound("WORKFLOW_NOT_FOUND", "Workflow not found");

  const data: { name?: string; description?: string | null } = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw ApiError.badRequest("NAME_REQUIRED", "Workflow name is required");
    data.name = name;
  }
  if (input.description !== undefined) data.description = input.description.trim() || null;

  let definitionChanged = false;
  let newDefinition: WorkflowDefinition | null = null;

  if (input.definition !== undefined) {
    const candidate = normalizeDefinition(input.definition);
    assertValidDefinition(candidate);
    const active = await prisma.workflowVersion.findFirst({
      where: { workflowId, isActive: true },
      orderBy: { version: "desc" },
    });
    const current = active?.definition as WorkflowDefinition | undefined;
    definitionChanged = JSON.stringify(current ?? EMPTY_DEFINITION) !== JSON.stringify(candidate);
    if (definitionChanged) {
      newDefinition = candidate;
    }
  }

  await prisma.workflow.update({ where: { id: workflow.id }, data });

  if (definitionChanged && newDefinition) {
    const latest = await prisma.workflowVersion.findFirst({
      where: { workflowId },
      orderBy: { version: "desc" },
    });
    const nextVersion = (latest?.version ?? 0) + 1;
    await prisma.$transaction([
      prisma.workflowVersion.updateMany({ where: { workflowId, isActive: true }, data: { isActive: false } }),
      prisma.workflowVersion.create({
        data: { workflowId, version: nextVersion, definition: newDefinition as object, isActive: true },
      }),
    ]);
    await syncWebhookRecord(workflow.id, newDefinition);
    if (workflow.status === "enabled") {
      await syncWorkflowSchedule(workflow.id, newDefinition);
    }
  } else if (newDefinition === null) {
    // Name/description only change — keep webhook record in sync anyway.
    const active = await prisma.workflowVersion.findFirst({
      where: { workflowId, isActive: true },
    });
    if (active) {
      const def = active.definition as unknown as WorkflowDefinition;
      await syncWebhookRecord(workflow.id, def);
    }
  }

  return getWorkflow(userId, workflowId);
}

export async function duplicateWorkflow(userId: string, workflowId: string) {
  const workflow = await prisma.workflow.findFirst({
    where: { id: workflowId, userId },
    include: { versions: { where: { isActive: true }, take: 1 } },
  });
  if (!workflow) throw ApiError.notFound("WORKFLOW_NOT_FOUND", "Workflow not found");

  const definition = (workflow.versions[0]?.definition ?? EMPTY_DEFINITION) as WorkflowDefinition;
  const copy = await prisma.workflow.create({
    data: {
      name: `${workflow.name} Copy`,
      description: workflow.description,
      userId,
      status: "disabled",
      versions: {
        create: { version: 1, definition: definition as object, isActive: true },
      },
    },
  });
  if (definition.nodes.some((n) => n.type === "webhook")) {
    await syncWebhookRecord(copy.id, definition);
  }
  return getWorkflow(userId, copy.id);
}

export async function deleteWorkflow(userId: string, workflowId: string) {
  const workflow = await prisma.workflow.findFirst({ where: { id: workflowId, userId } });
  if (!workflow) throw ApiError.notFound("WORKFLOW_NOT_FOUND", "Workflow not found");
  await removeWorkflowSchedule(workflow.id);
  await prisma.workflow.delete({ where: { id: workflow.id } });
  return { success: true };
}

export async function setWorkflowStatus(userId: string, workflowId: string, status: "enabled" | "disabled") {
  const workflow = await prisma.workflow.findFirst({
    where: { id: workflowId, userId },
    include: { versions: { where: { isActive: true }, take: 1 } },
  });
  if (!workflow) throw ApiError.notFound("WORKFLOW_NOT_FOUND", "Workflow not found");

  await prisma.workflow.update({ where: { id: workflow.id }, data: { status } });

  const definition = (workflow.versions[0]?.definition ?? EMPTY_DEFINITION) as WorkflowDefinition;

  if (status === "enabled") {
    await syncWebhookRecord(workflow.id, definition);
    await syncWorkflowSchedule(workflow.id, definition);
  } else {
    await removeWorkflowSchedule(workflow.id);
  }

  return getWorkflow(userId, workflowId);
}

export async function listVersions(userId: string, workflowId: string) {
  await getWorkflow(userId, workflowId); // ownership check
  const versions = await prisma.workflowVersion.findMany({
    where: { workflowId },
    orderBy: { version: "desc" },
    select: { id: true, version: true, isActive: true, createdAt: true, definition: true },
  });
  return versions.map((v) => ({
    id: v.id,
    version: v.version,
    isActive: v.isActive,
    createdAt: v.createdAt,
    nodeCount: ((v.definition as unknown as WorkflowDefinition).nodes ?? []).length,
  }));
}

export async function activateVersion(userId: string, workflowId: string, version: number) {
  const workflow = await prisma.workflow.findFirst({ where: { id: workflowId, userId } });
  if (!workflow) throw ApiError.notFound("WORKFLOW_NOT_FOUND", "Workflow not found");
  const target = await prisma.workflowVersion.findUnique({
    where: { workflowId_version: { workflowId, version } },
  });
  if (!target) throw ApiError.notFound("VERSION_NOT_FOUND", "Workflow version not found");

  await prisma.$transaction([
    prisma.workflowVersion.updateMany({ where: { workflowId, isActive: true }, data: { isActive: false } }),
    prisma.workflowVersion.update({ where: { id: target.id }, data: { isActive: true } }),
  ]);

  const definition = target.definition as unknown as WorkflowDefinition;
  await syncWebhookRecord(workflow.id, definition);
  if (workflow.status === "enabled") {
    await syncWorkflowSchedule(workflow.id, definition);
  }

  return getWorkflow(userId, workflowId);
}

export async function runWorkflowNow(
  userId: string,
  workflowId: string,
  payload: Record<string, unknown> | undefined
) {
  // Delegated to execution.service to keep a single code path.
  const { startExecution } = await import("./execution.service");
  return startExecution({
    workflowId,
    userId,
    triggerType: "manual",
    inputs: { manual: payload ?? {} },
  });
}

export { logger };
