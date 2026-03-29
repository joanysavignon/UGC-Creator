const pagePath = window.location.pathname;

const PAGE_CONFIG = pagePath.includes('creditcard_expenses.html')
  ? {
      scope: 'bills',
      storageKey: 'expenseTracker_cc_expenses_data_v1',
      notesKey: 'expenseTracker_cc_expenses_notes_v1'
    }
  : pagePath.includes('creditcards.html')
    ? {
        scope: 'creditcards',
        storageKey: 'expenseTracker_creditcards_data_v1',
        notesKey: 'expenseTracker_creditcards_notes_v1'
      }
    : pagePath.includes('savings.html')
      ? {
          scope: 'savings',
          storageKey: 'expenseTracker_savings_data_v1',
          notesKey: 'expenseTracker_savings_notes_v1'
        }
      : {
          scope: 'general',
          storageKey: 'expenseTracker_general_data_v1',
          notesKey: 'expenseTracker_general_notes_v1'
        };

const API_BASE = '/api';
let backendEnabled = false;
let backendCheckComplete = false;
let backendMode = 'browser';
let supabaseClient = null;
let backendStatusNote = '';

const incomeValue = document.getElementById('incomeValue');
const expenseValue = document.getElementById('expenseValue');
const balanceValue = document.getElementById('balanceValue');
const transactionsBody = document.getElementById('transactions');
const transactionForm = document.getElementById('transactionForm');
const searchInput = document.getElementById('searchInput');
const filterMonth = document.getElementById('filterMonth');
const filterHalf = document.getElementById('filterHalf');
const notesInput = document.getElementById('notes');
const notesMonth = document.getElementById('notesMonth');
const saveNote = document.getElementById('saveNote');
const notesList = document.getElementById('notesList');
const exportData = document.getElementById('exportData');
const exportToFolder = document.getElementById('exportToFolder');
const setAutoSaveFolder = document.getElementById('setAutoSaveFolder');
const importDataBtn = document.getElementById('importDataBtn');
const importData = document.getElementById('importData');
const resetData = document.getElementById('resetData');
const submitTransaction = document.getElementById('submitTransaction');
const cancelEdit = document.getElementById('cancelEdit');
const editModeHint = document.getElementById('editModeHint');

const h1Income = document.getElementById('h1Income');
const h1Expenses = document.getElementById('h1Expenses');
const h1Balance = document.getElementById('h1Balance');
const h1Leftover = document.getElementById('h1Leftover');
const h2Income = document.getElementById('h2Income');
const h2Expenses = document.getElementById('h2Expenses');
const h2Balance = document.getElementById('h2Balance');
const h2Leftover = document.getElementById('h2Leftover');
const halfLeftoverTotal = document.getElementById('halfLeftoverTotal');
const yearIncome = document.getElementById('yearIncome');
const yearExpenses = document.getElementById('yearExpenses');
const yearBalance = document.getElementById('yearBalance');
const monthBreakdown = document.getElementById('monthBreakdown');

let autoSaveBackupFolder = null;
let skipFolderAutoSave = false;
let transactions = [];
let notes = {};
let editId = null;
let lastSyncedBundleSignature = '';
let syncInFlight = false;

if (notesInput) {
  notesInput.value = '';
}

function ensureBackendStatusElement() {
  let statusEl = document.getElementById('backendStatus');
  if (statusEl) {
    return statusEl;
  }

  const topbar = document.querySelector('.topbar');
  if (!topbar || !topbar.firstElementChild) {
    return null;
  }

  statusEl = document.createElement('p');
  statusEl.id = 'backendStatus';
  statusEl.style.margin = '.35rem 0 0';
  statusEl.style.fontSize = '.88rem';
  statusEl.style.fontWeight = '600';
  topbar.firstElementChild.appendChild(statusEl);
  return statusEl;
}

function updateBackendStatus(mode, note = '') {
  backendMode = mode;
  backendStatusNote = note;

  const statusEl = ensureBackendStatusElement();
  if (!statusEl) {
    return;
  }

  const labels = {
    'local-json': 'Storage: Local JSON file',
    supabase: 'Storage: Supabase',
    browser: 'Storage: Browser only'
  };

  statusEl.textContent = note ? `${labels[mode] || 'Storage'} - ${note}` : (labels[mode] || 'Storage');
  statusEl.style.color = mode === 'browser' ? '#b45309' : '#0f766e';
}

function parseJsonStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch (error) {
    console.error(`Unable to parse local storage for ${key}`, error);
    return fallback;
  }
}

function loadLocalBundle() {
  const storedTransactions = parseJsonStorage(PAGE_CONFIG.storageKey, []);
  const storedNotes = parseJsonStorage(PAGE_CONFIG.notesKey, {});

  return {
    transactions: Array.isArray(storedTransactions) ? storedTransactions : [],
    notes: storedNotes && typeof storedNotes === 'object' ? storedNotes : {}
  };
}

function saveBundleToLocalStorage(bundle) {
  try {
    localStorage.setItem(PAGE_CONFIG.storageKey, JSON.stringify(bundle.transactions));
    localStorage.setItem(PAGE_CONFIG.notesKey, JSON.stringify(bundle.notes));
  } catch (error) {
    console.error('Unable to persist data locally', error);
  }
}

function hasPageData(bundle) {
  return bundle.transactions.length > 0 || Object.keys(bundle.notes).length > 0;
}

function getBundleSignature(bundle) {
  return JSON.stringify(bundle);
}

function markBundleSynced(bundle) {
  lastSyncedBundleSignature = getBundleSignature(bundle);
}

async function apiRequest(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    ...options
  });

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

async function detectBackendAvailability() {
  if (backendCheckComplete) {
    return backendEnabled;
  }

  backendCheckComplete = true;

  if (!window.location.protocol.startsWith('http')) {
    backendEnabled = false;
    updateBackendStatus('browser', 'opened from file');
    return backendEnabled;
  }

  try {
    await apiRequest(`${API_BASE}/health`);
    backendEnabled = true;
    updateBackendStatus('local-json', 'connected');
  } catch (error) {
    if (hasSupabaseConfig()) {
      backendEnabled = true;
      updateBackendStatus('supabase', 'configured');
    } else {
      backendEnabled = false;
      updateBackendStatus('browser', 'fallback active');
      console.info('No local backend or Supabase config detected, using browser storage.', error);
    }
  }

  return backendEnabled;
}

function hasSupabaseConfig() {
  return Boolean(
    window.SUPABASE_CONFIG &&
    window.SUPABASE_CONFIG.url &&
    window.SUPABASE_CONFIG.anonKey &&
    window.supabase &&
    typeof window.supabase.createClient === 'function'
  );
}

function getSupabaseClient() {
  if (!hasSupabaseConfig()) {
    return null;
  }

  if (!supabaseClient) {
    supabaseClient = window.supabase.createClient(
      window.SUPABASE_CONFIG.url,
      window.SUPABASE_CONFIG.anonKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false
        }
      }
    );
  }

  return supabaseClient;
}

function buildBundle() {
  return {
    transactions,
    notes
  };
}

function applyBundle(bundle) {
  transactions = (bundle.transactions || []).map((transaction) => ({
    ...transaction,
    amount: Number(transaction.amount)
  }));
  notes = bundle.notes || {};
  markBundleSynced(buildBundle());
}

async function loadBundleFromBackend() {
  const scope = encodeURIComponent(PAGE_CONFIG.scope);
  return apiRequest(`${API_BASE}/page-data?scope=${scope}`);
}

async function saveBundleToBackend(bundle) {
  const scope = encodeURIComponent(PAGE_CONFIG.scope);
  return apiRequest(`${API_BASE}/page-data?scope=${scope}`, {
    method: 'PUT',
    body: JSON.stringify(bundle)
  });
}

async function resetBundleInBackend() {
  const scope = encodeURIComponent(PAGE_CONFIG.scope);
  return apiRequest(`${API_BASE}/page-data?scope=${scope}`, {
    method: 'DELETE'
  });
}

async function loadBundleFromSupabase() {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error('Supabase is not configured.');
  }

  const { data, error } = await client
    .from('expense_pages')
    .select('data')
    .eq('scope', PAGE_CONFIG.scope)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data || !data.data) {
    return { transactions: [], notes: {} };
  }

  return {
    transactions: Array.isArray(data.data.transactions) ? data.data.transactions : [],
    notes: data.data.notes && typeof data.data.notes === 'object' ? data.data.notes : {}
  };
}

