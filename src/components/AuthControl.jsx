import React, { useState } from 'react';

// Bottom-right login control. When logged out it shows an "Anmelden" button
// that opens a login / sign-up dialog. When logged in it shows the username
// and an "Abmelden" button. Renders nothing when auth is not configured.
export function AuthControl({ auth, onOpenAchievements, achievementCount }) {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!auth.enabled) {
    return null;
  }

  function openDialog() {
    setMode('login');
    setError('');
    setPassword('');
    setIsOpen(true);
  }

  function closeDialog() {
    setIsOpen(false);
    setError('');
    setPassword('');
  }

  function switchMode() {
    setMode((current) => (current === 'signup' ? 'login' : 'signup'));
    setError('');
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');

    const action = mode === 'signup' ? auth.signUp : auth.signIn;
    const { error: actionError } = await action(username, password);

    setIsSubmitting(false);
    if (actionError) {
      setError(actionError);
      return;
    }

    setUsername('');
    setPassword('');
    setIsOpen(false);
  }

  if (auth.isLoggedIn) {
    return (
      <div className="auth-fab auth-fab--account">
        <span className="auth-fab-user" title={auth.username}>
          {auth.username}
        </span>
        {onOpenAchievements && (
          <button
            aria-label="Erfolge anzeigen"
            className="auth-achievements"
            title="Erfolge"
            type="button"
            onClick={onOpenAchievements}
          >
            <span aria-hidden="true">🏆</span>
            {typeof achievementCount === 'number' && (
              <span className="auth-achievements-badge">{achievementCount}</span>
            )}
          </button>
        )}
        <button className="auth-logout" type="button" onClick={auth.signOut}>
          Abmelden
        </button>
      </div>
    );
  }

  return (
    <>
      <button className="auth-fab auth-fab--login" type="button" onClick={openDialog}>
        Anmelden
      </button>

      {isOpen && (
        <section className="auth-panel" aria-label="Anmelden" aria-modal="true" role="dialog">
          <div className="auth-card">
            <div className="auth-header">
              <h2>{mode === 'signup' ? 'Konto erstellen' : 'Anmelden'}</h2>
              <button aria-label="Schließen" className="rules-close-button" type="button" onClick={closeDialog}>
                ×
              </button>
            </div>

            <p className="auth-intro">
              {mode === 'signup'
                ? 'Wähle einen Namen und ein Passwort. Dein Name erscheint dann automatisch in der Rangliste.'
                : 'Melde dich an, damit dein Name automatisch in der Rangliste steht.'}
            </p>

            <form className="auth-form" onSubmit={handleSubmit}>
              <label>
                <span>Benutzername</span>
                <input
                  autoComplete="username"
                  maxLength={18}
                  type="text"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                />
              </label>
              <label>
                <span>Passwort</span>
                <input
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>

              {error && (
                <p className="auth-error" aria-live="polite">
                  {error}
                </p>
              )}

              <button className="primary-action" disabled={isSubmitting} type="submit">
                {isSubmitting ? 'Bitte warten…' : mode === 'signup' ? 'Konto erstellen' : 'Anmelden'}
              </button>
            </form>

            <p className="auth-switch">
              {mode === 'signup' ? 'Schon ein Konto?' : 'Noch kein Konto?'}{' '}
              <button className="auth-link" type="button" onClick={switchMode}>
                {mode === 'signup' ? 'Anmelden' : 'Registrieren'}
              </button>
            </p>
          </div>
        </section>
      )}
    </>
  );
}
