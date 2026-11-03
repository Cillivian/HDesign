let counter = 0;

/**
 * Short, sortable, collision-resistant id for local-first documents.
 * Not cryptographic; ids are only unique inside one project/database.
 */
export function createId(prefix = 'id'): string {
  counter = (counter + 1) % 1_679_616;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}
