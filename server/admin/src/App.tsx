import { useState, useEffect } from 'react';
import * as api from './api';
import Login from './pages/Login';
import ChangePassword from './pages/ChangePassword';
import Dashboard from './pages/Dashboard';

type View = 'loading' | 'login' | 'change-password' | 'dashboard';

export default function App() {
  const [view, setView] = useState<View>('loading');

  useEffect(() => {
    if (api.getToken()) {
      api.getMe()
        .then((me) => {
          if (me.role !== 'admin') { api.clearToken(); setView('login'); return; }
          setView(me.must_change_password ? 'change-password' : 'dashboard');
        })
        .catch(() => setView('login'));
    } else {
      setView('login');
    }
  }, []);

  // Any API call may report that the password must be changed or that the session is gone
  useEffect(() => {
    const onMustChange = () => setView(v => (v === 'login' ? v : 'change-password'));
    const onExpired = () => setView('login');
    window.addEventListener(api.MUST_CHANGE_PASSWORD_EVENT, onMustChange);
    window.addEventListener(api.SESSION_EXPIRED_EVENT, onExpired);
    return () => {
      window.removeEventListener(api.MUST_CHANGE_PASSWORD_EVENT, onMustChange);
      window.removeEventListener(api.SESSION_EXPIRED_EVENT, onExpired);
    };
  }, []);

  const logout = () => { api.clearToken(); setView('login'); };

  if (view === 'loading') return null;

  if (view === 'login') {
    return <Login onLogin={(mustChange) => setView(mustChange ? 'change-password' : 'dashboard')} />;
  }

  if (view === 'change-password') {
    return <ChangePassword onDone={() => setView('dashboard')} onLogout={logout} />;
  }

  return <Dashboard onLogout={logout} />;
}
