import { createContext, useContext } from "react";
import { UserProfile, UserRole } from "../types";

export interface AuthContextType {
  user: UserProfile | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password?: string, role?: UserRole) => Promise<void>;
  register: (
    fullName: string,
    email: string,
    role: UserRole,
    password?: string,
  ) => Promise<void>;
  logout: () => Promise<void>;
  switchDemoUser: (role: UserRole) => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(
  undefined,
);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
