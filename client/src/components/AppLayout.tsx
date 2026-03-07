import { useState } from "react";
import { useLocation } from "wouter";
import {
  LayoutDashboard, Ticket, LogOut, ScanLine, Gift, Users,
  Menu, X, Moon, Sun, Shield,
} from "lucide-react";

interface AppLayoutProps {
  dark: boolean;
  toggleTheme: () => void;
  onLogout: () => void;
  user: { id: string; username: string; role: string };
  activePath: string;
  children: React.ReactNode;
  "data-testid"?: string;
}

export default function AppLayout({ dark, toggleTheme, onLogout, user, activePath, children, "data-testid": testId }: AppLayoutProps) {
  const [, navigate] = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const isAdmin = user.role === "adm";

  const navItems = [
    { icon: LayoutDashboard, label: "Dashboard", href: "/", adminOnly: true },
    { icon: ScanLine, label: "Scanner", href: "/scan", adminOnly: false },
    { icon: Ticket, label: "Tickets", href: "/tickets", adminOnly: true },
    { icon: Gift, label: "Courtesy Ticket", href: "/courtesy", adminOnly: false },
    ...(isAdmin ? [{ icon: Users, label: "User Management", href: "/admin/users", adminOnly: false }] : []),
  ];

  const visibleNav = navItems.filter((n) => !n.adminOnly || isAdmin);

  const sidebarItems = [
    ...(isAdmin ? [{ icon: LayoutDashboard, label: "Dashboard", href: "/" }] : []),
    { icon: ScanLine, label: "Scanner", href: "/scan" },
    ...(isAdmin ? [{ icon: Ticket, label: "Tickets", href: "/tickets" }] : []),
    { icon: Gift, label: "Courtesy", href: "/courtesy" },
    ...(isAdmin ? [{ icon: Users, label: "Users", href: "/admin/users" }] : []),
  ];

  return (
    <div className="min-h-screen bg-background text-foreground" data-testid={testId}>
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden" data-testid="drawer-overlay">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDrawerOpen(false)} />
          <div className={`absolute left-0 top-0 bottom-0 w-72 p-5 flex flex-col shadow-2xl ${dark ? "bg-[#111]" : "bg-card"}`}>
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <div>
                  <p className="font-semibold text-sm">Matcha On Ice</p>
                  <p className={`text-xs ${dark ? "text-gray-500" : "text-muted-foreground"}`}>Ticket Management</p>
                </div>
              </div>
              <button onClick={() => setDrawerOpen(false)} className={`p-1.5 rounded-lg ${dark ? "hover:bg-[#222]" : "hover:bg-muted"}`}>
                <X className="h-5 w-5" />
              </button>
            </div>

            <nav className="flex-1 space-y-1">
              {visibleNav.map((item) => (
                <button
                  key={item.label}
                  onClick={() => { navigate(item.href); setDrawerOpen(false); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    activePath === item.href
                      ? "bg-primary/10 text-primary"
                      : dark ? "hover:bg-[#222] text-gray-300" : "hover:bg-muted text-foreground"
                  }`}
                  data-testid={`drawer-${item.label.toLowerCase().replace(/\s/g, "-")}`}
                >
                  <item.icon className="h-5 w-5" />
                  {item.label}
                </button>
              ))}
            </nav>

            <div className={`border-t pt-4 mt-4 space-y-2 ${dark ? "border-[#222]" : "border-card-border"}`}>
              <div className={`flex items-center gap-3 px-3 py-2 rounded-xl ${dark ? "bg-[#1a1a1a]" : "bg-muted/30"}`}>
                <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${dark ? "bg-primary/20 text-primary" : "bg-primary/10 text-primary"}`}>
                  <Shield className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xs font-medium">{user.username}</p>
                  <p className={`text-[10px] ${dark ? "text-gray-500" : "text-muted-foreground"}`}>{user.role === "adm" ? "Admin" : "User"}</p>
                </div>
              </div>
              <button
                onClick={toggleTheme}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  dark ? "hover:bg-[#222] text-gray-300" : "hover:bg-muted text-foreground"
                }`}
              >
                {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                {dark ? "Light Mode" : "Dark Mode"}
              </button>
              <button
                onClick={onLogout}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-destructive hover:bg-destructive/10 transition-colors"
                data-testid="drawer-logout"
              >
                <LogOut className="h-5 w-5" />
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="md:hidden flex items-center justify-between px-4 py-3 border-b border-card-border bg-card">
        <button
          onClick={() => setDrawerOpen(true)}
          className="p-2 rounded-xl hover:bg-muted"
          data-testid="button-hamburger"
        >
          <Menu className="h-5 w-5" />
        </button>
        <span className="font-semibold text-sm">Matcha On Ice</span>
        <button onClick={toggleTheme} className="p-2 rounded-xl text-muted-foreground hover:text-foreground" data-testid="button-theme-mobile">
          {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </header>

      <div className="mx-auto max-w-[1440px] md:grid md:grid-cols-[88px_1fr] gap-6 p-4 md:p-6">
        <aside className="hidden md:flex min-h-[calc(100vh-48px)] flex-col items-center justify-between rounded-[32px] border border-sidebar-border bg-sidebar px-4 py-6 shadow-card" data-testid="sidebar">
          <div className="flex flex-col items-center gap-6">
            <nav className="flex flex-col gap-4">
              {sidebarItems.map((item) => (
                <button
                  key={item.label}
                  onClick={() => navigate(item.href)}
                  title={item.label}
                  className={`flex h-11 w-11 items-center justify-center rounded-xl transition-colors ${
                    activePath === item.href
                      ? "bg-sidebar-accent text-primary"
                      : "text-muted-foreground hover:bg-sidebar-accent hover:text-primary"
                  }`}
                  data-testid={`nav-${item.label.toLowerCase()}`}
                >
                  <item.icon className="h-5 w-5" />
                </button>
              ))}
            </nav>
          </div>
          <div className="flex flex-col items-center gap-3">
            <button
              onClick={toggleTheme}
              title="Toggle theme"
              className="flex h-11 w-11 items-center justify-center rounded-xl transition-colors text-muted-foreground hover:bg-sidebar-accent"
              data-testid="button-theme-sidebar"
            >
              {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
            <button
              onClick={onLogout}
              className="flex h-11 w-11 items-center justify-center rounded-xl text-primary hover:bg-sidebar-accent transition-colors"
              data-testid="button-logout"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </aside>

        <main className="min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
}
