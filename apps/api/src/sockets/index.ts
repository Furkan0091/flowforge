import { Server } from "socket.io";
import { Server as HttpServer } from "http";
import { env } from "../config/env";
import { verifyToken } from "../utils/jwt";
import { setSocketServer } from "./events";
import { logger } from "../lib/logger";

export function attachSockets(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: {
      origin: env.webOrigins,
      credentials: true,
    },
  });
  setSocketServer(io);

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (typeof token !== "string" || !token) {
      return next(new Error("unauthorized"));
    }
    try {
      const payload = verifyToken(token);
      socket.data.userId = payload.sub;
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    const userId = socket.data.userId as string;
    socket.join(`user:${userId}`);

    socket.on("join-execution", (executionId: string) => {
      socket.join(`execution:${executionId}`);
    });
    socket.on("leave-execution", (executionId: string) => {
      socket.leave(`execution:${executionId}`);
    });
    socket.on("join-workflow", (workflowId: string) => {
      socket.join(`workflow:${workflowId}`);
    });
    socket.on("leave-workflow", (workflowId: string) => {
      socket.leave(`workflow:${workflowId}`);
    });

    logger.debug("socket connected", { userId });
  });

  return io;
}
