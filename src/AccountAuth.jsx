import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './brand.jsx';
import { useDialogFocus } from './useDialogFocus.js';
import { sendAccountCode, verifyAccountCode } from './account-auth-client.js';
import './account-auth.css';

export default function AccountAuth({ initialMode = 'login', onSignedIn, onClose, notice = '' }) {
  const [mode, setMode] = useState(initialMode === 'signup' ? 'signup' : 'login');
  const [step, setStep] = useState('email');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [remaining, setRemaining] = useState(0);
  const pending = useRef(null);
  const codeInput = useRef(null);
  const dialog = useDialogFocus(onClose);
  const id = useId();
  const isSignup = mode === 'signup';

  useEffect(() => () => pending.current?.abort(), []);
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, []);
  useEffect(() => { if (step === 'code') codeInput.current?.focus(); }, [step]);
  useEffect(() => {
    if (remaining <= 0) return;
    const timer = setTimeout(() => setRemaining(value => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [remaining]);

  const sendCode = async event => {
    event?.preventDefault();
    if (busy || remaining > 0) return;
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true); setError('');
    try {
      await sendAccountCode(email, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setStep('code'); setCode(''); setRemaining(60);
      codeInput.current?.focus();
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(err.message);
        if (err.status === 429) setRemaining(60);
      }
    } finally { if (!controller.signal.aborted) setBusy(false); }
  };

  const verify = async event => {
    event.preventDefault();
    if (busy) return;
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true); setError('');
    try {
      const user = await verifyAccountCode(email, code, { name: isSignup ? name : undefined, signal: controller.signal });
      if (!controller.signal.aborted) onSignedIn(user);
    } catch (err) { if (!controller.signal.aborted) setError(err.message); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  };

  const changeEmail = () => { setStep('email'); setCode(''); setError(''); setRemaining(0); };

  return createPortal(<div className="pv-account-overlay" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialog} className="pv-account-dialog" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}>
      <header className="pv-account-header"><span className="pv-account-brand"><Icon name="shield" size={20} /> PrepVault</span><button type="button" className="pv-account-close" aria-label="Close sign-in" onClick={onClose}><Icon name="close" size={19} /></button></header>
      <div className="pv-account-content">
        <span className="pv-account-eyebrow">YOUR PREPARATION, YOUR SPACE</span>
        <h2 id={`${id}-title`}>{step === 'code' ? 'Check your inbox.' : isSignup ? 'Make room for your plan.' : 'Welcome back.'}</h2>
        <p className="pv-account-description" id={`${id}-description`}>{step === 'code' ? <>Enter the six-digit code sent to <strong>{email.trim()}</strong>.</> : 'Use a secure email code to access your account. No password to remember.'}</p>
        {notice && <p className="pv-account-notice" role="status">{notice}</p>}
        {step === 'email' ? <>
          <div className="pv-account-modes" aria-label="Account action">
            <button type="button" aria-pressed={!isSignup} onClick={() => { setMode('login'); setError(''); }} disabled={busy}>Sign in</button>
            <button type="button" aria-pressed={isSignup} onClick={() => { setMode('signup'); setError(''); }} disabled={busy}>Create account</button>
          </div>
          <form onSubmit={sendCode}>
            {isSignup && <label className="pv-account-field" htmlFor={`${id}-name`}>Your name <span>(optional)</span><input id={`${id}-name`} autoComplete="name" maxLength={80} value={name} onChange={event => setName(event.target.value)} disabled={busy} /></label>}
            <label className="pv-account-field" htmlFor={`${id}-email`}>Email address<input id={`${id}-email`} type="email" autoComplete="email" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} disabled={busy} placeholder="you@example.com" /></label>
            <button className="pv-account-submit" disabled={busy || remaining > 0}>{busy ? 'Sending code…' : remaining > 0 ? `Try again in ${remaining}s` : 'Email me a code'}<Icon name="arrow" size={16} /></button>
            <p className="pv-account-help">{isSignup ? 'Your account is created after you verify your email.' : 'New here? Verifying a new email will create your account.'}</p>
          </form>
        </> : <form onSubmit={verify}>
          <label className="pv-account-field" htmlFor={`${id}-code`}>Email code<input ref={codeInput} id={`${id}-code`} className="pv-account-code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required maxLength={6} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} disabled={busy} aria-describedby={`${id}-code-help`} /></label>
          <button className="pv-account-submit" disabled={busy || code.length !== 6}>{busy ? 'Checking code…' : isSignup ? 'Create my account' : 'Sign in'}<Icon name="arrow" size={16} /></button>
          <p className="pv-account-help" id={`${id}-code-help`}>Check your inbox and spam folder. Use the newest code you receive.</p>
          <div className="pv-account-links"><button type="button" disabled={busy || remaining > 0} onClick={sendCode}>{remaining > 0 ? `Resend in ${remaining}s` : 'Resend code'}</button><button type="button" disabled={busy} onClick={changeEmail}>Change email</button></div>
        </form>}
        {error && <p className="pv-account-error" role="alert">{error}</p>}
      </div>
      <footer className="pv-account-footer"><Icon name="shield" size={16} /><p>Your sign-in is secured by email verification.<br />Your plan is saved on this device.</p></footer>
    </section>
  </div>, document.body);
}
