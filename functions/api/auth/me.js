/**
 * ============================================================================
 * LINEA ABIERTA (lineaabierta.net.pe)
 * Endpoint: GET /api/auth/me (Verificación del estado de sesión actual)
 * ============================================================================
 */

import { verifyTokenHMAC } from '../../_utils/crypto.js';
import { parseCookies } from '../../_utils/cookies.js';

export async function onRequestGet(context) {
  const { request, env } = context;

  const cookies = parseCookies(request);
  const sessionToken = cookies.la_session;
  const sessionSecret = env.SESSION_SECRET || '';

  if (!sessionToken || !sessionSecret) {
    return new Response(JSON.stringify({ authenticated: false }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const payload = await verifyTokenHMAC(sessionToken, sessionSecret);
  if (!payload || !payload.admin) {
    return new Response(JSON.stringify({ authenticated: false }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return new Response(
    JSON.stringify({
      authenticated: true,
      user: payload.sub,
      exp: payload.exp
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }
  );
}
