import { useAuth } from '../App';

function formatDate(d) {
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

export default function Today() {
  const { user } = useAuth();
  const today = formatDate(new Date());

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Today</h1>
        <p className="text-sm text-gray-500 mt-0.5">{today}</p>
      </div>

      {/* Greeting */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-4">
        <p className="text-gray-800 font-medium">
          Welcome back, {user?.name}.
        </p>
        <p className="text-gray-500 text-sm mt-1">
          Cultivate is starting up. Phase 1 features coming soon.
        </p>
      </div>

      {/* Active batches placeholder */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <span className="text-gray-700 font-medium">Active Batches</span>
          <span className="text-2xl font-bold text-green-800">0</span>
        </div>
        <p className="text-gray-400 text-sm mt-1">No batches yet — create your first batch to get started.</p>
      </div>
    </div>
  );
}
