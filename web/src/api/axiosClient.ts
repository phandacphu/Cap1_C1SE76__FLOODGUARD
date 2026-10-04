import axios from 'axios'

export const TOKEN_KEY = 'fg_token'
export const USER_KEY = 'fg_user'

const axiosClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:5000/api',
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
})

// Attach the token to every request.
axiosClient.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// If the token is rejected, clear the session and go back to the login page.
axiosClient.interceptors.response.use(
  (res) => res,
  (error) => {
    const url: string = error?.config?.url ?? ''
    const isLoginCall = url.includes('/auth/login')
    if (error?.response?.status === 401 && !isLoginCall) {
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(USER_KEY)
      window.location.assign('/login')
    }
    return Promise.reject(error)
  },
)

export default axiosClient
