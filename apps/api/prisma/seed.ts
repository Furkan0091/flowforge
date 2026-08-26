import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { TEMPLATES } from "../src/templates";
import { generateWebhookSlug } from "../src/utils/ids";
import { syncWorkflowSchedule } from "../src/services/schedule.service";
import { getExecutionQueue } from "../src/queues/execution.queue";
import { closeRedis } from "../src/lib/redis";

const prisma = new PrismaClient();

const DEMO_EMAIL = "demo@flowforge.app";
const DEMO_PASSWORD = "flowforge123";

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const demoUser = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: {},
    create: { email: DEMO_EMAIL, passwordHash, name: "Demo User" },
  });

  for (const template of TEMPLATES) {
    const existing = await prisma.workflow.findFirst({
      where: { name: template.name, userId: demoUser.id },
    });
    if (existing) {
      console.log(`seed: workflow "${template.name}" already exists, skipping`);
      continue;
    }

    const workflow = await prisma.workflow.create({
      data: {
        name: template.name,
        description: template.description,
        userId: demoUser.id,
        status: template.defaultStatus,
        versions: {
          create: { version: 1, definition: template.definition as object, isActive: true },
        },
      },
    });

    if (template.definition.nodes.some((n) => n.type === "webhook")) {
      await prisma.webhook.create({
        data: {
          workflowId: workflow.id,
          method: "POST",
          secret: null,
          slug: generateWebhookSlug(),
        },
      });
    }

    console.log(`seed: created workflow "${template.name}" (${workflow.id})`);
  }

  // Register repeatable schedule jobs for enabled workflows with a schedule trigger.
  const enabled = await prisma.workflow.findMany({
    where: { status: "enabled" },
    include: { versions: { where: { isActive: true }, take: 1 } },
  });
  for (const wf of enabled) {
    const active = wf.versions[0];
    if (!active) continue;
    try {
      await syncWorkflowSchedule(wf.id, active.definition as never);
    } catch (err) {
      console.warn(`seed: could not register schedule for "${wf.name}"`, err instanceof Error ? err.message : err);
    }
  }

  console.log("seed: done");
  console.log(`\nDemo account:\n  email:    ${DEMO_EMAIL}\n  password: ${DEMO_PASSWORD}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    // Close the BullMQ queue connection so the process can exit.
    try {
      await getExecutionQueue().close();
    } catch {
      // redis may be unavailable; ignore
    }
    try {
      await closeRedis();
    } catch {
      // ignore
    }
    // Seed scripts exit explicitly once cleanup is done.
    process.exit(0);
  });
