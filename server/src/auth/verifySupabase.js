import { createClient } from '@supabase/supabase-js';
import { env, isSupabaseConfigured } from '../config/env.js';

let supabase = null;

/** Singleton Supabase client (server-side, used only to verify JWTs). */
function getSupabase() {
  if (!supabase && isSupabaseConfigured()) {
    supabase = createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: { persistSession: false },
    });
  }
  return supabase;
}

function sanitizeName(name) {
  const clean = String(name || '').trim().slice(0, 20);
  return clean || 'Racer';
}

/**
 * Socket.io middleware. Guests are allowed (no token); if a Supabase JWT is
 * provided and Supabase is configured, we verify it and attach the user id.
 */
export function createAuthMiddleware() {
  return async (socket, next) => {
    const { token, name } = socket.handshake.auth || {};
    socket.data.name = sanitizeName(name);
    socket.data.userId = null;

    if (token && getSupabase()) {
      try {
        const { data, error } = await getSupabase().auth.getUser(token);
        if (!error && data?.user) {
          socket.data.userId = data.user.id;
        }
      } catch {
        // Invalid token -> treat as guest instead of rejecting.
      }
    }
    next();
  };
}
