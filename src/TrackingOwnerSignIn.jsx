import { useEffect, useRef, useState } from 'react';
import { Icon } from './brand.jsx';
import { sendTrackingSignInCode, verifyTrackingSignInCode } from './tracking-auth.js';
import './tracking-auth.css';

export default function TrackingOwnerSignIn({
  onSignedIn, notice = '',
  description = 'Sign in to your owner account to invite people and view their shared locations.',
  detail = 'People you invite can share a position. They cannot access your map.',
  buttonLabel = 'Open private tracking',
}) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const codeInput = useRef(null);
  const pending = useRef(null);
  useEffect(() => () => pending.current?.abort(), []);
  useEffect(() => { if (step === 'code') codeInput.current?.focus(); }, [step]);

  const sendCode = async event => {
    event?.preventDefault();
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true); setError(''); setSent(false);
    try {
      await sendTrackingSignInCode(email, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setStep('code'); setCode(''); setSent(true);
    } catch (err) { if (!controller.signal.aborted) setError(err.message); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  };

  const signIn = async event => {
    event.preventDefault();
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true); setError('');
    try {
      const owner = await verifyTrackingSignInCode(email, code, { signal: controller.signal });
      if (!controller.signal.aborted) onSignedIn(owner);
    } catch (err) { if (!controller.signal.aborted) setError(err.message); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  };

  return <section className="pv-tracker-signin" aria-labelledby="tracker-signin-title">
    <div className="pv-tracker-signin-copy"><span className="pv-tracker-signin-icon"><Icon name="shield" size={24} /></span><h3 id="tracker-signin-title">Private to you.</h3><p>{description}</p><span>{detail}</span></div>
    <div className="pv-tracker-signin-form">
      {notice && <p className="pv-tracker-auth-notice" role="status">{notice}</p>}
      {step === 'email' ? <form onSubmit={sendCode}>
        <label className="pv-people-field">Your email<input type="email" autoComplete="email" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} disabled={busy} /></label>
        <button className="pv-button pv-primary" disabled={busy}>{busy ? 'Sending code…' : 'Email me a sign-in code'}<Icon name="arrow" size={15} /></button>
        <p className="pv-tracker-auth-help">Use the email connected to this private workspace. No password needed.</p>
      </form> : <form onSubmit={signIn}>
        <p className="pv-tracker-code-destination">Enter the six-digit code sent to <strong>{email.trim()}</strong>.</p>
        <label className="pv-people-field">Sign-in code<input ref={codeInput} type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required maxLength={6} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} disabled={busy} /></label>
        <button className="pv-button pv-primary" disabled={busy || code.length !== 6}>{busy ? 'Checking…' : buttonLabel}<Icon name="arrow" size={15} /></button>
        <div className="pv-tracker-auth-links"><button type="button" className="pv-tracker-text-button" onClick={sendCode} disabled={busy}>Send a new code</button><button type="button" className="pv-tracker-text-button" onClick={() => { setStep('email'); setCode(''); setError(''); setSent(false); }} disabled={busy}>Use a different email</button></div>
        {sent && <p className="pv-tracker-auth-help" role="status">Code requested. Check your inbox and spam folder.</p>}
      </form>}
      {error && <p className="pv-tracker-error" role="alert">{error}</p>}
    </div>
  </section>;
}
