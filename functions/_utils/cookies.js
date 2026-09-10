/**
 * ============================================================================
 * LINEA ABIERTA (lineaabierta.net.pe)
 * Utilidades para manejo seguro de Cookies HTTP (HttpOnly, Secure, SameSite)
 * ============================================================================
 */

export function createCookie(name, value, options = {}) {
  const {
    maxAge = 86400, // 24 horas por defecto
    path = '/',
    httpOnly = true,
    secure = true,
    sameSite = 'Strict'
  } = options;

  const parts = [`${name}=${encodeURIComponent(value)}`];

  if (path) parts.push(`Path=${path}`);
  if (maxAge !== undefined) parts.push(`Max-Age=${maxAge}`);
  if (httpOnly) parts.push('HttpOnly');
  if (secure) parts.push('Secure');
  if (sameSite) parts.push(`SameSite=${sameSite}`);

  return parts.join('; ');
}

export function clearCookie(name, options = {}) {
  const { path = '/', sameSite = 'Strict' } = options;
  return `${name}=; Path=${path}; Max-Age=0; HttpOnly; Secure; SameSite=${sameSite}`;
}

export function parseCookies(request) {
  const cookieHeader = request.headers.get('Cookie');
  if (!cookieHeader) return {};

  const cookies = {};
  const items = cookieHeader.split(';');

  for (const item of items) {
    const [key, ...rest] = item.trim().split('=');
    if (key) {
      cookies[key.trim()] = decodeURIComponent(rest.join('='));
    }
  }

  return cookies;
}
