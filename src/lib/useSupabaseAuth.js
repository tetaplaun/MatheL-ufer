'use client';

import { useCallback, useEffect, useState } from 'react';
import { mapAuthError, usernameFromUser, usernameToEmail, validatePassword, validateUsername } from './auth.js';
import { AUTH_ENABLED, supabase } from './supabaseClient.js';

// React hook exposing the current auth session plus username-based sign up /
// sign in / sign out. Returns { error } objects ('' on success) so callers can
// show inline messages without try/catch.
export function useSupabaseAuth() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(!AUTH_ENABLED);

  useEffect(() => {
    if (!supabase) {
      return undefined;
    }

    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) {
        setUser(data.session?.user ?? null);
        setReady(true);
      }
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const signUp = useCallback(async (username, password) => {
    if (!supabase) {
      return { error: 'Anmeldung ist nicht eingerichtet.' };
    }
    const usernameError = validateUsername(username);
    if (usernameError) {
      return { error: usernameError };
    }
    const passwordError = validatePassword(password);
    if (passwordError) {
      return { error: passwordError };
    }

    const { data, error } = await supabase.auth.signUp({
      email: usernameToEmail(username),
      password,
      options: { data: { username: username.trim() } },
    });
    if (error) {
      return { error: mapAuthError(error) };
    }
    // With email confirmation off, sign-up returns an active session. If a
    // session is missing, confirmation is still enabled in the project.
    if (!data.session) {
      return { error: 'E-Mail-Bestätigung ist im Supabase-Projekt noch aktiv – bitte deaktivieren.' };
    }
    return { error: '' };
  }, []);

  const signIn = useCallback(async (username, password) => {
    if (!supabase) {
      return { error: 'Anmeldung ist nicht eingerichtet.' };
    }
    const { error } = await supabase.auth.signInWithPassword({
      email: usernameToEmail(username),
      password,
    });
    if (error) {
      return { error: mapAuthError(error) };
    }
    return { error: '' };
  }, []);

  const signOut = useCallback(async () => {
    if (supabase) {
      await supabase.auth.signOut();
    }
  }, []);

  return {
    enabled: AUTH_ENABLED,
    ready,
    user,
    username: usernameFromUser(user),
    isLoggedIn: Boolean(user),
    signUp,
    signIn,
    signOut,
  };
}
