-- ============================================================================
-- LINEA ABIERTA (lineaabierta.net.pe)
-- Esquema de Autenticación Segura y Control de Fuerza Bruta por IP para D1
-- ============================================================================

-- 1. Estado Global de TOTP (Anti-Replay atómico con CAS)
CREATE TABLE IF NOT EXISTS admin_auth_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    last_totp_step INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Inicialización de fila única de control para TOTP
INSERT OR IGNORE INTO admin_auth_state (id, last_totp_step)
VALUES (1, 0);

-- 2. Control de Fuerza Bruta por IP del Cliente (Evita DoS al Administrador Legítimo)
CREATE TABLE IF NOT EXISTS admin_ip_rate_limits (
    ip TEXT PRIMARY KEY,
    password_failures INTEGER NOT NULL DEFAULT 0,
    totp_failures INTEGER NOT NULL DEFAULT 0,
    locked_until INTEGER NOT NULL DEFAULT 0,
    last_attempt_at INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_ip_rate_limits_locked ON admin_ip_rate_limits(locked_until);

-- 3. Tabla de Códigos de Recuperación de Un Solo Uso (Hashes SHA-256)
CREATE TABLE IF NOT EXISTS admin_recovery_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code_hash TEXT NOT NULL UNIQUE,
    used_at TEXT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_recovery_codes_hash ON admin_recovery_codes(code_hash);
