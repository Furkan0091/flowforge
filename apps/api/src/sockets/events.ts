import type { Server } from "socket.io";

let io: Server | null = null;

export function setSocketServer(server: Server): void {
  io = server;
}

export interface ExecutionEventPayload {
  executionId: string;
  userId: string;
  event: "execution" | "node" | "log";
  data: Record<string, unknown>;
}

/** Emit a real-time update to everyone watching this execution or workflow. */
export function emitExecutionEvent(payload: {
  executionId: string;
  userId: string;
  workflowId: string;
  event: "execution" | "node" | "log";
  data: Record<string, unknown>;
}): void {
  if (!io) return;
  const base = { executionId: payload.executionId, data: payload.data };
  io.to(`execution:${payload.executionId}`).emit(payload.event, base);
  io.to(`workflow:${payload.workflowId}`).emit(payload.event, base);
  io.to(`user:${payload.userId}`).emit(payload.event, base);
}
