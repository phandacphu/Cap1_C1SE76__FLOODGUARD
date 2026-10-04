import axiosClient from './axiosClient'
import { normalizeRole } from '../constants/roles'
import type { LoginRequest, LoginResult } from '../types/auth'

/**
 * TODO(CCF-39): the backend (backend/src/routes/auth.routes.js) only has POST /api/auth/register so far.
 * This assumes the login endpoint will be POST /api/auth/login and will answer in the same style as register:
 *   { success: true, message: "...", data: { token: "...", user: { id, fullName, email, role, ... } } }
 * Only this file should need changes once the real contract is confirmed.
 */
export async function login(payload: LoginRequest): Promise<LoginResult> {
  const { data: body } = await axiosClient.post('/auth/login', payload)

  // Backend wraps the payload in "data"; also accept an unwrapped response.
  const data = body?.data ?? body
  const user = data.user

  return {
    token: data.token,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName ?? user.name,
      role: normalizeRole(user.role),
    },
  }
}
