import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../../components/common/Sidebar';
import TopBar from '../../components/common/TopBar';
import Modal from '../../components/common/Modal';
import EmptyState from '../../components/common/EmptyState';
import api from '../../api/axios';
import { formatKES, apiError } from '../../utils/helpers';
import { useAuth } from '../../context/AuthContext';
import { Building2, Plus, Loader2, Pencil, Home, ChevronDown, ChevronRight, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';

const PROP_BLANK = { name: '', location: '', description: '', total_units: '' };
const UNIT_BLANK = { unit_number: '', floor: '', monthly_rent: '', bedrooms: '', bathrooms: '' };

export default function ManagerProperties() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [properties, setProperties] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [expanded, setExpanded]     = useState({});    // propertyId -> bool

  // Property modal
  const [propModal, setPropModal]   = useState(false);
  const [propForm, setPropForm]     = useState(PROP_BLANK);
  const [editProp, setEditProp]     = useState(null);

  // Unit modal
  const [unitModal, setUnitModal]   = useState(false);
  const [unitForm, setUnitForm]     = useState(UNIT_BLANK);
  const [editUnit, setEditUnit]     = useState(null);
  const [activePropId, setActivePropId] = useState(null);

  const [saving, setSaving] = useState(false);

  // Impersonation (manager -> landlord)
  const [impModal, setImpModal] = useState(false);
  const [impProp, setImpProp]   = useState(null);
  const [impPwd,  setImpPwd]    = useState('');
  const [impLoading, setImpLoading] = useState(false);

  const load = () => {
    setLoading(true);
    api.get('/properties?include_units=true')
      .then(r => setProperties(r.data.data || []))
      .catch(e => toast.error(apiError(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const toggle = (id) => setExpanded(p => ({ ...p, [id]: !p[id] }));

  const openImpersonate = (prop) => {
    setImpProp(prop);
    setImpPwd('');
    setImpModal(true);
  };

  const handleImpersonate = async () => {
    if (!impProp?.id) return;
    if (!impPwd) { toast.error('Enter your manager password to continue.'); return; }
    setImpLoading(true);
    try {
      const currentToken = localStorage.getItem('rms_token');
      const currentUser  = localStorage.getItem('rms_user');

      const r = await api.post('/auth/impersonate/landlord', {
        property_id: impProp.id,
        manager_password: impPwd,
      });

      // Save original manager session once (so we can return later)
      if (currentToken && currentUser && !localStorage.getItem('rms_impersonator_token')) {
        localStorage.setItem('rms_impersonator_token', currentToken);
        localStorage.setItem('rms_impersonator_user', currentUser);
      }

      login(r.data.token, r.data.user);
      toast.success(`Viewing ${impProp.name} as landlord`);
      setImpModal(false);
      navigate('/landlord/dashboard');
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setImpLoading(false);
    }
  };

  // ── Property CRUD ────────────────────────────────────────────
  const openAddProp = () => { setEditProp(null); setPropForm(PROP_BLANK); setPropModal(true); };
  const openEditProp = (p) => {
    setEditProp(p);
    setPropForm({ name: p.name, location: p.location || '', description: p.description || '', total_units: p.total_units || '' });
    setPropModal(true);
  };
  const handleSaveProp = async () => {
    if (!propForm.name) { toast.error('Property name is required.'); return; }
    setSaving(true);
    try {
      if (editProp) {
        await api.put(`/properties/${editProp.id}`, propForm);
        toast.success('Property updated!');
      } else {
        await api.post('/properties', propForm);
        toast.success('Property registered!');
      }
      setPropModal(false); load();
    } catch (e) { toast.error(apiError(e)); }
    finally { setSaving(false); }
  };

  // ── Unit CRUD ────────────────────────────────────────────────
  const openAddUnit = (propertyId) => {
    setEditUnit(null);
    setUnitForm(UNIT_BLANK);
    setActivePropId(propertyId);
    setUnitModal(true);
  };
  const openEditUnit = (unit, propertyId) => {
    setEditUnit(unit);
    setActivePropId(propertyId);
    setUnitForm({
      unit_number:  unit.unit_number  || '',
      floor:        unit.floor        || '',
      monthly_rent: unit.monthly_rent || '',
    });
    setUnitModal(true);
  };
  const handleSaveUnit = async () => {
    if (!unitForm.unit_number || !unitForm.monthly_rent) {
      toast.error('Unit number and monthly rent are required.');
      return;
    }
    setSaving(true);
    try {
      if (editUnit) {
        await api.put(`/units/${editUnit.id}`, unitForm);
        toast.success('Unit updated!');
      } else {
        await api.post('/units', { ...unitForm, property_id: activePropId });
        toast.success('Unit added!');
      }
      setUnitModal(false); load();
    } catch (e) { toast.error(apiError(e)); }
    finally { setSaving(false); }
  };

  return (
    <div className="page-wrapper">
      <Sidebar />
      <div className="page-content">
        <TopBar title="Properties" subtitle="Manage your properties and units" />
        <div className="page-inner space-y-5">

          <div className="flex justify-end">
            <button className="btn-primary" onClick={openAddProp}>
              <Plus size={15} /> Register Property
            </button>
          </div>

          {loading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="animate-spin text-brand-500" size={32} />
            </div>
          ) : properties.length > 0 ? (
            <div className="space-y-4">
              {properties.map(prop => (
                <div key={prop.id} className="card overflow-hidden">

                  {/* Property header */}
                  <div
                    className="flex items-center justify-between p-5 cursor-pointer
                               hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                    onClick={() => toggle(prop.id)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-brand-50 dark:bg-brand-900/20
                                      flex items-center justify-center shrink-0">
                        <Building2 size={18} className="text-brand-600 dark:text-brand-400" />
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-white">{prop.name}</p>
                        <p className="text-xs text-slate-400">{prop.location || 'No location set'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="hidden sm:flex gap-6 text-center">
                        {[
                          { label: 'Units',    val: prop.units?.length ?? 0 },
                          { label: 'Occupied', val: prop.units?.filter(u => u.is_occupied).length ?? 0 },
                          { label: 'Vacant',   val: prop.units?.filter(u => !u.is_occupied).length ?? 0 },
                        ].map(({ label, val }) => (
                          <div key={label}>
                            <p className="text-sm font-bold text-slate-800 dark:text-white">{val}</p>
                            <p className="text-xs text-slate-400">{label}</p>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          className="btn-secondary text-xs"
                          onClick={(e) => { e.stopPropagation(); openImpersonate(prop); }}
                          title="View landlord dashboard for supervision"
                        >
                          <ShieldCheck size={13} /> View Landlord Dashboard
                        </button>
                        <button className="btn-ghost p-2 text-xs" onClick={e => { e.stopPropagation(); openEditProp(prop); }}>
                          <Pencil size={14} />
                        </button>
                        {expanded[prop.id]
                          ? <ChevronDown size={18} className="text-slate-400" />
                          : <ChevronRight size={18} className="text-slate-400" />
                        }
                      </div>
                    </div>
                  </div>

                  {/* Units table (expanded) */}
                  {expanded[prop.id] && (
                    <div className="border-t border-slate-200 dark:border-slate-700">
                      <div className="flex items-center justify-between px-5 py-3 bg-slate-50 dark:bg-slate-800/50">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Units</p>
                        <button className="btn-secondary text-xs" onClick={() => openAddUnit(prop.id)}>
                          <Plus size={13} /> Add Unit
                        </button>
                      </div>

                      {prop.units && prop.units.length > 0 ? (
                        <div className="table-wrap rounded-none border-0">
                          <table className="table-base">
                            <thead>
                              <tr>
                                <th className="th">Unit No.</th>
                                <th className="th">Floor</th>
                                <th className="th">Monthly Rent</th>
                                <th className="th">Status</th>
                                <th className="th">Tenant</th>
                                <th className="th">Action</th>
                              </tr>
                            </thead>
                            <tbody>
                              {prop.units.map(unit => (
                                <tr key={unit.id} className="tr-hover">
                                  <td className="td font-bold">
                                    <div className="flex items-center gap-1.5">
                                      <Home size={13} className="text-slate-400" />
                                      {unit.unit_number}
                                    </div>
                                  </td>
                                  <td className="td">{unit.floor || '—'}</td>
                                  <td className="td font-semibold">{formatKES(unit.monthly_rent)}</td>
                                  <td className="td">
                                    <span className={`badge ${unit.is_occupied ? 'badge-red' : 'badge-green'}`}>
                                      {unit.is_occupied ? 'Occupied' : 'Vacant'}
                                    </span>
                                  </td>
                                  <td className="td">{unit.tenant_name || '—'}</td>
                                  <td className="td">
                                    <button className="btn-ghost text-xs px-2 py-1"
                                      onClick={() => openEditUnit(unit, prop.id)}>
                                      <Pencil size={12} /> Edit
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="py-10 text-center">
                          <p className="text-sm text-slate-400 mb-3">No units added yet</p>
                          <button className="btn-primary text-xs" onClick={() => openAddUnit(prop.id)}>
                            <Plus size={13} /> Add First Unit
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="card p-10">
              <EmptyState icon={Building2} title="No properties registered"
                description="Add your first property to begin managing tenants and units."
                action={<button className="btn-primary" onClick={openAddProp}><Plus size={15} /> Register Property</button>} />
            </div>
          )}
        </div>
      </div>

      {/* Property Modal */}
      <Modal open={propModal} onClose={() => setPropModal(false)}
        title={editProp ? 'Edit Property' : 'Register Property'}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setPropModal(false)}>Cancel</button>
            <button className="btn-primary" onClick={handleSaveProp} disabled={saving}>
              {saving ? <><Loader2 size={15} className="animate-spin" /> Saving…</> : editProp ? 'Save Changes' : 'Register'}
            </button>
          </>
        }>
        <div className="space-y-4">
          <div className="form-group">
            <label className="label">Property Name *</label>
            <input className="input" placeholder="e.g. Sunset Apartments"
              value={propForm.name}
              onChange={e => setPropForm(p => ({ ...p, name: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="label">Location</label>
            <input className="input" placeholder="e.g. Westlands, Nairobi"
              value={propForm.location}
              onChange={e => setPropForm(p => ({ ...p, location: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="label">Description</label>
            <textarea className="input min-h-[80px] resize-none" placeholder="Brief property description"
              value={propForm.description}
              onChange={e => setPropForm(p => ({ ...p, description: e.target.value }))} />
          </div>
        </div>
      </Modal>

      {/* Unit Modal */}
      <Modal open={unitModal} onClose={() => setUnitModal(false)}
        title={editUnit ? 'Edit Unit' : 'Add Unit'}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setUnitModal(false)}>Cancel</button>
            <button className="btn-primary" onClick={handleSaveUnit} disabled={saving}>
              {saving ? <><Loader2 size={15} className="animate-spin" /> Saving…</> : editUnit ? 'Save Changes' : 'Add Unit'}
            </button>
          </>
        }>
        <div className="grid grid-cols-2 gap-4">
          <div className="form-group col-span-2">
            <label className="label">Unit Number *</label>
            <input className="input" placeholder="e.g. 1A, B2, 101"
              value={unitForm.unit_number}
              onChange={e => setUnitForm(p => ({ ...p, unit_number: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="label">Floor</label>
            <input className="input" placeholder="e.g. Ground, 1st"
              value={unitForm.floor}
              onChange={e => setUnitForm(p => ({ ...p, floor: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="label">Monthly Rent (KSH) *</label>
            <input className="input" type="number" placeholder="e.g. 25000"
              value={unitForm.monthly_rent}
              onChange={e => setUnitForm(p => ({ ...p, monthly_rent: e.target.value }))} />
          </div>
      
        </div>
      </Modal>

      {/* Impersonation Modal */}
      <Modal
        open={impModal}
        onClose={() => setImpModal(false)}
        title="View as Landlord (Supervision)"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setImpModal(false)} disabled={impLoading}>Cancel</button>
            <button className="btn-primary" onClick={handleImpersonate} disabled={impLoading}>
              {impLoading ? <><Loader2 size={15} className="animate-spin" /> Verifying…</> : 'Continue'}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            You are about to open the landlord dashboard for <span className="font-semibold">{impProp?.name}</span>.
            To confirm this is a manager-supervision action, enter your manager password.
          </p>
          <div className="form-group mb-0">
            <label className="label">Manager Password *</label>
            <input
              className="input"
              type="password"
              placeholder="••••••••"
              value={impPwd}
              onChange={(e) => setImpPwd(e.target.value)}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}