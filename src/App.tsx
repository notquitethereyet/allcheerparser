// src/App.tsx
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useState, createContext, useContext } from 'react';
import Login from './components/Login';
import SheetsProcessor from './components/SheetsProcessor';

interface AuthContextType {
  isAuthenticated: boolean;
  setIsAuthenticated: (value: boolean) => void;
  accessToken: string | null;
  setAccessToken: (value: string | null) => void;
}

export const AuthContext = createContext<AuthContextType | null>(null);

const PrivateRoute = ({ children }: { children: React.ReactNode }) => {
  const auth = useContext(AuthContext);
  if (!auth?.isAuthenticated) {
    return <Navigate to="/" />;
  }
  return <>{children}</>;
};

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  return (
    <AuthContext.Provider value={{ 
      isAuthenticated, 
      setIsAuthenticated,
      accessToken,
      setAccessToken 
    }}>
      <Router>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route
            path="/files"
            element={
              <PrivateRoute>
                <SheetsProcessor />
              </PrivateRoute>
            }
          />
        </Routes>
      </Router>
    </AuthContext.Provider>
  );
}

export default App;
