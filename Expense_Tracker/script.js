const pagePath = window.location.pathname;
let storageKey, notesKey;

if (pagePath.includes('creditcard_expenses.html')) {
  storageKey = 'expenseTracker_cc_expenses_data_v1';
  notesKey = 'expenseTracker_cc_expenses_notes_v1';
} else if (pagePath.includes('creditcards.html')) {
  storageKey = 'expenseTracker_creditcards_data_v1';
  notesKey = 'expenseTracker_creditcards_notes_v1';
} else if (pagePath.includes('savings.html')) {
  storageKey = 'expenseTracker_savings_data_v1';
  notesKey = 'expenseTracker_savings_notes_v1';
} else {
  storageKey = 'expenseTracker_general_data_v1';
  notesKey = 'expenseTracker_general_notes_v1';
}

const DB_NAME = 'ExpenseTrackerDB';
const DB_VERSION = 1;
const dsTransactions = 'transactions';
const dsNotes = 'notes';

function openDB() {
  if (!('indexedDB' in window)) {
    return Promise.resolve(null);
  }
  if (!openDB.instance) {
    openDB.instance = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(dsTransactions)) {
          db.createObjectStore(dsTransactions, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(dsNotes)) {
          db.createObjectStore(dsNotes, { keyPath: 'month' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return openDB.instance;
}

async function idbTransaction(storeName, mode, callback) {
  const db = await openDB();
  if (!db) return callback(null);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const res = callback(store);
    tx.oncomplete = () => resolve(res);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function idbGetAll(storeName) {
  const db = await openDB();
  if (!db) return null;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idbPutBatch(storeName, items) {
  if (!items) return;
  const db = await openDB();
  if (!db) return;
  await idbTransaction(storeName, 'readwrite', (store) => {
    items.forEach(item => store.put(item));
  });
}

async function idbClear(storeName) {
  const db = await openDB();
  if (!db) return;
  await idbTransaction(storeName, 'readwrite', store => store.clear());
}

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

let autoSaveBackupFolder = null;
let skipFolderAutoSave = false;
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

let transactions = [];
let notes = {};
let editId = null;

if (notesInput) {
  notesInput.value = '';
}

async function loadData() {
  try {
    if ('indexedDB' in window) {
      const saved = await idbGetAll(dsTransactions);
      if (Array.isArray(saved) && saved.length > 0) {
        return saved;
      }
    }
    const raw = localStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error('Unable to load transactions', err);
    return [];
  }
}

async function saveData() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(transactions));
    if ('indexedDB' in window) {
      await idbClear(dsTransactions);
      const txArr = transactions.map(({ id, date, description, amount, type, category, cardType, month, half }) => ({ id, date, description, amount, type, category, cardType, month, half }));
      await idbPutBatch(dsTransactions, txArr);
    }
  } catch (err) {
    console.error('Unable to persist transactions', err);
  }
}

async function loadNotes() {
  try {
    if ('indexedDB' in window) {
      const saved = await idbGetAll(dsNotes);
      if (Array.isArray(saved) && saved.length > 0) {
        return saved.reduce((acc, record) => ({ ...acc, [record.month]: record.notes }), {});
      }
    }
    const raw = localStorage.getItem(notesKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (err) {
    console.error('Unable to load notes', err);
    return {};
  }
}

async function saveNotes() {
  try {
    localStorage.setItem(notesKey, JSON.stringify(notes));
    if ('indexedDB' in window) {
      await idbClear(dsNotes);
      const records = Object.entries(notes).map(([month, noteList]) => ({ month, notes: noteList }));
      await idbPutBatch(dsNotes, records);
    }
  } catch (err) {
    console.error('Unable to persist notes', err);
  }
}

function exportDatabase() {
  const payload = {
    transactions,
    notes
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'expense-data.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function importDatabase(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const imported = JSON.parse(e.target.result);
      if (imported.transactions && Array.isArray(imported.transactions)) {
        transactions = imported.transactions;
      }
      if (imported.notes && typeof imported.notes === 'object') {
        notes = imported.notes;
      }
      saveData();
      saveNotes();
      computeStats();
      renderTransactions(searchInput.value);
      renderNotes(notesMonth?.value || 'all');
      alert('Data imported successfully.');
    } catch (err) {
      console.error('Import failed', err);
      alert('Invalid JSON file. Please try again.');
    }
  };
  reader.readAsText(file);
}

async function addNoteForMonth(month, text) {
  if (!text.trim()) return;
  if (!notes[month]) notes[month] = [];
  notes[month].push({ id: crypto.randomUUID(), text: text.trim(), createdAt: new Date().toISOString() });
  await saveNotes();
  renderNotes(notesMonth?.value || 'all');
}

async function deleteNoteForMonth(month, noteId) {
  if (!notes[month]) return;
  notes[month] = notes[month].filter(note => note.id !== noteId);
  await saveNotes();
  renderNotes(notesMonth?.value || 'all');
}

function renderNotes(filterMonth = 'all') {
  if (!notesList) return;
  notesList.innerHTML = '';
  const createListItem = (month, note) => {
    const li = document.createElement('li');
    li.style.background = '#f8fafc';
    li.style.border = '1px solid var(--border)';
    li.style.borderRadius = '10px';
    li.style.padding = '.6rem .75rem';
    li.style.marginBottom = '.5rem';

    const monthLabel = month === 'all' ? 'All' : ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][Number(month)];
    li.innerHTML = `<div style="display:flex; justify-content:space-between; align-items:center;"><strong style="font-size:.82rem;">${monthLabel}</strong><button style="background:none;border:none;color:#ef4444;font-weight:700;cursor:pointer;" data-id="${note.id}" data-month="${month}">✕</button></div><p style="margin:.35rem 0 0; font-size:.92rem;">${note.text}</p><small style="color:#64748b;">${new Date(note.createdAt).toLocaleString()}</small>`;
    const deleteBtn = li.querySelector('button');
    deleteBtn.addEventListener('click', () => deleteNoteForMonth(month, note.id));
    return li;
  };

  const monthsToShow = filterMonth === 'all' ? Object.keys(notes) : [filterMonth];
  let hasNotes = false;
  monthsToShow.forEach(month => {
    (notes[month] || []).forEach(note => {
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

  // Prevent overwriting backup with empty state after reset
  const hasTransactions = Array.isArray(transactions) && transactions.length > 0;
  const hasNotes = notes && Object.keys(notes).length > 0;
  if (!hasTransactions && !hasNotes) {
    console.log('Auto-save skipped: no transactions or notes to save.');
    return;
  }

  try {
    const backupHandle = await folderHandle.getDirectoryHandle('data_backup', { create: true });
    const fileHandle = await backupHandle.getFileHandle('expense-data.json', { create: true });
    const writable = await fileHandle.createWritable();

    const payload = {
      transactions,
      notes
    };

    await writable.write(JSON.stringify(payload, null, 2));
    await writable.close();
    console.log('Auto-save to folder completed');
  } catch (err) {
    console.error('Folder save failed', err);
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
    const fileHandle = await backupHandle.getFileHandle('expense-data.json', { create: true });
    const writable = await fileHandle.createWritable();

    const payload = {
      transactions,
      notes
    };

    await writable.write(JSON.stringify(payload, null, 2));
    await writable.close();

    autoSaveBackupFolder = backupHandle;
    alert('Saved expense-data.json to data_backup successfully. Auto-save folder set.');
  } catch (err) {
    console.error('Folder save failed', err);
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
    } catch (err) {
      console.error('Auto-save folder set failed', err);
      alert('Could not set folder for auto-save.');
    }
  });
}

if (importDataBtn && importData) {
  importDataBtn.addEventListener('click', () => importData.click());
  importData.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length) {
      importDatabase(e.target.files[0]);
      e.target.value = '';
    }
  });
}


function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

function computeStats() {
  const income = transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
  const expenses = transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
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
    { month: 'Dec', totalIncome: 0, totalExpenses: 0, firstIncome: 0, firstExpenses: 0, secondIncome: 0, secondExpenses: 0 },
  ];

  for (const t of transactions) {
    const date = new Date(t.date);
    const monthIdx = Number.isInteger(t.month) ? t.month : date.getMonth();
    const half = t.half ? t.half : (date.getDate() <= 15 ? '1' : '2');
    const item = monthData[monthIdx];

    if (!item) {
      continue;
    }

    if (t.type === 'income') {
      item.totalIncome += t.amount;
      if (half === '1') item.firstIncome += t.amount;
      if (half === '2') item.secondIncome += t.amount;
    } else {
      item.totalExpenses += t.amount;
      if (half === '1') item.firstExpenses += t.amount;
      if (half === '2') item.secondExpenses += t.amount;
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

  // Expose per-half leftovers for debugging/usage
  const leftoversByHalf = {
    firstHalf: h1LeftoverVal,
    secondHalf: h2LeftoverVal,
    total: h1LeftoverVal + h2LeftoverVal
  };
  console.debug('Leftovers by half:', leftoversByHalf);

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
    .filter(t => {
      const query = filterTerm.toLowerCase();
      const desc = (t.description || '').toLowerCase();
      const cat = (t.category || '').toLowerCase();
      const monthMatch = selectedMonth === 'all' || Number(t.month) === Number(selectedMonth);
      const halfMatch = selectedHalf === 'all' || String(t.half) === String(selectedHalf);
      return monthMatch && halfMatch && (desc.includes(query) || cat.includes(query));
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
      <td>${['January','February','March','April','May','June','July','August','September','October','November','December'][Number(transaction.month)] || '-'}</td>
      <td>${transaction.half || '-'}</td>
      <td class="type-${transaction.type}">${transaction.type}</td>
      <td>${transaction.type === 'expense' ? '-' : ''}${formatCurrency(transaction.amount)}</td>
      <td>
        <button class="action-btn edit-btn" data-id="${transaction.id}">✏️</button>
        <button class="action-btn" data-id="${transaction.id}">🗑️</button>
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

    deleteBtn.addEventListener('click', () => {
      transactions = transactions.filter(item => item.id !== transaction.id);
      if (editId === transaction.id) {
        resetEditMode();
      }
      saveData();
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
    const index = transactions.findIndex(item => item.id === editId);
    if (index > -1) {
      const updated = { ...transactions[index], description, amount, type, category, month, half };
      if (cardType !== null) {
        updated.cardType = cardType;
      }
      transactions[index] = updated;
    }
  } else {
    const newTransaction = { id: crypto.randomUUID(), date: new Date().toISOString(), description, amount, type, category, month, half };
    if (cardType !== null) {
      newTransaction.cardType = cardType;
    }
    transactions.push(newTransaction);
  }

  await saveData();
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

notesInput.addEventListener('input', () => {
  saveNotes();
});

resetData.addEventListener('click', async () => {
  if (confirm('Reset all transaction data and notes?')) {
    skipFolderAutoSave = true;
    setTimeout(() => {
      skipFolderAutoSave = false;
    }, 60000);

    transactions = [];
    notes = {};
    notesInput.value = '';
    await idbClear(dsTransactions);
    await idbClear(dsNotes);
    await saveData();
    await saveNotes();
    computeStats();
    renderTransactions();
    renderNotes(notesMonth?.value || 'all');

    alert('Data reset locally. Existing data_backup/expense-data.json is preserved and not overwritten for 60s.');
  }
});

// Hamburger menu functionality
const navToggle = document.getElementById('navToggle');
const navLinks = document.querySelector('.nav-links');

if (navToggle && navLinks) {
  navToggle.addEventListener('click', () => {
    navLinks.classList.toggle('open');
    // Animate hamburger icon
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

  // Close menu when clicking outside or on a link
  document.addEventListener('click', (e) => {
    if (!navToggle.contains(e.target) && !navLinks.contains(e.target)) {
      navLinks.classList.remove('open');
      const lines = navToggle.querySelectorAll('.hamburger-line');
      lines[0].style.transform = 'none';
      lines[1].style.opacity = '1';
      lines[2].style.transform = 'none';
    }
  });

  // Close menu when clicking on a navigation link
  navLinks.addEventListener('click', (e) => {
    if (e.target.tagName === 'A') {
      navLinks.classList.remove('open');
      const lines = navToggle.querySelectorAll('.hamburger-line');
      lines[0].style.transform = 'none';
      lines[1].style.opacity = '1';
      lines[2].style.transform = 'none';
    }
  });
}

// Register Service Worker for PWA functionality
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('Service Worker registered successfully:', registration.scope);
      })
      .catch((error) => {
        console.log('Service Worker registration failed:', error);
      });
  });
}

async function initializeApp() {
  transactions = await loadData();
  notes = await loadNotes();
  renderNotes(notesMonth?.value || 'all');
  computeStats();
  renderTransactions();
}

initializeApp().catch(err => console.error('Initialization error', err));

// Auto-save data every 15 seconds
setInterval(async () => {
  try {
    await saveData();
    await saveNotes();
    if (autoSaveBackupFolder && !skipFolderAutoSave) {
      await saveToDataBackupFolder(autoSaveBackupFolder);
    }
    console.log('Auto-save complete');
  } catch (err) {
    console.error('Auto-save failed', err);
  }
}, 15000);

// PWA install prompt
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;

  // Show install button or prompt
  const installButton = document.createElement('button');
  installButton.textContent = 'Install App';
  installButton.className = 'btn-primary';
  installButton.style.position = 'fixed';
  installButton.style.bottom = '20px';
  installButton.style.right = '20px';
  installButton.style.zIndex = '1000';

  installButton.addEventListener('click', () => {
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then((choiceResult) => {
      if (choiceResult.outcome === 'accepted') {
        console.log('User accepted the install prompt');
      }
      deferredPrompt = null;
      installButton.remove();
    });
  });

  document.body.appendChild(installButton);

  // Auto-hide after 10 seconds
  setTimeout(() => {
    if (installButton.parentNode) {
      installButton.remove();
    }
  }, 10000);
});
