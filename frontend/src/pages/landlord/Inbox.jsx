import { useState, useEffect, useRef, useCallback } from 'react';
import Sidebar from '../../components/common/Sidebar';
import TopBar from '../../components/common/TopBar';
import api from '../../api/axios';
import { formatDateTime, apiError } from '../../utils/helpers';
import {
  MessageSquare, Send, ArrowLeft, Loader2,
  Ticket, ChevronDown, Users, Tag,
} from 'lucide-react';
import toast from 'react-hot-toast';

const priorityMeta = {
  low:    { color: 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400',    dot: 'bg-slate-400',  label: 'Low'    },
  normal: { color: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',      dot: 'bg-blue-400',   label: 'Normal' },
  high:   { color: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',  dot: 'bg-amber-400',  label: 'High'   },
  urgent: { color: 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400',          dot: 'bg-red-500',    label: 'Urgent' },
};

const statusOptions = [
  { value: 'open',        label: 'Open',        color: 'text-blue-600 dark:text-blue-400'     },
  { value: 'in_progress', label: 'In Progress', color: 'text-amber-600 dark:text-amber-400'   },
  { value: 'resolved',    label: 'Resolved',    color: 'text-emerald-600 dark:text-emerald-400'},
  { value: 'closed',      label: 'Closed',      color: 'text-slate-400'                       },
];

export default function LandlordInbox() {
  const [threads,       setThreads]       = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [activeThread,  setActiveThread]  = useState(null);
  const [threadMsgs,    setThreadMsgs]    = useState([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [replyText,     setReplyText]     = useState('');
  const [sending,       setSending]       = useState(false);
  const [filter,        setFilter]        = useState('all');   // all | message | request
  const [statusFilter,  setStatusFilter]  = useState('');      // '' | open | in_progress | resolved | closed
  const [statusDropdown,setStatusDropdown]= useState(false);
  const bottomRef = useRef(null);
  const dropRef   = useRef(null);

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

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => { if (dropRef.current && !dropRef.current.contains(e.target)) setStatusDropdown(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const openThread = async (thread) => {
    setActiveThread(thread);
    setReplyText('');
    setStatusDropdown(false);
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

  const handleStatusChange = async (newStatus) => {
    try {
      await api.patch(`/messages/${activeThread.id}/status`, { status: newStatus });
      setActiveThread(p => ({ ...p, status: newStatus }));
      setStatusDropdown(false);
      loadThreads();
      toast.success(`Status updated to ${newStatus.replace('_', ' ')}`);
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const filtered = threads.filter(t => {
    if (filter === 'request' && t.message_type !== 'request') return false;
    if (filter === 'message' && t.message_type !== 'message') return false;
    if (statusFilter && t.status !== statusFilter) return false;
    return true;
  });

  const pendingRequests = threads.filter(t =>
    t.message_type === 'request' && ['open','in_progress'].includes(t.status)
  ).length;

  const unreadTotal = threads.reduce((s, t) => s + (t.unread_replies || 0), 0);

  return (
    <div className="page-wrapper">
      <Sidebar />
      <div className="page-content">
        <TopBar title="Inbox" subtitle="Tenant messages and requests" />
        <div className="page-inner !p-0 flex h-[calc(100vh-64px)]">

          {/* ── Left panel ─────────────────────────────────── */}
          <div className={`flex flex-col border-r border-slate-200 dark:border-slate-700
                           w-full md:w-80 lg:w-96 shrink-0
                           ${activeThread ? 'hidden md:flex' : 'flex'}`}>

            {/* Stats row */}
            <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-700
                            flex items-center gap-3 text-xs">
              {unreadTotal > 0 && (
                <span className="flex items-center gap-1 bg-brand-50 dark:bg-brand-900/20
                                 text-brand-600 dark:text-brand-400 px-2 py-1 rounded-full font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-500" />
                  {unreadTotal} unread
                </span>
              )}
              {pendingRequests > 0 && (
                <span className="flex items-center gap-1 bg-amber-50 dark:bg-amber-900/20
                                 text-amber-600 dark:text-amber-400 px-2 py-1 rounded-full font-semibold">
                  <Ticket size={11} /> {pendingRequests} pending
                </span>
              )}
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

            {/* Status filter (only for requests) */}
            {filter !== 'message' && (
              <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-700 flex gap-1.5 flex-wrap">
                {[{v:'',l:'All'},
                  {v:'open',l:'Open'},
                  {v:'in_progress',l:'In Progress'},
                  {v:'resolved',l:'Resolved'},
                  {v:'closed',l:'Closed'}
                ].map(({v,l}) => (
                  <button key={v} onClick={() => setStatusFilter(v)}
                    className={`text-xs px-2 py-0.5 rounded-full transition-colors font-medium
                      ${statusFilter === v
                        ? 'bg-brand-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700'}`}>
                    {l}
                  </button>
                ))}
              </div>
            )}

            {/* Thread list */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700/60">
              {loading ? (
                <div className="flex justify-center py-16">
                  <Loader2 className="animate-spin text-brand-500" size={28} />
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                  <MessageSquare size={32} className="text-slate-300 mb-3" />
                  <p className="text-sm text-slate-500">No conversations match your filters</p>
                </div>
              ) : filtered.map(t => {
                  const pm    = priorityMeta[t.priority || 'normal'];
                  const isReq = t.message_type === 'request';
                  const sm    = statusOptions.find(s => s.value === (t.status || 'open'));
                  const unread= (t.unread_replies || 0) > 0;
                  const isActive = activeThread?.id === t.id;
                  return (
                    <button key={t.id} onClick={() => openThread(t)}
                      className={`w-full text-left px-4 py-3 transition-colors
                                  hover:bg-slate-50 dark:hover:bg-slate-800/50
                                  ${isActive ? 'bg-brand-50 dark:bg-brand-900/20 border-l-2 border-brand-500' : ''}`}>
                      <div className="flex items-start gap-2.5">
                        <div className={`mt-0.5 shrink-0 w-7 h-7 rounded-full flex items-center justify-center
                                         ${isReq ? 'bg-amber-100 dark:bg-amber-900/30' : 'bg-brand-100 dark:bg-brand-900/30'}`}>
                          {isReq
                            ? <Ticket size={13} className="text-amber-600 dark:text-amber-400" />
                            : <MessageSquare size={13} className="text-brand-600 dark:text-brand-400" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-1">
                            <div className="min-w-0">
                              <p className={`text-xs text-slate-500 truncate`}>
                                {t.sender_name}
                              </p>
                              <p className={`text-sm truncate ${unread ? 'font-bold text-slate-900 dark:text-white' : 'font-medium text-slate-700 dark:text-slate-300'}`}>
                                {t.subject || (isReq ? 'Request' : 'Message')}
                              </p>
                            </div>
                            {unread && <span className="shrink-0 mt-1 w-2 h-2 rounded-full bg-brand-500" />}
                          </div>
                          <p className="text-xs text-slate-400 truncate mt-0.5">{t.latest_body}</p>
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            {isReq && (
                              <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium flex items-center gap-1 ${pm.color}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${pm.dot}`} />
                                {pm.label}
                              </span>
                            )}
                            {isReq && sm && (
                              <span className={`text-xs font-medium ${sm.color}`}>{sm.label}</span>
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

          {/* ── Right panel: chat ───────────────────────────── */}
          <div className={`flex-1 flex flex-col ${!activeThread ? 'hidden md:flex' : 'flex'}`}>
            {!activeThread ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
                <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-800
                                flex items-center justify-center mb-4">
                  <MessageSquare size={28} className="text-slate-400" />
                </div>
                <p className="font-semibold text-slate-700 dark:text-slate-300 mb-1">Select a conversation</p>
                <p className="text-sm text-slate-400">Tenant messages and requests appear here</p>
              </div>
            ) : (
              <>
                {/* Chat header */}
                <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center gap-3">
                  <button onClick={() => setActiveThread(null)}
                    className="md:hidden p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                    <ArrowLeft size={18} />
                  </button>

                  {/* Left: sender info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-slate-800 dark:text-white text-sm">
                        {activeThread.sender_name}
                      </p>
                      <span className={`text-xs px-1.5 py-0.5 rounded-md font-medium
                        ${activeThread.message_type === 'request'
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                          : 'bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400'}`}>
                        {activeThread.message_type === 'request' ? 'Request' : 'Message'}
                      </span>
                      {activeThread.message_type === 'request' && (
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium flex items-center gap-1
                                         ${priorityMeta[activeThread.priority || 'normal'].color}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${priorityMeta[activeThread.priority || 'normal'].dot}`} />
                          {activeThread.priority}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5 truncate">
                      {activeThread.subject || 'No subject'} · {activeThread.reply_count || 0} repl{activeThread.reply_count === 1 ? 'y' : 'ies'}
                      {activeThread.category && activeThread.message_type === 'request' && (
                        <span className="ml-2 capitalize">· {activeThread.category}</span>
                      )}
                    </p>
                  </div>

                  {/* Status control — only for requests */}
                  {activeThread.message_type === 'request' && (
                    <div className="relative" ref={dropRef}>
                      <button onClick={() => setStatusDropdown(p => !p)}
                        className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5
                                    rounded-lg border transition-colors
                                    ${statusOptions.find(s=>s.value===activeThread.status)?.color || 'text-blue-600'}
                                    border-current/20 hover:bg-slate-50 dark:hover:bg-slate-800`}>
                        {statusOptions.find(s=>s.value===activeThread.status)?.label || 'Open'}
                        <ChevronDown size={12} />
                      </button>
                      {statusDropdown && (
                        <div className="absolute right-0 top-full mt-1 w-40 bg-white dark:bg-slate-800
                                        border border-slate-200 dark:border-slate-700 rounded-xl
                                        shadow-lg z-20 overflow-hidden">
                          {statusOptions.map(s => (
                            <button key={s.value} onClick={() => handleStatusChange(s.value)}
                              className={`w-full text-left px-3 py-2 text-xs font-medium hover:bg-slate-50
                                          dark:hover:bg-slate-700 transition-colors ${s.color}
                                          ${activeThread.status === s.value ? 'bg-slate-50 dark:bg-slate-700' : ''}`}>
                              {s.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                  {threadLoading ? (
                    <div className="flex justify-center py-12">
                      <Loader2 className="animate-spin text-brand-500" size={28} />
                    </div>
                  ) : threadMsgs.map(msg => {
                    const mine = msg.sender_id !== activeThread.sender_id;
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

                {/* Reply bar */}
                <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-700 flex gap-2">
                  <textarea
                    className="flex-1 input resize-none text-sm min-h-[42px] max-h-32 py-2"
                    placeholder="Type a reply… (Enter to send)"
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
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}