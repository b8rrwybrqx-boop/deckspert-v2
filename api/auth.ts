import { createClient } from "@supabase/supabase-js";

import { prisma } from "../core/server/prisma.js";
import { readHeader, type ApiRequest, type ApiResponse } from "./_utils.js";

export type RequestUser = {
  id: string;
  email: string;
  displayName: string;
  authMode: "supabase" | "demo";
};

let supabaseServerClient:
  | ReturnType<typeof createClient<{
      public: {
        Tables: Record<string, never>;
        Views: Record<string, never>;
        Functions: Record<string, never>;
        Enums: Record<string, never>;
        CompositeTypes: Record<string, never>;
      };
    }>>
  | null = null;

function getSupabaseServerConfig() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return null;
  }

  return { url, anonKey };
}

function getSupabaseServerClient() {
  const config = getSupabaseServerConfig();
  if (!config) {
    return null;
  }

  if (!supabaseServerClient) {
    supabaseServerClient = createClient(config.url, config.anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
  }

  return supabaseServerClient;
}

// The demo header is an unsigned base64 blob, so anyone who sends one is
// treated as that user. That is fine on a laptop or a preview build, where the
// client only falls back to demo mode because Supabase isn't configured (see
// apps/web/src/auth/AuthProvider.tsx), and unacceptable in production, where it
// would be an unauthenticated bypass of every access check below it.
function isDemoAuthEnabled(): boolean {
  const vercelEnv = process.env.VERCEL_ENV;
  if (vercelEnv) {
    return vercelEnv !== "production";
  }

  return process.env.NODE_ENV !== "production";
}

function decodeDemoUser(encoded: string): RequestUser | null {
  try {
    const parsed = JSON.parse(atob(encoded)) as Partial<RequestUser>;
    if (!parsed?.id || !parsed?.email || !parsed?.displayName) {
      return null;
    }

    return {
      id: parsed.id,
      email: parsed.email,
      displayName: parsed.displayName,
      authMode: "demo"
    };
  } catch {
    return null;
  }
}

export async function getAuthenticatedUser(req: ApiRequest): Promise<RequestUser | null> {
  // In production the header is ignored outright rather than rejected, so a
  // request that also carries a real Supabase token still authenticates.
  const demoHeader = isDemoAuthEnabled() ? readHeader(req, "x-deckspert-demo-user") : null;
  if (demoHeader) {
    const demoUser = decodeDemoUser(demoHeader);
    if (!demoUser) {
      return null;
    }

    const existingProfile = await prisma.userProfile.findFirst({
      where: {
        OR: [{ id: demoUser.id }, { email: demoUser.email }]
      }
    });

    if (!existingProfile) {
      return demoUser;
    }

    return {
      ...demoUser,
      id: existingProfile.id,
      displayName: existingProfile.displayName || demoUser.displayName
    };
  }

  const authorization = readHeader(req, "authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length).trim() : null;
  if (!token) {
    return null;
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user?.id || !data.user.email) {
    return null;
  }

  const email = data.user.email;
  const metadata = (data.user.user_metadata ?? {}) as { full_name?: string };
  const displayName =
    (typeof metadata.full_name === "string" && metadata.full_name) ||
    email.split("@")[0] ||
    "Account";

  const existingProfile = await prisma.userProfile.findFirst({
    where: {
      OR: [{ id: data.user.id }, { email }]
    }
  });

  return {
    id: existingProfile?.id ?? data.user.id,
    email,
    displayName: existingProfile?.displayName || displayName,
    authMode: "supabase"
  };
}

export async function requireAuthenticatedUser(req: ApiRequest, res: ApiResponse) {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    res.status(401).json({ error: "Authentication required." });
    return null;
  }

  return user;
}
