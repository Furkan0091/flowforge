import { io, Socket } from "socket.io-client";
import { getToken } from "./api";

let socket: Socket | null = null;

export interface NodeEvent {
  executionId: string;
  data: {
    nodeId: string;
    status: string;
    label?: string;
    output?: unknown;
    error?: unknown;
    duration?: number;
    startedAt?: string;
    finishedAt?: string;
  };
}

export interface ExecutionEvent {
  executionId: string;
  data: Record<string, unknown>;
}

export interface LogEvent {
  executionId: string;
  data: { log: { id?: string; level: string; message: string; nodeId?: string | null; createdAt: string } };
}

/** Connect (or reuse) the socket with the current token. */
export function connectSocket(): Socket {
  if (socket && socket.connected) return socket;
  const base = import.meta.env.VITE_API_URL || window.location.origin;
  socket = io(base, {
    auth: { token: getToken() },
    transports: ["websocket", "polling"],
    reconnectionAttempts: Infinity,
  });
  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}

export function joinExecutionRoom(executionId: string): void {
  connectSocket().emit("join-execution", executionId);
}

export function leaveExecutionRoom(executionId: string): void {
  socket?.emit("leave-execution", executionId);
}

export function joinWorkflowRoom(workflowId: string): void {
  connectSocket().emit("join-workflow", workflowId);
}

export function leaveWorkflowRoom(workflowId: string): void {
  socket?.emit("leave-workflow", workflowId);
}

export function onEvent<T>(event: string, handler: (payload: T) => void): () => void {
  const s = connectSocket();
  s.on(event, handler);
  return () => {
    s.off(event, handler);
  };
}
