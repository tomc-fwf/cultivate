import { NavLink } from 'react-router-dom';
import { Sprout, Layers, ScanLine, FlaskConical, Eye, Grid2x2, MapPin, LogOut } from 'lucide-react';
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

export default function NavBar() {
  const { logout } = useAuth();
  const cls = ({ isActive }) =>
    `flex flex-col items-center gap-0.5 text-xs pt-1 ${isActive ? 'text-green-800 font-semibold' : 'text-gray-600'}`;
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex justify-around py-3 px-1 z-50" style={{ minHeight: '60px' }}>
      <div className="relative">
        <NavLink to="/" end className={cls}><Sprout size={22}/><span>Today</span></NavLink>
        <SyncBadge />
      </div>
      <NavLink to="/scan" className={cls}><ScanLine size={22}/><span>Scan</span></NavLink>
      <NavLink to="/batches" className={cls}><Layers size={22}/><span>Batches</span></NavLink>
      <NavLink to="/applications" className={cls}><FlaskConical size={22}/><span>Apply</span></NavLink>
      <NavLink to="/observations" className={cls}><Eye size={22}/><span>Observe</span></NavLink>
      <NavLink to="/containers" className={cls}><Grid2x2 size={22}/><span>Containers</span></NavLink>
      <NavLink to="/locations" className={cls}><MapPin size={22}/><span>Locations</span></NavLink>
      <button onClick={logout} className="flex flex-col items-center gap-0.5 text-xs pt-1 text-gray-400 hover:text-red-500 transition-colors">
        <LogOut size={22}/><span>Logout</span>
      </button>
    </nav>
  );
}
