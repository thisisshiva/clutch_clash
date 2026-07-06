import { supabase, isSupabaseEnabled } from './supabaseClient.js';

/**
 * Auth facade - supports Supabase email/password accounts and a local guest
 * mode (works without any Supabase project configured).
 */
class AuthService {
  constructor() {
    this.user = null;      // { id, email } | null
    this.profile = null;   // { username } | null
    this.guestName = localStorage.getItem('cc_guest_name') || '';
  }

  get isLoggedIn() {
    return Boolean(this.user);
  }

  get displayName() {
    return this.profile?.username || this.guestName || 'Racer';
  }

  async restoreSession() {
    if (!isSupabaseEnabled) return null;
    const { data } = await supabase.auth.getSession();
    if (data?.session?.user) {
      this.user = data.session.user;
      await this._loadProfile();
    }
    return this.user;
  }

  async getToken() {
    if (!isSupabaseEnabled || !this.user) return null;
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token ?? null;
  }

  async signUp(email, password, username) {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw new Error(error.message);
    this.user = data.user;
    if (this.user) {
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert({ id: this.user.id, username });
      if (profileError) {
        throw new Error(
          profileError.code === '23505'
            ? 'Yeh username already liya hua hai'
            : profileError.message
        );
      }
      this.profile = { username };
    }
    return this.user;
  }

  async signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    this.user = data.user;
    await this._loadProfile();
    return this.user;
  }

  async signOut() {
    if (isSupabaseEnabled) await supabase.auth.signOut();
    this.user = null;
    this.profile = null;
  }

  playAsGuest(name) {
    this.guestName = name.trim().slice(0, 20) || 'Racer';
    localStorage.setItem('cc_guest_name', this.guestName);
  }

  async _loadProfile() {
    if (!this.user) return;
    const { data } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', this.user.id)
      .single();
    this.profile = data || null;
  }
}

export const authService = new AuthService();
