import { NodeFailure } from "./types";

export function nodeError(
  message: string,
  options: { code?: string; retryable?: boolean; details?: unknown } = {}
): NodeFailure {
  const err = new Error(message) as NodeFailure;
  err.code = options.code ?? "NODE_ERROR";
  err.retryable = options.retryable;
  err.details = options.details;
  return err;
}
