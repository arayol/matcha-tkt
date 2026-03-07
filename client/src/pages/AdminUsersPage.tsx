import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Users, UserPlus, Trash2, Shield, User,
  AlertCircle, Eye, EyeOff,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import AppLayout from "@/components/AppLayout";

interface UserData {
  id: string;
  username: string;
  role: string;
}

interface AdminUsersPageProps {
  dark: boolean;
  toggleTheme: () => void;
  onLogout: () => void;
  user: { id: string; username: string; role: string };
}

export default function AdminUsersPage({ dark, toggleTheme, onLogout, user }: AdminUsersPageProps) {
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

  const inputClass = "w-full px-3 py-2.5 rounded-xl text-sm outline-none transition-colors bg-muted/40 border border-card-border placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/30";

  return (
    <AppLayout dark={dark} toggleTheme={toggleTheme} onLogout={onLogout} user={user} activePath="/admin/users" data-testid="admin-users-page">
      <div className="space-y-6">
        <div className="hidden md:flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">User Management</h1>
            <p className="text-sm text-muted-foreground mt-1">Matcha On Ice · Admin Users</p>
          </div>
        </div>

        <div className="max-w-lg mx-auto md:mx-0 space-y-4">
          <button
            onClick={() => setShowForm(!showForm)}
            className={`w-full flex items-center justify-center gap-2 py-3 rounded-2xl font-medium text-sm transition-all active:scale-95 ${
              showForm
                ? "bg-muted text-muted-foreground"
                : "bg-primary text-primary-foreground shadow-soft"
            }`}
            data-testid="button-toggle-add-user"
          >
            <UserPlus className="h-4 w-4" />
            {showForm ? "Cancel" : "Add User"}
          </button>

          {showForm && (
            <div className="rounded-3xl p-5 space-y-3 border border-card-border bg-card shadow-card">
              <div>
                <label className="text-xs font-medium mb-1 block text-muted-foreground">Username</label>
                <input
                  value={form.username}
                  onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                  placeholder="Username"
                  className={inputClass}
                  data-testid="input-new-username"
                />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block text-muted-foreground">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={form.password}
                    onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                    placeholder="Password"
                    className={`${inputClass} pr-10`}
                    data-testid="input-new-password"
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" tabIndex={-1}>
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block text-muted-foreground">Role</label>
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

          <div className="rounded-3xl overflow-hidden border border-card-border bg-card shadow-card">
            {(userList || []).length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <Users className="h-8 w-8 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">No users</p>
              </div>
            ) : (
              <div>
                {(userList || []).map((u) => (
                  <div
                    key={u.id}
                    className="flex items-center gap-3 px-4 md:px-6 py-3 border-b last:border-b-0 border-card-border"
                    data-testid={`user-row-${u.id}`}
                  >
                    <div className={`flex h-9 w-9 items-center justify-center rounded-xl flex-shrink-0 ${
                      u.role === "adm"
                        ? "bg-primary/10 text-primary"
                        : "bg-muted text-muted-foreground"
                    }`}>
                      {u.role === "adm" ? <Shield className="h-4 w-4" /> : <User className="h-4 w-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{u.username}</p>
                      <p className="text-xs text-muted-foreground">
                        {u.role === "adm" ? "Admin" : "User"}
                      </p>
                    </div>
                    <select
                      value={u.role}
                      onChange={(e) => roleMutation.mutate({ id: u.id, role: e.target.value })}
                      disabled={u.id === user.id}
                      className={`text-xs px-2 py-1 rounded-lg appearance-none border-0 bg-muted ${
                        u.id === user.id ? "opacity-50 cursor-not-allowed" : ""
                      }`}
                      data-testid={`select-role-${u.id}`}
                    >
                      <option value="user">User</option>
                      <option value="adm">Admin</option>
                    </select>
                    {u.id !== user.id && (
                      <button
                        onClick={() => {
                          if (confirm(`Delete user "${u.username}"?`)) {
                            deleteMutation.mutate(u.id);
                          }
                        }}
                        className="p-1.5 rounded-lg transition-colors text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        data-testid={`button-delete-${u.id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
