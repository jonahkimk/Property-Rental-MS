import { useState, useEffect, useRef } from 'react';
import Sidebar from '../../components/common/Sidebar';
import TopBar from '../../components/common/TopBar';
import Modal from '../../components/common/Modal';
import EmptyState from '../../components/common/EmptyState';
import api from '../../api/axios';
import { formatDateTime, apiError } from '../../utils/helpers';
import { MessageSquare, Plus, Loader2, Send, ArrowLeft, User } from 'lucide-react';
import toast from 'react-hot-toast';

export default function TenantMessages() {
  const [threads,       setThreads]       = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [activeThread,  setActiveThread]  = useState(null);
  const [threadMsgs,    setThreadMsgs]    = useState([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [modal,         setModal]         = useState(false);
  const [saving,        setSaving]        = useState(false);
  const [replyText,     setReplyText]     = useState('');
  const [subject,       setSubject]       = useState('');
  const [body,          setBody]          = useState('');
  const bottomRef = useRef(null);

  const loadThreads = () => {
    setLoading(true);
    api.get('/messages/my')
      .then(r => setThreads(r.data.data || []))
      .catch(e => toast.error(apiError(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadThreads(); }, []);

  useEffect(() => {
    if (threadMsgs.length) {
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }
  }, [threadMsgs]);

  const openThread = async (thread) => {
    setActiveThread(thread);
    setReplyText('');
    setThreadLoading(true);
    try {
      const r = await api.get(`/messages/${thread.id}/thread`);
      setThreadMsgs(r.data.data || []);
      loadThreads();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setThreadLoading(false);
    }
  };

  const handleSend = async () => {
    if (!body.trim()) { toast.error('Message body is required.'); return; }
    setSaving(true);
    try {
      await api.post('/messages', { subject, body });
      toast.success('Message sent!');
      setModal(false);
      setSubject('');
      setBody('');
      loadThreads();
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
      await api.post(`/messages/${activeThread.id}/reply`, { body: replyText });
      setReplyText('');
      const r = await api.get(`/messages/${activeThread.id}/thread`);
      setThreadMsgs(r.data.data || []);
      loadThreads();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const totalUnread = threads.reduce((s, t) => s + Number(t.unread_replies || 0), 0);

  return (
    <div className="page-wrapper">
      <Sidebar />
      <div className="page-content">
        <TopBar title="Messages" subtitle="Conversations with your landlord" />
        <div className="page-inner">
          <div className="flex gap-5 h-[calc(100vh-160px)] min-h-[400px]">

            {/* ── Left: thread list ─────────────────────────── */}
            <div className={`card p-5 flex flex-col overflow-hidden
              ${activeThread ? 'hidden lg:flex lg:w-80 xl:w-96 shrink-0' : 'flex flex-1'}`}>

              <div className="flex items-center justify-between mb-4 shrink-0">
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold text-slate-800 dark:text-white">Conversations</h2>
                  {totalUnread > 0 && (
                    <span className="bg-brand-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                      {totalUnread}
                    </span>
                  )}
                </div>
                <button className="btn-primary text-xs px-3 py-1.5" onClick={() => setModal(true)}>
                  <Plus size={14} /> New
                </button>
              </div>

              <div className="flex-1 overflow-y-auto -mx-5">
                {loading ? (
                  <div className="flex justify-center py-16">
                    <Loader2 className="animate-spin text-brand-500" size={28} />
                  </div>
                ) : threads.length > 0 ? (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {threads.map(t => {
                      const isActive  = activeThread?.id === t.id;
                      const hasUnread = Number(t.unread_replies) > 0;
                      return (
                        <button key={t.id} onClick={() => openThread(t)}
                          className={`w-full text-left px-5 py-4 transition-colors
                            ${isActive
                              ? 'bg-brand-50 dark:bg-brand-900/20'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0
                                ${isActive ? 'bg-brand-100 dark:bg-brand-900/40' : 'bg-slate-100 dark:bg-slate-800'}`}>
                                <User size={14} className={isActive ? 'text-brand-600' : 'text-slate-400'} />
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <p className={`text-sm truncate ${hasUnread
                                    ? 'font-bold text-slate-900 dark:text-white'
                                    : 'font-medium text-slate-700 dark:text-slate-300'}`}>
                                    {t.subject || 'No subject'}
                                  </p>
                                  {hasUnread && <span className="w-2 h-2 rounded-full bg-brand-500 shrink-0" />}
                                </div>
                                <p className="text-xs text-slate-400 truncate mt-0.5">
                                  <span className="font-medium">{t.latest_sender}:</span> {t.latest_body}
                                </p>
                              </div>
                            </div>
                            <div className="shrink-0 text-right">
                              <p className="text-xs text-slate-400 whitespace-nowrap">
                                {formatDateTime(t.latest_at)}
                              </p>
                              {Number(t.reply_count) > 0 && (
                                <p className="text-xs text-slate-400 mt-1">
                                  {t.reply_count} {Number(t.reply_count) === 1 ? 'reply' : 'replies'}
                                </p>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="px-5">
                    <EmptyState icon={MessageSquare} title="No conversations yet"
                      description="Send a message to your landlord to start a conversation."
                      action={
                        <button className="btn-primary" onClick={() => setModal(true)}>
                          <Plus size={15} /> New Message
                        </button>
                      } />
                  </div>
                )}
              </div>
            </div>

            {/* ── Right: active thread ──────────────────────── */}
            {activeThread ? (
              <div className="card p-5 flex flex-col flex-1 overflow-hidden">

                {/* Thread header */}
                <div className="flex items-center gap-3 pb-4 mb-4 border-b border-slate-200 dark:border-slate-700 shrink-0">
                  <button className="lg:hidden btn-ghost p-2" onClick={() => setActiveThread(null)}>
                    <ArrowLeft size={16} />
                  </button>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-slate-800 dark:text-white truncate">
                      {activeThread.subject || 'No subject'}
                    </h3>
                    <p className="text-xs text-slate-400">
                      {activeThread.sender_name} → {activeThread.recipient_name || 'Landlord'}
                    </p>
                  </div>
                </div>

                {/* Chat bubbles */}
                <div className="flex-1 overflow-y-auto space-y-3 pr-1 min-h-0">
                  {threadLoading ? (
                    <div className="flex justify-center py-10">
                      <Loader2 className="animate-spin text-brand-500" size={24} />
                    </div>
                  ) : (
                    threadMsgs.map(msg => {
                      const isMine = msg.sender_id === activeThread.sender_id;
                      return (
                        <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed
                            ${isMine
                              ? 'bg-brand-600 text-white rounded-br-sm'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-bl-sm'}`}>
                            <p className={`text-xs font-semibold mb-1
                              ${isMine ? 'text-brand-100' : 'text-slate-500 dark:text-slate-400'}`}>
                              {msg.sender_name}
                            </p>
                            <p className="whitespace-pre-wrap">{msg.body}</p>
                            <p className={`text-xs mt-1.5 text-right
                              ${isMine ? 'text-brand-200' : 'text-slate-400'}`}>
                              {formatDateTime(msg.created_at)}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={bottomRef} />
                </div>

                {/* Reply box */}
                <div className="flex gap-2 pt-4 mt-4 border-t border-slate-200 dark:border-slate-700 shrink-0">
                  <textarea
                    className="input flex-1 min-h-[44px] max-h-[120px] resize-none py-2.5 text-sm"
                    placeholder="Type a reply… (Enter to send, Shift+Enter for new line)"
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleReply(); }
                    }}
                    rows={1}
                  />
                  <button className="btn-primary px-3 self-end h-[44px]"
                    onClick={handleReply}
                    disabled={saving || !replyText.trim()}>
                    {saving ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                  </button>
                </div>
              </div>
            ) : (
              <div className="hidden lg:flex card flex-1 items-center justify-center text-slate-400">
                <div className="text-center space-y-2">
                  <MessageSquare size={40} className="mx-auto opacity-30" />
                  <p className="text-sm">Select a conversation to read</p>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>

      {/* New Message Modal */}
      <Modal open={modal} onClose={() => setModal(false)}
        title="New Message to Landlord"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setModal(false)}>Cancel</button>
            <button className="btn-primary" onClick={handleSend} disabled={saving}>
              {saving ? <><Loader2 size={15} className="animate-spin" /> Sending…</> : <><Send size={15} /> Send</>}
            </button>
          </>
        }>
        <div className="space-y-4">
          <div className="form-group">
            <label className="label">Subject (optional)</label>
            <input className="input" placeholder="e.g. Leaking tap in bathroom"
              value={subject}
              onChange={e => setSubject(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="label">Message *</label>
            <textarea className="input min-h-[120px] resize-none"
              placeholder="Write your message here…"
              value={body}
              onChange={e => setBody(e.target.value)} />
          </div>
        </div>
      </Modal>
    </div>
  );
}