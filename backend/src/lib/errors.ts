/** An error whose message is safe to show to the end user. */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code = 'ERROR',
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (message: string, code = 'BAD_REQUEST', details?: Record<string, unknown>) =>
  new AppError(400, message, code, details);
export const unauthorized = (message = 'Please sign in to continue.') => new AppError(401, message, 'UNAUTHORIZED');
export const forbidden = (message = 'You do not have permission to do that.') =>
  new AppError(403, message, 'FORBIDDEN');
export const notFound = (message = 'The requested item was not found.') => new AppError(404, message, 'NOT_FOUND');
export const conflict = (message: string, code = 'CONFLICT', details?: Record<string, unknown>) =>
  new AppError(409, message, code, details);
