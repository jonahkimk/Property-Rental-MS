import { useState, useEffect } from 'react';
import Sidebar from '../../components/common/Sidebar';
import TopBar from '../../components/common/TopBar';
import Modal from '../../components/common/Modal';
import EmptyState from '../../components/common/EmptyState';
import api from '../../api/axios';
import { formatDate, statusBadge, apiError, cap } from '../../utils/helpers';
import { Ticket, Loader2, MessageSquare, Send, CheckCircle2, Clock } from 'lucide-react';
import toast from 'react-hot-toast';

const STATUSES      = ['all', 'open', 'in_progress', 'resolved', 'closed'];
const PRIORITIES    = ['all', 'urgent', 'high', 'normal', 'low'];
const CLOSED_DAYS   = 14; // hide closed tickets from landlord view after 2 weeks

const isExpiredTicket = (ticket) => {
  if (ticket.status !== 'closed' && ticket.status !== 'resolved') return false;
  const updated  = new Date(ticket.updated_at || ticket.created_at);
  const diffDays = (Date.now() - updated.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays > CLOSED_DAYS;
};

export default function LandlordRequests() {
  const [tickets, setTickets]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [selected, setSelected]   = useState(null);
  const [replies, setReplies]     = useState([]);
  const [replyText, setReplyText] = useState('');
  const [saving, setSaving]       = useState(false);
  const [filterStatus, setFilterStatus]   = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');

  const load = () => {
    setLoading(true);
    api.get('/tickets')
      .then(r => setTickets(r.data.data || []))
      .catch(e => toast.error(apiError(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openTicket = async (ticket) => {
    setSelected(ticket);
    setReplyText('');
    try {
      const r = await api.get(`/tickets/${ticket.id}/replies`);
      setReplies(r.data.data || []);
    } catch { setReplies([]); }
  };

  const handleReply = async () => {
    if (!replyText.trim()) return;
    setSaving(true);
    try {
      await api.post(`/tickets/${selected.id}/replies`, { message: replyText });
      const r = await api.get(`/tickets/${selected.id}/replies`);
      setReplies(r.data.data || []);
      setReplyText('');
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const handleStatus = async (ticketId, status) => {
    try {
      await api.patch(`/tickets/${ticketId}/status`, { status });
      toast.success(`Ticket marked as ${status}`);
      load();
      if (selected?.id === ticketId) setSelected(p => ({ ...p, status }));
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  // Auto-hide closed/resolved tickets older than CLOSED_DAYS
  // Unless the landlord explicitly filters for 'closed' or 'resolved'
  const showingExpired = filterStatus === 'closed' || filterStatus === 'resolved';
  const hiddenCount    = tickets.filter(t =>
    isExpiredTicket(t) &&
    (filterStatus === 'all' || t.status === filterStatus) &&
    (filterPriority === 'all' || t.priority === filterPriority)
  ).length;

  const filtered = tickets.filter(t => {
    if (filterStatus   !== 'all' && t.status   !== filterStatus)   return false;
    if (filterPriority !== 'all' && t.priority !== filterPriority) return false;
    if (!showingExpired && isExpiredTicket(t))                      return false;
    return true;
  });

  return (
    <div className="page-wrapper">
      <Sidebar />
      <div className="page-content">
        <TopBar title="Tenant Requests" subtitle="View and respond to tenant tickets" />
        <div className="page-inner space-y-5">

          {/* Filters */}
          <div className="flex flex-wrap gap-3">
            <div className="form-group mb-0">
              <label className="label">Status</label>
              <select className="input w-full sm:w-36" value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}>
                {STATUSES.map(s => <option key={s} value={s}>{cap(s)}</option>)}
              </select>
            </div>
            <div className="form-group mb-0">
              <label className="label">Priority</label>
              <select className="input w-full sm:w-36" value={filterPriority}
                onChange={e => setFilterPriority(e.target.value)}>
                {PRIORITIES.map(p => <option key={p} value={p}>{cap(p)}</option>)}
              </select>
            </div>
            <div className="self-end w-full sm:w-auto sm:ml-auto flex items-center gap-3 justify-between sm:justify-start">
              <span className="text-sm text-slate-400">
                {filtered.length} ticket{filtered.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>

          {/* Hidden tickets banner */}
          {hiddenCount > 0 && !showingExpired && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl
                            bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700
                            text-xs text-slate-500 dark:text-slate-400">
              <Clock size={14} className="shrink-0 text-slate-400" />
              <span>
                <strong>{hiddenCount}</strong> closed/resolved ticket{hiddenCount !== 1 ? 's' : ''} older
                than {CLOSED_DAYS} days {hiddenCount !== 1 ? 'are' : 'is'} hidden.
                Filter by <strong>Closed</strong> or <strong>Resolved</strong> to see them.
              </span>
            </div>
          )}

          <div className="card p-5">
            {loading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="animate-spin text-brand-500" size={32} />
              </div>
            ) : filtered.length > 0 ? (
              <div className="table-wrap">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th className="th">Tenant</th>
                      <th className="th">Unit</th>
                      <th className="th">Subject</th>
                      <th className="th">Category</th>
                      <th className="th">Priority</th>
                      <th className="th">Status</th>
                      <th className="th">Date</th>
                      <th className="th">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(t => (
                      <tr key={t.id} className="tr-hover">
                        <td className="td font-medium">{t.tenant_name}</td>
                        <td className="td">{t.unit_number}</td>
                        <td className="td max-w-[160px] truncate">{t.subject}</td>
                        <td className="td capitalize">{t.category}</td>
                        <td className="td">
                          <span className={`badge ${
                            t.priority === 'urgent' ? 'badge-red'    :
                            t.priority === 'high'   ? 'badge-yellow' : 'badge-gray'
                          }`}>{t.priority}</span>
                        </td>
                        <td className="td">
                          <span className={`badge ${statusBadge(t.status)}`}>{cap(t.status)}</span>
                        </td>
                        <td className="td">{formatDate(t.created_at)}</td>
                        <td className="td">
                          <div className="flex gap-1.5">
                            <button className="btn-ghost text-xs px-2 py-1"
                              onClick={() => openTicket(t)}>
                              <MessageSquare size={13} /> Reply
                            </button>
                            {t.status !== 'resolved' && t.status !== 'closed' && (
                              <button className="btn-ghost text-xs px-2 py-1 text-emerald-600
                                                 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                                onClick={() => handleStatus(t.id, 'resolved')}>
                                <CheckCircle2 size={13} /> Resolve
                              </button>
                            )}
                            {t.status !== 'closed' && (
                              <button className="btn-ghost text-xs px-2 py-1 text-slate-400"
                                onClick={() => handleStatus(t.id, 'closed')}>
                                Close
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState icon={Ticket} title="No tickets found"
                description="No tickets match the current filters." />
            )}
          </div>
        </div>
      </div>

      {/* Ticket Detail + Reply Modal */}
      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.subject || 'Ticket'}
        size="lg"
      >
        {selected && (
          <div className="space-y-4">
            {/* Meta */}
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="text-slate-400">From:</span>
              <strong className="text-slate-700 dark:text-slate-300">{selected.tenant_name}</strong>
              <span className="text-slate-400">· Unit {selected.unit_number}</span>
              <span className="text-slate-400">· {formatDate(selected.created_at)}</span>
            </div>

            {/* Badges */}
            <div className="flex gap-2 flex-wrap">
              <span className={`badge ${statusBadge(selected.status)}`}>{cap(selected.status)}</span>
              <span className="badge badge-gray capitalize">{selected.category}</span>
              <span className={`badge ${
                selected.priority === 'urgent' ? 'badge-red' :
                selected.priority === 'high'   ? 'badge-yellow' : 'badge-gray'
              }`}>{selected.priority}</span>
            </div>

            {/* Description */}
            <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4 text-sm
                            text-slate-700 dark:text-slate-300 leading-relaxed">
              {selected.description}
            </div>

            {/* Status actions */}
            <div className="flex gap-2">
              {selected.status !== 'in_progress' && selected.status !== 'closed' && (
                <button className="btn-secondary text-xs"
                  onClick={() => handleStatus(selected.id, 'in_progress')}>
                  Mark In Progress
                </button>
              )}
              {selected.status !== 'resolved' && selected.status !== 'closed' && (
                <button className="btn-success text-xs"
                  onClick={() => handleStatus(selected.id, 'resolved')}>
                  <CheckCircle2 size={13} /> Mark Resolved
                </button>
              )}
              {selected.status !== 'closed' && (
                <button className="btn-ghost text-xs text-slate-400"
                  onClick={() => handleStatus(selected.id, 'closed')}>
                  Close Ticket
                </button>
              )}
            </div>

            {/* Replies */}
            <div>
              <p className="label mb-2">Conversation</p>
              <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                {replies.length > 0 ? replies.map(r => (
                  <div key={r.id} className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800 text-sm">
                    <p className="font-semibold text-xs text-slate-500 dark:text-slate-400 mb-1">
                      {r.sender_name} · {formatDate(r.created_at)}
                    </p>
                    <p className="text-slate-700 dark:text-slate-300">{r.message}</p>
                  </div>
                )) : (
                  <p className="text-sm text-slate-400 text-center py-4">No replies yet.</p>
                )}
              </div>
            </div>

            {/* Reply input */}
            {selected.status !== 'closed' && (
              <div className="flex gap-2">
                <input className="input flex-1" placeholder="Write a reply…"
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleReply(); }}
                />
                <button className="btn-primary px-3" onClick={handleReply} disabled={saving || !replyText.trim()}>
                  {saving ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}