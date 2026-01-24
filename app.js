// app.js

// ================= CONFIGURAÇÃO =================
const APPS_SCRIPT_API_URL = 'https://script.google.com/macros/s/AKfycbwjSWmfvYVRp4CxD-94hK8G7s75_g8MUJBD_tRlpVMIBS3DeD1CpEHDs80sdmZosG-ajg/exec'
; // TROCAR PELO SEU URL

async function callApi(functionName, args = []) {
  const payload = { functionName, args };

  const res = await fetch(APPS_SCRIPT_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8'
    },
    body: JSON.stringify(payload)
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Erro ao interpretar resposta do servidor.');
  }

  if (!data.success) {
    throw new Error(data.error || 'Erro desconhecido no backend.');
  }
  return data.data;
}

// ================= ESTADO LOCAL =================
let currentUser = null;
let currentExpenses = [];
let selectedExpense = null;
let employeeCache = [];
let selectedUser = null;

function saveUserToStorage(user) {
  localStorage.setItem('dv_user', JSON.stringify(user));
}

function loadUserFromStorage() {
  const raw = localStorage.getItem('dv_user');
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function clearUserStorage() {
  localStorage.removeItem('dv_user');
}

// ================= INICIALIZAÇÃO =================
document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('login-form');
  const loginError = document.getElementById('login-error');

  const loginSection = document.getElementById('login-section');
  const mainSection = document.getElementById('main-section');

  const userNameEl = document.getElementById('user-name');
  const userRoleEl = document.getElementById('user-role');

  const tabElems = {
    dashboard: document.getElementById('tab-dashboard'),
    expense: document.getElementById('tab-expense'),
    query: document.getElementById('tab-query'),
    balance: document.getElementById('tab-balance'),
    user: document.getElementById('tab-user')
  };
  const navButtons = document.querySelectorAll('.nav-btn');

  const btnLogout = document.getElementById('btn-logout');

  // Dashboard
  const btnDashboardRefresh = document.getElementById('btn-dashboard-refresh');
  const dashSaldoAtual = document.getElementById('dash-saldo-atual');
  const dashSaldoRecebido = document.getElementById('dash-saldo-recebido');
  const dashTotalGasto = document.getElementById('dash-total-gasto');
  const dashboardSummary = document.getElementById('dashboard-summary');

  // Despesa (nova)
  const expenseForm = document.getElementById('expense-form');
  const expenseMsg = document.getElementById('expense-message');

  // Saldo (gestor)
  const btnRefreshBalances = document.getElementById('btn-refresh-balances');
  const balanceTableBody = document.getElementById('balance-table-body');
  const balanceSelect = document.getElementById('balance-employee');
  const balanceForm = document.getElementById('balance-form');
  const balanceMsg = document.getElementById('balance-message');

  // Gestão de usuários
  const userForm = document.getElementById('user-form');
  const userMsg = document.getElementById('user-message');
  const employeeListEl = document.getElementById('employee-list');
  const editUserCard = document.getElementById('edit-user-card');
  const editUserForm = document.getElementById('edit-user-form');
  const editUserMsg = document.getElementById('edit-user-message');

  // Consulta de despesas
  const queryForm = document.getElementById('query-form');
  const queryType = document.getElementById('query-type');
  const queryEmployeeWrapper = document.getElementById('query-employee-wrapper');
  const queryEmployeeSelect = document.getElementById('query-employee');
  const queryStartDate = document.getElementById('query-start-date');
  const queryEndDate = document.getElementById('query-end-date');
  const queryTableBody = document.getElementById('query-table-body');

  const detailCard = document.getElementById('expense-detail-card');
  const detailEmployeeInfo = document.getElementById('detail-employee-info');
  const detailForm = document.getElementById('expense-detail-form');
  const detailMsg = document.getElementById('detail-expense-message');
  const detailId = document.getElementById('detail-expense-id');
  const detailTipo = document.getElementById('detail-expense-type');
  const detailData = document.getElementById('detail-expense-date');
  const detailValor = document.getElementById('detail-expense-value');
  const detailDesc = document.getElementById('detail-expense-description');
  const detailFile = document.getElementById('detail-expense-file');
  const btnDetailSave = document.getElementById('btn-detail-save');
  const btnDetailDelete = document.getElementById('btn-detail-delete');

  // ========== LOGIN ==========
  const stored = loadUserFromStorage();
  if (stored) {
    currentUser = stored;
    showMainUI();
  }

  loginForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    loginError.classList.add('hidden');
    loginError.textContent = '';

    const login = document.getElementById('login-username').value.trim();
    const senha = document.getElementById('login-password').value;

    try {
      const user = await callApi('checkLogin', [login, senha]);
      currentUser = user;
      saveUserToStorage(user);
      showMainUI();
    } catch (err) {
      loginError.textContent = err.message;
      loginError.classList.remove('hidden');
    }
  });

  btnLogout.addEventListener('click', () => {
    currentUser = null;
    clearUserStorage();
    mainSection.classList.add('hidden');
    loginSection.classList.add('active');
    loginSection.classList.remove('hidden');
  });

  async function showMainUI() {
    if (!currentUser) return;
    loginSection.classList.add('hidden');
    loginSection.classList.remove('active');
    mainSection.classList.remove('hidden');

    userNameEl.textContent = currentUser.nome;
    userRoleEl.textContent = currentUser.perfil === 'GESTOR' ? 'Gestor' : 'Colaborador';

    document.querySelectorAll('.only-manager').forEach(el => {
      el.style.display = (currentUser.perfil === 'GESTOR') ? 'block' : 'none';
    });

    if (currentUser.perfil !== 'GESTOR') {
      activateTab('dashboard');
      queryEmployeeWrapper.style.display = 'none';
    } else {
      activateTab('dashboard');
      queryEmployeeWrapper.style.display = 'block';
      await loadEmployees();
      refreshBalances().catch(console.error);
    }

    updateDashboard().catch(console.error);
  }

  // ========== NAVEGAÇÃO DE TABS ==========
  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-tab');
      if (currentUser && currentUser.perfil !== 'GESTOR' &&
        (tab === 'balance' || tab === 'user')) {
        return;
      }
      activateTab(tab);
      if (tab === 'query') {
        // quando entrar na aba de consulta, executa uma busca padrão
        handleQuerySubmit().catch(console.error);
      }
    });
  });

  function activateTab(tabName) {
    Object.keys(tabElems).forEach(key => {
      tabElems[key].classList.add('hidden');
      tabElems[key].classList.remove('active');
    });
    const el = tabElems[tabName];
    if (el) {
      el.classList.remove('hidden');
      el.classList.add('active');
    }

    navButtons.forEach(btn => {
      btn.classList.remove('active');
      if (btn.getAttribute('data-tab') === tabName) {
        btn.classList.add('active');
      }
    });
  }

  // ========== DASHBOARD ==========
  btnDashboardRefresh.addEventListener('click', () => {
    updateDashboard().catch(console.error);
  });

  async function updateDashboard() {
    if (!currentUser) return;
    try {
      const data = await callApi('getDashboardData', [currentUser.id, currentUser.perfil]);
      dashSaldoAtual.textContent = formatCurrency(data.saldoAtual || 0);
      dashSaldoRecebido.textContent = formatCurrency(data.totalCredito || 0);
      dashTotalGasto.textContent = formatCurrency(data.totalGasto || 0);

      dashboardSummary.innerHTML = '';
      const li1 = document.createElement('li');
      li1.textContent = `Saldo atual: ${formatCurrency(data.saldoAtual || 0)}`;
      const li2 = document.createElement('li');
      li2.textContent = `Total recebido: ${formatCurrency(data.totalCredito || 0)}`;
      const li3 = document.createElement('li');
      li3.textContent = `Total gasto: ${formatCurrency(data.totalGasto || 0)}`;
      dashboardSummary.appendChild(li1);
      dashboardSummary.appendChild(li2);
      dashboardSummary.appendChild(li3);
    } catch (err) {
      console.error(err);
    }
  }
    // ========== REGISTRO DE DESPESA ==========
  expenseForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (!currentUser) return;

    expenseMsg.classList.add('hidden');
    expenseMsg.textContent = '';

    const tipo = document.getElementById('expense-type').value;

    const dataInput = document.getElementById('expense-date').value; // YYYY-MM-DD
    let dataBR = '';

    if (dataInput) {
      const [ano, mes, dia] = dataInput.split('-');
      dataBR = `${dia}/${mes}/${ano}`; // DD/MM/AAAA
    }

    const valor = document.getElementById('expense-value').value;
    const descricao = document.getElementById('expense-description').value;
    const fileInput = document.getElementById('expense-file');
    const file = fileInput.files[0];

    try {
      let base64 = null;
      let mimeType = null;
      let fileName = null;

      if (file) {
        const base64Str = await fileToBase64(file);
        base64 = base64Str;
        mimeType = file.type;
        fileName = file.name;
      }

      const payload = {
        userId: currentUser.id,
        userName: currentUser.nome,
        tipo,
        dataBR,          // ✅ DATA BR SEM HORA
        valor,
        descricao,
        base64,
        mimeType,
        fileName
      };

      await callApi('registerExpense', [payload]);

      expenseMsg.textContent = 'Despesa registrada com sucesso!';
      expenseMsg.classList.remove('hidden');
      expenseMsg.classList.remove('alert-error');
      expenseMsg.classList.add('alert', 'alert-success');

      expenseForm.reset();
      updateDashboard().catch(console.error);
    } catch (err) {
      expenseMsg.textContent = err.message;
      expenseMsg.classList.remove('hidden');
      expenseMsg.classList.remove('alert-success');
      expenseMsg.classList.add('alert', 'alert-error');
    }
  });

  
  // ========== SALDOS (GESTOR) ==========
  btnRefreshBalances.addEventListener('click', () => {
    refreshBalances().catch(console.error);
  });

  async function refreshBalances() {
    if (!currentUser || currentUser.perfil !== 'GESTOR') return;
    try {
      const list = await callApi('getEmployeeBalances', []);
      renderBalanceTable(list);
    } catch (err) {
      console.error(err);
    }
  }

  function renderBalanceTable(list) {
    balanceTableBody.innerHTML = '';
    if (!list || list.length === 0) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 4;
      td.textContent = 'Nenhum registro';
      tr.appendChild(td);
      balanceTableBody.appendChild(tr);
      return;
    }

    list.forEach(item => {
      const tr = document.createElement('tr');

      const tdName = document.createElement('td');
      tdName.textContent = item.employeeName;

      const tdCred = document.createElement('td');
      tdCred.textContent = formatCurrency(item.totalCredit || 0);

      const tdDeb = document.createElement('td');
      tdDeb.textContent = formatCurrency(item.totalDebit || 0);

      const tdBal = document.createElement('td');
      tdBal.textContent = formatCurrency(item.balance || 0);
      if (item.balance < 0) {
        tdBal.style.color = '#f44336';
      }

      tr.appendChild(tdName);
      tr.appendChild(tdCred);
      tr.appendChild(tdDeb);
      tr.appendChild(tdBal);
      balanceTableBody.appendChild(tr);
    });
  }

  balanceForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    balanceMsg.classList.add('hidden');
    balanceMsg.textContent = '';

    const employeeId = balanceSelect.value;
    const employeeName = balanceSelect.options[balanceSelect.selectedIndex]?.dataset?.name || '';
    const amount = document.getElementById('balance-value').value;
    const description = document.getElementById('balance-description').value;

    try {
      await callApi('registerBalance', [{
        employeeId,
        employeeName,
        amount,
        descricao: description
      }]);

      balanceMsg.textContent = 'Crédito lançado com sucesso!';
      balanceMsg.classList.remove('hidden');
      balanceMsg.classList.remove('alert-error');
      balanceMsg.classList.add('alert', 'alert-success');

      balanceForm.reset();
      refreshBalances().catch(console.error);
      updateDashboard().catch(console.error);
    } catch (err) {
      balanceMsg.textContent = err.message;
      balanceMsg.classList.remove('hidden');
      balanceMsg.classList.remove('alert-success');
      balanceMsg.classList.add('alert', 'alert-error');
    }
  });

  // ========== GESTÃO DE USUÁRIOS ==========
  userForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    userMsg.classList.add('hidden');
    userMsg.textContent = '';

    const login = document.getElementById('user-login').value.trim();
    const nome  = document.getElementById('user-name-input').value.trim();
    const senha = document.getElementById('user-password').value;
    const perfil = document.getElementById('user-role-select').value;

    try {
      await callApi('createUser', [login, nome, senha, perfil]);

      userMsg.textContent = 'Usuário criado com sucesso!';
      userMsg.classList.remove('hidden');
      userMsg.classList.remove('alert-error');
      userMsg.classList.add('alert', 'alert-success');

      userForm.reset();
      await loadEmployees();
    } catch (err) {
      userMsg.textContent = err.message;
      userMsg.classList.remove('hidden');
      userMsg.classList.remove('alert-success');
      userMsg.classList.add('alert', 'alert-error');
    }
  });

  async function loadEmployees() {
    if (!currentUser || currentUser.perfil !== 'GESTOR') return;
    try {
      const list = await callApi('getAllEmployees', []);
      employeeCache = list;
      renderEmployeeList(list);
      renderEmployeeSelects(list);
    } catch (err) {
      console.error(err);
    }
  }

  function renderEmployeeList(list) {
    employeeListEl.innerHTML = '';
    if (!list.length) {
      const li = document.createElement('li');
      li.textContent = 'Nenhum usuário ainda.';
      employeeListEl.appendChild(li);
      return;
    }

    list.forEach(emp => {
      const li = document.createElement('li');
      li.textContent = `${emp.nome} (${emp.login}) - ${emp.perfil} ${emp.ativo ? '' : ' [INATIVO]'}`;
      li.dataset.id = emp.id;
      employeeListEl.appendChild(li);
    });
  }

  function renderEmployeeSelects(list) {
    // Combo de crédito
    balanceSelect.innerHTML = '';
    list.filter(e => e.ativo).forEach(emp => {
      const opt = document.createElement('option');
      opt.value = emp.id;
      opt.dataset.name = emp.nome;
      opt.textContent = `${emp.nome} (${emp.login})`;
      balanceSelect.appendChild(opt);
    });

    // Combo de filtro na consulta (gestor)
    queryEmployeeSelect.innerHTML = '';
    const optAll = document.createElement('option');
    optAll.value = '';
    optAll.textContent = 'Todos';
    queryEmployeeSelect.appendChild(optAll);

    list.forEach(emp => {
      const opt = document.createElement('option');
      opt.value = emp.id;
      opt.textContent = `${emp.nome} (${emp.login})`;
      queryEmployeeSelect.appendChild(opt);
    });
  }

  employeeListEl.addEventListener('click', (ev) => {
    const li = ev.target.closest('li');
    if (!li || !li.dataset.id) return;
    const id = li.dataset.id;
    const emp = employeeCache.find(e => String(e.id) === String(id));
    if (!emp) return;

    selectedUser = emp;
    editUserCard.classList.remove('hidden');
    document.getElementById('edit-user-id').value = emp.id;
    document.getElementById('edit-user-login').value = emp.login;
    document.getElementById('edit-user-name').value = emp.nome;
    document.getElementById('edit-user-role').value = emp.perfil;
    document.getElementById('edit-user-password').value = '';
    document.getElementById('edit-user-active').checked = !!emp.ativo;
    editUserMsg.classList.add('hidden');
    editUserMsg.textContent = '';
  });

  editUserForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    editUserMsg.classList.add('hidden');
    editUserMsg.textContent = '';

    const id = document.getElementById('edit-user-id').value;
    const login = document.getElementById('edit-user-login').value.trim();
    const nome = document.getElementById('edit-user-name').value.trim();
    const senha = document.getElementById('edit-user-password').value;
    const perfil = document.getElementById('edit-user-role').value;
    const ativo = document.getElementById('edit-user-active').checked;

    try {
      await callApi('updateUser', [{
        id,
        login,
        nome,
        perfil,
        senha,
        ativo
      }]);

      editUserMsg.textContent = 'Usuário atualizado com sucesso!';
      editUserMsg.classList.remove('hidden');
      editUserMsg.classList.remove('alert-error');
      editUserMsg.classList.add('alert', 'alert-success');

      await loadEmployees();
    } catch (err) {
      editUserMsg.textContent = err.message;
      editUserMsg.classList.remove('hidden');
      editUserMsg.classList.remove('alert-success');
      editUserMsg.classList.add('alert', 'alert-error');
    }
  });

  // ========== CONSULTA DE DESPESAS (USUÁRIO / GESTOR) ==========
  queryForm.addEventListener('submit', (ev) => {
    ev.preventDefault();
    handleQuerySubmit().catch(console.error);
  });

  async function handleQuerySubmit() {
    if (!currentUser) return;

    detailCard.classList.add('hidden');
    detailMsg.classList.add('hidden');
    detailMsg.textContent = '';

    const tipo = queryType.value || '';
    const startDate = queryStartDate.value || '';
    const endDate = queryEndDate.value || '';

    try {
      if (currentUser.perfil === 'GESTOR') {
        const employeeId = queryEmployeeSelect.value || '';
        currentExpenses = await callApi('getAllExpenses', [{
          employeeId,
          tipo,
          startDate,
          endDate
        }]);
      } else {
        currentExpenses = await callApi('getUserExpenses', [{
          userId: currentUser.id,
          tipo,
          startDate,
          endDate
        }]);
      }

      renderQueryTable(currentExpenses);
    } catch (err) {
      console.error(err);
    }
  }

  function renderQueryTable(list) {
    queryTableBody.innerHTML = '';
    if (!list || list.length === 0) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 4;
      td.textContent = 'Nenhum registro.';
      tr.appendChild(td);
      queryTableBody.appendChild(tr);
      return;
    }

    list.forEach((exp, idx) => {
      const tr = document.createElement('tr');
      tr.dataset.index = idx;

      const tdData = document.createElement('td');
      tdData.textContent = formatDate(exp.data);

      const tdTipo = document.createElement('td');
      tdTipo.textContent = exp.tipo || '';

      const tdNome = document.createElement('td');
      tdNome.textContent = exp.employeeName || '';

      const tdValor = document.createElement('td');
      tdValor.textContent = formatCurrency(exp.valor || 0);

      tr.appendChild(tdData);
      tr.appendChild(tdTipo);
      tr.appendChild(tdNome);
      tr.appendChild(tdValor);

      tr.addEventListener('click', () => {
        selectExpense(idx);
      });

      queryTableBody.appendChild(tr);
    });
  }

  function selectExpense(index) {
    const exp = currentExpenses[index];
    if (!exp) return;
    selectedExpense = exp;

    detailCard.classList.remove('hidden');
    detailMsg.classList.add('hidden');
    detailMsg.textContent = '';

    detailEmployeeInfo.textContent =
      `${exp.employeeName || ''} (ID: ${exp.employeeId}) - ${formatDate(exp.data)}`;

    detailId.value = exp.id;
    detailTipo.value = exp.tipo || 'OUTROS';
    detailData.value = toInputDate(exp.data);
    detailValor.value = exp.valor || 0;
    detailDesc.value = exp.descricao || '';
    detailFile.value = '';

    const isOwner = currentUser.perfil === 'USUARIO' &&
      String(exp.employeeId) === String(currentUser.id);

    if (isOwner) {
      detailTipo.disabled = false;
      detailData.disabled = false;
      detailValor.disabled = false;
      detailDesc.disabled = false;
      detailFile.disabled = false;
      btnDetailSave.disabled = false;
      btnDetailDelete.disabled = false;
    } else {
      // Gestor: somente visualização
      detailTipo.disabled = true;
      detailData.disabled = true;
      detailValor.disabled = true;
      detailDesc.disabled = true;
      detailFile.disabled = true;
      btnDetailSave.disabled = true;
      btnDetailDelete.disabled = true;
    }

    detailCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  detailForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (!selectedExpense || !currentUser) return;

    const isOwner = currentUser.perfil === 'USUARIO' &&
      String(selectedExpense.employeeId) === String(currentUser.id);
    if (!isOwner) return;

    detailMsg.classList.add('hidden');
    detailMsg.textContent = '';

    const tipo = detailTipo.value;
    const dataInput = detailData.value; // YYYY-MM-DD
    let dataBR = '';

    if (dataInput) {
      const [ano, mes, dia] = dataInput.split('-');
      dataBR = `${dia}/${mes}/${ano}`;
    }

    const valor = detailValor.value;
    const descricao = detailDesc.value;
    const file = detailFile.files[0];

    try {
      let base64 = null;
      let mimeType = null;
      let fileName = null;

      if (file) {
        const base64Str = await fileToBase64(file);
        base64 = base64Str;
        mimeType = file.type;
        fileName = file.name;
      }

      await callApi('updateExpense', [{
        id: selectedExpense.id,
        userId: selectedExpense.employeeId,
        userName: selectedExpense.employeeName,
        tipo,
        dataBR,
        valor,
        descricao,
        base64,
        mimeType,
        fileName
      }]);

      detailMsg.textContent = 'Despesa atualizada com sucesso!';
      detailMsg.classList.remove('hidden');
      detailMsg.classList.remove('alert-error');
      detailMsg.classList.add('alert', 'alert-success');

      await handleQuerySubmit();
      updateDashboard().catch(console.error);
    } catch (err) {
      detailMsg.textContent = err.message;
      detailMsg.classList.remove('hidden');
      detailMsg.classList.remove('alert-success');
      detailMsg.classList.add('alert', 'alert-error');
    }
  });

  btnDetailDelete.addEventListener('click', async () => {
    if (!selectedExpense || !currentUser) return;

    const isOwner = currentUser.perfil === 'USUARIO' &&
      String(selectedExpense.employeeId) === String(currentUser.id);
    if (!isOwner) return;

    if (!confirm('Deseja realmente excluir esta despesa?')) return;

    detailMsg.classList.add('hidden');
    detailMsg.textContent = '';

    try {
      await callApi('deleteExpense', [{
        id: selectedExpense.id,
        userId: selectedExpense.employeeId,
        userName: selectedExpense.employeeName
      }]);

      detailMsg.textContent = 'Despesa excluída com sucesso!';
      detailMsg.classList.remove('hidden');
      detailMsg.classList.remove('alert-error');
      detailMsg.classList.add('alert', 'alert-success');

      selectedExpense = null;
      detailCard.classList.add('hidden');

      await handleQuerySubmit();
      updateDashboard().catch(console.error);
    } catch (err) {
      detailMsg.textContent = err.message;
      detailMsg.classList.remove('hidden');
      detailMsg.classList.remove('alert-success');
      detailMsg.classList.add('alert', 'alert-error');
    }
  });

  // ========== FORMATOS E UTIL ==========
  function formatCurrency(num) {
    const n = Number(num || 0);
    return n.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    });
  }

  function formatDate(value) {
    if (!value) return '';
    const d = new Date(value);
    if (isNaN(d.getTime())) return '';
    const dia = String(d.getDate()).padStart(2, '0');
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const ano = d.getFullYear();
    return `${dia}/${mes}/${ano}`;
  }

  function toInputDate(value) {
    if (!value) return '';
    const d = new Date(value);
    if (isNaN(d.getTime())) return '';
    const dia = String(d.getDate()).padStart(2, '0');
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const ano = d.getFullYear();
    return `${ano}-${mes}-${dia}`;
  }

  // ========== SERVICE WORKER PWA ==========
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js')
      .catch(err => console.error('SW error:', err));
  }
});
