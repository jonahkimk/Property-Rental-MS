import { format, parseISO, isValid } from 'date-fns';

// ── Currency ─────────────────────────────────────────────────
export const formatKES = (amount) => {
  if (amount === null || amount === undefined) return 'KSH 0';
  return `KSH ${Number(amount).toLocaleString('en-KE', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
};

// ── Dates ────────────────────────────────────────────────────
export const formatDate = (dateStr, fmt = 'dd MMM yyyy') => {
  if (!dateStr) return '—';
  try {
    const d = typeof dateStr === 'string' ? parseISO(dateStr) : new Date(dateStr);
    return isValid(d) ? format(d, fmt) : '—';
  } catch { return '—'; }
};

export const formatMonth = (dateStr) => formatDate(dateStr, 'MMMM yyyy');

export const formatDateTime = (dateStr) => formatDate(dateStr, 'dd MMM yyyy, HH:mm');

// ── Billing month for API (first of month) ───────────────────
export const toBillingMonth = (year, month) =>
  `${year}-${String(month).padStart(2, '0')}-01`;

// ── Status badge class helper ────────────────────────────────
export const statusBadge = (status) => {
  const map = {
    paid:        'badge-paid',
    pending:     'badge-pending',
    overdue:     'badge-overdue',
    partial:     'badge-partial',
    open:        'badge-open',
    in_progress: 'badge-in_progress',
    resolved:    'badge-resolved',
    closed:      'badge-closed',
    scheduled:   'badge-blue',
    completed:   'badge-green',
    cancelled:   'badge-gray',
  };
  return map[status] || 'badge-gray';
};

// ── Capitalise first letter ──────────────────────────────────
export const cap = (str) =>
  str ? str.charAt(0).toUpperCase() + str.slice(1).replace(/_/g, ' ') : '';

// ── Truncate text ────────────────────────────────────────────
export const truncate = (str, n = 60) =>
  str && str.length > n ? str.slice(0, n) + '…' : str;

// ── API error message extractor ──────────────────────────────
export const apiError = (err) =>
  err?.response?.data?.error ||
  err?.response?.data?.message ||
  err?.message ||
  'Something went wrong. Please try again.';