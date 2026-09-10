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

  // ===== ÉTAT =====
  let data = {
    currentDate: null,
    currentText: '',
    history: {},          // { "YYYY-MM-DD": { text, words } }
    order: [],            // ordre personnalisé des dates pour la vue Édition
    streak: 0
  };

  let currentEditDate = null;
  let cameFromView = 'view-history'; // pour savoir où retourner après édition
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
    const existing = new Set(data.order);
    const allDates = Object.keys(data.history);

    const newDates = allDates.filter(d => !existing.has(d)).sort().reverse();
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

    // Total words (history + current day)
    let total = countWords(data.currentText);
    Object.values(data.history).forEach(entry => {
      total += entry.words || 0;
    });
    $('total-words').textContent = total.toLocaleString('fr-FR');
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
      item.addEventListener('click', () => {
        cameFromView = 'view-history';
        openEdit(item.dataset.date);
      });
    });
  }

  // ===== ÉDITION (preview + reorder avec flèches) =====
  function renderEdition() {
    const list = $('edition-list');
    syncOrder();

    if (data.order.length === 0) {
      list.innerHTML = '<p class="history-empty">Aucune note pour le moment.<br>Écris un peu aujourd\'hui !</p>';
      return;
    }

    list.innerHTML = data.order.map((date, index) => {
      const entry = data.history[date];
      if (!entry) return '';
      const reached = entry.words >= GOAL ? 'reached' : '';
      const preview = getPreview(entry.text, 50);
      const isFirst = index === 0;
      const isLast = index === data.order.length - 1;

      return `
        <div class="history-item" data-date="${date}">
          <div class="reorder-controls">
            <button class="reorder-btn btn-up" data-index="${index}" ${isFirst ? 'disabled' : ''} aria-label="Monter">▲</button>
            <button class="reorder-btn btn-down" data-index="${index}" ${isLast ? 'disabled' : ''} aria-label="Descendre">▼</button>
          </div>
          <span class="history-item-preview">${escapeHtml(preview)}</span>
          <span class="history-item-words ${reached}">${entry.words}</span>
        </div>
      `;
    }).join('');

    // Clic sur la note → ouvrir l'édition
    list.querySelectorAll('.history-item').forEach(item => {
      item.addEventListener('click', (e) => {
        // Ne pas ouvrir si on a cliqué sur une flèche
        if (e.target.closest('.reorder-btn')) return;
        cameFromView = 'view-edition';
        openEdit(item.dataset.date);
      });
    });

    // Flèches de réordonnancement
    list.querySelectorAll('.btn-up').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.index, 10);
        if (idx > 0) {
          moveItem(idx, idx - 1);
        }
      });
    });

    list.querySelectorAll('.btn-down').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.index, 10);
        if (idx < data.order.length - 1) {
          moveItem(idx, idx + 1);
        }
      });
    });
  }

  function moveItem(fromIndex, toIndex) {
    const item = data.order.splice(fromIndex, 1)[0];
    data.order.splice(toIndex, 0, item);
    saveData();
    renderEdition();
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
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

  // ===== EXPORT / IMPORT / RESET =====
  function exportData() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `writeit-backup-${getToday()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportMarkdown() {
    const today = getToday();
    let md = `# Write-it — Export du ${formatDisplayDate(today)}\n\n`;

    // Use custom order if available, otherwise chronological reverse
    let dates = data.order && data.order.length > 0
      ? [...data.order]
      : Object.keys(data.history).sort().reverse();

    // Also include current day if it has text and isn't already in history
    if (data.currentText && data.currentText.trim() && !data.history[data.currentDate]) {
      dates = [data.currentDate, ...dates.filter(d => d !== data.currentDate)];
    }

    if (dates.length === 0) {
      md += '*Aucune note pour le moment.*\n';
    } else {
      dates.forEach(date => {
        let text = '';
        let words = 0;

        if (date === data.currentDate && data.currentText) {
          text = data.currentText;
          words = countWords(text);
        } else if (data.history[date]) {
          text = data.history[date].text || '';
          words = data.history[date].words || countWords(text);
        }

        if (!text && words === 0) return;

        md += `## ${formatDisplayDate(date)}\n`;
        md += `*${words} mot${words > 1 ? 's' : ''}*\n\n`;
        md += text.trim() + '\n\n';
        md += '---\n\n';
      });
    }

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `writeit-export-${today}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importData(file) {
    const status = $('import-status');
    status.textContent = 'Import en cours…';
    status.style.color = 'var(--text-muted)';

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target.result);

        if (!imported || typeof imported !== 'object') {
          throw new Error('Fichier invalide');
        }

        // Confirmation
        const noteCount = imported.history ? Object.keys(imported.history).length : 0;
        const msg = `Importer ces données ?\n\n${noteCount} note(s) trouvée(s).\nCela remplacera les données actuelles.`;
        if (!confirm(msg)) {
          status.textContent = 'Import annulé';
          return;
        }

        // Remplacement
        data = {
          currentDate: imported.currentDate || getToday(),
          currentText: imported.currentText || '',
          history: imported.history || {},
          order: Array.isArray(imported.order) ? imported.order : [],
          streak: imported.streak || 0
        };

        syncOrder();
        ensureCurrentDay();
        saveData();
        updateDashboard();

        status.textContent = `Import réussi ✓ (${Object.keys(data.history).length} notes)`;
        status.style.color = 'var(--accent)';
      } catch (err) {
        console.error(err);
        status.textContent = 'Erreur : fichier JSON invalide';
        status.style.color = 'var(--danger)';
      }
    };
    reader.onerror = () => {
      status.textContent = 'Erreur de lecture du fichier';
      status.style.color = 'var(--danger)';
    };
    reader.readAsText(file);
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
      // Retour vers la bonne vue
      if (cameFromView === 'view-edition') {
        renderEdition();
        showView('view-edition');
      } else {
        renderHistory();
        showView('view-history');
      }
    });

    $('btn-settings').addEventListener('click', () => {
      $('import-status').textContent = '';
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
    $('btn-export').addEventListener('click', exportData);
    $('btn-export-md').addEventListener('click', exportMarkdown);
    $('btn-import').addEventListener('click', () => {
      $('import-file').click();
    });
    $('import-file').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        importData(file);
        e.target.value = ''; // reset pour pouvoir réimporter le même fichier
      }
    });
    $('btn-reset').addEventListener('click', resetApp);

    // Vérifier le changement de jour
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

    window.addEventListener('focus', () => {
      ensureCurrentDay();
      updateDashboard();
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
