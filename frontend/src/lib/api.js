// src/lib/api.js
import axios from 'axios';

const BASE_URL = 'https://beautybook-production-2170.up.railway.app/api';

export const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Attach auth token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('bb_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  const tenantSlug = localStorage.getItem('bb_tenant_slug');
  if (tenantSlug) config.headers['x-tenant-slug'] = tenantSlug;
  return config;
});

// Handle 401
api.interceptors.response.use(
  (r) => r,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('bb_token');
      localStorage.removeItem('bb_tenant_slug');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// ─── Auth ─────────────────────────────────────────────────────────────────
export const login = (data) => api.post('/auth/login', data).then(r => r.data);
export const registerTenant = (data) => api.post('/auth/register-tenant', data).then(r => r.data);

// ─── Tenant ───────────────────────────────────────────────────────────────
export const getTenant = () => api.get('/tenant').then(r => r.data);
export const updateBranding = (data) => api.patch('/tenant/branding', data).then(r => r.data);
export const updateIntegrations = (data) => api.patch('/tenant/integrations', data).then(r => r.data);

// ─── Appointments ─────────────────────────────────────────────────────────
export const getAppointments = (params) => api.get('/appointments', { params }).then(r => r.data);
export const createAppointment = (data) => api.post('/appointments', data).then(r => r.data);
export const updateAppointment = (id, data) => api.patch(`/appointments/${id}`, data).then(r => r.data);

// ─── Clients ──────────────────────────────────────────────────────────────
export const getClients = (params) => api.get('/clients', { params }).then(r => r.data);
export const getClient = (id) => api.get(`/clients/${id}`).then(r => r.data);
export const createClient = (data) => api.post('/clients', data).then(r => r.data);

// ─── Services & Staff ─────────────────────────────────────────────────────
export const getServices = () => api.get('/services').then(r => r.data);
export const createService = (data) => api.post('/services', data).then(r => r.data);
export const getStaff = () => api.get('/staff').then(r => r.data);
export const createStaff = (data) => api.post('/staff', data).then(r => r.data);
export const getSalons = () => api.get('/salons').then(r => r.data);

// ─── Messaging ────────────────────────────────────────────────────────────
export const sendWhatsApp = (data) => api.post('/messages/send-whatsapp', data).then(r => r.data);
export const sendEmail = (data) => api.post('/messages/send-email', data).then(r => r.data);

// ─── Campaigns ────────────────────────────────────────────────────────────
export const getCampaigns = () => api.get('/campaigns').then(r => r.data);
export const createCampaign = (data) => api.post('/campaigns', data).then(r => r.data);
export const sendCampaign = (id) => api.post(`/campaigns/${id}/send`).then(r => r.data);

// ─── Credits ─────────────────────────────────────────────────────────────
export const getCredits = () => api.get('/credits').then(r => r.data);

// ─── Stats ────────────────────────────────────────────────────────────────
export const getStats = (params) => api.get('/stats/overview', { params }).then(r => r.data);

// ─── Public booking ───────────────────────────────────────────────────────
export const getPublicTenant = (slug) => axios.get(`${BASE_URL}/public/tenant/${slug}`).then(r => r.data);
export const getSlots = (params) => axios.get(`${BASE_URL}/public/slots`, { params }).then(r => r.data);
export const createBooking = (data) => axios.post(`${BASE_URL}/public/book`, data).then(r => r.data);
