/**
 * ============================================================================
 * LINEA ABIERTA (lineaabierta.net.pe)
 * Middleware de Seguridad: functions/api/admin/_middleware.js
 * Protege todas las rutas bajo /api/admin/* requiriendo una sesión 2FA activa.
 * ============================================================================
 */

import { verifyTokenHMAC } from '../../_utils/crypto.js';
import { validateOrigin } from '../../_utils/security.js';
import { parseCookies } from '../../_utils/cookies.js';

export async function onRequest(context) {
  const { request, env } = context;

  // 1. Verificación de Origen (Anti-CSRF en mutaciones)
  if (!validateOrigin(request)) {
    return new Response(JSON.stringify({ error: 'Origen de petición no permitido.' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // 2. Extracción y Verificación de Cookie de Sesión
  const cookies = parseCookies(request);
  const sessionToken = cookies.la_session;
  const sessionSecret = env.SESSION_SECRET || '';

  if (!sessionToken || !sessionSecret) {
    return new Response(
      JSON.stringify({
        error: 'No autorizado. Se requiere iniciar sesión con 2FA en /admin/login.html.',
        authenticated: false
      }),
      {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }

  const payload = await verifyTokenHMAC(sessionToken, sessionSecret);
  if (!payload || !payload.admin) {
    return new Response(
      JSON.stringify({
        error: 'Sesión inválida o expirada. Por favor autentíquese nuevamente.',
        authenticated: false
      }),
      {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }

  // Adjuntar el usuario autenticado al contexto para los siguientes manejadores
  context.data.adminUser = payload.sub;

  // Continuar la ejecución hacia el endpoint solicitado
  return await context.next();
}
