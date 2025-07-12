import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { TonConnectUIProvider } from '@tonconnect/ui-react';
import AdminPanel from './components/AdminPanel';
import UserPanel from './components/UserPanel';
import { tonConnectConfig } from './config/tonConnect';

function App() {
    return (
        <TonConnectUIProvider manifestUrl={tonConnectConfig.manifestUrl}>
            <Router>
                <Routes>
                    <Route path="/admin" element={<AdminPanel />} />
                    <Route path="/" element={<UserPanel />} />
                </Routes>
            </Router>
        </TonConnectUIProvider>
    );
}

export default App;
