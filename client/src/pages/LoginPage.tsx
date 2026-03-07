import { useState } from "react";
import { Lock, User, AlertCircle, Eye, EyeOff } from "lucide-react";
import matchaLogo from "@assets/matcha-logo_1772825112655.png";

interface LoginPageProps {
  onLogin: (username: string, password: string) => Promise<boolean>;
  error: string | null;
}

export default function LoginPage({ onLogin, error }: LoginPageProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;
    setLoading(true);
    await onLogin(username, password);
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4" data-testid="login-page">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-3">
          <img src={matchaLogo} alt="Matcha On Ice" className="h-24 w-auto mx-auto" data-testid="img-logo" />
          <p className="text-sm text-muted-foreground mt-1">Ticket Management System</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-2xl border border-card-border bg-card p-5 shadow-card space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Username</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter username"
                  autoComplete="username"
                  autoFocus
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-muted/40 border border-card-border text-sm outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground"
                  data-testid="input-username"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  autoComplete="current-password"
                  className="w-full pl-9 pr-10 py-2.5 rounded-xl bg-muted/40 border border-card-border text-sm outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground"
                  data-testid="input-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-xl" data-testid="text-login-error">
                <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                {error}
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={loading || !username || !password}
            className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-3 rounded-2xl font-semibold text-sm shadow-soft hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="button-login"
          >
            {loading ? (
              <div className="h-4 w-4 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" />
            ) : (
              <Lock className="h-4 w-4" />
            )}
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <p className="text-center text-xs text-muted-foreground">
          San Diego, CA
        </p>
      </div>
    </div>
  );
}
