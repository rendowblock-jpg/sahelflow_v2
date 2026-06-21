/**
 * Typed errors — structured error classes for the service layer.
 *
 * Every service function throws these (not generic Error) so the UI can
 * branch on error type and show appropriate messages.
 *
 * Usage:
 *   try {
 *     await orderService.update(id, data);
 *   } catch (err) {
 *     if (err instanceof NotFoundError) { ... }
 *     if (err instanceof ValidationError) { ... }
 *   }
 */

/** Base class for all SahelFlow errors. */
export class SahelFlowError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

/** Resource not found (404). */
export class NotFoundError extends SahelFlowError {
  constructor(resource: string, id: string) {
    super(`${resource} not found: ${id}`, "NOT_FOUND", 404);
  }
}

/** Input validation failed (400). */
export class ValidationError extends SahelFlowError {
  constructor(
    message: string,
    public readonly field?: string,
  ) {
    super(message, "VALIDATION_ERROR", 400);
  }
}

/** Business rule violation (409). */
export class BusinessRuleError extends SahelFlowError {
  constructor(message: string) {
    super(message, "BUSINESS_RULE", 409);
  }
}

/** Invalid state transition (409). */
export class InvalidTransitionError extends SahelFlowError {
  constructor(
    public readonly from: string,
    public readonly to: string,
    public readonly allowed: readonly string[],
  ) {
    super(
      `Cannot transition from '${from}' to '${to}'. Allowed: ${allowed.join(", ") || "(none)"}`,
      "INVALID_TRANSITION",
      409,
    );
  }
}

/** Conflict with existing data (409). */
export class ConflictError extends SahelFlowError {
  constructor(message: string) {
    super(message, "CONFLICT", 409);
  }
}

/** External service error (502). */
export class ExternalServiceError extends SahelFlowError {
  constructor(
    service: string,
    message: string,
  ) {
    super(`${service}: ${message}`, "EXTERNAL_SERVICE", 502);
  }
}

/** Rate limit exceeded (429). */
export class RateLimitError extends SahelFlowError {
  constructor(
    public readonly retryAfterMs: number,
  ) {
    super(`Rate limit exceeded. Retry after ${retryAfterMs}ms.`, "RATE_LIMIT", 429);
  }
}
