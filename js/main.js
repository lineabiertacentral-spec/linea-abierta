/**
 * ==========================================================================
 * LINEA ABIERTA (lineaabierta.net.pe)
 * Archivo: js/main.js - Interactividad frontend pura (Vanilla JS)
 * ==========================================================================
 */

document.addEventListener('DOMContentLoaded', () => {
  initLivePeruClock();
  initMobileNavigation();
  initSearchModal();
  initThemeToggle();
});

/**
 * 1. Reloj en Vivo (Hora Oficial de Lima, Perú)
 */
function initLivePeruClock() {
  const clockElement = document.getElementById('live-peru-time');
  if (!clockElement) return;

  const updateTime = () => {
    const now = new Date();
    
    // Formateador localizado para Perú
    const options = {
      timeZone: 'America/Lima',
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    };

    try {
      const formatter = new Intl.DateTimeFormat('es-PE', options);
      const parts = formatter.formatToParts(now);
      
      const weekday = parts.find(p => p.type === 'weekday')?.value || '';
      const day = parts.find(p => p.type === 'day')?.value || '';
      const month = parts.find(p => p.type === 'month')?.value || '';
      const year = parts.find(p => p.type === 'year')?.value || '';
      const hour = parts.find(p => p.type === 'hour')?.value || '';
      const minute = parts.find(p => p.type === 'minute')?.value || '';
      const dayPeriod = parts.find(p => p.type === 'dayPeriod')?.value || '';

      const capitalizedWeekday = weekday.charAt(0).toUpperCase() + weekday.slice(1);
      clockElement.textContent = `${capitalizedWeekday}, ${day} de ${month} de ${year} | ${hour}:${minute} ${dayPeriod.toUpperCase()} (Lima)`;
    } catch (e) {
      clockElement.textContent = now.toLocaleDateString('es-PE') + ' (Lima)';
    }
  };

  updateTime();
  setInterval(updateTime, 1000);
}

/**
 * 2. Menú de Navegación Lateral Móvil (Drawer)
 */
function initMobileNavigation() {
  const toggleBtn = document.getElementById('mobile-menu-btn');
  const drawer = document.getElementById('mobile-drawer');
  const overlay = document.getElementById('drawer-overlay');
  const closeBtn = document.getElementById('drawer-close-btn');

  if (!toggleBtn || !drawer || !overlay) return;

  const openDrawer = () => {
    drawer.classList.add('active');
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  };

  const closeDrawer = () => {
    drawer.classList.remove('active');
    overlay.classList.remove('active');
    document.body.style.overflow = '';
  };

  toggleBtn.addEventListener('click', openDrawer);
  if (closeBtn) closeBtn.addEventListener('click', closeDrawer);
  overlay.addEventListener('click', closeDrawer);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer.classList.contains('active')) {
      closeDrawer();
    }
  });
}

/**
 * 3. Modal de Búsqueda Rápida
 */
function initSearchModal() {
  const triggerBtns = document.querySelectorAll('.search-trigger-btn');
  const modalOverlay = document.getElementById('search-modal');
  const closeBtn = document.getElementById('search-modal-close');
  const searchInput = document.getElementById('search-input');

  if (!modalOverlay) return;

  const openModal = () => {
    modalOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
    if (searchInput) {
      setTimeout(() => searchInput.focus(), 150);
    }
  };

  const closeModal = () => {
    modalOverlay.classList.remove('active');
    document.body.style.overflow = '';
  };

  triggerBtns.forEach(btn => btn.addEventListener('click', openModal));
  if (closeBtn) closeBtn.addEventListener('click', closeModal);

  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) {
      closeModal();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalOverlay.classList.contains('active')) {
      closeModal();
    }
  });
}

/**
 * 4. Selector de Modo Oscuro / Claro
 */
function initThemeToggle() {
  const themeBtns = document.querySelectorAll('.theme-toggle-btn');
  let currentTheme = 'light';
  try {
    currentTheme = localStorage.getItem('linea_theme') || 'light';
  } catch (e) {
    currentTheme = 'light';
  }

  document.documentElement.setAttribute('data-theme', currentTheme);
  updateThemeButtonLabels(currentTheme);

  themeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const activeTheme = document.documentElement.getAttribute('data-theme');
      const newTheme = activeTheme === 'dark' ? 'light' : 'dark';

      document.documentElement.setAttribute('data-theme', newTheme);
      try {
        localStorage.setItem('linea_theme', newTheme);
      } catch (e) {}
      updateThemeButtonLabels(newTheme);
    });
  });

  function updateThemeButtonLabels(theme) {
    themeBtns.forEach(btn => {
      const textSpan = btn.querySelector('.theme-label');
      if (textSpan) {
        textSpan.textContent = theme === 'dark' ? 'Modo Día' : 'Modo Noche';
      }
    });
  }
}
