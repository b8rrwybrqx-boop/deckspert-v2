export type AuthMode = "supabase" | "demo";

export type AuthUser = {
  id: string;
  email: string;
  displayName: string;
  authMode: AuthMode;
};

export type AuthContextValue = {
  user: AuthUser | null;
  isLoading: boolean;
  isConfigured: boolean;
  authMode: AuthMode;
  getRequestHeaders: () => Promise<Record<string, string>>;
  signInWithEmailLink: (email: string) => Promise<void>;
  signInDemo: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
};
