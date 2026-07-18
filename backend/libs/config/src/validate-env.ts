import { z } from 'zod';

/**
 * Thrown when the environment fails validation. The message names the offending variables and
 * says what was wrong with each, and deliberately never echoes a value — an environment error
 * must not become the way a secret reaches a log (V3 §21).
 */
export class EnvironmentValidationError extends Error {
  constructor(
    readonly serviceName: string,
    readonly issues: readonly string[],
  ) {
    super(
      `Invalid environment for ${serviceName}:\n` +
        issues.map((issue) => `  - ${issue}`).join('\n'),
    );
    this.name = 'EnvironmentValidationError';
  }
}

/**
 * Validate `source` against `schema`, reporting every problem at once rather than the first.
 */
export function validateEnv<TSchema extends z.ZodTypeAny>(
  serviceName: string,
  schema: TSchema,
  source: Record<string, unknown> = process.env,
): z.infer<TSchema> {
  const result = schema.safeParse(source);

  if (!result.success) {
    const issues = result.error.issues.map((issue) => {
      const path = issue.path.join('.') || '(root)';
      return `${path}: ${issue.message}`;
    });
    throw new EnvironmentValidationError(serviceName, issues);
  }

  return result.data as z.infer<TSchema>;
}
