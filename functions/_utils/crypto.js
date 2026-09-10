/**
 * ============================================================================
 * LINEA ABIERTA (lineaabierta.net.pe)
 * Módulo Criptográfico Seguro basado en Web Crypto API (Cloudflare Edge)
 * ============================================================================
 */

// Utilidades de conversión Hex / Bytes
export function hexToBytes(hex) {
  if (typeof hex !== 'string') return new Uint8Array(0);
  const cleanHex = hex.replace(/[^0-9a-fA-F]/g, '');
  const bytes = new Uint8Array(Math.floor(cleanHex.length / 2));
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleanHex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export function bytesToHex(bytes) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
}

// Utilidades Base32 (RFC 4648) para TOTP con enmascaramiento estricto de bits
const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32ToBytes(base32) {
  if (!base32 || typeof base32 !== 'string') return new Uint8Array(0);
  const clean = base32.toUpperCase().replace(/=+$/, '').replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const output = [];

  for (let i = 0; i < clean.length; i++) {
    const idx = BASE32_CHARS.indexOf(clean[i]);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
      value &= (1 << bits) - 1; // Enmascarar bits consumidos para evitar corrupción acumulada
    }
  }
  return new Uint8Array(output);
}

export function bytesToBase32(bytes) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < arr.length; i++) {
    value = (value << 8) | arr[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_CHARS[(value >>> (bits - 5)) & 31];
      bits -= 5;
      value &= (1 << bits) - 1; // Enmascarar bits consumidos
    }
  }
  if (bits > 0) {
    output += BASE32_CHARS[(value << (5 - bits)) & 31];
  }
  return output;
}

// Base64URL encoding para tokens HMAC
export function base64UrlEncode(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function base64UrlDecode(str) {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// Comparación en tiempo constante para mitigar ataques de temporización
export function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  if (aBytes.byteLength !== bBytes.byteLength) return false;
  let diff = 0;
  for (let i = 0; i < aBytes.byteLength; i++) {
    diff |= aBytes[i] ^ bBytes[i];
  }
  return diff === 0;
}

/**
 * 1. Derivación de contraseña con PBKDF2 (HMAC-SHA-256)
 */
export async function hashPasswordPBKDF2(password, saltHex, iterations = 100000) {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(password || ''),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const saltBytes = hexToBytes(saltHex);
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations: iterations,
      hash: 'SHA-256'
    },
    baseKey,
    256 // 32 bytes = 256 bits
  );

  return bytesToHex(derivedBits);
}

export async function verifyPasswordPBKDF2(password, saltHex, expectedHashHex, iterations = 100000) {
  if (!password || !saltHex || !expectedHashHex) return false;
  const computedHash = await hashPasswordPBKDF2(password, saltHex, iterations);
  return timingSafeEqual(computedHash.toLowerCase(), expectedHashHex.toLowerCase());
}

/**
 * 2. Algoritmo TOTP (RFC 6238 / RFC 4226) compatible con Google/MS Authenticator
 */
export async function generateTOTP(secretBase32, timeStep) {
  const keyBytes = base32ToBytes(secretBase32);
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );

  // Buffer de 8 bytes en formato big-endian para el contador de tiempo
  const counterBuffer = new ArrayBuffer(8);
  const view = new DataView(counterBuffer);
  view.setBigUint64(0, BigInt(timeStep), false);

  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, counterBuffer));

  // Truncamiento dinámico (RFC 4226)
  const offset = signature[signature.length - 1] & 0x0f;
  const binary =
    ((signature[offset] & 0x7f) << 24) |
    ((signature[offset + 1] & 0xff) << 16) |
    ((signature[offset + 2] & 0xff) << 8) |
    (signature[offset + 3] & 0xff);

  const otp = binary % 1000000;
  return otp.toString().padStart(6, '0');
}

export async function verifyTOTP(secretBase32, token, window = 1) {
  if (!secretBase32 || !token) return { valid: false };
  const cleanToken = String(token).trim();
  if (cleanToken.length !== 6 || !/^\d{6}$/.test(cleanToken)) {
    return { valid: false };
  }

  const currentStep = Math.floor(Date.now() / 1000 / 30);

  // Verificación en ventana de tolerancia (actual, -30s, +30s)
  for (let step = currentStep - window; step <= currentStep + window; step++) {
    const candidate = await generateTOTP(secretBase32, step);
    if (timingSafeEqual(candidate, cleanToken)) {
      return { valid: true, step };
    }
  }

  return { valid: false };
}

/**
 * 3. Hash de Códigos de Recuperación (Normalizado a SHA-256)
 */
export async function hashRecoveryCode(rawCode) {
  if (!rawCode || typeof rawCode !== 'string') return '';
  const normalized = rawCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const data = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return bytesToHex(digest);
}

/**
 * 4. Firma y Verificación de Tokens HMAC-SHA-256 para Sesiones
 */
export async function signTokenHMAC(payload, secretKey) {
  if (!secretKey || secretKey.length < 16) {
    throw new Error('SESSION_SECRET debe tener al menos 16 caracteres.');
  }

  const enc = new TextEncoder();
  const payloadStr = JSON.stringify(payload);
  const encodedPayload = base64UrlEncode(enc.encode(payloadStr));

  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secretKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signatureBytes = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, enc.encode(encodedPayload))
  );
  const encodedSignature = base64UrlEncode(signatureBytes);

  return `${encodedPayload}.${encodedSignature}`;
}

export async function verifyTokenHMAC(token, secretKey) {
  if (!token || typeof token !== 'string' || !secretKey || secretKey.length < 16) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [encodedPayload, encodedSignature] = parts;
  const enc = new TextEncoder();

  try {
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(secretKey),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const signatureBytes = base64UrlDecode(encodedSignature);
    const isValid = await crypto.subtle.verify(
      'HMAC',
      key,
      signatureBytes,
      enc.encode(encodedPayload)
    );

    if (!isValid) return null;

    const payloadJson = new TextDecoder().decode(base64UrlDecode(encodedPayload));
    const payload = JSON.parse(payloadJson);

    // Verificación de expiración
    if (payload.exp && Date.now() > payload.exp) {
      return null;
    }

    return payload;
  } catch (err) {
    return null;
  }
}
