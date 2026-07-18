/**
 * System roles (V3 §5.2). ADMIN holds authority over the platform and never over content.
 */
export const SystemRole = {
  ADMIN: 'ADMIN',
  EMPLOYEE: 'EMPLOYEE',
} as const;

export type SystemRole = (typeof SystemRole)[keyof typeof SystemRole];

export const SYSTEM_ROLES: readonly SystemRole[] = Object.values(SystemRole);

export function isSystemRole(value: string): value is SystemRole {
  return (SYSTEM_ROLES as readonly string[]).includes(value);
}
