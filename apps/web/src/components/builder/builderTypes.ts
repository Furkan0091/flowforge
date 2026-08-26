import type { NodeCategory, NodeRunStatus, NodeTypeSchema } from "../../lib/types";

export interface BuilderNodeData extends Record<string, unknown> {
  label: string;
  type: string;
  category: NodeCategory;
  color: string;
  icon: string;
  config: Record<string, unknown>;
  status?: NodeRunStatus;
  durationMs?: number;
  error?: unknown;
  branchHandles?: string[];
}

export interface NodeStatusInfo {
  status?: NodeRunStatus;
  durationMs?: number;
  error?: unknown;
}

export type NodeTypeMap = Map<string, NodeTypeSchema>;
