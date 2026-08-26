export type NodeCategory = "trigger" | "logic" | "action" | "integration" | "data";
export type ExecutionStatus = "queued" | "running" | "completed" | "failed" | "retrying" | "cancelled";
export type NodeRunStatus = "idle" | "queued" | "running" | "success" | "failed" | "skipped";

export interface User {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
}

export interface WorkflowListItem {
  id: string;
  name: string;
  description: string | null;
  status: "enabled" | "disabled";
  version: number | null;
  nodeCount: number;
  nodeChain: string[];
  createdAt: string;
  updatedAt: string;
  executionCount: number;
  versionCount: number;
  lastExecution: {
    id: string;
    status: ExecutionStatus;
    createdAt: string;
    startedAt: string | null;
    finishedAt: string | null;
  } | null;
}

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

export interface WorkflowDetail extends WorkflowListItem {
  activeVersion: { version: number; definition: WorkflowDefinition; createdAt: string } | null;
  versions: { version: number; isActive: boolean; nodeCount: number; createdAt: string }[];
  webhook: { method: string; secret: boolean; slug: string } | null;
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
  branchHandles?: string[];
}

export interface NodeTypesResponse {
  categories: { id: NodeCategory; label: string; nodes: NodeTypeSchema[] }[];
}

export interface ExecutionNodeDetail {
  nodeId: string;
  nodeType: string;
  label: string;
  status: NodeRunStatus;
  attempts: number;
  input: unknown;
  output: unknown;
  error: unknown;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
}

export interface ExecutionLogEntry {
  id: string;
  level: "info" | "warn" | "error" | "debug";
  message: string;
  nodeId: string | null;
  nodeType: string | null;
  metadata: unknown;
  createdAt: string;
}

export interface ExecutionDetail {
  id: string;
  workflowId: string;
  workflow: { id: string; name: string; status: string };
  version: { version: number; definition: WorkflowDefinition } | null;
  triggerType: string;
  status: ExecutionStatus;
  triggerData: unknown;
  error: unknown;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  durationMs: number | null;
  nodeCount: number;
  nodes: ExecutionNodeDetail[];
  logs: ExecutionLogEntry[];
}

export interface ExecutionListItem {
  id: string;
  workflowId: string;
  workflow: { id: string; name: string; status: string };
  triggerType: string;
  status: ExecutionStatus;
  triggerData: unknown;
  error: unknown;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  durationMs: number | null;
  nodeCount: number;
}

export interface DashboardData {
  metrics: {
    activeWorkflows: number;
    totalWorkflows: number;
    executionsToday: number;
    successfulToday: number;
    failedToday: number;
    successRateToday: number;
  };
  statusCounts: Record<string, number>;
  recentExecutions: ExecutionListItem[];
  failedExecutions: ExecutionListItem[];
  topWorkflows: { workflowId: string; name: string; executions: number }[];
  activity: { hour: string; label: string; total: number; completed: number; failed: number }[];
}

export interface IntegrationStatus {
  email: { mode: string; configured: boolean; description: string };
  redis: { connected: boolean; error?: string; description: string };
  postgres: { connected: boolean; description: string };
  webhooks: { enabled: boolean; baseUrl: string; description: string };
  http: { enabled: boolean; description: string };
}
