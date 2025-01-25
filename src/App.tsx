import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { useState, createContext, useContext } from "react";
import Login from "./components/Login";
import SheetsProcessor from "./components/SheetsProcessor";
import NotAuthorized from "./components/NotAuthorized";

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
    <AuthContext.Provider
      value={{
        isAuthenticated,
        setIsAuthenticated,
        accessToken,
        setAccessToken,
      }}
    >
      <Router basename="/allcheerparser">
        <Routes>
          {/* Public route for login */}
          <Route path="/" element={<Login />} />

          {/* Private route for SheetsProcessor */}
          <Route
            path="/files"
            element={
              <PrivateRoute>
                <SheetsProcessor />
              </PrivateRoute>
            }
          />

          {/* Route for unauthorized users */}
          <Route path="/not-authorized" element={<NotAuthorized />} />

          {/* Redirect for undefined paths */}
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Router>
    </AuthContext.Provider>
  );
}

export default App;
