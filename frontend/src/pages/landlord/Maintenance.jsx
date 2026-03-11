import { useState, useEffect } from 'react';
import Sidebar from '../../components/common/Sidebar';
import TopBar from '../../components/common/TopBar';
import Modal from '../../components/common/Modal';
import EmptyState from '../../components/common/EmptyState';
import api from '../../api/axios';
import { formatDate, formatDateTime, statusBadge, apiError, cap } from '../../utils/helpers';
import { Wrench, Plus, Loader2, Pencil, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';

const BLANK = {
  title: '', description: '', unit_id: '',
  scheduled_date: '', assigned_to: '', estimated_cost: '',
};

const STATUS_OPTIONS = ['scheduled', 'in_progress', 'completed', 'cancelled'];

export default function LandlordMaintenance() {
  const [jobs, setJobs]       = useState([]);
  const [units, setUnits]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal]     = useState(false);
  const [isEdit, setIsEdit]   = useState(false);
  const [selected, setSelected] = useState(null);
  const [form, setForm]         = useState(BLANK);
  const [saving, setSaving]     = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get('/maintenance'),
      api.get('/units'),
    ]).then(([m, u]) => {
      setJobs(m.data.data  || []);
      setUnits(u.data.data || []);
    }).catch(e => toast.error(apiError(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openAdd = () => {
    setIsEdit(false);
    setForm(BLANK);
    setModal(true);
  };

  const openEdit = (job) => {
    setIsEdit(true);
    setSelected(job);
    setForm({
      title:          job.title          || '',
      description:    job.description    || '',
      unit_id:        job.unit_id        || '',
      scheduled_date: job.scheduled_date?.slice(0, 10) || '',
      // assigned_to:    job.assigned_to    || '',
      estimated_cost: job.estimated_cost || '',
    });
    setModal(true);
  };

  const handleSave = async () => {
    if (!form.title || !form.scheduled_date) {
      toast.error('Title and scheduled date are required.');
      return;
    }
    setSaving(true);
    try {
      if (isEdit) {
        await api.put(`/maintenance/${selected.id}`, form);
        toast.success('Job updated!');
      } else {
        await api.post('/maintenance', form);
        toast.success('Maintenance job scheduled!');
      }
      setModal(false);
      load();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const handleStatus = async (id, status) => {
    try {
      await api.patch(`/maintenance/${id}/status`, { status });
      toast.success(`Marked as ${status}`);
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const filtered = filterStatus === 'all'
    ? jobs
    : jobs.filter(j => j.status === filterStatus);

  const statusColor = {
    scheduled:   'bg-brand-50  dark:bg-brand-900/20  text-brand-700  dark:text-brand-400',
    in_progress: 'bg-amber-50  dark:bg-amber-900/20  text-amber-700  dark:text-amber-400',
    completed:   'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400',
    cancelled:   'bg-slate-100 dark:bg-slate-800     text-slate-500',
  };

  return (
    <div className="page-wrapper">
      <Sidebar />
      <div className="page-content">
        <TopBar title="Maintenance" subtitle="Schedule and track property maintenance" />
        <div className="page-inner space-y-5">

          {/* Controls */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
              {['all', ...STATUS_OPTIONS].map(s => (
                <button key={s} onClick={() => setFilterStatus(s)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold capitalize transition-all
                    ${filterStatus === s
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                    }`}>
                  {s.replace('_', ' ')}
                </button>
              ))}
            </div>
            <button className="btn-primary ml-auto" onClick={openAdd}>
              <Plus size={15} /> Schedule Job
            </button>
          </div>

          {/* Job cards */}
          {loading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="animate-spin text-brand-500" size={32} />
            </div>
          ) : filtered.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filtered.map(job => (
                <div key={job.id}
                  className="card p-5 flex flex-col gap-3 hover:shadow-card-md transition-shadow">

                  {/* Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0
                                       ${statusColor[job.status] || 'bg-slate-100 text-slate-500'}`}>
                        <Wrench size={16} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 leading-tight">
                          {job.title}
                        </p>
                        {job.unit_number && (
                          <p className="text-xs text-slate-400">Unit {job.unit_number}</p>
                        )}
                      </div>
                    </div>
                    <span className={`badge ${statusBadge(job.status)} shrink-0`}>
                      {cap(job.status)}
                    </span>
                  </div>

                  {/* Description */}
                  {job.description && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-2">
                      {job.description}
                    </p>
                  )}

                  {/* Details */}
                  <div className="grid grid-cols-2 gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <div>
                      <span className="font-semibold text-slate-600 dark:text-slate-300">Date</span>
                      <p>{formatDate(job.scheduled_date)}</p>
                    </div>
                    {/* {job.assigned_to && (
                      <div>
                        <span className="font-semibold text-slate-600 dark:text-slate-300">Assigned</span>
                        <p>{job.assigned_to}</p>
                      </div>
                    )} */}
                    {job.estimated_cost && (
                      <div>
                        <span className="font-semibold text-slate-600 dark:text-slate-300">Est. Cost</span>
                        <p>KSH {Number(job.estimated_cost).toLocaleString()}</p>
                      </div>
                    )}
                    {job.completed_date && (
                      <div>
                        <span className="font-semibold text-slate-600 dark:text-slate-300">Completed</span>
                        <p>{formatDate(job.completed_date)}</p>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
                    <button className="btn-ghost text-xs px-2 py-1" onClick={() => openEdit(job)}>
                      <Pencil size={12} /> Edit
                    </button>
                    {job.status === 'scheduled' && (
                      <button className="btn-ghost text-xs px-2 py-1 text-amber-600"
                        onClick={() => handleStatus(job.id, 'in_progress')}>
                        Start
                      </button>
                    )}
                    {job.status === 'in_progress' && (
                      <button className="btn-ghost text-xs px-2 py-1 text-emerald-600"
                        onClick={() => handleStatus(job.id, 'completed')}>
                        <CheckCircle2 size={12} /> Complete
                      </button>
                    )}
                    {job.status !== 'cancelled' && job.status !== 'completed' && (
                      <button className="btn-ghost text-xs px-2 py-1 text-red-500 ml-auto"
                        onClick={() => handleStatus(job.id, 'cancelled')}>
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="card p-8">
              <EmptyState icon={Wrench} title="No maintenance jobs"
                description="Schedule a maintenance job to keep track of property upkeep."
                action={<button className="btn-primary" onClick={openAdd}><Plus size={15} /> Schedule Job</button>} />
            </div>
          )}
        </div>
      </div>

      {/* Add / Edit Modal */}
      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title={isEdit ? 'Edit Maintenance Job' : 'Schedule Maintenance Job'}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setModal(false)}>Cancel</button>
            <button className="btn-primary" onClick={handleSave} disabled={saving}>
              {saving
                ? <><Loader2 size={15} className="animate-spin" /> Saving…</>
                : isEdit ? 'Save Changes' : 'Schedule Job'
              }
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="form-group">
            <label className="label">Title *</label>
            <input className="input" placeholder="e.g. Plumbing repair – Unit 2B"
              value={form.title}
              onChange={e => setForm(p => ({ ...p, title: e.target.value }))} />
          </div>

          <div className="form-group">
            <label className="label">Description</label>
            <textarea className="input min-h-[80px] resize-none"
              placeholder="Describe the work to be done…"
              value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="form-group">
              <label className="label">Unit (optional)</label>
              <select className="input" value={form.unit_id}
                onChange={e => setForm(p => ({ ...p, unit_id: e.target.value }))}>
                <option value="">Common area / All</option>
                {units.map(u => (
                  <option key={u.id} value={u.id}>Unit {u.unit_number}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="label">Scheduled Date *</label>
              <input className="input" type="date" value={form.scheduled_date}
                onChange={e => setForm(p => ({ ...p, scheduled_date: e.target.value }))} />
            </div>
            {/* <div className="form-group">
              <label className="label">Assigned To</label>
              <input className="input" placeholder="Contractor / team name"
                value={form.assigned_to}
                onChange={e => setForm(p => ({ ...p, assigned_to: e.target.value }))} />
            </div> */}
            <div className="form-group">
              <label className="label">Estimated Cost (KSH)</label>
              <input className="input" type="number" placeholder="0"
                value={form.estimated_cost}
                onChange={e => setForm(p => ({ ...p, estimated_cost: e.target.value }))} />
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}