async function saveBundleToSupabase(bundle) {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error('Supabase is not configured.');
  }

  const { error } = await client
    .from('expense_pages')
    .upsert(
      {
        scope: PAGE_CONFIG.scope,
        data: bundle,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'scope' }
    );

  if (error) {
    throw error;
  }
}

async function resetBundleInSupabase() {
  await saveBundleToSupabase({ transactions: [], notes: {} });
}

async function persistCurrentState() {
  const bundle = buildBundle();
  saveBundleToLocalStorage(bundle);
  markBundleSynced(bundle);

  const backendAvailable = await detectBackendAvailability();
  if (!backendAvailable) {
    return;
  }

  try {
    if (backendMode === 'local-json') {
      await saveBundleToBackend(bundle);
    } else if (backendMode === 'supabase') {
      await saveBundleToSupabase(bundle);
    }
  } catch (error) {
    backendEnabled = false;
    backendCheckComplete = true;
    updateBackendStatus('browser', 'save failed');
    console.error('Unable to persist data to the configured backend, continuing with browser storage only.', error);
  }
}

async function initializeData() {
  const localBundle = loadLocalBundle();

  const backendAvailable = await detectBackendAvailability();
  if (!backendAvailable) {
    return localBundle;
  }

  try {
    const backendBundle = backendMode === 'local-json'
      ? await loadBundleFromBackend()
      : await loadBundleFromSupabase();
    backendEnabled = true;
    updateBackendStatus(backendMode, 'connected');

    if (!hasPageData(backendBundle) && hasPageData(localBundle)) {
      if (backendMode === 'local-json') {
        await saveBundleToBackend(localBundle);
      } else if (backendMode === 'supabase') {
        await saveBundleToSupabase(localBundle);
      }
      return localBundle;
    }

    return backendBundle;
  } catch (error) {
    backendEnabled = false;
    backendCheckComplete = true;
    updateBackendStatus('browser', 'backend unavailable');
    console.error('Configured backend unavailable, loading browser storage fallback.', error);
    return localBundle;
  }
}

async function syncFromBackendIfNeeded() {
  if (syncInFlight || editId) {
    return;
  }

  const backendAvailable = await detectBackendAvailability();
  if (!backendAvailable || backendMode === 'browser') {
    return;
  }

  syncInFlight = true;
  try {
    const incomingBundle = backendMode === 'local-json'
      ? await loadBundleFromBackend()
      : await loadBundleFromSupabase();
    const incomingSignature = getBundleSignature(incomingBundle);

    if (incomingSignature !== lastSyncedBundleSignature) {
      applyBundle(incomingBundle);
      saveBundleToLocalStorage(buildBundle());
      renderNotes(notesMonth?.value || 'all');
      computeStats();
      renderTransactions(searchInput.value);
    }
  } catch (error) {
    console.error('Background sync failed.', error);
  } finally {
    syncInFlight = false;
  }
}

function setupCrossBrowserSync() {
  setInterval(() => {
    syncFromBackendIfNeeded();
  }, 10000);

  window.addEventListener('focus', () => {
    syncFromBackendIfNeeded();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      syncFromBackendIfNeeded();
    }
  });
}

