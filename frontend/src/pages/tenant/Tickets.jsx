import { useState, useEffect } from 'react';
import Sidebar from '../../components/common/Sidebar';
import TopBar from '../../components/common/TopBar';
import Modal from '../../components/common/Modal';
import EmptyState from '../../components/common/EmptyState';
import api from '../../api/axios';
import { formatDate, statusBadge, apiError, cap } from '../../utils/helpers';
import { Ticket, Plus, Loader2, MessageSquare, Send, Clock } from 'lucide-react';
import toast from 'react-hot-toast';

const CATEGORIES    = ['plumbing','electrical','security','cleaning','general','other'];
const PRIORITIES    = ['low','normal','high','urgent'];
const CLOSED_DAYS   = 30; // hide closed/resolved tickets older than this

const isExpiredTicket = (ticket) => {
  if (ticket.status !== 'closed' && ticket.status !== 'resolved') return false;
  const updated = new Date(ticket.updated_at || ticket.created_at);
  const diffDays = (Date.now() - updated.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays > CLOSED_DAYS;
};

export default function TenantTickets() {
  const [tickets, setTickets]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [newModal, setNewModal] = useState(false);
  const [viewModal, setViewModal] = useState(false);
  const [selected, setSelected] = useState(null);
  const [replies, setReplies]   = useState([]);
  const [replyText, setReplyText] = useState('');
  const [saving, setSaving]     = useState(false);
  const [form, setForm]         = useState({
    subject: '', description: '', category: 'general', priority: 'normal',
  });

  const load = () => {
    setLoading(true);
    api.get('/tickets/my')
      .then(r => setTickets(r.data.data || []))
      .catch(e => toast.error(apiError(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openView = async (ticket) => {
    setSelected(ticket);
    setViewModal(true);
    setReplyText('');
    try {
      const r = await api.get(`/tickets/${ticket.id}/replies`);
      setReplies(r.data.data || []);
    } catch { setReplies([]); }
  };

  const handleSubmit = async () => {
    if (!form.subject.trim() || !form.description.trim()) {
      toast.error('Subject and description are required.');
      return;
    }
    setSaving(true);
    try {
      await api.post('/tickets', form);
      toast.success('Ticket submitted successfully!');
      setNewModal(false);
      setForm({ subject: '', description: '', category: 'general', priority: 'normal' });
      load();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
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

  const visibleTickets = tickets.filter(t => !isExpiredTicket(t));
  const hiddenCount    = tickets.length - visibleTickets.length;

  return (
    <div className="page-wrapper">
      <Sidebar />
      <div className="page-content">
        <TopBar title="Request Tickets" subtitle="Submit and track your maintenance requests" />
        <div className="page-inner space-y-5">

          <div className="flex justify-end">
            <button className="btn-primary" onClick={() => setNewModal(true)}>
              <Plus size={16} /> New Ticket
            </button>
          </div>

          {/* Hidden tickets info banner */}
          {hiddenCount > 0 && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl
                            bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700
                            text-xs text-slate-500 dark:text-slate-400">
              <Clock size={14} className="shrink-0 text-slate-400" />
              <span>
                <strong>{hiddenCount}</strong> closed ticket{hiddenCount !== 1 ? 's' : ''} older
                than {CLOSED_DAYS} days {hiddenCount !== 1 ? 'are' : 'is'} hidden.
                They are still saved on our system.
              </span>
            </div>
          )}

          <div className="card p-5">
            {loading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="animate-spin text-brand-500" size={32} />
              </div>
            ) : visibleTickets.length > 0 ? (
              <div className="table-wrap">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th className="th">Subject</th>
                      <th className="th">Category</th>
                      <th className="th">Priority</th>
                      <th className="th">Status</th>
                      <th className="th">Submitted</th>
                      <th className="th">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleTickets.map(t => (
                      <tr key={t.id} className="tr-hover">
                        <td className="td font-medium max-w-[200px] truncate">{t.subject}</td>
                        <td className="td capitalize">{t.category}</td>
                        <td className="td">
                          <span className={`badge ${
                            t.priority === 'urgent' ? 'badge-red' :
                            t.priority === 'high'   ? 'badge-yellow' :
                            'badge-gray'
                          }`}>{t.priority}</span>
                        </td>
                        <td className="td">
                          <span className={`badge ${statusBadge(t.status)}`}>{cap(t.status)}</span>
                        </td>
                        <td className="td">{formatDate(t.created_at)}</td>
                        <td className="td">
                          <button
                            onClick={() => openView(t)}
                            className="btn-ghost text-xs px-2 py-1"
                          >
                            <MessageSquare size={13} /> View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                icon={Ticket}
                title={tickets.length > 0 ? 'All caught up!' : 'No tickets yet'}
                description={
                  tickets.length > 0
                    ? `Your ${hiddenCount} closed ticket${hiddenCount !== 1 ? 's' : ''} have been automatically hidden after ${CLOSED_DAYS} days.`
                    : 'Submit a ticket to report any issues with your unit.'
                }
                action={
                  <button className="btn-primary" onClick={() => setNewModal(true)}>
                    <Plus size={15} /> Submit Ticket
                  </button>
                }
              />
            )}
          </div>
        </div>
      </div>

      {/* New Ticket Modal */}
      <Modal
        open={newModal}
        onClose={() => setNewModal(false)}
        title="Submit New Ticket"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setNewModal(false)}>Cancel</button>
            <button className="btn-primary" onClick={handleSubmit} disabled={saving}>
              {saving ? <><Loader2 size={15} className="animate-spin" /> Submitting…</> : 'Submit Ticket'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="form-group">
            <label className="label">Subject</label>
            <input className="input" placeholder="Brief description of the issue"
              value={form.subject}
              onChange={e => setForm(p => ({ ...p, subject: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="form-group">
              <label className="label">Category</label>
              <select className="input" value={form.category}
                onChange={e => setForm(p => ({ ...p, category: e.target.value }))}>
                {CATEGORIES.map(c => <option key={c} value={c}>{cap(c)}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="label">Priority</label>
              <select className="input" value={form.priority}
                onChange={e => setForm(p => ({ ...p, priority: e.target.value }))}>
                {PRIORITIES.map(p => <option key={p} value={p}>{cap(p)}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="label">Description</label>
            <textarea className="input min-h-[100px] resize-none" placeholder="Describe the issue in detail"
              value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
          </div>
        </div>
      </Modal>

      {/* View Ticket + Replies Modal */}
      <Modal
        open={viewModal}
        onClose={() => setViewModal(false)}
        title={selected?.subject || 'Ticket'}
        size="lg"
      >
        {selected && (
          <div className="space-y-4">
            <div className="flex gap-3 flex-wrap">
              <span className={`badge ${statusBadge(selected.status)}`}>{cap(selected.status)}</span>
              <span className="badge badge-gray capitalize">{selected.category}</span>
              <span className={`badge ${selected.priority === 'urgent' ? 'badge-red' : selected.priority === 'high' ? 'badge-yellow' : 'badge-gray'}`}>
                {selected.priority}
              </span>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 rounded-lg p-3">
              {selected.description}
            </p>

            {/* Replies */}
            <div>
              <p className="label mb-2">Replies</p>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {replies.length > 0 ? replies.map(r => (
                  <div key={r.id} className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800 text-sm">
                    <p className="font-semibold text-slate-700 dark:text-slate-300 text-xs mb-1">
                      {r.sender_name} · {formatDate(r.created_at)}
                    </p>
                    <p className="text-slate-600 dark:text-slate-400">{r.message}</p>
                  </div>
                )) : (
                  <p className="text-sm text-slate-400 py-4 text-center">No replies yet.</p>
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
                <button className="btn-primary px-3" onClick={handleReply} disabled={saving}>
                  <Send size={15} />
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}