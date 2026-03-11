import { useState, useEffect, useRef, useCallback } from 'react';
import Sidebar from '../../components/common/Sidebar';
import TopBar from '../../components/common/TopBar';
import api from '../../api/axios';
import { formatDateTime, apiError } from '../../utils/helpers';
import {
  MessageSquare, Send, ArrowLeft, Plus, Loader2,
  AlertCircle, Tag, ChevronDown, X, Ticket,
} from 'lucide-react';
import toast from 'react-hot-toast';

const PRIORITIES = ['low', 'normal', 'high', 'urgent'];
const CATEGORIES  = ['general','plumbing','electrical','security','cleaning','other'];

const priorityMeta = {
  low:    { color: 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400',    dot: 'bg-slate-400'   },
  normal: { color: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',      dot: 'bg-blue-400'    },
  high:   { color: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',  dot: 'bg-amber-400'   },
  urgent: { color: 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400',          dot: 'bg-red-500'     },
};

const statusMeta = {
  open:        { color: 'text-blue-600 dark:text-blue-400',    label: 'Open'        },
  in_progress: { color: 'text-amber-600 dark:text-amber-400',  label: 'In Progress' },
  resolved:    { color: 'text-emerald-600 dark:text-emerald-400', label: 'Resolved'  },
  closed:      { color: 'text-slate-400',                       label: 'Closed'      },
};

export default function TenantInbox() {
  const [threads,       setThreads]       = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [activeThread,  setActiveThread]  = useState(null);
  const [threadMsgs,    setThreadMsgs]    = useState([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [replyText,     setReplyText]     = useState('');
  const [sending,       setSending]       = useState(false);
  const [showCompose,   setShowCompose]   = useState(false);
  const [filter,        setFilter]        = useState('all'); // all | message | request
  const bottomRef = useRef(null);

  // Compose form — flat state to prevent typing bugs
  const [cSubject,   setCSubject]   = useState('');
  const [cBody,      setCBody]      = useState('');
  const [cType,      setCType]      = useState('message');
  const [cPriority,  setCPriority]  = useState('normal');
  const [cCategory,  setCCategory]  = useState('general');

  const loadThreads = useCallback(() => {
    setLoading(true);
    api.get('/messages/my')
      .then(r => setThreads(r.data.data || []))
      .catch(e => toast.error(apiError(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadThreads(); }, [loadThreads]);

  useEffect(() => {
    if (threadMsgs.length)
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
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

  const handleSendReply = async () => {
    if (!replyText.trim()) return;
    setSending(true);
    try {
      await api.post(`/messages/${activeThread.id}/reply`, { body: replyText.trim() });
      setReplyText('');
      const r = await api.get(`/messages/${activeThread.id}/thread`);
      setThreadMsgs(r.data.data || []);
      loadThreads();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSending(false);
    }
  };

  const handleCompose = async () => {
    if (!cBody.trim()) { toast.error('Message is required.'); return; }
    setSending(true);
    try {
      await api.post('/messages', {
        subject:      cSubject || undefined,
        body:         cBody.trim(),
        message_type: cType,
        priority:     cType === 'request' ? cPriority : 'normal',
        category:     cType === 'request' ? cCategory : 'general',
      });
      toast.success(cType === 'request' ? 'Request submitted!' : 'Message sent!');
      setShowCompose(false);
      setCSubject(''); setCBody(''); setCType('message');
      setCPriority('normal'); setCCategory('general');
      loadThreads();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSending(false);
    }
  };

  const filtered = threads.filter(t =>
    filter === 'all' ? true :
    filter === 'request' ? t.message_type === 'request' :
    t.message_type === 'message'
  );

  const unreadTotal = threads.reduce((s, t) => s + (t.unread_replies || 0), 0);

  return (
    <div className="page-wrapper">
      <Sidebar />
      <div className="page-content">
        <TopBar title="Inbox"
          subtitle="Messages and requests with your landlord" />
        <div className="page-inner !p-0 flex h-[calc(100vh-64px)]">

          {/* ── Left panel: thread list ─────────────────────── */}
          <div className={`flex flex-col border-r border-slate-200 dark:border-slate-700
                           w-full md:w-80 lg:w-96 shrink-0
                           ${activeThread ? 'hidden md:flex' : 'flex'}`}>

            {/* Header */}
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700
                            flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-800 dark:text-white text-sm">
                  Conversations
                </span>
                {unreadTotal > 0 && (
                  <span className="bg-brand-600 text-white text-xs font-bold
                                   px-1.5 py-0.5 rounded-full leading-none">
                    {unreadTotal}
                  </span>
                )}
              </div>
              <button onClick={() => setShowCompose(true)}
                className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1">
                <Plus size={13} /> New
              </button>
            </div>

            {/* Filter tabs */}
            <div className="flex border-b border-slate-200 dark:border-slate-700">
              {[['all','All'],['message','Messages'],['request','Requests']].map(([v,l]) => (
                <button key={v} onClick={() => setFilter(v)}
                  className={`flex-1 py-2 text-xs font-semibold transition-colors
                    ${filter === v
                      ? 'text-brand-600 border-b-2 border-brand-600'
                      : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>
                  {l}
                </button>
              ))}
            </div>

            {/* Thread list */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700/60">
              {loading ? (
                <div className="flex justify-center py-16">
                  <Loader2 className="animate-spin text-brand-500" size={28} />
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center px-6">
                  <MessageSquare size={32} className="text-slate-300 mb-3" />
                  <p className="text-sm font-medium text-slate-500">No conversations yet</p>
                  <p className="text-xs text-slate-400 mt-1">Start by sending a message or submitting a request</p>
                </div>
              ) : filtered.map(t => {
                const pm   = priorityMeta[t.priority || 'normal'];
                const isReq = t.message_type === 'request';
                const sm   = statusMeta[t.status || 'open'];
                const unread = (t.unread_replies || 0) > 0;
                const isActive = activeThread?.id === t.id;
                return (
                  <button key={t.id} onClick={() => openThread(t)}
                    className={`w-full text-left px-4 py-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50
                                ${isActive ? 'bg-brand-50 dark:bg-brand-900/20' : ''}`}>
                    <div className="flex items-start gap-2.5">
                      {/* Type icon */}
                      <div className={`mt-0.5 shrink-0 w-7 h-7 rounded-full flex items-center justify-center
                                       ${isReq ? 'bg-amber-100 dark:bg-amber-900/30' : 'bg-brand-100 dark:bg-brand-900/30'}`}>
                        {isReq
                          ? <Ticket size={13} className="text-amber-600 dark:text-amber-400" />
                          : <MessageSquare size={13} className="text-brand-600 dark:text-brand-400" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <p className={`text-sm truncate ${unread ? 'font-bold text-slate-900 dark:text-white' : 'font-medium text-slate-700 dark:text-slate-300'}`}>
                            {t.subject || (isReq ? 'Request' : 'Message')}
                          </p>
                          {unread && (
                            <span className="shrink-0 w-2 h-2 rounded-full bg-brand-500" />
                          )}
                        </div>
                        <p className="text-xs text-slate-400 truncate mt-0.5">{t.latest_body}</p>
                        <div className="flex items-center gap-2 mt-1.5">
                          {isReq && (
                            <>
                              <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium flex items-center gap-1 ${pm.color}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${pm.dot}`} />
                                {t.priority}
                              </span>
                              <span className={`text-xs font-medium ${sm.color}`}>{sm.label}</span>
                            </>
                          )}
                          <span className="text-xs text-slate-400 ml-auto">
                            {formatDateTime(t.latest_at)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Right panel: thread chat ────────────────────── */}
          <div className={`flex-1 flex flex-col ${!activeThread ? 'hidden md:flex' : 'flex'}`}>
            {!activeThread ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
                <div className="w-16 h-16 rounded-2xl bg-brand-50 dark:bg-brand-900/20
                                flex items-center justify-center mb-4">
                  <MessageSquare size={28} className="text-brand-500" />
                </div>
                <p className="font-semibold text-slate-700 dark:text-slate-300 mb-1">Select a conversation</p>
                <p className="text-sm text-slate-400">Or start a new message or request</p>
              </div>
            ) : (
              <>
                {/* Chat header */}
                <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700
                                flex items-center gap-3">
                  <button onClick={() => setActiveThread(null)}
                    className="md:hidden p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                    <ArrowLeft size={18} />
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-slate-800 dark:text-white text-sm truncate">
                        {activeThread.subject || (activeThread.message_type === 'request' ? 'Request' : 'Message')}
                      </p>
                      {activeThread.message_type === 'request' && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1 shrink-0
                                         ${priorityMeta[activeThread.priority || 'normal'].color}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${priorityMeta[activeThread.priority || 'normal'].dot}`} />
                          {activeThread.priority}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400">
                      {activeThread.message_type === 'request' && (
                        <span className={`font-medium mr-2 ${statusMeta[activeThread.status || 'open'].color}`}>
                          {statusMeta[activeThread.status || 'open'].label}
                        </span>
                      )}
                      {activeThread.recipient_name || 'Landlord'} ·
                      {' '}{activeThread.reply_count || 0} repl{activeThread.reply_count === 1 ? 'y' : 'ies'}
                    </p>
                  </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                  {threadLoading ? (
                    <div className="flex justify-center py-12">
                      <Loader2 className="animate-spin text-brand-500" size={28} />
                    </div>
                  ) : threadMsgs.map(msg => {
                    const isMine = msg.sender_id === activeThread.sender_id ||
                                   (msg.thread_id && msg.sender_id !== activeThread.recipient_id);
                    // Determine mine by matching current user via thread root's sender_id
                    const amSender = activeThread.sender_id;
                    const mine = msg.sender_id === amSender;
                    return (
                      <div key={msg.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm
                                        ${mine
                                          ? 'bg-brand-600 text-white rounded-br-sm'
                                          : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-bl-sm'}`}>
                          {!mine && (
                            <p className="text-xs font-semibold mb-1 opacity-70">{msg.sender_name}</p>
                          )}
                          <p className="leading-relaxed whitespace-pre-wrap">{msg.body}</p>
                          <p className={`text-xs mt-1 ${mine ? 'text-brand-200' : 'text-slate-400'}`}>
                            {formatDateTime(msg.created_at)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={bottomRef} />
                </div>

                {/* Reply bar — disabled if resolved/closed */}
                {['resolved','closed'].includes(activeThread.status) ? (
                  <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-700
                                  text-center text-xs text-slate-400">
                    This {activeThread.message_type === 'request' ? 'request' : 'conversation'} is {activeThread.status}
                  </div>
                ) : (
                  <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-700 flex gap-2">
                    <textarea
                      className="flex-1 input resize-none text-sm min-h-[42px] max-h-32 py-2"
                      placeholder="Type a reply… (Enter to send, Shift+Enter for new line)"
                      value={replyText}
                      onChange={e => setReplyText(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSendReply();
                        }
                      }}
                      rows={1}
                    />
                    <button onClick={handleSendReply} disabled={sending || !replyText.trim()}
                      className="btn-primary px-3 py-2 self-end">
                      {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Compose Modal ────────────────────────────────────── */}
      {showCompose && (
        <div className="modal-overlay" onClick={() => setShowCompose(false)}>
          <div className="modal-box max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">New Conversation</h3>
              <button onClick={() => setShowCompose(false)}>
                <X size={18} className="text-slate-400 hover:text-slate-600" />
              </button>
            </div>
            <div className="modal-body space-y-4">

              {/* Type toggle */}
              <div className="flex gap-2">
                <button onClick={() => setCType('message')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold border transition-all
                    ${cType === 'message'
                      ? 'bg-brand-600 text-white border-brand-600'
                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600'}`}>
                  <MessageSquare size={15} /> Message
                </button>
                <button onClick={() => { setCType('request'); setCPriority('normal'); }}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold border transition-all
                    ${cType === 'request'
                      ? 'bg-amber-500 text-white border-amber-500'
                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600'}`}>
                  <Ticket size={15} /> Request / Ticket
                </button>
              </div>

              {/* Info blurb */}
              <div className={`text-xs px-3 py-2 rounded-lg ${cType === 'request'
                ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800'
                : 'bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-400 border border-brand-200 dark:border-brand-800'}`}>
                {cType === 'request'
                  ? 'Requests are tracked with priority and status — your landlord can update progress.'
                  : 'A regular message to your landlord. No tracking or status needed.'}
              </div>

              <div className="form-group">
                <label className="label">Subject (optional)</label>
                <input className="input" placeholder="e.g. Leaking tap in bathroom"
                  value={cSubject} onChange={e => setCSubject(e.target.value)} />
              </div>

              {/* Request extras */}
              {cType === 'request' && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="form-group mb-0">
                    <label className="label">Priority</label>
                    <select className="input" value={cPriority} onChange={e => setCPriority(e.target.value)}>
                      {PRIORITIES.map(p => (
                        <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group mb-0">
                    <label className="label">Category</label>
                    <select className="input" value={cCategory} onChange={e => setCCategory(e.target.value)}>
                      {CATEGORIES.map(c => (
                        <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <div className="form-group">
                <label className="label">Message *</label>
                <textarea className="input resize-none min-h-[100px]"
                  placeholder={cType === 'request'
                    ? 'Describe the issue in detail…'
                    : 'Write your message…'}
                  value={cBody}
                  onChange={e => setCBody(e.target.value)} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowCompose(false)}>Cancel</button>
              <button disabled={sending || !cBody.trim()}
                onClick={handleCompose}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors
                  ${cType === 'request' ? 'bg-amber-500 hover:bg-amber-600' : 'bg-brand-600 hover:bg-brand-700'}`}>
                {sending
                  ? <><Loader2 size={14} className="animate-spin" /> Sending…</>
                  : <><Send size={14} /> {cType === 'request' ? 'Submit Request' : 'Send Message'}</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}