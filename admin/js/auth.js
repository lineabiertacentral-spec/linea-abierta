/**
 * ============================================================================
 * LINEA ABIERTA (lineaabierta.net.pe)
 * Lógica de Autenticación en 2 Pasos con 2FA (admin/js/auth.js)
 * ============================================================================
 */

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Verificar si ya existe una sesión activa
  try {
    const res = await fetch('/api/auth/me');
    const data = await res.json();
    if (data.authenticated) {
      window.location.href = '/admin/index.html';
      return;
    }
  } catch (err) {
    console.warn('Verificación inicial de sesión omitida:', err);
  }

  // 2. Elementos del DOM
  const step1Form = document.getElementById('form-step-1');
  const step2Form = document.getElementById('form-step-2');
  const step1Box = document.getElementById('step-1-box');
  const step2Box = document.getElementById('step-2-box');
  const dot1 = document.getElementById('dot-1');
  const dot2 = document.getElementById('dot-2');
  const alertError = document.getElementById('alert-error');
  const alertSuccess = document.getElementById('alert-success');
  const toggleRecoveryBtn = document.getElementById('btn-toggle-recovery');
  const totpInputGroup = document.getElementById('totp-input-group');
  const recoveryInputGroup = document.getElementById('recovery-input-group');

  let isRecoveryMode = false;

  function showError(msg) {
    alertError.innerText = msg;
    alertError.style.display = 'block';
    alertSuccess.style.display = 'none';
  }

  function showSuccess(msg) {
    alertSuccess.innerText = msg;
    alertSuccess.style.display = 'block';
    alertError.style.display = 'none';
  }

  function clearAlerts() {
    alertError.style.display = 'none';
    alertSuccess.style.display = 'none';
  }

  // 3. Manejo de Paso 1: Usuario + Contraseña
  step1Form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAlerts();

    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    const submitBtn = document.getElementById('btn-step-1');

    if (!username || !password) {
      showError('Por favor complete todos los campos.');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerText = 'Verificando...';

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await res.json();

      if (!res.ok) {
        showError(data.error || 'Error de autenticación.');
        return;
      }

      if (data.requires2FA) {
        // Transición fluida a Paso 2
        step1Box.style.display = 'none';
        step2Box.style.display = 'block';
        dot1.classList.remove('active');
        dot2.classList.add('active');
        showSuccess(data.message || 'Credenciales correctas. Ingrese el código 2FA.');
        document.getElementById('login-totp').focus();
      }
    } catch (err) {
      showError('Error de red o conexión al servidor.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerText = 'Continuar con 2FA →';
    }
  });

  // 4. Alternar entre TOTP y Código de Recuperación
  if (toggleRecoveryBtn) {
    toggleRecoveryBtn.addEventListener('click', () => {
      isRecoveryMode = !isRecoveryMode;
      clearAlerts();

      if (isRecoveryMode) {
        totpInputGroup.style.display = 'none';
        recoveryInputGroup.style.display = 'block';
        toggleRecoveryBtn.innerText = '← Volver a código Authenticator (6 dígitos)';
        document.getElementById('login-recovery').focus();
      } else {
        totpInputGroup.style.display = 'block';
        recoveryInputGroup.style.display = 'none';
        toggleRecoveryBtn.innerText = '¿No tienes acceso a tu app? Usar código de recuperación';
        document.getElementById('login-totp').focus();
      }
    });
  }

  // 5. Manejo de Paso 2: Validación de 2FA o Recuperación
  step2Form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAlerts();

    const submitBtn = document.getElementById('btn-step-2');
    const totpVal = document.getElementById('login-totp').value.trim();
    const recoveryVal = document.getElementById('login-recovery').value.trim();

    const code = isRecoveryMode ? recoveryVal : totpVal;

    if (!code) {
      showError(isRecoveryMode ? 'Ingrese su código de recuperación.' : 'Ingrese el código de 6 dígitos.');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerText = 'Comprobando 2FA...';

    try {
      const res = await fetch('/api/auth/verify-2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          isRecoveryCode: isRecoveryMode
        })
      });

      const data = await res.json();

      if (!res.ok) {
        showError(data.error || 'Código de verificación incorrecto.');
        return;
      }

      showSuccess('Autenticación completada. Redirigiendo al panel...');
      setTimeout(() => {
        window.location.href = '/admin/index.html';
      }, 800);
    } catch (err) {
      showError('Error de comunicación con el servidor.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerText = 'Acceder al Panel';
    }
  });
});
