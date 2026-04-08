import { useState, useEffect } from 'react';
import * as api from './api';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';

export default function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (api.getToken()) {
      api.getMe()
        .then(() => setLoggedIn(true))
        .catch(() => setLoggedIn(false))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  if (loading) return null;

  if (!loggedIn) {
    return <Login onLogin={() => setLoggedIn(true)} />;
  }

  return <Dashboard onLogout={() => { api.clearToken(); setLoggedIn(false); }} />;
}
