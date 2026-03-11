import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { ALargeSmall, Menu } from 'lucide-react';

const fontOptions = ['small', 'medium', 'large'];

export default function TopBar({ title, subtitle }) {
  const { fontSize, setFontSize } = useTheme();
  const { user } = useAuth();

  return (
    <header className="sticky top-0 z-30 bg-white/80 dark:bg-slate-900/80
                       backdrop-blur border-b border-slate-200 dark:border-slate-700/60
                       px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between gap-4">
      {/* Page title */}
      <div className="flex items-start gap-3 min-w-0">
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event('rms:toggleSidebar'))}
          className="lg:hidden mt-0.5 inline-flex items-center justify-center w-10 h-10 rounded-lg
                     bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700
                     text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
          aria-label="Open navigation"
        >
          <Menu size={18} />
        </button>
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3">
        {/* Font size picker */}
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800
                        rounded-lg p-1">
          <ALargeSmall size={14} className="text-slate-400 mx-1" />
          {fontOptions.map(size => (
            <button
              key={size}
              onClick={() => setFontSize(size)}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold capitalize
                         transition-all duration-150
                         ${fontSize === size
                           ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                           : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                         }`}
            >
              {size === 'small' ? 'A' : size === 'medium' ? 'A' : 'A'}
            </button>
          ))}
        </div>

        {/* User chip */}
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg
                        bg-slate-100 dark:bg-slate-800">
          <div className="w-5 h-5 rounded-full bg-brand-200 dark:bg-brand-800
                          flex items-center justify-center">
            <span className="text-xs font-bold text-brand-700 dark:text-brand-300">
              {user?.full_name?.charAt(0).toUpperCase()}
            </span>
          </div>
          <span className="text-xs font-medium text-slate-700 dark:text-slate-300 max-w-[120px] truncate">
            {user?.full_name}
          </span>
        </div>
      </div>
    </header>
  );
}