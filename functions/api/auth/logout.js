/**
 * ============================================================================
 * LINEA ABIERTA (lineaabierta.net.pe)
 * Endpoint: POST /api/auth/logout (Cierre seguro de sesión)
 * ============================================================================
 */

import { validateOrigin } from '../../_utils/security.js';
import { clearCookie } from '../../_utils/cookies.js';

export async function onRequestPost(context) {
  const { request } = context;

  if (!validateOrigin(request)) {
    return new Response(JSON.stringify({ error: 'Origen no permitido.' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const headers = new Headers();
  headers.set('Content-Type', 'application/json');
  headers.append('Set-Cookie', clearCookie('la_session'));
  headers.append('Set-Cookie', clearCookie('la_preauth'));

  return new Response(
    JSON.stringify({ success: true, message: 'Sesión cerrada correctamente.' }),
    {
      status: 200,
      headers
    }
  );
}
