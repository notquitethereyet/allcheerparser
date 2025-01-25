import { useNavigate } from "react-router-dom";

const NotAuthorized = () => {
  const navigate = useNavigate();

  const handleBackToLogin = () => {
    navigate("/"); // Redirect to the login page
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background">
      <div className="bg-white p-8 rounded-lg shadow-lg max-w-sm w-full text-center">
        <h1 className="text-3xl font-bold text-red-600 mb-6">Access Denied</h1>
        <p className="text-gray-700 mb-6">
          You are not authorized to access this application. If you believe this is a mistake, please contact the administrator.
        </p>
        <button
          onClick={handleBackToLogin}
          className="bg-primary text-white px-6 py-2 rounded-lg hover:bg-highlight-primary"
        >
          Back to Login
        </button>
      </div>
    </div>
  );
};

export default NotAuthorized;
