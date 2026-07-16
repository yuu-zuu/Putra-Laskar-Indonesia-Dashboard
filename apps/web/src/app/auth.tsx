import type { AuthUser, ChangePasswordInput, LoginInput, RegisterInput } from "@spbu/contracts";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import * as authGateway from "../data/authGateway.js";

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  changePassword: (input: ChangePasswordInput) => Promise<void>;
  deleteAccount: (password: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void authGateway
      .getCurrentUser()
      .then(setUser)
      .finally(() => setLoading(false));
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      login: async (input) => setUser(await authGateway.login(input)),
      register: async (input) => setUser(await authGateway.register(input)),
      logout: async () => {
        await authGateway.logout();
        setUser(null);
      },
      changePassword: authGateway.changePassword,
      deleteAccount: async (password) => {
        await authGateway.deleteAccount(password);
        setUser(null);
      },
      refresh: async () => setUser(await authGateway.getCurrentUser()),
    }),
    [user, loading],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === null) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