function exportDatabase() {
  const payload = buildBundle();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${PAGE_CONFIG.scope}-expense-data.json`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function importDatabase(file) {
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (event) => {
    try {
      const imported = JSON.parse(event.target.result);
      transactions = Array.isArray(imported.transactions) ? imported.transactions : [];
      notes = imported.notes && typeof imported.notes === 'object' ? imported.notes : {};

      await persistCurrentState();
      computeStats();
      renderTransactions(searchInput.value);
      renderNotes(notesMonth?.value || 'all');
      alert(backendEnabled ? 'Data imported and saved to the configured backend successfully.' : 'Data imported successfully.');
    } catch (error) {
      console.error('Import failed', error);
      alert('Invalid JSON file. Please try again.');
    }
  };

  reader.readAsText(file);
}

async function addNoteForMonth(month, text) {
  if (!text.trim()) return;
  if (!notes[month]) notes[month] = [];

  notes[month].push({
    id: crypto.randomUUID(),
    text: text.trim(),
    createdAt: new Date().toISOString()
  });

  await persistCurrentState();
  renderNotes(notesMonth?.value || 'all');
}

async function deleteNoteForMonth(month, noteId) {
  if (!notes[month]) return;
  notes[month] = notes[month].filter((note) => note.id !== noteId);

  if (notes[month].length === 0) {
    delete notes[month];
  }

  await persistCurrentState();
  renderNotes(notesMonth?.value || 'all');
}

function renderNotes(filterMonth = 'all') {
  if (!notesList) return;

  notesList.innerHTML = '';
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const createListItem = (month, note) => {
    const listItem = document.createElement('li');
    listItem.style.background = '#f8fafc';
    listItem.style.border = '1px solid var(--border)';
    listItem.style.borderRadius = '10px';
    listItem.style.padding = '.6rem .75rem';
    listItem.style.marginBottom = '.5rem';

    const monthLabel = month === 'all' ? 'All' : monthNames[Number(month)];
    listItem.innerHTML = `<div style="display:flex; justify-content:space-between; align-items:center;"><strong style="font-size:.82rem;">${monthLabel}</strong><button style="background:none;border:none;color:#ef4444;font-weight:700;cursor:pointer;" data-id="${note.id}" data-month="${month}">X</button></div><p style="margin:.35rem 0 0; font-size:.92rem;">${note.text}</p><small style="color:#64748b;">${new Date(note.createdAt).toLocaleString()}</small>`;

    const deleteBtn = listItem.querySelector('button');
    deleteBtn.addEventListener('click', () => deleteNoteForMonth(month, note.id));
    return listItem;
  };

  const monthsToShow = filterMonth === 'all' ? Object.keys(notes) : [filterMonth];
  let hasNotes = false;

  monthsToShow.forEach((month) => {
    (notes[month] || []).forEach((note) => {
      hasNotes = true;
      notesList.appendChild(createListItem(month, note));
    });
  });

  if (!hasNotes) {
    notesList.innerHTML = '<li style="color:#64748b; padding:.6rem;">No notes for selected month.</li>';
  }
}

if (notesMonth) {
  notesMonth.addEventListener('change', () => renderNotes(notesMonth.value));
}

if (saveNote) {
  saveNote.addEventListener('click', async () => {
    const selectedMonth = notesMonth?.value || 'all';
    await addNoteForMonth(selectedMonth, notesInput.value);
    notesInput.value = '';
  });
}

if (exportData) {
  exportData.addEventListener('click', exportDatabase);
}

async function saveToDataBackupFolder(folderHandle) {
  if (!folderHandle) return;

  const hasTransactions = Array.isArray(transactions) && transactions.length > 0;
  const hasNotes = notes && Object.keys(notes).length > 0;
  if (!hasTransactions && !hasNotes) {
    console.log('Auto-save skipped: no transactions or notes to save.');
    return;
  }

  try {
    const backupHandle = await folderHandle.getDirectoryHandle('data_backup', { create: true });
    const fileHandle = await backupHandle.getFileHandle(`${PAGE_CONFIG.scope}-expense-data.json`, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(buildBundle(), null, 2));
    await writable.close();
    console.log('Auto-save to folder completed');
  } catch (error) {
    console.error('Folder save failed', error);
  }
}

async function saveToDataBackup() {
  if (!window.showDirectoryPicker) {
    alert('Directory access is not supported in this browser. Use Export JSON instead.');
    return;
  }

  try {
    const rootHandle = await window.showDirectoryPicker();
    const backupHandle = await rootHandle.getDirectoryHandle('data_backup', { create: true });
    const fileHandle = await backupHandle.getFileHandle(`${PAGE_CONFIG.scope}-expense-data.json`, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(buildBundle(), null, 2));
    await writable.close();

    autoSaveBackupFolder = backupHandle;
    alert('Saved JSON backup to data_backup successfully. Auto-save folder set.');
  } catch (error) {
    console.error('Folder save failed', error);
    alert('Unable to save to folder. Please try again.');
  }
}

if (exportToFolder) {
  exportToFolder.addEventListener('click', saveToDataBackup);
}

if (setAutoSaveFolder) {
  setAutoSaveFolder.addEventListener('click', async () => {
    if (!window.showDirectoryPicker) {
      alert('Directory access is not supported in this browser. Please use Export JSON.');
      return;
    }

    try {
      const rootHandle = await window.showDirectoryPicker();
      autoSaveBackupFolder = await rootHandle.getDirectoryHandle('data_backup', { create: true });
      alert('Auto-save target folder set to data_backup.');
    } catch (error) {
      console.error('Auto-save folder set failed', error);
      alert('Could not set folder for auto-save.');
    }
  });
}

if (importDataBtn && importData) {
  importDataBtn.addEventListener('click', () => importData.click());
  importData.addEventListener('change', (event) => {
    if (event.target.files && event.target.files.length) {
      importDatabase(event.target.files[0]);
      event.target.value = '';
    }
  });
}

function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

function computeStats() {
  const income = transactions.filter((t) => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
  const expenses = transactions.filter((t) => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
  const balance = income - expenses;

  incomeValue.textContent = formatCurrency(income);
  expenseValue.textContent = formatCurrency(expenses);
  balanceValue.textContent = formatCurrency(balance);
  balanceValue.parentElement.classList.toggle('negative', balance < 0);

  const monthData = [
    { month: 'Jan', totalIncome: 0, totalExpenses: 0, firstIncome: 0, firstExpenses: 0, secondIncome: 0, secondExpenses: 0 },
    { month: 'Feb', totalIncome: 0, totalExpenses: 0, firstIncome: 0, firstExpenses: 0, secondIncome: 0, secondExpenses: 0 },
    { month: 'Mar', totalIncome: 0, totalExpenses: 0, firstIncome: 0, firstExpenses: 0, secondIncome: 0, secondExpenses: 0 },
    { month: 'Apr', totalIncome: 0, totalExpenses: 0, firstIncome: 0, firstExpenses: 0, secondIncome: 0, secondExpenses: 0 },
    { month: 'May', totalIncome: 0, totalExpenses: 0, firstIncome: 0, firstExpenses: 0, secondIncome: 0, secondExpenses: 0 },
    { month: 'Jun', totalIncome: 0, totalExpenses: 0, firstIncome: 0, firstExpenses: 0, secondIncome: 0, secondExpenses: 0 },
    { month: 'Jul', totalIncome: 0, totalExpenses: 0, firstIncome: 0, firstExpenses: 0, secondIncome: 0, secondExpenses: 0 },
    { month: 'Aug', totalIncome: 0, totalExpenses: 0, firstIncome: 0, firstExpenses: 0, secondIncome: 0, secondExpenses: 0 },
    { month: 'Sep', totalIncome: 0, totalExpenses: 0, firstIncome: 0, firstExpenses: 0, secondIncome: 0, secondExpenses: 0 },
    { month: 'Oct', totalIncome: 0, totalExpenses: 0, firstIncome: 0, firstExpenses: 0, secondIncome: 0, secondExpenses: 0 },
    { month: 'Nov', totalIncome: 0, totalExpenses: 0, firstIncome: 0, firstExpenses: 0, secondIncome: 0, secondExpenses: 0 },
    { month: 'Dec', totalIncome: 0, totalExpenses: 0, firstIncome: 0, firstExpenses: 0, secondIncome: 0, secondExpenses: 0 }
  ];

  for (const transaction of transactions) {
    const date = new Date(transaction.date);
    const monthIdx = Number.isInteger(transaction.month) ? transaction.month : date.getMonth();
    const half = transaction.half ? transaction.half : (date.getDate() <= 15 ? '1' : '2');
    const item = monthData[monthIdx];

    if (!item) {
      continue;
    }

    if (transaction.type === 'income') {
      item.totalIncome += transaction.amount;
      if (half === '1') item.firstIncome += transaction.amount;
      if (half === '2') item.secondIncome += transaction.amount;
    } else {
      item.totalExpenses += transaction.amount;
      if (half === '1') item.firstExpenses += transaction.amount;
      if (half === '2') item.secondExpenses += transaction.amount;
    }
  }

  const h1IncomeVal = monthData.slice(0, 6).reduce((sum, item) => sum + item.totalIncome, 0);
  const h1ExpenseVal = monthData.slice(0, 6).reduce((sum, item) => sum + item.totalExpenses, 0);
  const h1LeftoverVal = h1IncomeVal - h1ExpenseVal;

  const h2IncomeVal = monthData.slice(6, 12).reduce((sum, item) => sum + item.totalIncome, 0);
  const h2ExpenseVal = monthData.slice(6, 12).reduce((sum, item) => sum + item.totalExpenses, 0);
  const h2LeftoverVal = h2IncomeVal - h2ExpenseVal;

  h1Income.textContent = formatCurrency(h1IncomeVal);
  h1Expenses.textContent = formatCurrency(h1ExpenseVal);
  h1Balance.textContent = formatCurrency(h1LeftoverVal);
  h2Income.textContent = formatCurrency(h2IncomeVal);
  h2Expenses.textContent = formatCurrency(h2ExpenseVal);
  h2Balance.textContent = formatCurrency(h2LeftoverVal);

  yearIncome.textContent = formatCurrency(income);
  yearExpenses.textContent = formatCurrency(expenses);
  yearBalance.textContent = formatCurrency(balance);

  if (h1Leftover) h1Leftover.textContent = formatCurrency(h1LeftoverVal);
  if (h2Leftover) h2Leftover.textContent = formatCurrency(h2LeftoverVal);
  if (halfLeftoverTotal) halfLeftoverTotal.textContent = formatCurrency(h1LeftoverVal + h2LeftoverVal);

  const selectedMonth = filterMonth.value;
  const selectedHalf = filterHalf.value;

  let selectedIncome = income;
  let selectedExpenses = expenses;

  if (selectedMonth !== 'all') {
    const monthIndex = Number(selectedMonth);
    const monthItem = monthData[monthIndex];

    if (selectedHalf === 'all') {
      selectedIncome = monthItem.totalIncome;
      selectedExpenses = monthItem.totalExpenses;
    } else if (selectedHalf === '1') {
      selectedIncome = monthItem.firstIncome;
      selectedExpenses = monthItem.firstExpenses;
    } else {
      selectedIncome = monthItem.secondIncome;
      selectedExpenses = monthItem.secondExpenses;
    }
  }

  incomeValue.textContent = formatCurrency(selectedIncome);
  expenseValue.textContent = formatCurrency(selectedExpenses);
  balanceValue.textContent = formatCurrency(selectedIncome - selectedExpenses);
  balanceValue.parentElement.classList.toggle('negative', selectedIncome - selectedExpenses < 0);

  monthBreakdown.innerHTML = '';
  for (const item of monthData) {
    const totalLeftover = item.totalIncome - item.totalExpenses;
    const firstLeftover = item.firstIncome - item.firstExpenses;
    const secondLeftover = item.secondIncome - item.secondExpenses;

    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${item.month}</td>
      <td class="income-cell">${formatCurrency(item.totalIncome)}</td>
      <td class="expense-cell">${formatCurrency(item.totalExpenses)}</td>
      <td class="leftover-cell ${totalLeftover >= 0 ? 'positive' : 'negative'}">${formatCurrency(totalLeftover)}</td>
      <td class="income-cell">${formatCurrency(item.firstIncome)}</td>
      <td class="expense-cell">${formatCurrency(item.firstExpenses)}</td>
      <td class="leftover-cell ${firstLeftover >= 0 ? 'positive' : 'negative'}">${formatCurrency(firstLeftover)}</td>
      <td class="income-cell">${formatCurrency(item.secondIncome)}</td>
      <td class="expense-cell">${formatCurrency(item.secondExpenses)}</td>
      <td class="leftover-cell ${secondLeftover >= 0 ? 'positive' : 'negative'}">${formatCurrency(secondLeftover)}</td>
    `;
    monthBreakdown.appendChild(row);
  }
}

