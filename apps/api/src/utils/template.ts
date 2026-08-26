/**
 * Template resolution for workflow data flow.
 *
 * Nodes produce outputs that are stored in an execution context. Later nodes
 * can reference those outputs with `{{path.to.value}}` expressions, for
 * example `{{webhook.email}}` or `{{http_request.data.company}}`.
 *
 * The context shape is:
 * {
 *   inputs:    { webhook?, schedule?, manual? }  — raw trigger payloads
 *   variables: { name: value }                    — set by Set Variable nodes
 *   nodes:     { [nodeId]: output }               — outputs of every executed node
 *   metadata:  { executionId, workflowId, triggerType, startedAt }
 * }
 */

export interface ExecutionContext {
  inputs: Record<string, unknown>;
  variables: Record<string, unknown>;
  nodes: Record<string, unknown>;
  metadata: Record<string, unknown>;
  /** node ids in execution order (used for type/label aliasing) */
  nodeOrder: string[];
  /** label slug -> node id */
  labelIndex: Record<string, string>;
  /** node type -> first node id of that type (execution order) */
  typeIndex: Record<string, string>;
}

const TOKEN_RE = /\{\{\s*([^{}]+?)\s*\}\}/g;

function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function buildContext(partial: {
  inputs?: Record<string, unknown>;
  variables?: Record<string, unknown>;
  nodes?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  nodeOrder?: string[];
}): ExecutionContext {
  return {
    inputs: partial.inputs ?? {},
    variables: partial.variables ?? {},
    nodes: partial.nodes ?? {},
    metadata: partial.metadata ?? {},
    nodeOrder: partial.nodeOrder ?? [],
    labelIndex: {},
    typeIndex: {},
  };
}

export function indexNodes(ctx: ExecutionContext, definitions: { id: string; type: string; label: string }[]): void {
  ctx.labelIndex = {};
  ctx.typeIndex = {};
  for (const def of definitions) {
    if (!(def.type in ctx.typeIndex)) ctx.typeIndex[def.type] = def.id;
    const slug = slugify(def.label);
    if (slug && !(slug in ctx.labelIndex)) ctx.labelIndex[slug] = def.id;
  }
}

/** Resolve a dotted path against the context, e.g. "webhook.email". */
export function resolvePath(context: ExecutionContext, rawPath: string): unknown {
  const path = rawPath.trim();
  if (!path) return undefined;

  const segments = path.split(".").filter(Boolean);
  const first = segments[0];

  let root: unknown;
  if (first === "webhook" || first === "schedule" || first === "manual") {
    root = context.inputs[first];
  } else if (first === "inputs" || first === "payload" || first === "trigger") {
    root = context.inputs;
  } else if (first === "variables") {
    root = context.variables;
  } else if (first === "nodes") {
    root = context.nodes;
  } else if (first === "metadata") {
    root = context.metadata;
  } else if (first === "env") {
    root = process.env as unknown as Record<string, unknown>;
  } else if (first in context.nodes) {
    root = context.nodes[first];
  } else if (first in context.labelIndex) {
    root = context.nodes[context.labelIndex[first]];
  } else if (first in context.typeIndex) {
    root = context.nodes[context.typeIndex[first]];
  } else {
    return undefined;
  }

  let current: unknown = root;
  for (let i = 1; i < segments.length; i++) {
    if (current === null || current === undefined) return undefined;
    if (Array.isArray(current)) {
      const idx = Number(segments[i]);
      if (!Number.isInteger(idx)) return undefined;
      current = current[idx];
    } else if (typeof current === "object") {
      current = (current as Record<string, unknown>)[segments[i]];
    } else {
      return undefined;
    }
  }
  return current;
}

function stringify(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * Resolve a value that may contain `{{path}}` templates.
 * - If the whole string is a single template, the raw resolved value is returned.
 * - Objects and arrays are resolved recursively.
 */
export function resolveTemplate(value: unknown, context: ExecutionContext): unknown {
  if (typeof value === "string") {
    if (!value.includes("{{")) return value;
    const trimmed = value.trim();
    const singleMatch = trimmed.match(/^\{\{\s*([^{}]+?)\s*\}\}$/);
    if (singleMatch) {
      return resolvePath(context, singleMatch[1]) ?? "";
    }
    return value.replace(TOKEN_RE, (_m, path: string) => stringify(resolvePath(context, path) ?? ""));
  }
  if (Array.isArray(value)) {
    return value.map((v) => resolveTemplate(v, context));
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = resolveTemplate(v, context);
    }
    return out;
  }
  return value;
}

/** Extract every referenced path from a string template. */
export function referencedPaths(value: unknown, acc: Set<string> = new Set()): Set<string> {
  if (typeof value === "string") {
    let m: RegExpExecArray | null;
    const re = new RegExp(TOKEN_RE.source, "g");
    while ((m = re.exec(value)) !== null) {
      acc.add(m[1].trim());
    }
  } else if (Array.isArray(value)) {
    value.forEach((v) => referencedPaths(v, acc));
  } else if (value && typeof value === "object") {
    Object.values(value).forEach((v) => referencedPaths(v, acc));
  }
  return acc;
}
