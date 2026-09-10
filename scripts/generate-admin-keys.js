/**
 * ============================================================================
 * LINEA ABIERTA (lineaabierta.net.pe)
 * Script local para generación de credenciales PBKDF2, TOTP y Códigos de Recuperación
 * Ejecutar con: node scripts/generate-admin-keys.js [tu_usuario] [tu_contraseña]
 * ============================================================================
 */

import crypto from 'node:crypto';

const user = process.argv[2] || 'admin';
const pass = process.argv[3] || 'CambiarEstaContrasena123!';

const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function bytesToBase32(bytes) {
  let bits = 0, value = 0, output = '';
  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_CHARS[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_CHARS[(value << (5 - bits)) & 31];
  }
  return output;
}

function generateRecoveryCode() {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const getChar = () => chars[crypto.randomInt(0, chars.length)];
  const seg = (l) => Array.from({ length: l }, getChar).join('');
  return `${seg(4)}-${seg(4)}-${seg(4)}`;
}

async function run() {
  console.log('='.repeat(70));
  console.log('🛡️  GENERADOR DE CREDENCIALES Y 2FA - LINEA ABIERTA');
  console.log('='.repeat(70));

  // 1. Salt y Hash PBKDF2
  const saltBytes = crypto.randomBytes(16);
  const saltHex = saltBytes.toString('hex');
  const hashBuffer = crypto.pbkdf2Sync(pass, saltBytes, 100000, 32, 'sha256');
  const hashHex = hashBuffer.toString('hex');

  // 2. Secreto TOTP (Base32)
  const totpBytes = crypto.randomBytes(20);
  const totpSecret = bytesToBase32(totpBytes);

  // 3. Session Secret
  const sessionSecret = crypto.randomBytes(32).toString('hex');

  // 4. Códigos de recuperación
  const codes = [];
  const hashes = [];
  for (let i = 0; i < 8; i++) {
    const code = generateRecoveryCode();
    const clean = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    const hash = crypto.createHash('sha256').update(clean).digest('hex');
    codes.push(code);
    hashes.push(hash);
  }

  console.log('\n📋 VARIABLES DE ENTORNO PARA CLOUDFLARE (.dev.vars o Dashboard):');
  console.log('-'.repeat(70));
  console.log(`ADMIN_USERNAME=${user}`);
  console.log(`ADMIN_PASSWORD_SALT=${saltHex}`);
  console.log(`ADMIN_PASSWORD_HASH=${hashHex}`);
  console.log(`TOTP_SECRET=${totpSecret}`);
  console.log(`SESSION_SECRET=${sessionSecret}`);

  console.log('\n📱 CLAVE TOTP PARA GOOGLE / MICROSOFT AUTHENTICATOR:');
  console.log('-'.repeat(70));
  console.log(`Clave Base32:  ${totpSecret.match(/.{1,4}/g).join(' ')}`);
  console.log(`URI otpauth:   otpauth://totp/Linea%20Abierta:${encodeURIComponent(user)}?secret=${totpSecret}&issuer=Linea%20Abierta&algorithm=SHA1&digits=6&period=30`);

  console.log('\n🔑 CÓDIGOS DE RECUPERACIÓN DE UN SOLO USO:');
  console.log('-'.repeat(70));
  codes.forEach((c, idx) => console.log(`  ${idx + 1}. ${c}`));

  console.log('\n🗄️  SQL PARA INSERTAR CÓDIGOS DE RECUPERACIÓN EN D1:');
  console.log('-'.repeat(70));
  console.log('DELETE FROM admin_recovery_codes;');
  console.log('INSERT INTO admin_recovery_codes (code_hash) VALUES');
  console.log(hashes.map(h => `  ('${h}')`).join(',\n') + ';');
  console.log('='.repeat(70));
}

run();
