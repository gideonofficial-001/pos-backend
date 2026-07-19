import axios from 'axios'
import { useAuthStore } from '@/store'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api'

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().token
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error),
)

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const message = error.response?.data?.message || error.message || 'An error occurred'

    if (error.response?.status === 401) {
      useAuthStore.getState().clearAuth()
      window.location.href = '/login'
    }

    return Promise.reject({ ...error, message })
  },
)

// Auth API
export const authApi = {
  login: (email: string, password: string, deviceFingerprint: string) =>
    api.post('/auth/login', { email, password, deviceFingerprint }),
  requestDeviceCode: (email: string, deviceFingerprint: string) =>
    api.post('/auth/device/request', { email, deviceFingerprint }),
  verifyDeviceCode: (requestId: string, authorizationCode: string) =>
    api.post('/auth/device/verify', { requestId, authorizationCode }),
  logout: () => api.post('/auth/logout'),
}

// Users API
export const usersApi = {
  getAll: () => api.get('/users'),
  getById: (id: string) => api.get(`/users/${id}`),
  create: (data: any) => api.post('/users', data),
  update: (id: string, data: any) => api.patch(`/users/${id}`, data),
  delete: (id: string, confirmationText: string) =>
    api.delete(`/users/${id}?confirmation=${encodeURIComponent(confirmationText)}`),
  getStats: () => api.get('/users/stats'),
}

// Branches API
export const branchesApi = {
  getAll: () => api.get('/branches'),
  getById: (id: string) => api.get(`/branches/${id}`),
  create: (data: any) => api.post('/branches', data),
  update: (id: string, data: any) => api.patch(`/branches/${id}`, data),
  toggleStatus: (id: string) => api.patch(`/branches/${id}/toggle-status`),
  getInventory: (id: string) => api.get(`/branches/${id}/inventory`),
  getSales: (id: string, startDate?: string, endDate?: string) =>
    api.get(`/branches/${id}/sales`, { params: { startDate, endDate } }),
}

// Products API
export const productsApi = {
  getAll: (params?: any) => api.get('/products', { params }),
  getById: (id: string) => api.get(`/products/${id}`),
  create: (data: any) => api.post('/products', data),
  update: (id: string, data: any) => api.patch(`/products/${id}`, data),
  delete: (id: string) => api.delete(`/products/${id}`),
  toggleStatus: (id: string) => api.patch(`/products/${id}/toggle`),
  getCategories: () => api.get('/products/categories'),
  createCategory: (name: string, description?: string) =>
    api.post('/products/categories', { name, description }),
  deleteCategory: (id: string) => api.delete(`/products/categories/${id}`),
}

// Inventory API
export const inventoryApi = {
  getAll: (params?: any) => api.get('/inventory', { params }),
  getById: (id: string) => api.get(`/inventory/${id}`),
  restock: (id: string, quantity: number) => api.post(`/inventory/${id}/restock`, { quantity }),
  adjustStock: (id: string, payload: { quantity?: number; fullCylinders?: number; emptyCylinders?: number; reason: string }) =>
    api.post(`/inventory/${id}/adjust`, payload),
  getLowStock: () => api.get('/inventory/low-stock'),
  getMovements: (params?: any) => api.get('/inventory/movements', { params }),
}


// Customers API
export const customersApi = {
  getAll: (params?: any) => api.get('/customers', { params }),
  getById: (id: string) => api.get(`/customers/${id}`),
  create: (data: any) => api.post('/customers', data),
  update: (id: string, data: any) => api.patch(`/customers/${id}`, data),
  toggleStatus: (id: string) => api.patch(`/customers/${id}/toggle`),
  getOutstandingBalances: () => api.get('/customers/outstanding-balances'),
}

// Sales API
export const salesApi = {
  getAll: (params?: any) => api.get('/sales', { params }),
  getById: (id: string) => api.get(`/sales/${id}`),
  getByCode: (code: string) => api.get(`/sales/code/${code}`),
  create: (data: any) => api.post('/sales', data),
  getWeekly: (year?: number, week?: number) => api.get('/sales/weekly', { params: { year, week } }),
}

// Invoices API
export const invoicesApi = {
  getAll: (params?: any) => api.get('/invoices', { params }),
  getById: (id: string) => api.get(`/invoices/${id}`),
  create: (data: any) => api.post('/invoices', data),
  updateStatus: (id: string, status: string) => api.patch(`/invoices/${id}/status`, { status }),
  getSummary: () => api.get('/invoices/summary'),
  getOverdue: () => api.get('/invoices/overdue'),
}

// Returns API
export const returnsApi = {
  getAll: (params?: any) => api.get('/returns', { params }),
  getById: (id: string) => api.get(`/returns/${id}`),
  create: (data: any) => api.post('/returns', data),
  approve: (id: string) => api.patch(`/returns/${id}/approve`),
  reject: (id: string, rejectionReason: string) => api.patch(`/returns/${id}/reject`, { rejectionReason }),
}

// Expenses API
export const expensesApi = {
  getAll: (params?: any) => api.get('/expenses', { params }),
  getById: (id: string) => api.get(`/expenses/${id}`),
  create: (data: any) => api.post('/expenses', data),
  approve: (id: string) => api.patch(`/expenses/${id}/approve`),
  reject: (id: string, rejectionReason: string) => api.patch(`/expenses/${id}/reject`, { rejectionReason }),
}

// Transfers API
export const transfersApi = {
  getAll: (params?: any) => api.get('/transfers', { params }),
  getById: (id: string) => api.get(`/transfers/${id}`),
  create: (data: any) => api.post('/transfers', data),
  approve: (id: string) => api.patch(`/transfers/${id}/approve`),
  reject: (id: string, rejectionReason: string) => api.patch(`/transfers/${id}/reject`, { rejectionReason }),
  cancel: (id: string) => api.patch(`/transfers/${id}/cancel`),
}

// Devices API
export const devicesApi = {
  getPending: () => api.get('/devices/pending'),
  getAll: () => api.get('/devices'),
  approve: (id: string) => api.post(`/devices/${id}/approve`),
  revoke: (id: string) => api.patch(`/devices/${id}/revoke`),
}

// Notifications API
export const notificationsApi = {
  getAll: () => api.get('/notifications'),
  getUnreadCount: () => api.get('/notifications/unread-count'),
  getPendingApprovals: () => api.get('/notifications/pending-approvals'),
  markAsRead: (id: string) => api.patch(`/notifications/${id}/read`),
  markAllAsRead: () => api.patch('/notifications/read-all'),
}

// Audit Logs API
export const auditLogsApi = {
  getAll: (params?: any) => api.get('/audit-logs', { params }),
  getStats: () => api.get('/audit-logs/stats'),
}

// Reports API
export const reportsApi = {
  getDashboardStats: () => api.get('/reports/dashboard'),
  getSalesTrend: (days?: number) => api.get('/reports/sales-trend', { params: { days } }),
  getBranchPerformance: () => api.get('/reports/branch-performance'),
  getProductPerformance: () => api.get('/reports/product-performance'),
  getExpenseReport: (startDate?: string, endDate?: string) =>
    api.get('/reports/expenses', { params: { startDate, endDate } }),
  getInventoryValuation: () => api.get('/reports/inventory-valuation'),
}

// Activity Feed API
export const activityFeedApi = {
  getAll: () => api.get('/activity-feed'),
  getRecent: (limit?: number) => api.get('/activity-feed/recent', { params: { limit } }),
}

export default api
