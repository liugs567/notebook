const AUTH_KEY = 'liu-blog-auth'

export function isAuthenticated(): boolean {
  return sessionStorage.getItem(AUTH_KEY) === '1'
}

export function login(password: string): boolean {
  if (password === 'liuguangshuo') {
    sessionStorage.setItem(AUTH_KEY, '1')
    return true
  }
  return false
}

export function logout(): void {
  sessionStorage.removeItem(AUTH_KEY)
}
