import { NodeRegistration, NodeTypeSchema } from "./types";
import { registerWebhookNode } from "./webhook.node";
import { registerScheduleNode } from "./schedule.node";
import { registerManualNode } from "./manual.node";
import { registerConditionNode } from "./condition.node";
import { registerSwitchNode } from "./switch.node";
import { registerDelayNode } from "./delay.node";
import { registerHttpRequestNode } from "./httpRequest.node";
import { registerEmailNode } from "./email.node";
import { registerDatabaseNode } from "./database.node";
import { registerTransformNode } from "./transform.node";
import { registerSetVariableNode } from "./setVariable.node";
import { registerLogNode } from "./log.node";
import { registerSlackNode } from "./slack.node";

const registry = new Map<string, NodeRegistration>();

export function registerNode(registration: NodeRegistration): void {
  registry.set(registration.schema.type, registration);
}

export function getNode(type: string): NodeRegistration | undefined {
  return registry.get(type);
}

export function getNodeSchemas(): NodeTypeSchema[] {
  return [...registry.values()].map((r) => r.schema);
}

export function getNodeTypes(): string[] {
  return [...registry.keys()];
}

export function isTriggerType(type: string): boolean {
  return registry.get(type)?.schema.isTrigger === true;
}

export function registerBuiltinNodes(): void {
  registerWebhookNode();
  registerScheduleNode();
  registerManualNode();
  registerConditionNode();
  registerSwitchNode();
  registerDelayNode();
  registerHttpRequestNode();
  registerEmailNode();
  registerDatabaseNode();
  registerTransformNode();
  registerSetVariableNode();
  registerLogNode();
  registerSlackNode();
}

/** Register test-only node types (used by the test suite). */
export function registerTestNodes(): void {
  if (registry.has("test_fail")) return;
  registry.set("test_fail", {
    schema: {
      type: "test_fail",
      category: "action",
      label: "Test Fail",
      description: "Always fails. Test only.",
      icon: "bug",
      color: "#f43f5e",
      outputAliases: [],
      configFields: [
        { name: "message", label: "Error message", type: "text", default: "boom" },
        { name: "retryable", label: "Retryable", type: "toggle", default: true },
      ],
      defaultConfig: {},
    },
    handler: async (ctx) => {
      const message = String(ctx.node.config.message ?? "boom");
      const retryable = ctx.node.config.retryable !== false;
      const err = new Error(message) as Error & { retryable?: boolean; code?: string };
      err.retryable = retryable;
      err.code = "TEST_FAILURE";
      throw err;
    },
  });
  registry.set("test_flaky", {
    schema: {
      type: "test_flaky",
      category: "action",
      label: "Test Flaky",
      description: "Fails a configured number of times, then succeeds. Test only.",
      icon: "bug",
      color: "#f59e0b",
      outputAliases: [],
      configFields: [
        { name: "failures", label: "Failures before success", type: "number", default: 2 },
        { name: "key", label: "State key", type: "text", default: "flaky" },
      ],
      defaultConfig: {},
    },
    handler: async (ctx) => {
      const failures = Number(ctx.node.config.failures ?? 2);
      const key = String(ctx.node.config.key ?? "flaky");
      const count = Number((ctx.context.variables[`__flaky_${key}`] as number) ?? 0);
      if (count < failures) {
        ctx.context.variables[`__flaky_${key}`] = count + 1;
        const err = new Error(`flaky failure ${count + 1}/${failures}`) as Error & { retryable?: boolean };
        err.retryable = true;
        throw err;
      }
      return { attempts: count + 1, succeeded: true };
    },
  });
}

export function resetRegistry(): void {
  registry.clear();
}
