export default function StatCard({ label, value, icon: Icon, color = 'blue', sub }) {
  const colors = {
    blue:   'bg-brand-50  dark:bg-brand-900/20  text-brand-600  dark:text-brand-400',
    green:  'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400',
    amber:  'bg-amber-50  dark:bg-amber-900/20  text-amber-600  dark:text-amber-400',
    red:    'bg-red-50    dark:bg-red-900/20    text-red-600    dark:text-red-400',
    purple: 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400',
    slate:  'bg-slate-100 dark:bg-slate-800     text-slate-600  dark:text-slate-400',
  };

  return (
    <div className="stat-card">
      <div className={`stat-icon ${colors[color] || colors.blue}`}>
        <Icon size={22} />
      </div>
      <div className="min-w-0">
        <p className="stat-value">{value}</p>
        <p className="stat-label">{label}</p>
        {sub && (
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{sub}</p>
        )}
      </div>
    </div>
  );
}