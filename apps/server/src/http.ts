import type { ZodError } from 'zod';

export function issues(error: ZodError): string[] {
  return error.issues.map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`);
}
