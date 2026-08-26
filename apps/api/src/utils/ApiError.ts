export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }

  static badRequest(code: string, message: string, details?: unknown): ApiError {
    return new ApiError(400, code, message, details);
  }

  static unauthorized(code = "UNAUTHORIZED", message = "Authentication required"): ApiError {
    return new ApiError(401, code, message);
  }

  static forbidden(code = "FORBIDDEN", message = "You do not have access to this resource"): ApiError {
    return new ApiError(403, code, message);
  }

  static notFound(code = "NOT_FOUND", message = "Resource not found"): ApiError {
    return new ApiError(404, code, message);
  }

  static conflict(code = "CONFLICT", message = "Resource already exists"): ApiError {
    return new ApiError(409, code, message);
  }

  static tooManyRequests(message = "Too many requests, please slow down"): ApiError {
    return new ApiError(429, "RATE_LIMITED", message);
  }
}
