/**
 * ============================================================================
 * LINEA ABIERTA (lineaabierta.net.pe)
 * Endpoint: POST /api/auth/login (Paso 1: Usuario + Contraseña PBKDF2)
 * ============================================================================
 */

import { verifyPasswordPBKDF2, signTokenHMAC, timingSafeEqual } from '../../_utils/crypto.js';
import { validateOrigin, getClientIp, checkBruteForceLock, recordPasswordFailure } from '../../_utils/security.js';
import { createCookie } from '../../_utils/cookies.js';

// Sal y Hash ficticios constantes para neutralizar ataques de temporización (User Enumeration)
const DUMMY_SALT = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const DUMMY_HASH = '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8';

export async function onRequestPost(context) {
  const { request, env } = context;

  // 1. Verificación de Origen (Anti-CSRF)
  if (!validateOrigin(request)) {
    return new Response(JSON.stringify({ error: 'Origen de petición no permitido.' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const db = env.DB;
  if (!db) {
    return new Response(JSON.stringify({ error: 'Configuración de base de datos no disponible.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // 2. Control de Fuerza Bruta aislado por IP del cliente
  const clientIp = getClientIp(request);
  const lockStatus = await checkBruteForceLock(db, clientIp);

  if (lockStatus.locked) {
    const minutes = Math.ceil(lockStatus.remainingSeconds / 60);
    return new Response(
      JSON.stringify({
        error: `Demasiados intentos fallidos desde tu dirección IP. Acceso bloqueado temporalmente por ${minutes} minuto(s).`,
        locked: true,
        remainingSeconds: lockStatus.remainingSeconds
      }),
      {
        status: 429,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }

  // 3. Lectura de credenciales enviadas
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Cuerpo de solicitud inválido.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const { username, password } = body;
  if (!username || !password) {
    return new Response(JSON.stringify({ error: 'Debe ingresar usuario y contraseña.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // 4. Verificación de Entorno de Servidor
  const expectedUser = env.ADMIN_USERNAME || '';
  const salt = env.ADMIN_PASSWORD_SALT || '';
  const hash = env.ADMIN_PASSWORD_HASH || '';
  const sessionSecret = env.SESSION_SECRET || '';

  if (!expectedUser || !salt || !hash || !sessionSecret || sessionSecret.length < 16) {
    return new Response(
      JSON.stringify({ error: 'Credenciales del sistema no configuradas correctamente en el entorno.' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }

  // 5. Comparación y Mitigación de Timing Attack (Ejecución PBKDF2 incondicional)
  const isUserValid = timingSafeEqual(username.trim(), expectedUser.trim());

  // Si el usuario no coincide, se ejecuta PBKDF2 contra la sal/hash ficticios.
  // Esto garantiza que la respuesta tome exactamente el mismo tiempo (~80-150ms).
  const effectiveSalt = isUserValid ? salt : DUMMY_SALT;
  const effectiveHash = isUserValid ? hash : DUMMY_HASH;
  const isPasswordValid = await verifyPasswordPBKDF2(password, effectiveSalt, effectiveHash);

  // Ambas condiciones deben ser ciertas
  if (!isUserValid || !isPasswordValid) {
    const failureResult = await recordPasswordFailure(db, clientIp, lockStatus);
    const msg = failureResult.isLocked
      ? 'Demasiados intentos fallidos. Tu IP ha sido bloqueada temporalmente por 15 minutos.'
      : `Credenciales incorrectas. Intentos restantes antes del bloqueo: ${failureResult.remainingAttempts}.`;

    return new Response(
      JSON.stringify({
        error: msg,
        remainingAttempts: failureResult.remainingAttempts
      }),
      {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }

  // 6. Generación de Token de Pre-autorización Temporal (5 minutos)
  const preauthPayload = {
    sub: expectedUser,
    preauth: true,
    exp: Date.now() + 5 * 60 * 1000 // 5 minutos
  };

  const preauthToken = await signTokenHMAC(preauthPayload, sessionSecret);
  const cookieHeader = createCookie('la_preauth', preauthToken, {
    maxAge: 300,
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'Strict'
  });

  return new Response(
    JSON.stringify({
      success: true,
      requires2FA: true,
      message: 'Credenciales validadas. Ingrese su código de autenticación de dos factores (2FA).'
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': cookieHeader
      }
    }
  );
}
