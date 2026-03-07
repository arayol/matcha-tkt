import { useState, useEffect } from "react";
import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "@/lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import LoginPage from "@/pages/LoginPage";
import Dashboard from "@/pages/Dashboard";
import ScannerPage from "@/pages/ScannerPage";
import TicketPage from "@/pages/TicketPage";
import TicketsPage from "@/pages/TicketsPage";
import CourtesyPage from "@/pages/CourtesyPage";
import AdminUsersPage from "@/pages/AdminUsersPage";
import NotFound from "@/pages/not-found";
import { Toaster } from "@/components/ui/toaster";

function useThemeGlobal() {
  const [dark, setDark] = useState(() => {
    if (typeof window === "undefined") return false;
    const stored = localStorage.getItem("moi-theme");
    return stored === "dark";
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("moi-theme", dark ? "dark" : "light");
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", dark ? "#0a0a0a" : "#f5f3ff");
  }, [dark]);

  return { dark, toggle: () => setDark((d) => !d) };
}

interface SharedProps {
  dark: boolean;
  toggleTheme: () => void;
  onLogout: () => void;
  user: { id: string; username: string; role: string };
}

function AppContent() {
  const { user, isLoading, login, logout, error } = useAuth();
  const { dark, toggle: toggleTheme } = useThemeGlobal();
  const [, navigate] = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground text-xl font-bold shadow-soft">
            M
          </div>
          <div className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      </div>
    );
  }

  const isAdmin = user?.role === "adm";
  const shared: SharedProps | null = user ? { dark, toggleTheme, onLogout: logout, user } : null;

  return (
    <>
      <Switch>
        <Route path="/ticket/:slug" component={TicketPage} />

        {!user || !shared ? (
          <Route>
            <LoginPage onLogin={login} error={error} />
          </Route>
        ) : (
          <>
            <Route path="/">
              {isAdmin ? (
                <Dashboard {...shared} />
              ) : (
                () => { navigate("/scan"); return null; }
              )}
            </Route>
            <Route path="/scan">
              <ScannerPage {...shared} />
            </Route>
            <Route path="/tickets">
              {isAdmin ? (
                <TicketsPage {...shared} />
              ) : (
                () => { navigate("/scan"); return null; }
              )}
            </Route>
            <Route path="/courtesy">
              <CourtesyPage {...shared} />
            </Route>
            <Route path="/admin/users">
              {isAdmin ? (
                <AdminUsersPage {...shared} />
              ) : (
                () => { navigate("/scan"); return null; }
              )}
            </Route>
            <Route component={NotFound} />
          </>
        )}
      </Switch>
      <Toaster />
    </>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  );
}
