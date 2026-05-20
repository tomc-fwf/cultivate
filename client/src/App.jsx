import { createContext, useContext, useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { api } from './api';
import NavBar from './components/NavBar';
import Login from './pages/Login';
import Today from './pages/Today';
import RecipeIndex from './pages/recipes/RecipeIndex';
import FertigationRecipes from './pages/recipes/FertigationRecipes';
import FertigationRecipeDetail from './pages/recipes/FertigationRecipeDetail';
import FertigationRecipeEdit from './pages/recipes/FertigationRecipeEdit';
import FoliarRecipes from './pages/recipes/FoliarRecipes';
import FoliarRecipeDetail from './pages/recipes/FoliarRecipeDetail';
import FoliarRecipeEdit from './pages/recipes/FoliarRecipeEdit';

export const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

function Protected({ children, minRole }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  // role hierarchy: grower < supervisor < admin
  const levels = { grower: 0, supervisor: 1, admin: 2 };
  if (minRole && (levels[user.role] ?? 0) < (levels[minRole] ?? 0)) {
    return <Navigate to="/" replace />;
  }
  return children;
}

export default function App() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const stored = (() => { try { return JSON.parse(localStorage.getItem('cv_user')); } catch { return null; } })();
    const token = localStorage.getItem('cv_token');
    if (!stored || !token) return;
    api.refreshToken()
      .then(({ token: newToken }) => { localStorage.setItem('cv_token', newToken); setUser(stored); })
      .catch(() => { localStorage.removeItem('cv_token'); localStorage.removeItem('cv_user'); });
  }, []);

  function login(token, userData) {
    localStorage.setItem('cv_token', token);
    localStorage.setItem('cv_user', JSON.stringify(userData));
    setUser(userData);
  }
  function logout() {
    localStorage.removeItem('cv_token');
    localStorage.removeItem('cv_user');
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      <BrowserRouter>
        <div className="min-h-screen bg-gray-100 flex flex-col">
          <div className="flex-1 pb-20">
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/" element={<Protected><Today /></Protected>} />
              <Route path="/recipes" element={<Protected><RecipeIndex /></Protected>} />
              <Route path="/recipes/fertigation" element={<Protected><FertigationRecipes /></Protected>} />
              <Route path="/recipes/fertigation/new" element={<Protected minRole="supervisor"><FertigationRecipeEdit /></Protected>} />
              <Route path="/recipes/fertigation/:id" element={<Protected><FertigationRecipeDetail /></Protected>} />
              <Route path="/recipes/fertigation/:id/version" element={<Protected minRole="supervisor"><FertigationRecipeEdit /></Protected>} />
              <Route path="/recipes/foliar" element={<Protected><FoliarRecipes /></Protected>} />
              <Route path="/recipes/foliar/new" element={<Protected minRole="supervisor"><FoliarRecipeEdit /></Protected>} />
              <Route path="/recipes/foliar/:id" element={<Protected><FoliarRecipeDetail /></Protected>} />
              <Route path="/recipes/foliar/:id/version" element={<Protected minRole="supervisor"><FoliarRecipeEdit /></Protected>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
          {user && <NavBar />}
        </div>
      </BrowserRouter>
    </AuthContext.Provider>
  );
}
