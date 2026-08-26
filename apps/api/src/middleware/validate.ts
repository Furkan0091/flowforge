import { NextFunction, Request, Response } from "express";
import { ZodSchema } from "zod";
import { ApiError } from "../utils/ApiError";

export function validate(schema: ZodSchema, target: "body" | "query" | "params" = "body") {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[target]);
    if (!result.success) {
      throw ApiError.badRequest(
        "VALIDATION_ERROR",
        "Request validation failed",
        result.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        }))
      );
    }
    (req as unknown as Record<string, unknown>)[target] = result.data;
    next();
  };
}
