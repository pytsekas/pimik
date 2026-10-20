import type { ErrorRequestHandler, RequestHandler } from 'express';

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: 'not_found', message: 'Not found' });
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.code, message: err.message });
    return;
  }
  const status = clientErrorStatus(err);
  if (status !== undefined) {
    const code = status === 400 ? 'bad_request' : 'client_error';
    res
      .status(status)
      .json({ error: code, message: status === 400 ? 'Bad request' : 'Request error' });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'internal', message: 'Internal error' });
};

/** Express and its body parsers tag client errors (e.g. malformed URI escapes) with a 4xx status. */
function clientErrorStatus(err: unknown): number | undefined {
  if (typeof err !== 'object' || err === null) return undefined;
  const { status, statusCode } = err as { status?: unknown; statusCode?: unknown };
  const value = typeof status === 'number' ? status : statusCode;
  return typeof value === 'number' && value >= 400 && value < 500 ? value : undefined;
}
