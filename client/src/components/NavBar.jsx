import { NavLink } from 'react-router-dom';
import { Sprout, Layers, FlaskConical, Eye, Grid2x2, LogOut } from 'lucide-react';
import { useAuth } from '../App';

export default function NavBar() {
  const { logout } = useAuth();
  const cls = ({ isActive }) =>
    `flex flex-col items-center gap-0.5 text-xs pt-1 ${isActive ? 'text-green-800 font-semibold' : 'text-gray-600'}`;
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex justify-around py-2 px-1 z-50">
      <NavLink to="/" end className={cls}><Sprout size={22}/><span>Today</span></NavLink>
      <NavLink to="/batches" className={cls}><Layers size={22}/><span>Batches</span></NavLink>
      <NavLink to="/applications" className={cls}><FlaskConical size={22}/><span>Apply</span></NavLink>
      <NavLink to="/observations" className={cls}><Eye size={22}/><span>Observe</span></NavLink>
      <NavLink to="/containers" className={cls}><Grid2x2 size={22}/><span>Containers</span></NavLink>
      <button onClick={logout} className="flex flex-col items-center gap-0.5 text-xs pt-1 text-gray-400 hover:text-red-500 transition-colors">
        <LogOut size={22}/><span>Logout</span>
      </button>
    </nav>
  );
}
