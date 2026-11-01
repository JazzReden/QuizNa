import React, { useState, useEffect, useRef } from "react";
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

  const [confirmationError, setConfirmationError] = useState("");
  const initialization = useRef<Promise<void> | null>(null);

  useEffect(() => {
    const initializeAuth = async () => {
      const fragment = new URLSearchParams(window.location.hash.slice(1));
      if (fragment.has("access_token") || fragment.has("error") || fragment.has("error_description")) {
        const access = fragment.get("access_token");
        const refresh = fragment.get("refresh_token");
        // Strip credentials immediately, before any async work or navigation.
        window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
        if (access && refresh && !fragment.has("error") && fragment.get("type") === "signup") {
          try {
            const profile = await api.verifyConfirmationSession(access);
            localStorage.setItem("quizna_token", access);
            localStorage.setItem("quizna_refresh", refresh);
            setToken(access);
            setUser(profile);
          } catch {
            setConfirmationError("Your email link could not sign you in. Try signing in with your password.");
          }
        } else {
          setConfirmationError("This confirmation link is invalid or has expired. Try signing in or request a new link.");
        }
        setIsLoading(false);
        return;
      }
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

    initialization.current ??= initializeAuth();
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
      if ("confirmation_required" in res) return res;
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
        confirmationError,
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
