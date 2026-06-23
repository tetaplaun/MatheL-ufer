import { describe, expect, it } from 'vitest';
import {
  PASSWORD_MIN,
  SYNTHETIC_EMAIL_DOMAIN,
  USERNAME_MAX,
  mapAuthError,
  normalizeUsername,
  usernameFromUser,
  usernameToEmail,
  validatePassword,
  validateUsername,
} from './auth.js';

describe('normalizeUsername', () => {
  it('trims, lower-cases, and strips disallowed characters', () => {
    expect(normalizeUsername('  Mia!  ')).toBe('mia');
    expect(normalizeUsername('Anna_Lena-1.0')).toBe('anna_lena-1.0');
    expect(normalizeUsername('Tom Müller')).toBe('tommller');
  });
  it('handles null/undefined', () => {
    expect(normalizeUsername(undefined)).toBe('');
    expect(normalizeUsername(null)).toBe('');
  });
});

describe('usernameToEmail', () => {
  it('builds a stable synthetic email from the normalized username', () => {
    expect(usernameToEmail('Mia')).toBe(`mia@${SYNTHETIC_EMAIL_DOMAIN}`);
    expect(usernameToEmail('MIA')).toBe(usernameToEmail('mia'));
  });
});

describe('validateUsername', () => {
  it('accepts a normal username', () => {
    expect(validateUsername('Mia')).toBe('');
  });
  it('rejects too-short usernames', () => {
    expect(validateUsername('a')).not.toBe('');
  });
  it('rejects too-long usernames', () => {
    expect(validateUsername('x'.repeat(USERNAME_MAX + 1))).not.toBe('');
  });
  it('rejects usernames with no usable characters', () => {
    expect(validateUsername('✓✓')).not.toBe('');
  });
});

describe('validatePassword', () => {
  it('rejects passwords shorter than the minimum', () => {
    expect(validatePassword('x'.repeat(PASSWORD_MIN - 1))).not.toBe('');
  });
  it('accepts passwords at or above the minimum', () => {
    expect(validatePassword('x'.repeat(PASSWORD_MIN))).toBe('');
  });
});

describe('usernameFromUser', () => {
  it('prefers the metadata username', () => {
    expect(usernameFromUser({ user_metadata: { username: 'Mia' }, email: 'mia@users.mathelaeufer.app' })).toBe('Mia');
  });
  it('falls back to the email local part', () => {
    expect(usernameFromUser({ email: 'tom@users.mathelaeufer.app' })).toBe('tom');
  });
  it('returns an empty string for no user', () => {
    expect(usernameFromUser(null)).toBe('');
  });
});

describe('mapAuthError', () => {
  it('maps a duplicate account to a username-taken message', () => {
    expect(mapAuthError({ message: 'User already registered' })).toMatch(/vergeben/i);
  });
  it('maps invalid credentials', () => {
    expect(mapAuthError({ message: 'Invalid login credentials' })).toMatch(/falsch/i);
  });
  it('maps an unconfirmed email to the disable-confirmation hint', () => {
    expect(mapAuthError({ message: 'Email not confirmed' })).toMatch(/Bestätigung/i);
  });
  it('falls back to a generic message', () => {
    expect(mapAuthError({ message: '' })).toMatch(/schiefgelaufen/i);
  });
});
