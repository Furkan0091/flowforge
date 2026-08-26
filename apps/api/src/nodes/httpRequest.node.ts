import { resolveTemplate } from "../utils/template";
import { registerNode } from "./registry";
import { nodeError } from "./errors";

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

interface KeyValue {
  key: string;
  value: string;
}

function pairsToObject(pairs: unknown, context: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!Array.isArray(pairs)) return out;
  for (const pair of pairs as KeyValue[]) {
    if (!pair || typeof pair !== "object") continue;
    const key = String(pair.key ?? "").trim();
    if (!key) continue;
    out[key] = String(resolveTemplate(pair.value ?? "", context as never) ?? "");
  }
  return out;
}

export function registerHttpRequestNode(): void {
  registerNode({
    schema: {
      type: "http_request",
      category: "integration",
      label: "HTTP Request",
      description: "Performs an outbound HTTP request. The response is available to downstream nodes.",
      icon: "globe",
      color: "#60a5fa",
      outputAliases: ["http_response"],
      defaultConfig: {
        method: "GET",
        url: "https://api.example.com/resource",
        headers: [{ key: "Content-Type", value: "application/json" }],
        queryParams: [],
        body: "",
        authType: "none",
        authUsername: "",
        authPassword: "",
        authToken: "",
        timeoutMs: 10000,
        retries: 2,
        retryDelayMs: 1000,
      },
      configFields: [
        {
          name: "method",
          label: "Method",
          type: "select",
          options: METHODS.map((m) => ({ label: m, value: m })),
          default: "GET",
        },
        {
          name: "url",
          label: "URL",
          type: "text",
          placeholder: "https://api.example.com/resource",
          default: "",
        },
        {
          name: "headers",
          label: "Headers",
          type: "keyvalue",
          default: [],
        },
        {
          name: "queryParams",
          label: "Query parameters",
          type: "keyvalue",
          default: [],
        },
        {
          name: "body",
          label: "Request body",
          type: "code",
          rows: 4,
          placeholder: '{"email": "{{webhook.email}}"}',
          help: "JSON string; supports {{variable}} templates.",
          default: "",
        },
        {
          name: "authType",
          label: "Authentication",
          type: "select",
          options: [
            { label: "None", value: "none" },
            { label: "Basic", value: "basic" },
            { label: "Bearer token", value: "bearer" },
          ],
          default: "none",
        },
        {
          name: "authUsername",
          label: "Username",
          type: "text",
          default: "",
          dependsOn: { field: "authType", equals: "basic" },
        },
        {
          name: "authPassword",
          label: "Password",
          type: "secret",
          default: "",
          dependsOn: { field: "authType", equals: "basic" },
        },
        {
          name: "authToken",
          label: "Token",
          type: "secret",
          default: "",
          dependsOn: { field: "authType", equals: "bearer" },
        },
        {
          name: "timeoutMs",
          label: "Timeout (ms)",
          type: "number",
          default: 10000,
        },
        {
          name: "retries",
          label: "Retries",
          type: "number",
          default: 2,
          help: "Automatic retries for transient failures (network errors, 5xx, 429).",
        },
        {
          name: "retryDelayMs",
          label: "Retry delay (ms)",
          type: "number",
          default: 1000,
          help: "Base delay; retries use exponential backoff.",
        },
      ],
    },
    handler: async (ctx) => {
      const config = ctx.node.config;
      const method = String(config.method ?? "GET").toUpperCase();
      const urlTemplate = String(config.url ?? "");
      if (!urlTemplate.trim()) {
        throw nodeError("HTTP Request node requires a URL", { code: "HTTP_NO_URL" });
      }

      const context = ctx.context;
      const url = String(resolveTemplate(urlTemplate, context) ?? "");
      const headers = pairsToObject(config.headers, context);
      const queryParams = pairsToObject(config.queryParams, context);
      const timeoutMs = Math.max(1, Number(config.timeoutMs ?? 10000));
      const authType = String(config.authType ?? "none");

      if (authType === "basic") {
        const user = String(resolveTemplate(config.authUsername ?? "", context) ?? "");
        const pass = String(resolveTemplate(config.authPassword ?? "", context) ?? "");
        headers["Authorization"] = `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
      } else if (authType === "bearer") {
        const token = String(resolveTemplate(config.authToken ?? "", context) ?? "");
        headers["Authorization"] = `Bearer ${token}`;
      }

      let target = url;
      if (Object.keys(queryParams).length > 0) {
        const parsed = new URL(url);
        for (const [k, v] of Object.entries(queryParams)) parsed.searchParams.set(k, v);
        target = parsed.toString();
      }

      let body: string | undefined;
      if (method !== "GET" && method !== "HEAD") {
        const resolvedBody = resolveTemplate(config.body ?? "", context);
        body = typeof resolvedBody === "string" ? resolvedBody : JSON.stringify(resolvedBody ?? {});
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const started = Date.now();

      try {
        let response: Response;
        try {
          response = await fetch(target, {
            method,
            headers,
            body,
            signal: controller.signal,
          });
        } catch (err) {
          const aborted = err instanceof Error && err.name === "AbortError";
          throw nodeError(
            aborted ? `Request timed out after ${timeoutMs}ms` : `Network error: ${(err as Error).message}`,
            { code: aborted ? "HTTP_TIMEOUT" : "HTTP_NETWORK", retryable: true, details: { url: target } }
          );
        }

        const duration = Date.now() - started;
        const raw = await response.text();
        let data: unknown = raw;
        try {
          data = JSON.parse(raw);
        } catch {
          // leave as text
        }

        if (!response.ok) {
          const retryable = response.status === 429 || response.status >= 500;
          throw nodeError(`HTTP ${response.status} ${response.statusText}`, {
            code: "HTTP_ERROR",
            retryable,
            details: { status: response.status, url: target, body: raw.slice(0, 1000) },
          });
        }

        await ctx.log("info", `HTTP ${method} ${target} → ${response.status} (${duration}ms)`);

        return {
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries()),
          data,
          duration,
          url: target,
        };
      } finally {
        clearTimeout(timer);
      }
    },
  });
}
