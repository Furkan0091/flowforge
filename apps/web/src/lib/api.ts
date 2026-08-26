import type {
  DashboardData,
  ExecutionDetail,
  ExecutionListItem,
  IntegrationStatus,
  NodeTypesResponse,
  User,
  WorkflowDefinition,
  WorkflowDetail,
  WorkflowListItem,
} from "./types";

const TOKEN_KEY = "flowforge_token";
const API_BASE = import.meta.env.VITE_API_URL || "";

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", "Cannot reach the FlowForge API. Is the backend running?");
  }

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // no body
  }

  if (!res.ok) {
    const err = (body as { error?: { code?: string; message?: string; details?: unknown } })?.error;
    if (res.status === 401 && getToken()) {
      setToken(null);
      window.dispatchEvent(new Event("flowforge:unauthorized"));
    }
    throw new ApiError(res.status, err?.code ?? "REQUEST_FAILED", err?.message ?? res.statusText, err?.details);
  }

  const data = (body as { data?: T })?.data;
  if (data === undefined) {
    throw new ApiError(200, "BAD_RESPONSE", "Malformed API response");
  }
  return data;
}

function get<T>(path: string): Promise<T> {
  return request<T>(path);
}

function post<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });
}

function put<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, { method: "PUT", body: body === undefined ? undefined : JSON.stringify(body) });
}

function del<T>(path: string): Promise<T> {
  return request<T>(path, { method: "DELETE" });
}

export const api = {
  auth: {
    register: (body: { email: string; password: string; name?: string }) =>
      post<{ token: string; user: User }>("/api/auth/register", body),
    login: (body: { email: string; password: string }) =>
      post<{ token: string; user: User }>("/api/auth/login", body),
    me: () => get<{ user: User }>("/api/auth/me"),
    logout: () => request<void>("/api/auth/logout", { method: "POST" }),
    updateProfile: (body: { name?: string }) => put<{ user: User }>("/api/auth/me", body),
    changePassword: (body: { currentPassword: string; newPassword: string }) =>
      put<{ success: boolean }>("/api/auth/me/password", body),
  },
  workflows: {
    list: () => get<{ workflows: WorkflowListItem[] }>("/api/workflows"),
    get: (id: string) => get<{ workflow: WorkflowDetail }>(`/api/workflows/${id}`),
    create: (body: { name: string; description?: string; definition?: WorkflowDefinition }) =>
      post<{ workflow: WorkflowDetail }>("/api/workflows", body),
    update: (id: string, body: Partial<{ name: string; description: string; definition: WorkflowDefinition }>) =>
      put<{ workflow: WorkflowDetail }>(`/api/workflows/${id}`, body),
    remove: (id: string) => del<{ success: boolean }>(`/api/workflows/${id}`),
    duplicate: (id: string) => post<{ workflow: WorkflowDetail }>(`/api/workflows/${id}/duplicate`),
    enable: (id: string) => post<{ workflow: WorkflowDetail }>(`/api/workflows/${id}/enable`),
    disable: (id: string) => post<{ workflow: WorkflowDetail }>(`/api/workflows/${id}/disable`),
    execute: (id: string, payload?: Record<string, unknown>) =>
      post<{ executionId: string; status: string }>(`/api/workflows/${id}/execute`, { payload }),
    versions: (id: string) => get<{ versions: WorkflowDetail["versions"] }>(`/api/workflows/${id}/versions`),
    activateVersion: (id: string, version: number) =>
      post<{ workflow: WorkflowDetail }>(`/api/workflows/${id}/versions/activate`, { version }),
  },
  executions: {
    list: (params?: { workflowId?: string; status?: string; limit?: number; offset?: number }) => {
      const q = new URLSearchParams();
      if (params?.workflowId) q.set("workflowId", params.workflowId);
      if (params?.status) q.set("status", params.status);
      if (params?.limit) q.set("limit", String(params.limit));
      if (params?.offset) q.set("offset", String(params.offset));
      const suffix = q.toString() ? `?${q.toString()}` : "";
      return get<{ total: number; executions: ExecutionListItem[] }>(`/api/executions${suffix}`);
    },
    get: (id: string) => get<{ execution: ExecutionDetail }>(`/api/executions/${id}`),
    logs: (id: string) => get<{ logs: ExecutionDetail["logs"] }>(`/api/executions/${id}/logs`),
    cancel: (id: string) => post<{ execution: ExecutionListItem }>(`/api/executions/${id}/cancel`),
    rerun: (id: string) => post<{ executionId: string; status: string }>(`/api/executions/${id}/rerun`),
  },
  dashboard: {
    get: () => get<DashboardData>("/api/dashboard"),
  },
  integrations: {
    get: () => get<IntegrationStatus>("/api/integrations"),
  },
  templates: {
    list: () =>
      get<{ templates: { id: string; name: string; description: string; nodeCount: number; nodeTypes: string[] }[] }>(
        "/api/templates"
      ),
    use: (templateId: string) => post<{ workflowId: string }>("/api/templates/use", { templateId }),
  },
  nodeTypes: {
    get: () => get<NodeTypesResponse>("/api/workflows/node-types"),
  },
};
