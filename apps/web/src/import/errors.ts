/* UI-facing import errors: always actionable Chinese copy, never a raw stack. */

export type ImportErrorCode =
  | 'UNSUPPORTED_FILE'
  | 'FILE_TOO_LARGE'
  | 'CORRUPT_FILE'
  | 'PDF_PASSWORD'
  | 'PDF_PAGE_FAILED'
  | 'PDF_CORRUPT'
  | 'IMAGE_DECODE_FAILED'
  | 'TOO_MANY_PIXELS'
  | 'WORKER_FAILED'
  | 'OCR_UNAVAILABLE'
  | 'AI_NOT_CONFIGURED'
  | 'AI_FAILED'
  | 'NO_GEOMETRY';

export class ImportError extends Error {
  readonly code: ImportErrorCode;
  readonly hint?: string;

  constructor(code: ImportErrorCode, message: string, hint?: string) {
    super(message);
    this.name = 'ImportError';
    this.code = code;
    this.hint = hint;
  }
}

export function errorMessage(error: unknown): { message: string; hint?: string } {
  if (error instanceof ImportError) return { message: error.message, hint: error.hint };
  if (error instanceof Error) return { message: error.message };
  return { message: String(error) };
}

export function isImportError(error: unknown): error is ImportError {
  return error instanceof ImportError;
}
