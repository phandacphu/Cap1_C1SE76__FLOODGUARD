// Backend stores roles in lowercase (e.g. "resident" in user.service.js).
// TODO(CCF-39): confirm the exact strings used for admin and rescue staff accounts.
export const ROLES = {
  ADMIN: 'admin',
  RESCUE_STAFF: 'rescue_staff',
  RESIDENT: 'resident', // mobile only, must NOT access the web dashboard
} as const

export type Role = (typeof ROLES)[keyof typeof ROLES]

/** Roles that are allowed to use the web dashboard. */
export const WEB_ROLES: Role[] = [ROLES.ADMIN, ROLES.RESCUE_STAFF]

/** Where each role lands after logging in. */
export const HOME_BY_ROLE: Partial<Record<Role, string>> = {
  [ROLES.ADMIN]: '/admin',
  [ROLES.RESCUE_STAFF]: '/rescue',
}

/** Normalize a role string from the API ("Rescue Staff", "RESCUE-STAFF" -> "rescue_staff"). */
export function normalizeRole(raw: unknown): Role {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_') as Role
}
