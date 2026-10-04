import type { Role } from '../constants/roles'

export interface AuthUser {
  id: string
  email: string
  fullName?: string
  role: Role
}

export interface LoginRequest {
  email: string
  password: string
}

export interface LoginResult {
  token: string
  user: AuthUser
}
