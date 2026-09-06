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
    history: {},          // { "YYYY-MM-DD": { text, words } }
    order: [],            // ordre personnalisé des dates pour la vue Édition
    streak: 0,
    lastNotifDate: null,
    notifEnabled: false
  };

  let currentEditDate = null;
  let saveTimeout = null;
  let dragState = null;   // pour le drag & drop

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

  function getPreview(text, max = 50) {
    if (!text) return '(Note vide)';
    const clean = text.replace(/\s+/g, ' ').trim();
    if (clean.length <= max) return clean;
    return clean.slice(0, max).trim() + '…';
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

    // S'assurer que order existe et contient toutes les dates
    if (!Array.isArray(data.order)) data.order = [];
    syncOrder();
    ensureCurrentDay();
  }

  function saveData() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('Erreur sauvegarde', e);
    }
  }

  function syncOrder() {
    // Ajoute les nouvelles dates en tête, garde l'ordre existant pour les autres
    const existing = new Set(data.order);
    const allDates = Object.keys(data.history);

    // Nouvelles dates (pas encore dans order) → en haut
    const newDates = allDates.filter(d => !existing.has(d)).sort().reverse();
    // Dates encore valides dans l'ancien order
    const kept = data.order.filter(d => data.history[d]);

    data.order = [...newDates, ...kept];
  }

  function ensureCurrentDay() {
    const today = getToday();

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
      syncOrder();
    }

    updateStreak();
    data.currentText = '';
  }

  function updateStreak() {
    const dates = Object.keys(data.history).sort().reverse();
    let streak = 0;
    let expected = getToday();

    const todayWords = countWords(data.currentText);
    if (todayWords >= GOAL) {
      streak = 1;
      const d = new Date();
      d.setDate(d.getDate() - 1);
      expected = formatDate(d);
    } else {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      expected = formatDate(d);
    }

    for (const date of dates) {
      if (date === getToday() && todayWords >= GOAL) continue;
      if (date === expected && data.history[date] && data.history[date].words >= GOAL) {
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
      status.textContent = words >= 200 ? 'Excellent ! Belle session ✍️' : 'Objectif atteint ! 🎉';
    } else {
      countEl.classList.remove('reached');
      fill.classList.remove('reached');
      status.textContent = words === 0
        ? 'Commence à écrire aujourd\'hui'
        : `Encore ${GOAL - words} mot${GOAL - words > 1 ? 's' : ''} pour atteindre l'objectif`;
    }

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

    if (words > MAX_WORDS) {
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

  // ===== HISTORIQUE (par date) =====
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
      item.addEventListener('click', () => openEdit(item.dataset.date));
    });
  }

  // ===== ÉDITION (preview + reorder) =====
  function renderEdition() {
    const list = $('edition-list');
    syncOrder();

    if (data.order.length === 0) {
      list.innerHTML = '<p class="history-empty">Aucune note pour le moment.<br>Écris un peu aujourd\'hui !</p>';
      return;
    }

    list.innerHTML = data.order.map(date => {
      const entry = data.history[date];
      if (!entry) return '';
      const reached = entry.words >= GOAL ? 'reached' : '';
      const preview = getPreview(entry.text, 50);
      return `
        <div class="history-item" data-date="${date}" draggable="false">
          <span class="history-item-preview">${escapeHtml(preview)}</span>
          <span class="history-item-words ${reached}">${entry.words}</span>
        </div>
      `;
    }).join('');

    // Drag & drop (pointer events pour mobile + desktop)
    setupDragAndDrop(list);
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function setupDragAndDrop(list) {
    let longPressTimer = null;
    let startY = 0;
    let currentItem = null;
    let placeholder = null;

    list.querySelectorAll('.history-item').forEach(item => {
      // Click normal → ouvrir l'édition
      item.addEventListener('click', (e) => {
        if (dragState) return; // on ignore si on vient de drag
        openEdit(item.dataset.date);
      });

      // Pointer events pour long-press + drag
      item.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        startY = e.clientY;
        currentItem = item;

        longPressTimer = setTimeout(() => {
          // Début du drag
          dragState = { item, startIndex: [...list.children].indexOf(item) };
          item.classList.add('dragging');
          item.setPointerCapture(e.pointerId);

          // Feedback haptique si disponible
          if (navigator.vibrate) navigator.vibrate(30);
        }, 400); // 400ms de long-press
      });

      item.addEventListener('pointermove', (e) => {
        if (!dragState || dragState.item !== item) {
          // Si on bouge trop avant le long-press, on annule
          if (longPressTimer && Math.abs(e.clientY - startY) > 10) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
          }
          return;
        }

        e.preventDefault();
        const y = e.clientY;
        const siblings = [...list.querySelectorAll('.history-item:not(.dragging)')];

        let nextSibling = null;
        for (const sib of siblings) {
          const rect = sib.getBoundingClientRect();
          const mid = rect.top + rect.height / 2;
          if (y < mid) {
            nextSibling = sib;
            break;
          }
        }

        if (nextSibling) {
          list.insertBefore(item, nextSibling);
        } else {
          list.appendChild(item);
        }
      });

      item.addEventListener('pointerup', (e) => {
        clearTimeout(longPressTimer);
        longPressTimer = null;

        if (dragState && dragState.item === item) {
          item.classList.remove('dragging');
          item.releasePointerCapture(e.pointerId);

          // Mettre à jour l'ordre
          const newOrder = [...list.querySelectorAll('.history-item')].map(el => el.dataset.date);
          data.order = newOrder;
          saveData();

          // Petit délai pour éviter le click après drag
          setTimeout(() => { dragState = null; }, 50);
        }
      });

      item.addEventListener('pointercancel', () => {
        clearTimeout(longPressTimer);
        if (dragState && dragState.item === item) {
          item.classList.remove('dragging');
          dragState = null;
        }
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
      // Notification de test avec son si possible
      new Notification('Write-it', {
        body: 'Notifications activées ! Tu recevras un rappel vers 18h.',
        icon: 'icons/icon-192.png',
        silent: false,
        requireInteraction: false
      });
    }
  }

  function checkAndNotify() {
    if (!data.notifEnabled || Notification.permission !== 'granted') return;

    const now = new Date();
    const today = getToday();

    if (data.lastNotifDate === today) return;

    if (now.getHours() >= NOTIF_HOUR) {
      const words = countWords(data.currentText);
      if (words < GOAL) {
        new Notification('Write-it', {
          body: 'C\'est l\'heure d\'écrire tes 100 mots ✍️',
          icon: 'icons/icon-192.png',
          tag: 'writeit-daily',
          silent: false,           // essaie de jouer le son système
          requireInteraction: true // reste visible plus longtemps
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

    $('btn-edition').addEventListener('click', () => {
      renderEdition();
      showView('view-edition');
    });

    $('btn-back-edition').addEventListener('click', () => {
      updateDashboard();
      showView('view-dashboard');
    });

    $('btn-back-edit').addEventListener('click', () => {
      // Retour vers la vue d'où on vient (historique ou édition)
      // Par simplicité on retourne à l'historique
      renderHistory();
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

    // Édition d'une note
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
      }
    });

    // Settings
    $('btn-enable-notif').addEventListener('click', requestNotificationPermission);
    $('btn-export').addEventListener('click', exportData);
    $('btn-reset').addEventListener('click', resetApp);

    // Vérifier le changement de jour + notifications
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
    }, 30000);
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

    window.addEventListener('focus', () => {
      ensureCurrentDay();
      updateDashboard();
      checkAndNotify();
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
