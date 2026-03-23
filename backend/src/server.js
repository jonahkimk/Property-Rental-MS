require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const helmet    = require('helmet');
const morgan    = require('morgan');
const rateLimit = require('express-rate-limit');

// Bootstrap DB connection
require('./config/db');

// Route imports
const authRoutes         = require('./routes/auth.routes');
const userRoutes         = require('./routes/user.routes');
const propertyRoutes     = require('./routes/property.routes');
const unitRoutes         = require('./routes/unit.routes');
const tenantRoutes       = require('./routes/tenant.routes');
const utilityRoutes      = require('./routes/utility.routes');
const invoiceRoutes      = require('./routes/invoice.routes');
const paymentRoutes      = require('./routes/payment.routes');
const ticketRoutes       = require('./routes/ticket.routes');
const messageRoutes      = require('./routes/message.routes');
const notificationRoutes = require('./routes/notification.routes');
const maintenanceRoutes  = require('./routes/maintenance.routes');
const reportRoutes       = require('./routes/report.routes');
const dashboardRoutes    = require('./routes/dashboard.routes');
const visitorRoutes      = require('./routes/visitor.routes');

const app  = express();
const PORT = process.env.PORT || 5000;

// ── Security ─────────────────────────────────────────────────
app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));
app.use(cors({
  origin: (origin, callback) => {
    // allow non-browser requests with no Origin header
    if (!origin) return callback(null, true);

    const allowed = new Set([
      'https://rms-frontend-uo3t.onrender.com',
      'https://property-rental-ms.vercel.app',
      'http://localhost:5173',
    ]);

    // Some deployments can include a trailing slash in Origin.
    const normalized = origin.replace(/\/+$/, '');
    return allowed.has(normalized) ? callback(null, true) : callback(null, false);
  },
  credentials: true,
}));

// ── Rate limiting ─────────────────────────────────────────────
app.use('/api', rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      200,
  message:  { error: 'Too many requests. Please slow down.' },
}));

// ── Body parsing ──────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── XSS sanitization ─────────────────────────────────────────
const xss = require('xss');

app.use((req, res, next) => {
  const isPlainObject = (v) =>
    Object.prototype.toString.call(v) === '[object Object]';

  const sanitizeClone = (value) => {
    if (typeof value === 'string') return xss(value);
    if (Array.isArray(value)) return value.map(sanitizeClone);
    if (value && typeof value === 'object') {
      // Avoid breaking non-plain objects (Date, Buffer, etc).
      if (!isPlainObject(value)) return value;

      const out = {};
      Object.keys(value).forEach((key) => {
        out[key] = sanitizeClone(value[key]);
      });
      return out;
    }
    return value;
  };

  // Preserve original request values for debugging/auditing.
  req._xssOriginal = {
    body: req.body,
    query: req.query,
    params: req.params,
  };

  // Sanitize by replacing with cloned sanitized objects (no in-place mutation).
  req.body = sanitizeClone(req.body);
  req.query = sanitizeClone(req.query);
  req.params = sanitizeClone(req.params);
  next();
});

// ── Logging ───────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'production') app.use(morgan('dev'));

// ── Health check ──────────────────────────────────────────────
app.get('/api/health', (_, res) =>
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
);

// ── Routes ────────────────────────────────────────────────────
app.use('/api/auth',          authRoutes);
app.use('/api/users',         userRoutes);
app.use('/api/properties',    propertyRoutes);
app.use('/api/units',         unitRoutes);
app.use('/api/tenants',       tenantRoutes);
app.use('/api/utilities',     utilityRoutes);
app.use('/api/invoices',      invoiceRoutes);
app.use('/api/payments',      paymentRoutes);
app.use('/api/tickets',       ticketRoutes);
app.use('/api/messages',      messageRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/maintenance',   maintenanceRoutes);
app.use('/api/reports',       reportRoutes);
app.use('/api/visitors',      visitorRoutes);
app.use('/api',               dashboardRoutes);   // /api/tenant/dashboard, /api/landlord/dashboard, etc.

// ── 404 ───────────────────────────────────────────────────────
app.use((req, res) =>
  res.status(404).json({ error: `Route ${req.method} ${req.originalUrl} not found` })
);

// ── Global error handler ──────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error',
  });
});

app.listen(PORT, () => {
  console.log(`🚀  Server → http://localhost:${PORT}`);
  console.log(`🌍  Mode   → ${process.env.NODE_ENV || 'development'}`);

  // Start daily overdue invoice + penalty job
  const { scheduleOverdueJob } = require('./jobs/overdueJob');
  scheduleOverdueJob();
  console.log('📅  Overdue invoice job scheduled (runs daily)');

  const { keepAlive } = require('./jobs/keepAlive');
  const keepAliveStarted = keepAlive();
  if (keepAliveStarted) {
    console.log('♻️  Keep-alive job started');
  } else if (process.env.NODE_ENV === 'production') {
    console.warn('♻️  Keep-alive job not started: set RENDER_BACKEND_URL in production.');
  }
});