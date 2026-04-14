// src/middleware/auth.js
const jwt = require('jsonwebtoken');
const { query } = require('../models/db');

// Resolve tenant from custom domain or subdomain
async function resolveTenant(req, res, next) {
  try {
    const host = req.headers['x-forwarded-host'] || req.headers.host || '';
    const tenantSlug = req.headers['x-tenant-slug'] || req.query._tenant;

    let tenant = null;

    if (tenantSlug) {
      const r = await query('SELECT * FROM tenants WHERE slug = $1 AND is_active = true', [tenantSlug]);
      tenant = r.rows[0];
    } else if (host) {
      // Check custom domain first
      const byDomain = await query(
        'SELECT * FROM tenants WHERE custom_domain = $1 AND is_active = true',
        [host.split(':')[0]]
      );
      if (byDomain.rows[0]) {
        tenant = byDomain.rows[0];
      } else {
        // Try subdomain: salon.beautybook.lv
        const subdomain = host.split('.')[0];
        if (subdomain && subdomain !== 'www' && subdomain !== 'app') {
          const bySlug = await query(
            'SELECT * FROM tenants WHERE slug = $1 AND is_active = true',
            [subdomain]
          );
          tenant = bySlug.rows[0];
        }
      }
    }

    req.tenant = tenant;
    next();
  } catch (err) {
    next(err);
  }
}

// Require resolved tenant
function requireTenant(req, res, next) {
  if (!req.tenant) {
    return res.status(404).json({ error: 'Tenant not found' });
  }
  next();
}

// JWT auth
async function authenticate(req, res, next) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'No token provided' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const r = await query(
      'SELECT u.*, t.slug AS tenant_slug FROM users u JOIN tenants t ON u.tenant_id = t.id WHERE u.id = $1 AND u.is_active = true',
      [decoded.userId]
    );

    if (!r.rows[0]) return res.status(401).json({ error: 'User not found' });

    req.user = r.rows[0];
    req.tenantId = r.rows[0].tenant_id;
    if (!req.tenant) req.tenant = { id: req.tenantId };
    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    next(err);
  }
}

// Role-based access
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

module.exports = { resolveTenant, requireTenant, authenticate, requireRole };
