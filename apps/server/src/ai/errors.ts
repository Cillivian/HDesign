export class AiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly hint?: string;
  readonly details?: string[];

  constructor(code: string, message: string, status = 500, hint?: string, details?: string[]) {
    super(message);
    this.name = 'AiError';
    this.code = code;
    this.status = status;
    this.hint = hint;
    this.details = details;
  }
}
