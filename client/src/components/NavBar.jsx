import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Sprout, Layers, ScanLine, FlaskConical, Eye, Grid2x2, MapPin, LogOut, MoreHorizontal, ClipboardList, BarChart2, X, LayoutGrid } from 'lucide-react';
import { useAuth } from '../App';
import { useSyncStatus } from '../lib/offlineQueue';

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

function MoreSheet({ onClose, logout }) {
  const navigate = useNavigate();
  const go = (path) => { navigate(path); onClose(); };

  const items = [
    { icon: <Grid2x2 size={20} />, label: 'Containers', path: '/containers' },
    { icon: <MapPin size={20} />, label: 'Locations', path: '/locations' },
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
              <span>{item.label}</span>
            </button>
          ))}
          <button
            onClick={() => { logout(); onClose(); }}
            className="flex items-center gap-4 w-full px-4 py-3 rounded-xl text-left text-red-600 font-medium hover:bg-red-50 active:bg-red-100 transition-colors"
            style={{ minHeight: '56px' }}
          >
            <span className="text-red-400"><LogOut size={20} /></span>
            <span>Logout</span>
          </button>
        </div>
      </div>
    </>
  );
}

export default function NavBar() {
  const { logout } = useAuth();
  const [showMore, setShowMore] = useState(false);
  const cls = ({ isActive }) =>
    `flex flex-col items-center gap-0.5 text-xs pt-1 ${isActive ? 'text-green-800 font-semibold' : 'text-gray-600'}`;
  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex justify-around py-3 px-1 z-50" style={{ minHeight: '60px' }}>
        <div className="relative">
          <NavLink to="/" end className={cls}><Sprout size={22} /><span>Today</span></NavLink>
          <SyncBadge />
        </div>
        <NavLink to="/scan" className={cls}><ScanLine size={22} /><span>Scan</span></NavLink>
        <NavLink to="/batches" className={cls}><Layers size={22} /><span>Batches</span></NavLink>
        <NavLink to="/applications" className={cls}><LayoutGrid size={22} /><span>Hub</span></NavLink>
        <NavLink to="/observations" className={cls}><Eye size={22} /><span>Observe</span></NavLink>
        <button
          onClick={() => setShowMore(true)}
          className="flex flex-col items-center gap-0.5 text-xs pt-1 text-gray-600 hover:text-green-800 transition-colors"
        >
          <MoreHorizontal size={22} /><span>More</span>
        </button>
      </nav>
      {showMore && <MoreSheet onClose={() => setShowMore(false)} logout={logout} />}
    </>
  );
}
