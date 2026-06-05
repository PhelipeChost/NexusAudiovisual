const BASE_URL = (import.meta.env.VITE_API_URL || '/audiovisual/api')

function getToken() {
  return localStorage.getItem('nexus_token')
}

async function request(path, options = {}) {
  const token = getToken()
  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
    ...options,
  }

  let res
  try {
    res = await fetch(`${BASE_URL}${path}`, config)
  } catch (err) {
    throw new Error('Servidor indisponível. Tente novamente.')
  }

  let data
  try {
    const text = await res.text()
    data = text ? JSON.parse(text) : {}
  } catch {
    throw new Error('Erro de comunicação com o servidor')
  }

  if (!res.ok) {
    throw new Error(data.error || 'Erro na requisição')
  }

  return data
}

const api = {
  auth: {
    login: (email, password) => request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
    register: (data) => request('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
    me: () => request('/auth/me'),
    updateProfile: (data) => request('/auth/profile', { method: 'PUT', body: JSON.stringify(data) }),
  },

  dashboard: {
    get: () => request('/dashboard'),
  },

  clients: {
    list: () => request('/clients'),
    get: (id) => request(`/clients/${id}`),
    create: (data) => request('/clients', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => request(`/clients/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => request(`/clients/${id}`, { method: 'DELETE' }),
    uploadLogo: (id, logo) => request(`/clients/${id}/logo`, { method: 'PUT', body: JSON.stringify({ logo }) }),
    getColumns: (clientId) => request(`/clients/${clientId}/columns`),
    createColumn: (clientId, data) => request(`/clients/${clientId}/columns`, { method: 'POST', body: JSON.stringify(data) }),
    invite: (clientId) => request(`/clients/${clientId}/invite`, { method: 'POST' }),
  },

  invite: {
    get: (token) => request(`/invite/${token}`),
    registerClient: (data) => request('/auth/register-client', { method: 'POST', body: JSON.stringify(data) }),
  },

  clientPortal: {
    getProjects: () => request('/client/projects'),
    approve: (orderId) => request(`/client/orders/${orderId}/approve`, { method: 'POST' }),
    requestChanges: (orderId, data) => request(`/client/orders/${orderId}/request-changes`, { method: 'POST', body: JSON.stringify(data) }),
    getFinancial: () => request('/client/financial'),
    getInvoiceItems: (id) => request(`/client/invoices/${id}/items`),
    payEntry: (id, data) => request(`/client/entries/${id}/pay`, { method: 'PUT', body: JSON.stringify(data) }),
    createOrder: (data) => request('/client/orders', { method: 'POST', body: JSON.stringify(data) }),
    getContract: () => request('/client/contract'),
    sendContractOTP: () => request('/client/contract/send-otp', { method: 'POST' }),
    signContract: (data) => request('/client/contract/sign', { method: 'POST', body: JSON.stringify(data) }),
    govbrAvailable: () => request('/client/contract/govbr-available'),
  },

  editorPortal: {
    getDashboard: () => request('/editor/dashboard'),
    getBoard: () => request('/editor/board'),
    deliver: (orderId, data) => request(`/editor/orders/${orderId}/deliver`, { method: 'POST', body: JSON.stringify(data) }),
    getFinancial: () => request('/editor/financial'),
    getMyReport: () => request('/editor/my-report'),
  },

  contracts: {
    list: () => request('/contracts'),
    get: (id) => request(`/contracts/${id}`),
    create: (data) => request('/contracts', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => request(`/contracts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => request(`/contracts/${id}`, { method: 'DELETE' }),
    sendSignature: (id, data) => request(`/contracts/${id}/send-signature`, { method: 'POST', body: JSON.stringify(data) }),
    getSignatures: (id) => request(`/contracts/${id}/signatures`),
    // Public (no auth)
    getForSigning: (token) => fetch(`${BASE_URL}/contracts/sign/${token}`).then(r => r.json()),
    sendOTP: (token) => fetch(`${BASE_URL}/contracts/sign/${token}/send-otp`, { method: 'POST' }).then(r => r.json()),
    verifySignature: (token, data) => fetch(`${BASE_URL}/contracts/sign/${token}/verify`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    }).then(r => r.json()),
    govbrAvailable: (token) => fetch(`${BASE_URL}/contracts/sign/${token}/govbr-available`).then(r => r.json()),
    // Validation
    validate: (file, contractId) => {
      const formData = new FormData()
      formData.append('file', file)
      if (contractId) formData.append('contract_id', contractId)
      const token = localStorage.getItem('nexus_token')
      return fetch(`${BASE_URL}/contracts/validate`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      }).then(r => r.json())
    },
    getValidations: () => request('/contracts/validations'),
    getValidation: (id) => request(`/contracts/validations/${id}`),
  },

  lookup: {
    cnpj: (cnpj) => request(`/lookup/cnpj/${cnpj}`),
  },

  orders: {
    listByClient: (clientId, month) => request(`/clients/${clientId}/orders${month ? `?month=${month}` : ''}`),
    listAll: () => request('/orders'),
    create: (clientId, data) => request(`/clients/${clientId}/orders`, { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => request(`/orders/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => request(`/orders/${id}`, { method: 'DELETE' }),
    getComments: (id) => request(`/orders/${id}/comments`),
    addComment: (id, data) => request(`/orders/${id}/comments`, { method: 'POST', body: JSON.stringify(data) }),
    getChecklist: (id) => request(`/orders/${id}/checklist`),
    addChecklistItem: (id, data) => request(`/orders/${id}/checklist`, { method: 'POST', body: JSON.stringify(data) }),
    toggleChecklistItem: (id, done) => request(`/checklist/${id}`, { method: 'PUT', body: JSON.stringify({ done }) }),
    getVersions: (id) => request(`/orders/${id}/versions`),
    addVersion: (id, data) => request(`/orders/${id}/versions`, { method: 'POST', body: JSON.stringify(data) }),
  },

  team: {
    list: () => request('/team'),
    listRemoved: () => request('/team/removed'),
    create: (data) => request('/team', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => request(`/team/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => request(`/team/${id}`, { method: 'DELETE' }),
    restore: (id) => request(`/team/${id}/restore`, { method: 'POST' }),
    invite: (email) => request('/team/invite', { method: 'POST', body: JSON.stringify({ email }) }),
    getInvites: () => request('/team/invites'),
    acceptInvite: (id) => request(`/team/invite/${id}/accept`, { method: 'POST' }),
    declineInvite: (id) => request(`/team/invite/${id}/decline`, { method: 'POST' }),
    myInvites: () => request('/my/team-invites'),
  },

  financial: {
    get: () => request('/financial'),
    create: (data) => request('/financial', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => request(`/financial/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

    // New financial management
    getLists: () => request('/financial/lists'),
    getOverview: (month) => request(`/financial/overview?month=${month}`),
    getClientSheet: (clientId, month) => request(`/financial/client-sheet/${clientId}?month=${month}`),
    getEditorSheet: (editorId, month) => request(`/financial/editor-sheet/${editorId}?month=${month}`),

    // Client invoices
    createClientInvoice: (data) => request('/financial/client-invoices', { method: 'POST', body: JSON.stringify(data) }),
    payClientInvoice: (id, data) => request(`/financial/client-invoices/${id}/pay`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteClientInvoice: (id) => request(`/financial/client-invoices/${id}`, { method: 'DELETE' }),
    getInvoiceItems: (id) => request(`/financial/client-invoices/${id}/items`),

    // Editor payment batches
    createEditorBatch: (data) => request('/financial/editor-batches', { method: 'POST', body: JSON.stringify(data) }),
    payEditorBatch: (id, data) => request(`/financial/editor-batches/${id}/pay`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteEditorBatch: (id) => request(`/financial/editor-batches/${id}`, { method: 'DELETE' }),
    getBatchItems: (id) => request(`/financial/editor-batches/${id}/items`),

    // Editor standalone entries (lançamentos avulsos)
    createEditorEntry: (data) => request('/financial/editor-entries', { method: 'POST', body: JSON.stringify(data) }),
    deleteEditorEntry: (id) => request(`/financial/editor-entries/${id}`, { method: 'DELETE' }),

    // Client standalone entries (lançamentos avulsos)
    createClientEntry: (data) => request('/financial/client-entries', { method: 'POST', body: JSON.stringify(data) }),
    deleteClientEntry: (id) => request(`/financial/client-entries/${id}`, { method: 'DELETE' }),
    payClientEntry: (id, data) => request(`/financial/client-entries/${id}/pay`, { method: 'PUT', body: JSON.stringify(data) }),

    // Daily records
    upsertDailyRecord: (data) => request('/financial/daily-record', { method: 'PUT', body: JSON.stringify(data) }),
  },

  templates: {
    list: () => request('/templates'),
    create: (data) => request('/templates', { method: 'POST', body: JSON.stringify(data) }),
    delete: (id) => request(`/templates/${id}`, { method: 'DELETE' }),
  },

  calendar: {
    get: (month) => request(`/calendar?month=${month || ''}`),
  },

  reports: {
    editors: () => request('/editor/report'),
  },

  admin: {
    dashboard: () => request('/admin/dashboard'),
    companies: () => request('/admin/companies'),
    updateSubscription: (companyId, data) => request(`/admin/subscriptions/${companyId}`, { method: 'PUT', body: JSON.stringify(data) }),
    recordPayment: (data) => request('/admin/payments', { method: 'POST', body: JSON.stringify(data) }),
    deletePayment: (id) => request(`/admin/payments/${id}`, { method: 'DELETE' }),
    approvePayment: (id) => request(`/admin/payments/${id}/approve`, { method: 'PUT' }),
    plans: () => request('/admin/plans'),
    createPlan: (data) => request('/admin/plans', { method: 'POST', body: JSON.stringify(data) }),
    updatePlan: (id, data) => request(`/admin/plans/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deletePlan: (id) => request(`/admin/plans/${id}`, { method: 'DELETE' }),
    deleteCompany: (id) => request(`/admin/companies/${id}`, { method: 'DELETE' }),
    getSettings: () => request('/admin/settings'),
    updateSettings: (settings) => request('/admin/settings', { method: 'PUT', body: JSON.stringify({ settings }) }),
  },

  subscription: {
    get: () => request('/subscription'),
  },

  payment: {
    config: () => request('/payment/config'),
    createPreference: (months) => request('/payment/create-preference', { method: 'POST', body: JSON.stringify({ months }) }),
    createPix: (months) => request('/payment/pix', { method: 'POST', body: JSON.stringify({ months }) }),
    status: () => request('/payment/status'),
  },

  public: {
    plans: () => fetch(`${BASE_URL}/public/plans`).then(r => r.json()),
    stats: () => fetch(`${BASE_URL}/public/stats`).then(r => r.json()),
  },

  notifications: {
    get: () => request('/notifications'),
    readAll: () => request('/notifications/read-all', { method: 'PUT' }),
  },

  settings: {
    get: () => request('/settings'),
    update: (data) => request('/settings', { method: 'PUT', body: JSON.stringify(data) }),
    testEmail: () => request('/settings/test-email', { method: 'POST' }),
  },

  activity: {
    list: () => request('/activity'),
  },

  personalFinance: {
    get: (month) => request(`/personal-finance?month=${month}`),
    createIncome: (data) => request('/personal-finance/income', { method: 'POST', body: JSON.stringify(data) }),
    updateIncome: (id, data) => request(`/personal-finance/income/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteIncome: (id) => request(`/personal-finance/income/${id}`, { method: 'DELETE' }),
    createExpense: (data) => request('/personal-finance/expenses', { method: 'POST', body: JSON.stringify(data) }),
    updateExpense: (id, data) => request(`/personal-finance/expenses/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    toggleExpense: (id) => request(`/personal-finance/expenses/${id}/toggle`, { method: 'PUT' }),
    deleteExpense: (id) => request(`/personal-finance/expenses/${id}`, { method: 'DELETE' }),
    createFixedCost: (data) => request('/personal-finance/fixed-costs', { method: 'POST', body: JSON.stringify(data) }),
    updateFixedCost: (id, data) => request(`/personal-finance/fixed-costs/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteFixedCost: (id) => request(`/personal-finance/fixed-costs/${id}`, { method: 'DELETE' }),
  },
}

export default api
