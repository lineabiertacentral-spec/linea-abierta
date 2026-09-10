/**
 * ============================================================================
 * LINEA ABIERTA (lineaabierta.net.pe)
 * Módulo de Seguridad: Fuerza Bruta por IP, Anti-CSRF y Anti-Replay Atómico D1
 * ============================================================================
 */

import { hashRecoveryCode } from './crypto.js';

/**
 * 1. Obtención de IP del Cliente (Cloudflare Edge)
 */
export function getClientIp(request) {
  const cfIp = request.headers.get('CF-Connecting-IP');
  if (cfIp) return cfIp.trim();

  const xff = request.headers.get('X-Forwarded-For');
  if (xff) {
    const firstIp = xff.split(',')[0].trim();
    if (firstIp) return firstIp;
  }

  return '127.0.0.1';
}

/**
 * 2. Validación de Origen (Anti-CSRF & Origin Matching)
 */
export function validateOrigin(request) {
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (safeMethods.includes(request.method.toUpperCase())) {
    return true;
  }

  const reqUrl = new URL(request.url);
  const expectedOrigin = reqUrl.origin;

  const originHeader = request.headers.get('Origin');
  if (originHeader) {
    return originHeader === expectedOrigin;
  }

  const refererHeader = request.headers.get('Referer');
  if (refererHeader) {
    try {
      const refererUrl = new URL(refererHeader);
      return refererUrl.origin === expectedOrigin;
    } catch {
      return false;
    }
  }

  return false;
}

/**
 * 3. Control de Fuerza Bruta Aislado por IP (Evita DoS al Administrador Legítimo)
 */
export async function getIpRateLimitState(db, ip) {
  try {
    const row = await db.prepare('SELECT * FROM admin_ip_rate_limits WHERE ip = ?').bind(ip).first();
    return row || null;
  } catch (err) {
    console.error('Error al consultar rate limits en D1:', err);
    return null;
  }
}

export async function checkBruteForceLock(db, ip) {
  const state = await getIpRateLimitState(db, ip);
  if (!state) {
    return { locked: false, state: null, expiredLock: false };
  }

  const now = Date.now();
  if (state.locked_until && state.locked_until > now) {
    const remainingSeconds = Math.ceil((state.locked_until - now) / 1000);
    return {
      locked: true,
      remainingSeconds,
      state,
      expiredLock: false
    };
  }

  // Si el bloqueo expiró anteriormente, marcar como expiredLock para reiniciar contador
  const expiredLock = Boolean(state.locked_until && now >= state.locked_until);
  return { locked: false, state, expiredLock };
}

export async function recordPasswordFailure(db, ip, lockStatus) {
  const now = Date.now();
  const state = lockStatus?.state;
  let currentFailures = 1;

  // Si el bloqueo anterior ya expiró, o no había fallos, reinicia a 1.
  // Solo incrementa si los fallos ocurren dentro de la ventana de intentos activa.
  if (state && !lockStatus.expiredLock) {
    currentFailures = (state.password_failures || 0) + 1;
  }

  let lockedUntil = 0;
  // Bloqueo de 15 minutos al alcanzar 5 intentos fallidos
  if (currentFailures >= 5) {
    lockedUntil = now + 15 * 60 * 1000;
  }

  try {
    await db.prepare(`
      INSERT INTO admin_ip_rate_limits (ip, password_failures, totp_failures, locked_until, last_attempt_at)
      VALUES (?, ?, 0, ?, ?)
      ON CONFLICT(ip) DO UPDATE SET
        password_failures = excluded.password_failures,
        locked_until = excluded.locked_until,
        last_attempt_at = excluded.last_attempt_at
    `).bind(ip, currentFailures, lockedUntil, now).run();
  } catch (err) {
    console.error('Error al registrar fallo de contraseña por IP:', err);
  }

  return {
    failures: currentFailures,
    isLocked: lockedUntil > 0,
    remainingAttempts: Math.max(0, 5 - currentFailures)
  };
}

export async function recordTotpFailure(db, ip, lockStatus) {
  const now = Date.now();
  const state = lockStatus?.state;
  let currentFailures = 1;

  if (state && !lockStatus.expiredLock) {
    currentFailures = (state.totp_failures || 0) + 1;
  }

  let lockedUntil = 0;
  // Bloqueo de 15 minutos al alcanzar 3 intentos fallidos de 2FA
  if (currentFailures >= 3) {
    lockedUntil = now + 15 * 60 * 1000;
  }

  try {
    await db.prepare(`
      INSERT INTO admin_ip_rate_limits (ip, password_failures, totp_failures, locked_until, last_attempt_at)
      VALUES (?, 0, ?, ?, ?)
      ON CONFLICT(ip) DO UPDATE SET
        totp_failures = excluded.totp_failures,
        locked_until = excluded.locked_until,
        last_attempt_at = excluded.last_attempt_at
    `).bind(ip, currentFailures, lockedUntil, now).run();
  } catch (err) {
    console.error('Error al registrar fallo de 2FA por IP:', err);
  }

  return {
    failures: currentFailures,
    isLocked: lockedUntil > 0,
    remainingAttempts: Math.max(0, 3 - currentFailures)
  };
}

export async function resetAuthFailures(db, ip) {
  try {
    await db.prepare('DELETE FROM admin_ip_rate_limits WHERE ip = ?').bind(ip).run();
  } catch (err) {
    console.error('Error al resetear intentos de IP:', err);
  }
}

/**
 * 4. Prevención de Reutilización de TOTP Atómica (Anti-Replay sin TOCTOU)
 */
export async function checkAndConsumeTotpStep(db, step) {
  try {
    // Asegurar que la fila de control exista
    await db.prepare('INSERT OR IGNORE INTO admin_auth_state (id, last_totp_step) VALUES (1, 0)').run();

    // Actualización atómica Compare-And-Swap (CAS):
    // Solo actualiza si el paso de tiempo recibido es estrictamente mayor al registrado.
    const result = await db.prepare(`
      UPDATE admin_auth_state 
      SET last_totp_step = ?,
          updated_at = datetime('now')
      WHERE id = 1 AND ? > last_totp_step
    `).bind(step, step).run();

    const changes = result.meta?.changes ?? result.changes ?? 0;
    return changes > 0;
  } catch (err) {
    console.error('Error en consumo atómico de TOTP:', err);
    return false;
  }
}

/**
 * 5. Verificación y Consumo Atómico de Códigos de Recuperación (Sin TOCTOU)
 */
export async function verifyAndConsumeRecoveryCode(db, rawCode) {
  const codeHash = await hashRecoveryCode(rawCode);
  if (!codeHash) return false;

  try {
    // Actualización atómica en una sola consulta SQL:
    // Solo marca como consumido si coincide el hash Y used_at sigue siendo NULL.
    const result = await db.prepare(`
      UPDATE admin_recovery_codes 
      SET used_at = datetime('now') 
      WHERE code_hash = ? AND used_at IS NULL
    `).bind(codeHash).run();

    const changes = result.meta?.changes ?? result.changes ?? 0;
    return changes > 0;
  } catch (err) {
    console.error('Error en consumo atómico de código de recuperación:', err);
    return false;
  }
}
