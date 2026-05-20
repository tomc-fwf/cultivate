import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../App';
import { api } from '../api';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [phase, setPhase] = useState('loading'); // 'loading' | 'users' | 'pin'
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    async function loadUsers() {
      try {
        const list = await api.getUsers();
        setUsers(list);
        setPhase('users');
      } catch (e) {
        setLoadError(e.message);
        setPhase('users');
      }
    }
    loadUsers();
  }, []);

  function pressDigit(d) {
    if (pin.length < 8) setPin(p => p + d);
  }

  async function submitPin() {
    if (pin.length < 4) { setPinError('PIN must be at least 4 digits'); return; }
    setBusy(true); setPinError('');
    try {
      const { token, worker } = await api.login(selectedUser.id, pin);
      login(token, worker);
      navigate('/');
    } catch (e) {
      setPinError(e.message);
      setPin('');
    } finally {
      setBusy(false);
    }
  }

  if (phase === 'loading') {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-green-800">Cultivate</h1>
          <p className="text-gray-600 text-sm mt-1">Cannabis Cultivation Tracking</p>
        </div>

        {phase === 'users' && !selectedUser && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <h2 className="font-semibold text-gray-900 text-center mb-4">Who are you?</h2>
            {loadError && <p className="text-red-500 text-sm text-center mb-3">{loadError}</p>}
            {users.length === 0 && !loadError && (
              <p className="text-gray-500 text-sm text-center">No users found.</p>
            )}
            <div className="space-y-2">
              {users.map(u => (
                <button
                  key={u.id}
                  onClick={() => { setSelectedUser(u); setPhase('pin'); setPinError(''); setPin(''); }}
                  className="w-full py-4 px-4 bg-gray-50 hover:bg-green-50 border border-gray-200 hover:border-green-500 rounded-xl text-left font-medium text-gray-900 transition-colors"
                  style={{ minHeight: '56px' }}
                >
                  <span>{u.name}</span>
                  <span className="ml-2 text-xs text-gray-400 capitalize">{u.role}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {phase === 'pin' && selectedUser && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <h2 className="font-semibold text-gray-900 text-center mb-1">Hello, {selectedUser.name}</h2>
            <p className="text-gray-600 text-sm text-center mb-5">Enter your PIN</p>

            {/* PIN dots */}
            <div className="flex justify-center gap-3 mb-4">
              {Array.from({ length: 8 }, (_, i) => (
                <div
                  key={i}
                  className={`w-3 h-3 rounded-full transition-colors ${i < pin.length ? 'bg-green-800' : 'bg-gray-200'}`}
                />
              ))}
            </div>

            {pinError && (
              <p className="text-red-500 text-sm text-center mb-3">{pinError}</p>
            )}

            {/* Numpad */}
            <div className="grid grid-cols-3 gap-2 mb-3">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, '⌫'].map((d, i) => (
                <button
                  key={i}
                  onClick={() => {
                    if (d === '') return;
                    if (d === '⌫') { setPin(p => p.slice(0, -1)); return; }
                    pressDigit(String(d));
                  }}
                  disabled={d === ''}
                  className={`rounded-xl text-lg font-semibold transition-colors ${
                    d === ''
                      ? 'invisible'
                      : 'bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-900'
                  }`}
                  style={{ minHeight: '64px' }}
                >
                  {d}
                </button>
              ))}
            </div>

            <button
              onClick={submitPin}
              disabled={busy || pin.length < 4}
              className="w-full py-4 bg-green-800 text-white rounded-xl font-semibold hover:bg-green-900 disabled:bg-gray-200 disabled:text-gray-400 transition-colors mb-2"
              style={{ minHeight: '56px' }}
            >
              {busy ? 'Signing in...' : 'Sign In'}
            </button>
            <button
              onClick={() => { setSelectedUser(null); setPhase('users'); setPin(''); setPinError(''); }}
              className="w-full text-sm text-gray-600 hover:text-gray-900 py-2"
            >
              Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
