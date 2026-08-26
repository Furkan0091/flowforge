import { NextFunction, Request, Response } from "express";
import { ApiError } from "../utils/ApiError";
import { verifyToken } from "../utils/jwt";
import { prisma } from "../lib/prisma";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
      };
    }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    next(ApiError.unauthorized());
    return;
  }
  const token = header.slice("Bearer ".length).trim();
  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    next(ApiError.unauthorized("INVALID_TOKEN", "Invalid or expired token"));
    return;
  }

  prisma.user
    .findUnique({ where: { id: payload.sub } })
    .then((user) => {
      if (!user) {
        next(ApiError.unauthorized("INVALID_TOKEN", "Token does not map to a user"));
        return;
      }
      req.user = { id: user.id, email: user.email };
      next();
    })
    .catch(next);
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (header && header.startsWith("Bearer ")) {
    try {
      const payload = verifyToken(header.slice("Bearer ".length).trim());
      req.user = { id: payload.sub, email: payload.email };
    } catch {
      // ignore invalid tokens for optional auth
    }
  }
  next();
}
