import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

import Login from './Login';
import Registro from './Registro';
import Navbar from './Navbar/Navbar';
import PanelGraficos from './PanelGraficos';
import GraficoBase from './GraficoBase';
import BaseRegistros from './BaseRegistros';
import AdminRoute from './AdminRoute';

function App() {
  const [userData, setUserData] = useState(null);

  
  useEffect(() => {
    try {
      const rawUser = localStorage.getItem('userData');
      if (rawUser) setUserData(JSON.parse(rawUser));
    } catch { /* noop */ }
  }, []);

  
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === 'userData' && !e.newValue) setUserData(null);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const handleLoginSuccess = (payload) => {
    const token = payload?.token || null;
    const user  = payload?.user  || payload || null;

    if (token) localStorage.setItem('token', token);
    if (user) {
      localStorage.setItem('userData', JSON.stringify(user));
      setUserData(user);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('userData');
    setUserData(null);
  };

  const rol     = (userData?.rol || '').toString().toUpperCase();
  const nombre  = userData?.nombre || '';
  const equipo  = userData?.equipo || '';
  const isAdmin = rol === 'ADMIN';

  return (
    <Router>
      {!userData ? (
        <Routes>
          <Route path="*" element={<Login onLoginSuccess={handleLoginSuccess} />} />
        </Routes>
      ) : (
        <>
          <Navbar
            isAdmin={isAdmin}
            rol={rol}
            equipo={equipo}
            nombre={nombre}
            onLogout={handleLogout}
          />

          <Routes>
            
            <Route path="/" element={<Registro userData={userData} />} />

            
            <Route
              path="/GraficoBase"
              element={
                <AdminRoute>
                  <GraficoBase userData={userData} />
                </AdminRoute>
              }
            />

            
            <Route
              path="/BaseRegistros"
              element={
                <AdminRoute>
                  <BaseRegistros />
                </AdminRoute>
              }
            />

            
            <Route
              path="/grafico"
              element={
                <AdminRoute allow={['ADMIN', 'CONSULTOR']}>
                  <PanelGraficos />
                </AdminRoute>
              }
            />

            
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </>
      )}
    </Router>
  );
}

export default App;
