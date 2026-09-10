/**
 * ============================================================================
 * LINEA ABIERTA (lineaabierta.net.pe)
 * Endpoint: POST /api/auth/verify-2fa (Paso 2: Validación TOTP / Recuperación)
 * ============================================================================
 */

import { verifyTOTP, verifyTokenHMAC, signTokenHMAC } from '../../_utils/crypto.js';
import {
  validateOrigin,
  getClientIp,
  checkBruteForceLock,
  recordTotpFailure,
  resetAuthFailures,
  checkAndConsumeTotpStep,
  verifyAndConsumeRecoveryCode
} from '../../_utils/security.js';
import { parseCookies, createCookie, clearCookie } from '../../_utils/cookies.js';

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
    return new Response(JSON.stringify({ error: 'Base de datos no disponible.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // 2. Control de Fuerza Bruta aislado por IP
  const clientIp = getClientIp(request);
  const lockStatus = await checkBruteForceLock(db, clientIp);

  if (lockStatus.locked) {
    const minutes = Math.ceil(lockStatus.remainingSeconds / 60);
    return new Response(
      JSON.stringify({
        error: `Acceso bloqueado temporalmente por intentos fallidos desde tu IP. Intenta nuevamente en ${minutes} minuto(s).`,
        locked: true,
        remainingSeconds: lockStatus.remainingSeconds
      }),
      {
        status: 429,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }

  // 3. Verificación de Cookie de Pre-autorización
  const cookies = parseCookies(request);
  const preauthToken = cookies.la_preauth;
  const sessionSecret = env.SESSION_SECRET || '';

  if (!preauthToken || !sessionSecret || sessionSecret.length < 16) {
    return new Response(
      JSON.stringify({ error: 'La sesión de pre-autorización no existe o ha expirado. Inicia sesión nuevamente.' }),
      {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }

  const preauthPayload = await verifyTokenHMAC(preauthToken, sessionSecret);
  if (!preauthPayload || !preauthPayload.preauth) {
    return new Response(
      JSON.stringify({ error: 'Sesión temporal inválida o caducada. Inicia sesión nuevamente.' }),
      {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          'Set-Cookie': clearCookie('la_preauth')
        }
      }
    );
  }

  // 4. Lectura del código enviado
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Cuerpo de solicitud inválido.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const { code, isRecoveryCode } = body;
  if (!code) {
    return new Response(JSON.stringify({ error: 'Debe ingresar el código de verificación o recuperación.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (isRecoveryCode) {
    // 5A. Validación y Consumo Atómico de Código de Recuperación (Sin TOCTOU)
    const isConsumed = await verifyAndConsumeRecoveryCode(db, code);
    if (!isConsumed) {
      const failureResult = await recordTotpFailure(db, clientIp, lockStatus);
      return new Response(
        JSON.stringify({
          error: failureResult.isLocked
            ? 'Demasiados intentos fallidos. Tu IP ha sido bloqueada por 15 minutos.'
            : `Código de recuperación inválido o ya utilizado. Intentos restantes: ${failureResult.remainingAttempts}.`
        }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
  } else {
    // 5B. Validación de Código TOTP (Google/MS Authenticator)
    const totpSecret = env.TOTP_SECRET || '';
    if (!totpSecret) {
      return new Response(JSON.stringify({ error: 'Configuración 2FA no establecida en el servidor.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const totpResult = await verifyTOTP(totpSecret, code, 1);
    if (!totpResult.valid) {
      const failureResult = await recordTotpFailure(db, clientIp, lockStatus);
      return new Response(
        JSON.stringify({
          error: failureResult.isLocked
            ? 'Demasiados intentos fallidos. Tu IP ha sido bloqueada por 15 minutos.'
            : `Código 2FA incorrecto o desincronizado. Intentos restantes: ${failureResult.remainingAttempts}.`
        }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // 6. Prevención Atómica de Reutilización (Anti-Replay CAS en D1)
    const stepConsumed = await checkAndConsumeTotpStep(db, totpResult.step);
    if (!stepConsumed) {
      return new Response(
        JSON.stringify({
          error: 'Este código ya ha sido utilizado recientemente. Por favor espera al siguiente código en tu app (hasta 30 segundos).'
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
  }

  // 7. Autenticación exitosa: Reiniciar fallos de la IP y emitir Cookie de Sesión Oficial
  await resetAuthFailures(db, clientIp);

  const sessionPayload = {
    sub: preauthPayload.sub,
    admin: true,
    exp: Date.now() + 24 * 60 * 60 * 1000 // 24 horas
  };

  const sessionToken = await signTokenHMAC(sessionPayload, sessionSecret);
  const sessionCookie = createCookie('la_session', sessionToken, {
    maxAge: 86400,
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'Strict'
  });

  const clearPreauth = clearCookie('la_preauth');

  const headers = new Headers();
  headers.set('Content-Type', 'application/json');
  headers.append('Set-Cookie', sessionCookie);
  headers.append('Set-Cookie', clearPreauth);

  return new Response(
    JSON.stringify({
      success: true,
      message: 'Autenticación en dos factores completada con éxito.'
    }),
    {
      status: 200,
      headers
    }
  );
}
