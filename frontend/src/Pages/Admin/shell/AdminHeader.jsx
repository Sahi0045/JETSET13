import React from 'react';
import { LuMenu, LuRefreshCw } from 'react-icons/lu';
import { useAdminRefresh } from './RefreshContext';

function formatLastRefresh(date) {
  if (!date) return null;
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function AdminHeader({ title, breadcrumb, onToggleSidebar, userInitial = 'A', userName = 'Admin' }) {
  const { triggerRefresh, isRefreshing, lastRefreshAt } = useAdminRefresh();
  const [, force] = React.useReducer((x) => x + 1, 0);

  React.useEffect(() => {
    if (!lastRefreshAt) return undefined;
    const t = setInterval(force, 30000);
    return () => clearInterval(t);
  }, [lastRefreshAt]);

  const lastText = formatLastRefresh(lastRefreshAt);

  return (
    <header className="aps-topbar">
      <div className="aps-topbar-left">
        <button
          type="button"
          className="aps-topbar-toggle"
          onClick={onToggleSidebar}
          aria-label="Toggle sidebar"
        >
          <LuMenu />
        </button>
        <div>
          {breadcrumb && <div className="aps-topbar-crumb">{breadcrumb}</div>}
          <h1 className="aps-topbar-title">{title}</h1>
        </div>
      </div>

      <div className="aps-topbar-right">
        {lastText && <span className="aps-updated">Updated {lastText}</span>}
        <button
          type="button"
          className="aps-refresh-btn"
          onClick={triggerRefresh}
          disabled={isRefreshing}
          title="Refresh data"
        >
          <LuRefreshCw className={isRefreshing ? 'aps-spin' : ''} />
          <span>{isRefreshing ? 'Refreshing…' : 'Refresh'}</span>
        </button>
        <div className="aps-user-pill" title={userName}>
          <span className="aps-avatar">{userInitial}</span>
          <span>{userName}</span>
        </div>
      </div>
    </header>
  );
}

export default React.memo(AdminHeader);
