import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import type { Session } from "@supabase/supabase-js";

import { getSupabaseClient, isSupabaseConfigured } from "../lib/supabase";
import type { AuthContextValue, AuthUser } from "./types";

const DEMO_STORAGE_KEY = "deckspert.demo.user";

const AuthContext = createContext<AuthContextValue | null>(null);

function displayNameFromEmail(email: string) {
  const localPart = email.split("@")[0] ?? email;
  const normalized = localPart.replace(/[._-]+/g, " ").trim();
  if (!normalized) {
    return "Account";
  }

  return normalized.replace(/\b\w/g, (character) => character.toUpperCase());
}

function mapSessionToUser(session: Session | null): AuthUser | null {
  const email = session?.user.email;
  if (!session?.user.id || !email) {
    return null;
  }

  return {
    id: session.user.id,
    email,
    displayName:
      (typeof session.user.user_metadata?.full_name === "string" && session.user.user_metadata.full_name) ||
      displayNameFromEmail(email),
    authMode: "supabase"
  };
}

function readDemoUser(): AuthUser | null {
  try {
    const stored = window.localStorage.getItem(DEMO_STORAGE_KEY);
    if (!stored) {
      return null;
    }
    const parsed = JSON.parse(stored) as AuthUser;
    if (!parsed?.email || !parsed?.id) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function encodeDemoUser(user: AuthUser) {
  return window.btoa(JSON.stringify(user));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const configured = isSupabaseConfigured();
  const supabase = getSupabaseClient();

  useEffect(() => {
    if (!configured || !supabase) {
      setUser(readDemoUser());
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) {
        setUser(mapSessionToUser(data.session));
        setIsLoading(false);
      }
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(mapSessionToUser(session));
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [configured, supabase]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isConfigured: configured,
      authMode: configured ? "supabase" : "demo",
      async getRequestHeaders() {
        if (configured && supabase) {
          const { data } = await supabase.auth.getSession();
          const token = data.session?.access_token;
          const headers: Record<string, string> = {};
          if (token) {
            headers.Authorization = `Bearer ${token}`;
          }
          return headers;
        }

        const demoUser = readDemoUser();
        const headers: Record<string, string> = {};
        if (demoUser) {
          headers["x-deckspert-demo-user"] = encodeDemoUser(demoUser);
        }
        return headers;
      },
      async signInWithEmailLink(email: string) {
        if (!configured || !supabase) {
          throw new Error("Supabase auth is not configured in this environment.");
        }

        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: {
            emailRedirectTo: window.location.origin
          }
        });

        if (error) {
          throw error;
        }
      },
      async signInDemo(email: string) {
        const normalizedEmail = email.trim().toLowerCase();
        if (!normalizedEmail) {
          throw new Error("Enter an email address to continue.");
        }

        const demoUser: AuthUser = {
          id: `demo-${normalizedEmail}`,
          email: normalizedEmail,
          displayName: displayNameFromEmail(normalizedEmail),
          authMode: "demo"
        };

        window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(demoUser));
        setUser(demoUser);
      },
      async signOut() {
        if (configured && supabase) {
          const { error } = await supabase.auth.signOut();
          if (error) {
            throw error;
          }
          return;
        }

        window.localStorage.removeItem(DEMO_STORAGE_KEY);
        setUser(null);
      }
    }),
    [configured, isLoading, supabase, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuthContext must be used inside AuthProvider.");
  }
  return context;
}
