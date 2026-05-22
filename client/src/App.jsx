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
import MixCalculatorPage from './pages/recipes/MixCalculatorPage';
import CropInputs from './pages/inputs/CropInputs';
import CropInputDetail from './pages/inputs/CropInputDetail';
import Batches from './pages/batches/Batches';
import BatchDetail from './pages/batches/BatchDetail';
import BatchNew from './pages/batches/BatchNew';
import Strains from './pages/strains/Strains';
import ContainerDashboard from './pages/containers/ContainerDashboard';
import ContainerDetail from './pages/containers/ContainerDetail';
import FertigationLog from './pages/applications/FertigationLog';
import FertigationNew from './pages/applications/FertigationNew';
import FoliarLog from './pages/applications/FoliarLog';
import FoliarNew from './pages/applications/FoliarNew';
import AmendmentLog from './pages/containers/AmendmentLog';
import AmendmentNew from './pages/containers/AmendmentNew';
import PesticideLog from './pages/applications/PesticideLog';
import PesticideNew from './pages/applications/PesticideNew';
import REIDashboard from './pages/applications/REIDashboard';
import ObservationLog from './pages/observations/ObservationLog';
import ObservationNew from './pages/observations/ObservationNew';
import ApplicationsHub from './pages/applications/ApplicationsHub';
import HarvestDashboard from './pages/harvest/HarvestDashboard';
import PartialHarvestForm from './pages/harvest/PartialHarvestForm';
import FinalHarvestForm from './pages/harvest/FinalHarvestForm';
import WasteTrimForm from './pages/harvest/WasteTrimForm';
import WeatherEventClose from './pages/harvest/WeatherEventClose';
import PlantLossForm from './pages/containers/PlantLossForm';
import PlantReplacementForm from './pages/containers/PlantReplacementForm';
import TeardownForm from './pages/containers/TeardownForm';
import SoilSampleForm from './pages/containers/SoilSampleForm';
import StartupForm from './pages/containers/StartupForm';
import StartupReadyForm from './pages/containers/StartupReadyForm';
import MetrcExport from './pages/exports/MetrcExport';
import MdaReport from './pages/exports/MdaReport';
import CultivationRecord from './pages/exports/CultivationRecord';
import ComplianceDashboard from './pages/compliance/ComplianceDashboard';
import PlantInventory from './pages/compliance/PlantInventory';
import TagVerification from './pages/compliance/TagVerification';
import MetrcReconciliation from './pages/compliance/MetrcReconciliation';
import ContainerScanner from './pages/containers/ContainerScanner';
import TagAssignmentWalkthrough from './pages/containers/TagAssignmentWalkthrough';
import LocationView from './pages/locations/LocationView';
import ContainerLabels from './pages/admin/ContainerLabels';
import SensorManagement from './pages/admin/SensorManagement';
import EnvironmentalHistory from './pages/admin/EnvironmentalHistory';

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
    // Always attempt refresh — succeeds via Authorization header (localStorage token)
    // or via hatstak_token cookie (SSO from another hatstak.app subdomain).
    api.refreshToken()
      .then(({ token: newToken, worker }) => {
        localStorage.setItem('cv_token', newToken);
        const userData = worker || stored;
        if (userData) {
          localStorage.setItem('cv_user', JSON.stringify(userData));
          setUser(userData);
        }
      })
      .catch(() => {
        // No valid session — clear any stale localStorage.
        if (token) {
          localStorage.removeItem('cv_token');
          localStorage.removeItem('cv_user');
        }
      });
  }, []);

  function login(token, userData) {
    localStorage.setItem('cv_token', token);
    localStorage.setItem('cv_user', JSON.stringify(userData));
    setUser(userData);
  }
  function logout() {
    api.logout().catch(() => {}); // clear server-side cookie (fire-and-forget)
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
              <Route path="/recipes/calculator" element={<Protected><MixCalculatorPage /></Protected>} />
              <Route path="/recipes/fertigation" element={<Protected><FertigationRecipes /></Protected>} />
              <Route path="/recipes/fertigation/new" element={<Protected minRole="supervisor"><FertigationRecipeEdit /></Protected>} />
              <Route path="/recipes/fertigation/:id" element={<Protected><FertigationRecipeDetail /></Protected>} />
              <Route path="/recipes/fertigation/:id/version" element={<Protected minRole="supervisor"><FertigationRecipeEdit /></Protected>} />
              <Route path="/recipes/foliar" element={<Protected><FoliarRecipes /></Protected>} />
              <Route path="/recipes/foliar/new" element={<Protected minRole="supervisor"><FoliarRecipeEdit /></Protected>} />
              <Route path="/recipes/foliar/:id" element={<Protected><FoliarRecipeDetail /></Protected>} />
              <Route path="/recipes/foliar/:id/version" element={<Protected minRole="supervisor"><FoliarRecipeEdit /></Protected>} />
              <Route path="/inputs" element={<Protected><CropInputs /></Protected>} />
              <Route path="/inputs/:id" element={<Protected><CropInputDetail /></Protected>} />
              <Route path="/batches" element={<Protected><Batches /></Protected>} />
              <Route path="/batches/new" element={<Protected minRole="supervisor"><BatchNew /></Protected>} />
              <Route path="/batches/:id" element={<Protected><BatchDetail /></Protected>} />
              <Route path="/strains" element={<Protected minRole="supervisor"><Strains /></Protected>} />
              <Route path="/containers" element={<Protected><ContainerDashboard /></Protected>} />
              <Route path="/containers/:containerId/loss" element={<Protected><PlantLossForm /></Protected>} />
              <Route path="/containers/:containerId/replacement" element={<Protected><PlantReplacementForm /></Protected>} />
              <Route path="/containers/:containerId/teardown" element={<Protected><TeardownForm /></Protected>} />
              <Route path="/containers/:containerId/soil-sample/new" element={<Protected><SoilSampleForm /></Protected>} />
              <Route path="/containers/:containerId/startup" element={<Protected><StartupForm /></Protected>} />
              <Route path="/containers/:containerId/startup/:startupId/ready" element={<Protected minRole="supervisor"><StartupReadyForm /></Protected>} />
              <Route path="/containers/:containerId" element={<Protected><ContainerDetail /></Protected>} />
              <Route path="/applications" element={<Protected><ApplicationsHub /></Protected>} />
              <Route path="/applications/fertigation" element={<Protected><FertigationLog /></Protected>} />
              <Route path="/applications/fertigation/new" element={<Protected><FertigationNew /></Protected>} />
              <Route path="/applications/foliar" element={<Protected><FoliarLog /></Protected>} />
              <Route path="/applications/foliar/new" element={<Protected><FoliarNew /></Protected>} />
              <Route path="/applications/amendments" element={<Protected><AmendmentLog /></Protected>} />
              <Route path="/applications/amendments/new" element={<Protected><AmendmentNew /></Protected>} />
              <Route path="/applications/pesticide" element={<Protected><PesticideLog /></Protected>} />
              <Route path="/applications/pesticide/new" element={<Protected><PesticideNew /></Protected>} />
              <Route path="/rei" element={<Protected><REIDashboard /></Protected>} />
              <Route path="/observations" element={<Protected><ObservationLog /></Protected>} />
              <Route path="/observations/new" element={<Protected><ObservationNew /></Protected>} />
              {/* Harvest routes — static segments first to beat :batchId */}
              <Route path="/harvest/waste-trim/new" element={<Protected><WasteTrimForm /></Protected>} />
              <Route path="/harvest/batches/:harvestBatchId/force-close" element={<Protected minRole="supervisor"><WeatherEventClose /></Protected>} />
              <Route path="/harvest/:batchId" element={<Protected><HarvestDashboard /></Protected>} />
              <Route path="/harvest/:batchId/partial" element={<Protected><PartialHarvestForm /></Protected>} />
              <Route path="/harvest/:batchId/final" element={<Protected><FinalHarvestForm /></Protected>} />
              <Route path="/exports/metrc" element={<Protected><MetrcExport /></Protected>} />
              <Route path="/exports/mda-pesticide" element={<Protected><MdaReport /></Protected>} />
              <Route path="/exports/cultivation-record" element={<Protected><CultivationRecord /></Protected>} />
              <Route path="/compliance" element={<Protected><ComplianceDashboard /></Protected>} />
              <Route path="/compliance/plant-inventory" element={<Protected><PlantInventory /></Protected>} />
              <Route path="/compliance/tag-verification" element={<Protected><TagVerification /></Protected>} />
              <Route path="/compliance/metrc-reconciliation" element={<Protected><MetrcReconciliation /></Protected>} />
              <Route path="/locations" element={<Protected><LocationView /></Protected>} />
              <Route path="/scan" element={<Protected><ContainerScanner /></Protected>} />
              <Route path="/tag-assignments" element={<Protected><TagAssignmentWalkthrough /></Protected>} />
              <Route path="/admin/container-labels" element={<Protected minRole="admin"><ContainerLabels /></Protected>} />
              <Route path="/admin/sensors" element={<Protected minRole="admin"><SensorManagement /></Protected>} />
              <Route path="/admin/environmental-history" element={<Protected minRole="admin"><EnvironmentalHistory /></Protected>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
          {user && <NavBar />}
        </div>
      </BrowserRouter>
    </AuthContext.Provider>
  );
}
