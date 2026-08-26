import type { ExecutionContext } from "../utils/template";

export type NodeCategory = "trigger" | "logic" | "action" | "integration" | "data";

export interface NodeDefinition {
  id: string;
  type: string;
  label: string;
  config: Record<string, unknown>;
  position?: { x: number; y: number };
}

export interface EdgeDefinition {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

export interface WorkflowDefinition {
  nodes: NodeDefinition[];
  edges: EdgeDefinition[];
}

export interface NodeFieldSchema {
  name: string;
  label: string;
  type:
    | "text"
    | "number"
    | "select"
    | "textarea"
    | "code"
    | "keyvalue"
    | "cases"
    | "object"
    | "json"
    | "toggle"
    | "readonly"
    | "secret";
  placeholder?: string;
  help?: string;
  options?: { label: string; value: string }[];
  default?: unknown;
  dependsOn?: { field: string; equals: string };
  rows?: number;
  mono?: boolean;
}

export interface NodeTypeSchema {
  type: string;
  category: NodeCategory;
  label: string;
  description: string;
  icon: string;
  color: string;
  outputAliases: string[];
  configFields: NodeFieldSchema[];
  defaultConfig: Record<string, unknown>;
  isTrigger?: boolean;
  /** when true, the engine treats outgoing edges as branch handles (e.g. true/false) */
  branchHandles?: string[];
}

export interface NodeFailure extends Error {
  code?: string;
  /** whether this failure is safe to retry (transient errors) */
  retryable?: boolean;
  details?: unknown;
}

/** Context passed to every node handler. */
export interface NodeExecutionContext {
  executionId: string;
  workflowId: string;
  node: NodeDefinition;
  context: ExecutionContext;
  log: (level: "info" | "warn" | "error" | "debug", message: string, meta?: Record<string, unknown>) => Promise<void>;
}

export type NodeHandler = (ctx: NodeExecutionContext) => Promise<unknown>;

export interface NodeRegistration {
  schema: NodeTypeSchema;
  handler: NodeHandler;
}
