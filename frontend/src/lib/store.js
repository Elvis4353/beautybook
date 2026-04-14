// src/lib/store.js
import { create } from 'zustand';

export const useAuthStore = create((set) => ({
  user: JSON.parse(localStorage.getItem('bb_user') || 'null'),
  token: localStorage.getItem('bb_token'),
  tenantSlug: localStorage.getItem('bb_tenant_slug'),

  setAuth: (user, token, tenantSlug) => {
    localStorage.setItem('bb_token', token);
    localStorage.setItem('bb_user', JSON.stringify(user));
    localStorage.setItem('bb_tenant_slug', tenantSlug);
    set({ user, token, tenantSlug });
  },

  logout: () => {
    localStorage.removeItem('bb_token');
    localStorage.removeItem('bb_user');
    localStorage.removeItem('bb_tenant_slug');
    set({ user: null, token: null, tenantSlug: null });
  },
}));

// Tenant branding store (used for whitelabel rendering)
export const useTenantStore = create((set) => ({
  tenant: null,
  setTenant: (tenant) => {
    // Apply CSS variables dynamically
    if (tenant?.primary_color) {
      document.documentElement.style.setProperty('--color-primary', tenant.primary_color);
    }
    if (tenant?.secondary_color) {
      document.documentElement.style.setProperty('--color-secondary', tenant.secondary_color);
    }
    if (tenant?.font_choice) {
      document.documentElement.style.setProperty('--font-brand', `'${tenant.font_choice}', sans-serif`);
    }
    set({ tenant });
  },
}));
