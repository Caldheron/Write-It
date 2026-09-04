/**
 * Write-it — Application d'écriture quotidienne
 * Stockage 100% local + PWA
 */

(function () {
  'use strict';

  // ===== CONSTANTES =====
  const STORAGE_KEY = 'writeit_data';
  const GOAL = 100;
  const MAX_WORDS = 2000;
  const NOTIF_HOUR = 18;

  // ===== ÉTAT =====
  let data = {
    currentDate: null,
    currentText: '',
    history: {},       // { "YYYY-MM-DD": { text, words } }
    streak: 0,
    lastNotifDate: null,
    notifEnabled: false
  };

  let currentEditDate = null;
  let saveTimeout = null;

  // ===== HELPERS DATE =====
  function getToday() {
    const d = new Date();
    return formatDate(d);
  }

  function formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function formatDisplayDate(dateStr) {
    const [y, m, d] = dateStr.split('-');
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  }

  function countWords(text) {
    if (!text || !text.trim()) return 0;
    return text.trim().split(/\s+/).filter(Boolean).length;
  }

  // ===== STOCKAGE =====
  function loadData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        data = { ...data, ...parsed };
      }
    } catch (e) {
      console.warn('Erreur chargement données', e);
    }
    ensureCurrentDay();
  }

  function saveData() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('Erreur sauvegarde', e);
    }
  }

  function ensureCurrentDay() {
    const today = getToday();

    // Si on change de jour → archiver l'ancien texte
    if (data.currentDate && data.currentDate !== today) {
      archiveCurrentDay();
    }

    if (data.currentDate !== today) {
      data.currentDate = today;
      data.currentText = '';
      saveData();
    }
  }

  function archiveCurrentDay() {
    if (!data.currentDate) return;

    const words = countWords(data.currentText);
    if (words > 0 || data.currentText.trim()) {
      data.history[data.currentDate] = {
        text: data.currentText,
        words: words
      };
    }

    // Calcul du streak
    updateStreak();
    data.currentText = '';
  }

  function updateStreak() {
    const dates = Object.keys(data.history).sort().reverse();
    let streak = 0;
    let expected = getToday();

    // Si aujourd'hui a déjà 100+ mots, on commence par aujourd'hui
    const todayWords = countWords(data.currentText);
    if (todayWords >= GOAL) {
      streak = 1;
      // On recule d'un jour pour la suite
      const d = new Date();
      d.setDate(d.getDate() - 1);
      expected = formatDate(d);
    } else {
      // On regarde à partir d'hier
      const d = new Date();
      d.setDate(d.getDate() - 1);
      expected = formatDate(d);
    }

    for (const date of dates) {
      if (date === getToday() && todayWords >= GOAL) continue; // déjà compté
      if (date === expected && data.history[date].words >= GOAL) {
        streak++;
        const d = new Date(expected);
        d.setDate(d.getDate() - 1);
        expected = formatDate(d);
      } else if (date < expected) {
        break;
      }
    }

    data.streak = streak;
  }

  // ===== UI HELPERS =====
  function $(id) {
    return document.getElementById(id);
  }

  function showView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const view = $(viewId);
    if (view) view.classList.add('active');
  }

  function updateDashboard() {
    const words = countWords(data.currentText);
    const countEl = $('dashboard-count').querySelector('.count-number');
    const fill = $('progress-fill');
    const status = $('status-text');
    const dateLabel = $('today-date');

    dateLabel.textContent = formatDisplayDate(data.currentDate);
    countEl.textContent = words;

    const percent = Math.min((words / GOAL) * 100, 100);
    fill.style.width = percent + '%';

    if (words >= GOAL) {
      countEl.classList.add('reached');
      fill.classList.add('reached');
      status.textContent = words >= GOAL
        ? (words >= 200 ? 'Excellent ! Belle session ✍️' : 'Objectif atteint ! 🎉')
        : '';
    } else {
      countEl.classList.remove('reached');
      fill.classList.remove('reached');
      status.textContent = words === 0
        ? 'Commence à écrire aujourd\'hui'
        : `Encore ${GOAL - words} mot${GOAL - words > 1 ? 's' : ''} pour atteindre l'objectif`;
    }

    // Streak
    updateStreak();
    $('streak-count').textContent = data.streak;
    $('streak-plural').textContent = data.streak > 1 ? 's' : '';
  }

  function updateWriteCounter() {
    const words = countWords($('editor').value);
    const counter = $('write-counter');
    const live = $('live-count');

    live.textContent = words;

    if (words >= GOAL) {
      counter.classList.add('reached');
    } else {
      counter.classList.remove('reached');
    }

    // Limite soft à 2000
    if (words > MAX_WORDS) {
      // On laisse écrire mais on prévient
      $('max-hint').textContent = `⚠️ Au-delà de ${MAX_WORDS} mots`;
      $('max-hint').style.color = 'var(--danger)';
    } else {
      $('max-hint').textContent = `Maximum ${MAX_WORDS} mots`;
      $('max-hint').style.color = '';
    }
  }

  function showSaveStatus(id) {
    const el = $(id);
    el.classList.add('visible');
    el.textContent = 'Enregistré';
    setTimeout(() => el.classList.remove('visible'), 1500);
  }

  // ===== HISTORIQUE =====
  function renderHistory() {
    const list = $('history-list');
    const dates = Object.keys(data.history).sort().reverse();

    if (dates.length === 0) {
      list.innerHTML = '<p class="history-empty">Aucune note pour le moment.<br>Écris un peu aujourd\'hui !</p>';
      return;
    }

    list.innerHTML = dates.map(date => {
      const entry = data.history[date];
      const reached = entry.words >= GOAL ? 'reached' : '';
      return `
        <div class="history-item" data-date="${date}">
          <span class="history-item-date">${formatDisplayDate(date)}</span>
          <span class="history-item-words ${reached}">${entry.words} mot${entry.words > 1 ? 's' : ''}</span>
        </div>
      `;
    }).join('');

    list.querySelectorAll('.history-item').forEach(item => {
      item.addEventListener('click', () => {
        openEdit(item.dataset.date);
      });
    });
  }

  function openEdit(date) {
    currentEditDate = date;
    const entry = data.history[date];
    $('edit-editor').value = entry.text || '';
    $('edit-date-label').textContent = formatDisplayDate(date);
    updateEditCounter();
    showView('view-edit');
  }

  function updateEditCounter() {
    const words = countWords($('edit-editor').value);
    $('edit-word-count').textContent = `${words} mot${words > 1 ? 's' : ''}`;
  }

  // ===== NOTIFICATIONS =====
  function updateNotifStatus() {
    const status = $('notif-status');
    if (!('Notification' in window)) {
      status.textContent = 'Notifications non supportées sur ce navigateur';
      return;
    }

    if (Notification.permission === 'granted') {
      status.textContent = 'Notifications activées ✓';
      data.notifEnabled = true;
    } else if (Notification.permission === 'denied') {
      status.textContent = 'Permission refusée. Tu peux la réactiver dans les réglages du navigateur.';
    } else {
      status.textContent = 'Clique pour autoriser les notifications';
    }
  }

  async function requestNotificationPermission() {
    if (!('Notification' in window)) {
      alert('Les notifications ne sont pas supportées sur ce navigateur.');
      return;
    }

    const permission = await Notification.requestPermission();
    updateNotifStatus();

    if (permission === 'granted') {
      data.notifEnabled = true;
      saveData();
      // Notification de test
      new Notification('Write-it', {
        body: 'Notifications activées ! Tu recevras un rappel vers 18h.',
        icon: 'icons/icon-192.png'
      });
    }
  }

  function checkAndNotify() {
    if (!data.notifEnabled || Notification.permission !== 'granted') return;

    const now = new Date();
    const today = getToday();

    // Si on a déjà notifié aujourd'hui, on sort
    if (data.lastNotifDate === today) return;

    // Si l'heure est >= 18h et que l'objectif n'est pas atteint
    if (now.getHours() >= NOTIF_HOUR) {
      const words = countWords(data.currentText);
      if (words < GOAL) {
        new Notification('Write-it', {
          body: 'C\'est l\'heure d\'écrire tes 100 mots ✍️',
          icon: 'icons/icon-192.png',
          tag: 'writeit-daily'
        });
        data.lastNotifDate = today;
        saveData();
      }
    }
  }

  // ===== EXPORT / RESET =====
  function exportData() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `writeit-backup-${getToday()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function resetApp() {
    if (confirm('Êtes-vous sûr de vouloir tout effacer ? Cette action est irréversible.')) {
      localStorage.removeItem(STORAGE_KEY);
      location.reload();
    }
  }

  // ===== EVENTS =====
  function bindEvents() {
    // Navigation
    $('btn-write').addEventListener('click', () => {
      $('editor').value = data.currentText;
      updateWriteCounter();
      showView('view-write');
      $('editor').focus();
    });

    $('btn-back-write').addEventListener('click', () => {
      data.currentText = $('editor').value;
      saveData();
      updateDashboard();
      showView('view-dashboard');
    });

    $('btn-history').addEventListener('click', () => {
      renderHistory();
      showView('view-history');
    });

    $('btn-back-history').addEventListener('click', () => {
      updateDashboard();
      showView('view-dashboard');
    });

    $('btn-back-edit').addEventListener('click', () => {
      showView('view-history');
    });

    $('btn-settings').addEventListener('click', () => {
      updateNotifStatus();
      showView('view-settings');
    });

    $('btn-back-settings').addEventListener('click', () => {
      showView('view-dashboard');
    });

    // Éditeur du jour
    $('editor').addEventListener('input', () => {
      updateWriteCounter();
      data.currentText = $('editor').value;

      clearTimeout(saveTimeout);
      saveTimeout = setTimeout(() => {
        saveData();
        showSaveStatus('save-status');
      }, 400);
    });

    $('btn-save-write').addEventListener('click', () => {
      data.currentText = $('editor').value;
      saveData();
      showSaveStatus('save-status');
      updateDashboard();
    });

    // Édition historique
    $('edit-editor').addEventListener('input', () => {
      updateEditCounter();
      clearTimeout(saveTimeout);
      saveTimeout = setTimeout(() => {
        if (currentEditDate) {
          const text = $('edit-editor').value;
          data.history[currentEditDate] = {
            text,
            words: countWords(text)
          };
          saveData();
          showSaveStatus('edit-save-status');
        }
      }, 400);
    });

    $('btn-save-edit').addEventListener('click', () => {
      if (currentEditDate) {
        const text = $('edit-editor').value;
        data.history[currentEditDate] = {
          text,
          words: countWords(text)
        };
        saveData();
        showSaveStatus('edit-save-status');
        renderHistory();
      }
    });

    // Settings
    $('btn-enable-notif').addEventListener('click', requestNotificationPermission);
    $('btn-export').addEventListener('click', exportData);
    $('btn-reset').addEventListener('click', resetApp);

    // Vérifier le changement de jour périodiquement
    setInterval(() => {
      const previousDate = data.currentDate;
      ensureCurrentDay();
      if (data.currentDate !== previousDate) {
        updateDashboard();
        if ($('view-write').classList.contains('active')) {
          $('editor').value = '';
          updateWriteCounter();
        }
      }
      checkAndNotify();
    }, 30000); // toutes les 30s
  }

  // ===== SERVICE WORKER =====
  function registerSW() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js')
        .then(() => console.log('Service Worker enregistré'))
        .catch(err => console.warn('SW erreur', err));
    }
  }

  // ===== INIT =====
  function init() {
    loadData();
    bindEvents();
    updateDashboard();
    registerSW();
    checkAndNotify();

    // Gestion du retour arrière du navigateur (optionnel)
    window.addEventListener('focus', () => {
      ensureCurrentDay();
      updateDashboard();
      checkAndNotify();
    });
  }

  // Lancer
  document.addEventListener('DOMContentLoaded', init);
})();
