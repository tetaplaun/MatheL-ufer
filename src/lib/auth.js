// Pure helpers for username-based auth. Players log in with a username, but
// Supabase Auth needs an email, so each username maps to a stable synthetic
// email. The display username keeps its original case (stored in user
// metadata); the email uses a normalized lower-case form so usernames are
// unique case-insensitively. No React, no network — safe to unit test.

export const USERNAME_MIN = 2;
export const USERNAME_MAX = 18;
export const PASSWORD_MIN = 6;
export const SYNTHETIC_EMAIL_DOMAIN = 'users.mathelaeufer.app';

export const normalizeUsername = (username) =>
  (username ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '');

export const usernameToEmail = (username) => `${normalizeUsername(username)}@${SYNTHETIC_EMAIL_DOMAIN}`;

export const validateUsername = (username) => {
  const trimmed = (username ?? '').trim();
  if (trimmed.length < USERNAME_MIN) {
    return `Benutzername braucht mindestens ${USERNAME_MIN} Zeichen.`;
  }
  if (trimmed.length > USERNAME_MAX) {
    return `Benutzername darf höchstens ${USERNAME_MAX} Zeichen haben.`;
  }
  if (normalizeUsername(trimmed).length < USERNAME_MIN) {
    return 'Benutzername darf nur Buchstaben, Zahlen sowie . _ - enthalten.';
  }
  return '';
};

export const validatePassword = (password) => {
  if ((password ?? '').length < PASSWORD_MIN) {
    return `Passwort braucht mindestens ${PASSWORD_MIN} Zeichen.`;
  }
  return '';
};

// The display name shown on the leaderboard for an authenticated user.
export const usernameFromUser = (user) =>
  user?.user_metadata?.username ?? (user?.email ? user.email.split('@')[0] : '');

// Translate the most common Supabase auth errors to friendly German copy.
export const mapAuthError = (error) => {
  const message = error?.message ?? '';
  if (/already registered|already been registered|user already exists/i.test(message)) {
    return 'Dieser Benutzername ist schon vergeben.';
  }
  if (/invalid login credentials/i.test(message)) {
    return 'Benutzername oder Passwort ist falsch.';
  }
  if (/email.*not confirmed|confirm/i.test(message)) {
    return 'E-Mail-Bestätigung ist im Supabase-Projekt noch aktiv – bitte deaktivieren.';
  }
  return message || 'Etwas ist schiefgelaufen. Bitte später erneut versuchen.';
};
