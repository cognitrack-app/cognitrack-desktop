import React, { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth, signInWithGoogle } from '@cognitrack/api-client';

// Maps Firebase Auth error codes to user-friendly messages.
// Firebase's own err.message contains internal strings like
// "Firebase: Error (auth/wrong-password)." which should never be shown raw.
const FIREBASE_ERROR_MAP: Record<string, string> = {
  'auth/user-not-found':        'No account found with this email.',
  'auth/wrong-password':        'Incorrect password.',
  'auth/invalid-credential':    'Incorrect email or password.',   // Firebase v9+
  'auth/invalid-email':         'Please enter a valid email address.',
  'auth/email-already-in-use':  'An account with this email already exists.',
  'auth/too-many-requests':     'Too many attempts. Please wait and try again.',
  'auth/network-request-failed':'Network error. Check your connection.',
  'auth/user-disabled':         'This account has been disabled.',
};

export function SignInPopover() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      // Let main process know we signed in
      window.electronAPI.signIn(cred.user.uid);
      setLoading(false);
    } catch (err: any) {
      const code = (err?.code as string) ?? '';
      setError(FIREBASE_ERROR_MAP[code] ?? 'Sign in failed. Please try again.');
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError('');
    try {
      const user = await signInWithGoogle();
      window.electronAPI.signIn(user.uid);
      setLoading(false);
    } catch (err: any) {
      const code = (err?.code as string) ?? '';
      setError(FIREBASE_ERROR_MAP[code] ?? 'Google Sign In failed. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="popover" id="sign-in-popover">
      <header className="popover__header">
        <div className="popover__brand">
          <svg className="popover__logo" width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="7" stroke="url(#grad)" strokeWidth="2" />
            <circle cx="8" cy="8" r="3" fill="url(#grad)" />
            <defs>
              <linearGradient id="grad" x1="0" y1="0" x2="16" y2="16">
                <stop offset="0%" stopColor="#6C5CE7" />
                <stop offset="100%" stopColor="#00CEC9" />
              </linearGradient>
            </defs>
          </svg>
          <span className="popover__title">CogniTrack Sign In</span>
        </div>
      </header>

      <div className="popover__divider" />

      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <button 
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="popover__btn popover__btn--secondary"
          style={{ width: '100%', justifyContent: 'center', WebkitAppRegion: 'no-drag', display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          {loading ? 'Please wait...' : 'Sign in with Google'}
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', opacity: 0.6 }}>
          <div style={{ flex: 1, height: '1px', background: 'var(--color-border)' }} />
          <span style={{ fontSize: '12px' }}>or</span>
          <div style={{ flex: 1, height: '1px', background: 'var(--color-border)' }} />
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <input 
            type="email" 
            placeholder="Email" 
            value={email} 
            onChange={e => setEmail(e.target.value)}
            required
            style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--color-border)', background: 'transparent', color: 'inherit', WebkitAppRegion: 'no-drag' }}
          />
          <input 
            type="password" 
            placeholder="Password" 
            value={password} 
            onChange={e => setPassword(e.target.value)}
            required
            style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--color-border)', background: 'transparent', color: 'inherit', WebkitAppRegion: 'no-drag' }}
          />
          {error && <div style={{ color: 'var(--color-danger)', fontSize: '12px' }}>{error}</div>}
          <button 
            type="submit" 
            disabled={loading}
            className="popover__btn popover__btn--primary"
            style={{ marginTop: '8px', width: '100%', justifyContent: 'center', WebkitAppRegion: 'no-drag' }}
          >
            {loading ? 'Signing in...' : 'Sign In with Email'}
          </button>
        </form>
      </div>
    </div>
  );
}
