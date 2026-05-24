import { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Sprout, Layers, ScanLine, FlaskConical, Eye, Grid2x2, MapPin, LogOut, MoreHorizontal, ClipboardList, BarChart2, X, LayoutGrid, Vault, ListChecks } from 'lucide-react';
import { useAuth } from '../App';
import { useSyncStatus } from '../lib/offlineQueue';
import { api } from '../api';

function SyncBadge() {
  const { pending, failed } = useSyncStatus();
  if (failed > 0) {
    return (
      <span className="absolute -top-0.5 -right-1.5 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[14px] h-3.5 flex items-center justify-center px-0.5">
        !
      </span>
    );
  }
  if (pending > 0) {
    return (
      <span className="absolute -top-0.5 -right-1.5 bg-amber-500 text-white text-[9px] font-bold rounded-full min-w-[14px] h-3.5 flex items-center justify-center px-0.5">
        {pending > 9 ? '9+' : pending}
      </span>
    );
  }
  return (
    <span className="absolute -top-0.5 -right-1.5 bg-green-500 rounded-full w-2 h-2" />
  );
}

function useMetrcPending() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let mounted = true;
    function refresh() {
      api.getMetrcTodosPendingCount()
        .then(data => { if (mounted) setCount(data.count ?? 0); })
        .catch(() => {});
    }
    refresh();
    const interval = setInterval(refresh, 30000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);
  return count;
}

function MoreSheet({ onClose, metrcPending }) {
  const navigate = useNavigate();
  const go = (path) => { navigate(path); onClose(); };

  const items = [
    { icon: <ScanLine size={20} />, label: 'Scan', path: '/scan' },
    { icon: <Layers size={20} />, label: 'Batches', path: '/batches' },
    { icon: <Vault size={20} />, label: 'Seed Vault', path: '/seed-vault' },
    { icon: <LayoutGrid size={20} />, label: 'Hub', path: '/applications' },
    { icon: <Eye size={20} />, label: 'Observations', path: '/observations' },
    { icon: <Grid2x2 size={20} />, label: 'Containers', path: '/containers' },
    { icon: <MapPin size={20} />, label: 'Locations', path: '/locations' },
    { icon: <ListChecks size={20} />, label: 'METRC Actions', path: '/compliance/metrc-todos', badge: metrcPending },
    { icon: <ClipboardList size={20} />, label: 'Compliance', path: '/compliance' },
    { icon: <BarChart2 size={20} />, label: 'Analytics', path: '/analytics/applicators' },
    { icon: <ClipboardList size={20} />, label: 'Planting Plans', path: '/planting-plans' },
    { icon: <FlaskConical size={20} />, label: 'Soil Samples', path: '/soil-samples' },
  ];

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl z-50">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <span className="font-semibold text-gray-800">More</span>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <X size={20} />
          </button>
        </div>
        <div className="px-3 py-3 flex flex-col gap-1 pb-8">
          {items.map(item => (
            <button
              key={item.path}
              onClick={() => go(item.path)}
              className="flex items-center gap-4 w-full px-4 py-3 rounded-xl text-left text-gray-800 font-medium hover:bg-gray-50 active:bg-gray-100 transition-colors"
              style={{ minHeight: '56px' }}
            >
              <span className="text-gray-400">{item.icon}</span>
              <span className="flex-1">{item.label}</span>
              {item.badge > 0 && (
                <span className="bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-full min-w-[22px] text-center">
                  {item.badge > 99 ? '99+' : item.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

export default function NavBar() {
  const { logout } = useAuth();
  const [showMore, setShowMore] = useState(false);
  const metrcPending = useMetrcPending();
  const cls = ({ isActive }) =>
    `flex flex-col items-center gap-0.5 text-xs pt-1 ${isActive ? 'text-green-800 font-semibold' : 'text-gray-600'}`;
  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex justify-around py-3 px-1 z-50" style={{ minHeight: '60px' }}>
        <div className="relative">
          <NavLink to="/" end className={cls}><Sprout size={22} /><span>Today</span></NavLink>
          <SyncBadge />
        </div>
        <NavLink to="/locations" className={cls}><MapPin size={22} /><span>Locations</span></NavLink>
        <NavLink to="/tasks" className={cls}><ClipboardList size={22} /><span>Tasks</span></NavLink>
        <div className="relative">
          <button
            onClick={() => setShowMore(true)}
            className="flex flex-col items-center gap-0.5 text-xs pt-1 text-gray-600 hover:text-green-800 transition-colors"
          >
            <MoreHorizontal size={22} /><span>More</span>
          </button>
          {metrcPending > 0 && (
            <span className="absolute -top-0.5 -right-1.5 bg-amber-500 text-white text-[9px] font-bold rounded-full min-w-[14px] h-3.5 flex items-center justify-center px-0.5">
              {metrcPending > 9 ? '9+' : metrcPending}
            </span>
          )}
        </div>
        <button
          onClick={logout}
          className="flex flex-col items-center gap-0.5 text-xs pt-1 text-gray-600 hover:text-red-600 transition-colors"
        >
          <LogOut size={22} /><span>Logout</span>
        </button>
      </nav>
      {showMore && <MoreSheet onClose={() => setShowMore(false)} metrcPending={metrcPending} />}
    </>
  );
}