function renderTransactions(filterTerm = '') {
  transactionsBody.innerHTML = '';

  const selectedMonth = filterMonth.value;
  const selectedHalf = filterHalf.value;
  const isSavings = pagePath.includes('savings.html');

  const matches = transactions
    .filter((transaction) => {
      const query = filterTerm.toLowerCase();
      const desc = (transaction.description || '').toLowerCase();
      const category = (transaction.category || '').toLowerCase();
      const monthMatch = selectedMonth === 'all' || Number(transaction.month) === Number(selectedMonth);
      const halfMatch = selectedHalf === 'all' || String(transaction.half) === String(selectedHalf);
      return monthMatch && halfMatch && (desc.includes(query) || category.includes(query));
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  if (matches.length === 0) {
    const row = document.createElement('tr');
    const colspan = isSavings ? 8 : 9;
    row.innerHTML = `<td colspan="${colspan}" style="text-align:center; color:#64748b; padding:1rem;">No transactions yet</td>`;
    transactionsBody.appendChild(row);
    return;
  }

  for (const transaction of matches) {
    const row = document.createElement('tr');
    row.classList.add(`type-${transaction.type}`);

    const cardTypeCell = isSavings ? '' : `<td>${transaction.cardType ? transaction.cardType : '-'}</td>`;

    row.innerHTML = `
      <td>${new Date(transaction.date).toLocaleDateString()}</td>
      <td>${transaction.description}</td>
      <td>${transaction.category ? transaction.category : '-'}</td>
      ${cardTypeCell}
      <td>${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][Number(transaction.month)] || '-'}</td>
      <td>${transaction.half || '-'}</td>
      <td class="type-${transaction.type}">${transaction.type}</td>
      <td>${transaction.type === 'expense' ? '-' : ''}${formatCurrency(transaction.amount)}</td>
      <td>
        <button class="action-btn edit-btn" data-id="${transaction.id}">Edit</button>
        <button class="action-btn" data-id="${transaction.id}">Delete</button>
      </td>
    `;

    const buttons = row.querySelectorAll('button');
    const editBtn = buttons[0];
    const deleteBtn = buttons[1];

    editBtn.addEventListener('click', () => {
      editId = transaction.id;
      document.getElementById('description').value = transaction.description;
      document.getElementById('amount').value = transaction.amount;
      document.getElementById('category').value = transaction.category || '';
      if (document.getElementById('cardType')) {
        document.getElementById('cardType').value = transaction.cardType || '';
      }
      document.getElementById('type').value = transaction.type;
      document.getElementById('month').value = transaction.month;
      document.getElementById('half').value = transaction.half;
      submitTransaction.textContent = 'Update entry';
      cancelEdit.style.display = 'inline-block';
      editModeHint.style.display = 'inline-block';
    });

    deleteBtn.addEventListener('click', async () => {
      transactions = transactions.filter((item) => item.id !== transaction.id);
      if (editId === transaction.id) {
        resetEditMode();
      }
      await persistCurrentState();
      computeStats();
      renderTransactions(searchInput.value);
    });

    transactionsBody.appendChild(row);
  }
}

transactionForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const description = document.getElementById('description').value.trim();
  const amount = parseFloat(document.getElementById('amount').value);
  const type = document.getElementById('type').value;
  const category = document.getElementById('category').value.trim();
  const cardTypeEl = document.getElementById('cardType');
  const cardType = cardTypeEl ? cardTypeEl.value.trim() : null;
  const month = Number(document.getElementById('month').value);
  const half = document.getElementById('half').value;

  if (!description || Number.isNaN(amount) || amount <= 0) {
    alert('Please add a valid description and amount > 0.');
    return;
  }

  if (editId) {
    const index = transactions.findIndex((item) => item.id === editId);
    if (index > -1) {
      const updated = { ...transactions[index], description, amount, type, category, month, half };
      if (cardType !== null) {
        updated.cardType = cardType;
      }
      transactions[index] = updated;
    }
  } else {
    const newTransaction = {
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      description,
      amount,
      type,
      category,
      month,
      half
    };
    if (cardType !== null) {
      newTransaction.cardType = cardType;
    }
    transactions.push(newTransaction);
  }

  await persistCurrentState();
  computeStats();
  renderTransactions(searchInput.value);
  resetEditMode();
  transactionForm.reset();
});

