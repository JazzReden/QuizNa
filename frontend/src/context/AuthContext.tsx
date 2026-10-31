import React, { useState, useEffect } from "react";
import { UserProfile, UserRole } from "../types";
import { api } from "../api/client";
import { AuthContext } from "./auth-context";

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(
    localStorage.getItem("quizna_token"),
  );
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const initializeAuth = async () => {
      const storedToken = localStorage.getItem("quizna_token");
      if (storedToken) {
        try {
          const profile = await api.getMe();
          setUser(profile);
          setToken(localStorage.getItem("quizna_token"));
        } catch {
          // Token invalid or backend restarted
          localStorage.removeItem("quizna_token");
          localStorage.removeItem("quizna_refresh");
          setToken(null);
          setUser(null);
        }
      }
      setIsLoading(false);
    };

    initializeAuth();
  }, []);

  const login = async (email: string, password?: string, role?: UserRole) => {
    setIsLoading(true);
    try {
      const res = await api.login(email, password, role);
      localStorage.setItem("quizna_token", res.token);
      if (res.refresh_token)
        localStorage.setItem("quizna_refresh", res.refresh_token);
      else localStorage.removeItem("quizna_refresh");
      setToken(res.token);
      setUser(res.profile);
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (
    fullName: string,
    email: string,
    role: UserRole,
    password?: string,
  ) => {
    setIsLoading(true);
    try {
      const res = await api.register(fullName, email, role, password);
      localStorage.setItem("quizna_token", res.token);
      if (res.refresh_token)
        localStorage.setItem("quizna_refresh", res.refresh_token);
      else localStorage.removeItem("quizna_refresh");
      setToken(res.token);
      setUser(res.profile);
    } finally {
      setIsLoading(false);
    }
  };

  const clearPasteDrafts = () => {
    try {
      for (const key of Object.keys(sessionStorage)) {
        if (key.startsWith("quizna-paste:")) sessionStorage.removeItem(key);
      }
    } catch {
      /* Draft storage may be unavailable. */
    }
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch {
      /* The browser can still sign out while disconnected. */
    }
    clearPasteDrafts();
    localStorage.removeItem("quizna_token");
    localStorage.removeItem("quizna_refresh");
    setToken(null);
    setUser(null);
  };

  const switchDemoUser = async (role: UserRole) => {
    setIsLoading(true);
    try {
      if (localStorage.getItem("quizna_token")) {
        try {
          await api.logout();
        } catch {
          /* A disconnected demo switch will also fail below. */
        }
      }
      const email =
        role === "teacher" ? "teacher@quizna.dev" : "student@quizna.dev";
      const res = await api.login(email);
      clearPasteDrafts();
      localStorage.setItem("quizna_token", res.token);
      if (res.refresh_token)
        localStorage.setItem("quizna_refresh", res.refresh_token);
      else localStorage.removeItem("quizna_refresh");
      setToken(res.token);
      setUser(res.profile);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        login,
        register,
        logout,
        switchDemoUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
