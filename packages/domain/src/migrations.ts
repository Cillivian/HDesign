import { projectSchema, SCHEMA_VERSION, type Project } from './schema';

export class DomainValidationError extends Error {
  readonly issues: string[];

  constructor(message: string, issues: string[]) {
    super(message);
    this.name = 'DomainValidationError';
    this.issues = issues;
  }
}

export interface NormalizedProject {
  project: Project;
  warnings: string[];
}

/**
 * Validates and upgrades a raw project document.
 * Unknown schema versions are rejected loudly instead of silently losing data.
 */
export function normalizeProject(raw: unknown): NormalizedProject {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new DomainValidationError('项目数据格式无效：根节点必须是对象', ['project: expected object']);
  }
  const candidate = { ...(raw as Record<string, unknown>) };
  const warnings: string[] = [];
  const version = candidate.schemaVersion;
  if (typeof version !== 'number') {
    candidate.schemaVersion = SCHEMA_VERSION;
    warnings.push('缺少 schemaVersion，已按当前版本读取');
  } else if (version > SCHEMA_VERSION) {
    warnings.push(`项目版本 ${version} 高于当前支持的 ${SCHEMA_VERSION}，可能存在未识别字段`);
  }
  const parsed = projectSchema.safeParse(candidate);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(
      (issue) => `${issue.path.join('.') || 'project'}: ${issue.message}`,
    );
    throw new DomainValidationError(`项目数据校验失败（${issues.length} 处）`, issues);
  }
  return { project: parsed.data, warnings };
}

export function validateProject(raw: unknown): {
  ok: boolean;
  issues: string[];
  project?: Project;
} {
  const parsed = projectSchema.safeParse(raw);
  if (parsed.success) return { ok: true, issues: [], project: parsed.data };
  return {
    ok: false,
    issues: parsed.error.issues.map(
      (issue) => `${issue.path.join('.') || 'project'}: ${issue.message}`,
    ),
  };
}

export function projectIssues(raw: unknown): string[] {
  return validateProject(raw).issues;
}
