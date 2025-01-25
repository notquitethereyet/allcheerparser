import { useEffect, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../App";
import { googleConfig, allowedEmails } from "../config";
import logo from "../assets/logo.png";

const Login = () => {
  const navigate = useNavigate();
  const auth = useContext(AuthContext);

  useEffect(() => {
    if (auth?.isAuthenticated) {
      navigate("/files");
      return;
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = initializeGoogleIdentity;
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, [auth?.isAuthenticated, navigate]);

  const initializeGoogleIdentity = () => {
    window.google?.accounts.id.initialize({
      client_id: googleConfig.clientId,
      callback: handleCredentialResponse,
      auto_select: true,
      cancel_on_tap_outside: true,
    });

    window.google?.accounts.id.renderButton(
      document.getElementById("googleSignInDiv"),
      {
        type: "standard",
        theme: "outline",
        size: "large",
        width: 250,
        logo_alignment: "center",
      }
    );

    window.google?.accounts.id.prompt();
  };

  const handleCredentialResponse = (credentialResponse: any) => {
    if (credentialResponse) {
      const tokenClient = window.google?.accounts.oauth2.initTokenClient({
        client_id: googleConfig.clientId,
        scope: "https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/userinfo.email",
        callback: (tokenResponse: any) => {
          if (tokenResponse.access_token) {
            fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
              headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
            })
              .then((res) => res.json())
              .then((userInfo) => {
                const userEmail = userInfo.email.toLowerCase(); // Normalize email to lowercase

                if (allowedEmails.includes(userEmail)) {
                  auth?.setAccessToken(tokenResponse.access_token);
                  auth?.setIsAuthenticated(true);
                  navigate("/files");
                } else {
                  navigate("/not-authorized"); // Redirect unauthorized users
                }
              })
              .catch((err) => {
                console.error("Failed to fetch user info", err);
                navigate("/not-authorized");
              });
          }
        },
      });

      tokenClient?.requestAccessToken();
    }
  };


  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background">
      {/* Company Logo */}
      <img src={logo} alt="Company Logo" className="w-32 h-auto mb-6" />

      {/* Login Container */}
      <div className="bg-white p-8 rounded-lg shadow-lg max-w-sm w-full text-center">
        <h1 className="text-3xl font-bold text-primary mb-6">AllCheer Schedule Parser</h1>
        <div id="googleSignInDiv" className="flex justify-center"></div>
      </div>
    </div>
  );
};

export default Login;
