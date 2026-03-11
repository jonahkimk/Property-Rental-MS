export default function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        {Icon && <Icon size={28} />}
      </div>
      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
        {title}
      </h3>
      {description && (
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 max-w-xs">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}