function resetEditMode() {
  editId = null;
  submitTransaction.textContent = 'Save transaction';
  cancelEdit.style.display = 'none';
  editModeHint.style.display = 'none';
  transactionForm.reset();
}

cancelEdit.addEventListener('click', () => {
  resetEditMode();
});

searchInput.addEventListener('input', () => {
  renderTransactions(searchInput.value);
});

filterMonth.addEventListener('change', () => {
  computeStats();
  renderTransactions(searchInput.value);
});

filterHalf.addEventListener('change', () => {
  computeStats();
  renderTransactions(searchInput.value);
});

resetData.addEventListener('click', async () => {
  if (!confirm('Reset all transaction data and notes?')) {
    return;
  }

  skipFolderAutoSave = true;
  setTimeout(() => {
    skipFolderAutoSave = false;
  }, 60000);

  transactions = [];
  notes = {};
  if (notesInput) {
    notesInput.value = '';
  }

  saveBundleToLocalStorage(buildBundle());

  if (backendEnabled) {
    try {
      if (backendMode === 'local-json') {
        await resetBundleInBackend();
      } else if (backendMode === 'supabase') {
        await resetBundleInSupabase();
      }
    } catch (error) {
      backendEnabled = false;
      updateBackendStatus('browser', 'reset failed');
      console.error('Unable to reset configured backend data, reset completed locally only.', error);
    }
  }

  computeStats();
  renderTransactions();
  renderNotes(notesMonth?.value || 'all');

  alert(backendEnabled
    ? 'Data reset in the configured backend and local backup storage.'
    : 'Data reset locally. Existing folder backups were preserved.');
});

