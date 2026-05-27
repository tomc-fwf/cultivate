import { useNavigate } from 'react-router-dom';
import { Printer, Wifi, BarChart2, ClipboardList } from 'lucide-react';

const ADMIN_ITEMS = [
  {
    icon: <ClipboardList size={22} className="text-green-700" />,
    label: 'METRC Setup',
    sub: 'Reference data, tag pools, sublocations, additive templates',
    path: '/admin/metrc-setup',
  },
  {
    icon: <Printer size={22} className="text-green-700" />,
    label: 'Container Labels',
    sub: 'Print QR label sheets for containers',
    path: '/admin/container-labels',
  },
  {
    icon: <Wifi size={22} className="text-green-700" />,
    label: 'Sensors',
    sub: 'Manage SensorPush devices and polling',
    path: '/admin/sensors',
  },
  {
    icon: <BarChart2 size={22} className="text-green-700" />,
    label: 'Environmental History',
    sub: 'Historical temp/RH charts per sensor and location',
    path: '/admin/environmental-history',
  },
];

export default function AdminHub() {
  const navigate = useNavigate();

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-24">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Admin</h1>
        <p className="text-sm text-gray-500 mt-0.5">System configuration and setup</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl divide-y divide-gray-100">
        {ADMIN_ITEMS.map((item) => (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            className="w-full px-4 py-3.5 text-left flex items-center gap-3 hover:bg-gray-50 transition-colors"
            style={{ minHeight: '56px' }}
          >
            <span className="flex-shrink-0">{item.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-gray-900">{item.label}</div>
              <div className="text-xs text-gray-500 mt-0.5">{item.sub}</div>
            </div>
            <span className="text-gray-300 text-lg">›</span>
          </button>
        ))}
      </div>
    </div>
  );
}
