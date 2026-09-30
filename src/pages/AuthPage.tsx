import { useState, type FormEvent } from "react";
import { useNavigate, useLocation, Navigate } from "react-router-dom";
import {
  Eye,
  EyeOff,
  AlertCircle,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";

export default function AuthPage() {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const destination = (location.state as { from?: { pathname?: string } })?.from?.pathname || "/";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isAuthenticated) {
    return <Navigate to={destination} replace />;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!username.trim() || !password.trim()) {
      setError("Veuillez renseigner votre identifiant / email et votre mot de passe.");
      return;
    }

    setLoading(true);
    try {
      const res = await login(username, password);
      if (res.success) {
        navigate(destination, { replace: true });
      } else {
        setError(res.error || "Identifiant ou mot de passe incorrect.");
      }
    } catch {
      setError("Erreur de connexion. Veuillez réessayer.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page-wrapper">
      {/* Subtle overlay to enhance contrast and readability */}
      <div className="auth-overlay" />

      {/* Main Glassmorphic Login Card - Positioned in the exact center on PC and Mobile */}
      <div className="auth-card">
        {/* Card Title */}
        <div style={{ textAlign: "center", marginBottom: "26px" }}>
          <p style={{ fontSize: "11px", fontWeight: 900, letterSpacing: "0.25em", color: "rgba(255, 255, 255, 0.75)", textTransform: "uppercase", marginBottom: "6px" }}>
            ITALCAR • FLUX ATELIER
          </p>
          <h1 style={{ fontSize: "28px", fontWeight: 900, color: "#ffffff", letterSpacing: "0.08em", textTransform: "uppercase", margin: 0 }}>
            LOG IN
          </h1>
        </div>

        {/* Error Alert */}
        {error && (
          <div style={{
            marginBottom: "16px",
            padding: "12px 16px",
            borderRadius: "16px",
            background: "rgba(239, 68, 68, 0.28)",
            border: "1px solid rgba(248, 113, 113, 0.45)",
            color: "#ffffff",
            fontSize: "12px",
            boxShadow: "0 8px 16px rgba(0,0,0,0.2)"
          }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
              <AlertCircle style={{ width: "16px", height: "16px", flexShrink: 0, color: "#fca5a5", marginTop: "2px" }} />
              <div>
                <span style={{ fontWeight: 500, display: "block" }}>{error}</span>
              </div>
            </div>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Username / Email Input */}
          <div style={{ position: "relative" }}>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Email ou Nom d'utilisateur"
              autoComplete="username"
              className="auth-input"
            />
          </div>

          {/* Password Input */}
          <div style={{ position: "relative" }}>
            <input
              type={showPassword ? "text" : "password"}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mot de passe"
              autoComplete="current-password"
              className="auth-input"
              style={{ paddingRight: "48px" }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              style={{
                position: "absolute",
                right: "16px",
                top: "50%",
                transform: "translateY(-50%)",
                background: "transparent",
                border: "none",
                color: "rgba(255, 255, 255, 0.7)",
                cursor: "pointer",
                padding: "4px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              }}
              title={showPassword ? "Masquer" : "Afficher"}
            >
              {showPassword ? <EyeOff style={{ width: "16px", height: "16px" }} /> : <Eye style={{ width: "16px", height: "16px" }} />}
            </button>
          </div>

          {/* Submit LOG IN Button */}
          <div style={{ paddingTop: "6px" }}>
            <button
              type="submit"
              disabled={loading}
              className="auth-btn-primary"
            >
              {loading ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                  <span style={{
                    width: "16px",
                    height: "16px",
                    border: "2px solid rgba(15, 23, 42, 0.3)",
                    borderTopColor: "#0f172a",
                    borderRadius: "50%",
                    animation: "spin 1s linear infinite"
                  }} />
                  CONNEXION...
                </span>
              ) : (
                "LOG IN"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
