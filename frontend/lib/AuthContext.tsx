"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { supabase } from "./supabase";
import type { User, Session } from "@supabase/supabase-js";

/* ── Types ──────────────────────────────────────────────────────────────────── */
interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAuthModalOpen: boolean;
  openAuthModal: () => void;
  closeAuthModal: () => void;
  signOut: () => Promise<void>;
  /** Checks auth: if logged in, runs the callback. If not, opens the auth modal. */
  requireAuth: (callback: () => void) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/* ── Provider ───────────────────────────────────────────────────────────────── */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  // Pending action to run after successful auth
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  useEffect(() => {
    // Restore existing session
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      setLoading(false);
    });

    // Listen for auth changes (login, logout, token refresh)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // When user logs in and there's a pending action, run it
  useEffect(() => {
    if (user && pendingAction) {
      pendingAction();
      setPendingAction(null);
      setIsAuthModalOpen(false);
    }
  }, [user, pendingAction]);

  const openAuthModal = useCallback(() => setIsAuthModalOpen(true), []);
  const closeAuthModal = useCallback(() => {
    setIsAuthModalOpen(false);
    setPendingAction(null);
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
  }, []);

  const requireAuth = useCallback(
    (callback: () => void) => {
      if (user) {
        callback();
      } else {
        setPendingAction(() => callback);
        setIsAuthModalOpen(true);
      }
    },
    [user]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        isAuthModalOpen,
        openAuthModal,
        closeAuthModal,
        signOut,
        requireAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

/* ── Hook ───────────────────────────────────────────────────────────────────── */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
