import { prisma } from "../lib/prisma";
import { serializeExecution } from "../utils/serialize";

export async function getDashboard(userId: string) {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [
    activeWorkflows,
    totalWorkflows,
    executionsToday,
    successfulToday,
    failedToday,
    recentExecutions,
    failedExecutions,
    activityRows,
    statusCounts,
    topWorkflows,
  ] = await Promise.all([
    prisma.workflow.count({ where: { userId, status: "enabled" } }),
    prisma.workflow.count({ where: { userId } }),
    prisma.workflowExecution.count({ where: { userId, createdAt: { gte: todayStart } } }),
    prisma.workflowExecution.count({ where: { userId, status: "completed", createdAt: { gte: todayStart } } }),
    prisma.workflowExecution.count({ where: { userId, status: "failed", createdAt: { gte: todayStart } } }),
    prisma.workflowExecution.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { workflow: { select: { id: true, name: true } } },
    }),
    prisma.workflowExecution.findMany({
      where: { userId, status: "failed" },
      orderBy: { createdAt: "desc" },
      take: 6,
      include: { workflow: { select: { id: true, name: true } } },
    }),
    prisma.workflowExecution.findMany({
      where: { userId, createdAt: { gte: dayAgo } },
      select: { createdAt: true, status: true },
    }),
    prisma.workflowExecution.groupBy({
      by: ["status"],
      where: { userId },
      _count: { _all: true },
    }),
    prisma.workflowExecution.groupBy({
      by: ["workflowId"],
      where: { userId },
      _count: { _all: true },
      orderBy: { _count: { workflowId: "desc" } },
      take: 5,
    }),
  ]);

  const workflowNames = await prisma.workflow.findMany({
    where: { id: { in: topWorkflows.map((w) => w.workflowId) } },
    select: { id: true, name: true },
  });
  const nameById = new Map(workflowNames.map((w) => [w.id, w.name]));

  // Bucket execution activity over the last 24h (one bucket per hour).
  const activity: { hour: string; label: string; total: number; completed: number; failed: number }[] = [];
  for (let i = 23; i >= 0; i--) {
    const start = new Date(Date.now() - i * 60 * 60 * 1000);
    start.setMinutes(0, 0, 0);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const inWindow = activityRows.filter((r) => r.createdAt >= start && r.createdAt < end);
    activity.push({
      hour: start.toISOString(),
      label: start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      total: inWindow.length,
      completed: inWindow.filter((r) => r.status === "completed").length,
      failed: inWindow.filter((r) => r.status === "failed").length,
    });
  }

  return {
    metrics: {
      activeWorkflows,
      totalWorkflows,
      executionsToday,
      successfulToday,
      failedToday,
      successRateToday: executionsToday > 0 ? Math.round((successfulToday / executionsToday) * 100) : 0,
    },
    statusCounts: Object.fromEntries(statusCounts.map((s) => [s.status, s._count._all])),
    recentExecutions: recentExecutions.map((r) => ({
      ...serializeExecution(r),
      workflow: r.workflow,
    })),
    failedExecutions: failedExecutions.map((r) => ({
      ...serializeExecution(r),
      workflow: r.workflow,
    })),
    topWorkflows: topWorkflows.map((w) => ({
      workflowId: w.workflowId,
      name: nameById.get(w.workflowId) ?? "Unknown",
      executions: w._count._all,
    })),
    activity,
  };
}