const navToggle = document.getElementById('navToggle');
const navLinks = document.querySelector('.nav-links');

if (navToggle && navLinks) {
  navToggle.addEventListener('click', () => {
    navLinks.classList.toggle('open');
    const lines = navToggle.querySelectorAll('.hamburger-line');
    if (navLinks.classList.contains('open')) {
      lines[0].style.transform = 'rotate(45deg) translate(6px, 6px)';
      lines[1].style.opacity = '0';
      lines[2].style.transform = 'rotate(-45deg) translate(6px, -6px)';
    } else {
      lines[0].style.transform = 'none';
      lines[1].style.opacity = '1';
      lines[2].style.transform = 'none';
    }
  });

  document.addEventListener('click', (event) => {
    if (!navToggle.contains(event.target) && !navLinks.contains(event.target)) {
      navLinks.classList.remove('open');
      const lines = navToggle.querySelectorAll('.hamburger-line');
      lines[0].style.transform = 'none';
      lines[1].style.opacity = '1';
      lines[2].style.transform = 'none';
    }
  });

  navLinks.addEventListener('click', (event) => {
    if (event.target.tagName === 'A') {
      navLinks.classList.remove('open');
      const lines = navToggle.querySelectorAll('.hamburger-line');
      lines[0].style.transform = 'none';
      lines[1].style.opacity = '1';
      lines[2].style.transform = 'none';
    }
  });
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js')
      .then((registration) => {
        console.log('Service Worker registered successfully:', registration.scope);
      })
      .catch((error) => {
        console.log('Service Worker registration failed:', error);
      });
  });
}

async function initializeApp() {
  const bundle = await initializeData();
  applyBundle(bundle);
  renderNotes(notesMonth?.value || 'all');
  computeStats();
  renderTransactions();
  setupCrossBrowserSync();
}

initializeApp().catch((error) => console.error('Initialization error', error));

setInterval(async () => {
  try {
    await persistCurrentState();
    if (autoSaveBackupFolder && !skipFolderAutoSave) {
      await saveToDataBackupFolder(autoSaveBackupFolder);
    }
    console.log('Auto-save complete');
  } catch (error) {
    console.error('Auto-save failed', error);
  }
}, 15000);

let deferredPrompt;
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredPrompt = event;

  const installButton = document.createElement('button');
  installButton.textContent = 'Install App';
  installButton.className = 'btn-primary';
  installButton.style.position = 'fixed';
  installButton.style.bottom = '20px';
  installButton.style.right = '20px';
  installButton.style.zIndex = '1000';

  installButton.addEventListener('click', () => {
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(() => {
      deferredPrompt = null;
      installButton.remove();
    });
  });

  document.body.appendChild(installButton);

  setTimeout(() => {
    if (installButton.parentNode) {
      installButton.remove();
    }
  }, 10000);
});
