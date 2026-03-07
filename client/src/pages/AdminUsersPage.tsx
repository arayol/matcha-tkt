import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  ArrowLeft, Users, UserPlus, Trash2, Shield, User,
  AlertCircle, Moon, Sun, Eye, EyeOff,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface UserData {
  id: string;
  username: string;
  role: string;
}

export default function AdminUsersPage({ dark, toggleTheme, currentUserId }: { dark: boolean; toggleTheme: () => void; currentUserId: string }) {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ username: "", password: "", role: "user" });
  const [showPassword, setShowPassword] = useState(false);

  const { data: userList } = useQuery<UserData[]>({ queryKey: ["/api/admin/users"] });

  const createMutation = useMutation({
    mutationFn: (body: typeof form) => apiRequest("POST", "/api/admin/users", body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setForm({ username: "", password: "", role: "user" });
      setShowForm(false);
      toast({ title: "User created" });
    },
    onError: async (err: any) => {
      let msg = "Failed to create user";
      try {
        const body = await err?.response?.json?.();
        if (body?.error) msg = body.error;
      } catch {}
      toast({ title: msg, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/users/${id}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "User deleted" });
    },
    onError: () => toast({ title: "Failed to delete user", variant: "destructive" }),
  });

  const roleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) => apiRequest("PATCH", `/api/admin/users/${id}`, { role }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Role updated" });
    },
    onError: () => toast({ title: "Failed to update role", variant: "destructive" }),
  });

  const inputClass = `w-full px-3 py-2.5 rounded-xl text-sm outline-none transition-colors ${
    dark
      ? "bg-[#161616] border border-[#222] text-white placeholder-gray-600 focus:border-primary"
      : "bg-muted/40 border border-card-border placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/30"
  }`;

  return (
    <div className={`min-h-screen flex flex-col ${dark ? "bg-[#0a0a0a] text-white" : "bg-background text-foreground"}`} data-testid="admin-users-page">
      <header className={`flex items-center justify-between px-4 py-3 border-b ${dark ? "bg-[#111] border-[#222]" : "bg-card border-card-border"}`}>
        <Link href="/" className={`flex items-center gap-1.5 text-sm ${dark ? "text-gray-400 hover:text-white" : "text-muted-foreground hover:text-foreground"} transition-colors`} data-testid="link-back">
          <ArrowLeft className="h-4 w-4" />
          <span>Back</span>
        </Link>
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          <h1 className="font-semibold text-base">User Management</h1>
        </div>
        <button onClick={toggleTheme} className={`p-2 rounded-xl ${dark ? "text-gray-400 hover:text-white" : "text-muted-foreground hover:text-foreground"}`} data-testid="button-theme-admin">
          {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </header>

      <main className="flex-1 p-4 space-y-4 max-w-lg mx-auto w-full">
        <button
          onClick={() => setShowForm(!showForm)}
          className={`w-full flex items-center justify-center gap-2 py-3 rounded-2xl font-medium text-sm transition-all active:scale-95 ${
            showForm
              ? dark ? "bg-[#222] text-gray-300" : "bg-muted text-muted-foreground"
              : "bg-primary text-primary-foreground shadow-soft"
          }`}
          data-testid="button-toggle-add-user"
        >
          <UserPlus className="h-4 w-4" />
          {showForm ? "Cancel" : "Add User"}
        </button>

        {showForm && (
          <div className={`rounded-2xl p-4 space-y-3 ${dark ? "bg-[#111] border border-[#222]" : "bg-card border border-card-border shadow-card"}`}>
            <div>
              <label className={`text-xs font-medium mb-1 block ${dark ? "text-gray-400" : "text-muted-foreground"}`}>Username</label>
              <input
                value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                placeholder="Username"
                className={inputClass}
                data-testid="input-new-username"
              />
            </div>
            <div>
              <label className={`text-xs font-medium mb-1 block ${dark ? "text-gray-400" : "text-muted-foreground"}`}>Password</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder="Password"
                  className={`${inputClass} pr-10`}
                  data-testid="input-new-password"
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className={`absolute right-3 top-1/2 -translate-y-1/2 ${dark ? "text-gray-600" : "text-muted-foreground"}`} tabIndex={-1}>
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className={`text-xs font-medium mb-1 block ${dark ? "text-gray-400" : "text-muted-foreground"}`}>Role</label>
              <select
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                className={`${inputClass} appearance-none`}
                data-testid="select-new-role"
              >
                <option value="user">User (mobile only)</option>
                <option value="adm">Admin (full access)</option>
              </select>
            </div>

            {createMutation.isError && (
              <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-xl">
                <AlertCircle className="h-3.5 w-3.5" />
                Failed to create user
              </div>
            )}

            <button
              onClick={() => {
                if (form.username && form.password) createMutation.mutate(form);
              }}
              disabled={createMutation.isPending || !form.username || !form.password}
              className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-2.5 rounded-xl font-medium text-sm active:scale-95 transition-all disabled:opacity-50"
              data-testid="button-create-user"
            >
              {createMutation.isPending ? "Creating..." : "Create User"}
            </button>
          </div>
        )}

        <div className={`rounded-2xl overflow-hidden ${dark ? "bg-[#111] border border-[#222]" : "bg-card border border-card-border shadow-card"}`}>
          {(userList || []).length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <Users className={`h-8 w-8 ${dark ? "text-gray-700" : "text-muted-foreground/30"}`} />
              <p className={`text-sm ${dark ? "text-gray-500" : "text-muted-foreground"}`}>No users</p>
            </div>
          ) : (
            <div>
              {(userList || []).map((user) => (
                <div
                  key={user.id}
                  className={`flex items-center gap-3 px-4 py-3 border-b last:border-b-0 ${dark ? "border-[#222]" : "border-card-border"}`}
                  data-testid={`user-row-${user.id}`}
                >
                  <div className={`flex h-9 w-9 items-center justify-center rounded-xl flex-shrink-0 ${
                    user.role === "adm"
                      ? dark ? "bg-primary/20 text-primary" : "bg-primary/10 text-primary"
                      : dark ? "bg-[#222] text-gray-400" : "bg-muted text-muted-foreground"
                  }`}>
                    {user.role === "adm" ? <Shield className="h-4 w-4" /> : <User className="h-4 w-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{user.username}</p>
                    <p className={`text-xs ${dark ? "text-gray-500" : "text-muted-foreground"}`}>
                      {user.role === "adm" ? "Admin" : "User"}
                    </p>
                  </div>
                  <select
                    value={user.role}
                    onChange={(e) => roleMutation.mutate({ id: user.id, role: e.target.value })}
                    disabled={user.id === currentUserId}
                    className={`text-xs px-2 py-1 rounded-lg appearance-none ${
                      user.id === currentUserId
                        ? "opacity-50 cursor-not-allowed"
                        : ""
                    } ${dark ? "bg-[#222] text-gray-300 border-0" : "bg-muted border-0"}`}
                    data-testid={`select-role-${user.id}`}
                  >
                    <option value="user">User</option>
                    <option value="adm">Admin</option>
                  </select>
                  {user.id !== currentUserId && (
                    <button
                      onClick={() => {
                        if (confirm(`Delete user "${user.username}"?`)) {
                          deleteMutation.mutate(user.id);
                        }
                      }}
                      className={`p-1.5 rounded-lg transition-colors ${dark ? "text-gray-600 hover:text-red-400 hover:bg-red-950/30" : "text-muted-foreground hover:text-destructive hover:bg-destructive/10"}`}
                      data-testid={`button-delete-${user.id}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
