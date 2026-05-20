const BASE_URL = (import.meta.env.VITE_API_URL || '/api')

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
  },

  editorPortal: {
    getDashboard: () => request('/editor/dashboard'),
    getBoard: () => request('/editor/board'),
  },

  orders: {
    listByClient: (clientId) => request(`/clients/${clientId}/orders`),
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
    create: (data) => request('/team', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => request(`/team/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => request(`/team/${id}`, { method: 'DELETE' }),
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

    // Daily records
    upsertDailyRecord: (data) => request('/financial/daily-record', { method: 'PUT', body: JSON.stringify(data) }),
  },

  notifications: {
    get: () => request('/notifications'),
    readAll: () => request('/notifications/read-all', { method: 'PUT' }),
  },

  settings: {
    get: () => request('/settings'),
    update: (data) => request('/settings', { method: 'PUT', body: JSON.stringify(data) }),
  },

  activity: {
    list: () => request('/activity'),
  },
}

export default api
