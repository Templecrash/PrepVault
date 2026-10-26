import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from './brand.jsx';
import TrackingOwnerSignIn from './TrackingOwnerSignIn.jsx';
import { getTrackingOwner, signOutTrackingOwner } from './tracking-auth.js';
import { askAdvisor, getAdvisorStatus } from './advisor-client.js';
import './inventory.css';
import './private-advisor.css';

const STARTERS = [
  { label: 'Assess supplies', icon: 'box', detail: 'Find gaps and useful next steps', prompt: 'Assess my current supplies against my household needs and preparation targets. Prioritize the most important gaps, use the recorded quantities, and distinguish missing information from confirmed shortages.' },
  { label: 'Review plans', icon: 'map', detail: 'Check assumptions and dependencies', prompt: 'Review my preparation plans, property systems, routes, and dependencies. Identify practical weaknesses, explain what supports each conclusion, and suggest the next three improvements.' },
  { label: 'Explore a scenario', icon: 'compass', detail: 'Think through what could happen', prompt: 'Help me explore a preparedness scenario using my current household, supplies, and plans. Suggest three relevant scenarios and ask which one I want to work through before making a detailed plan.' },
];

function ContextDetails({ context }) {
  const meta = context?.meta || {};
  const sections = Array.isArray(meta.sections) ? meta.sections : [];
  const limitations = Array.isArray(meta.limitations) ? meta.limitations : [];
  const captured = Date.parse(meta.generatedAt);
  return <details className="pv-advisor-context">
    <summary><span><Icon name="book" size={16} />What your advisor knows</span><span>Current app context<Icon name="chevron" size={14} /></span></summary>
    <div className="pv-advisor-context-body">
      <p>Your current app data is included each time you ask a question.{Number.isFinite(captured) && ` This snapshot was prepared at ${new Date(captured).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`}</p>
      {sections.length > 0 && <ul className="pv-advisor-sections">{sections.map((section, index) => <li key={section.key || index}><span>{section.label}</span>{Number.isFinite(section.count) && <strong>{section.count}</strong>}</li>)}</ul>}
      {limitations.length > 0 && <ul className="pv-advisor-limitations">{limitations.map((limitation, index) => <li key={index}>{limitation}</li>)}</ul>}
      <p>OpenAI processes your questions and the included app context to generate replies. Conversations stay in this page's memory and are cleared when you leave or sign out. <a href="https://developers.openai.com/api/docs/guides/your-data" target="_blank" rel="noreferrer">How OpenAI handles API data<Icon name="arrow" size={12} /></a></p>
    </div>
  </details>;
}

export default function PrivateAdvisor({ context }) {
  const [auth, setAuth] = useState({ phase: 'checking', owner: null, message: '' });
  const [configured, setConfigured] = useState(false);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [canRetry, setCanRetry] = useState(false);
  const ownerRef = useRef(null);
  const authRequest = useRef(null);
  const chatRequest = useRef(null);
  const authRevision = useRef(0);
  const chatRevision = useRef(0);
  const composer = useRef(null);
  const bottom = useRef(null);

  const cancelChat = useCallback(() => {
    chatRevision.current += 1;
    chatRequest.current?.abort();
    chatRequest.current = null;
    setBusy(false);
  }, []);

  const clearConversation = useCallback(() => {
    cancelChat();
    setMessages([]); setDraft(''); setError(''); setCanRetry(false);
  }, [cancelChat]);

  const expireSession = useCallback(() => {
    authRequest.current?.abort(); authRevision.current += 1;
    ownerRef.current = null;
    clearConversation(); setConfigured(false);
    setAuth({ phase: 'signed-out', owner: null, message: 'Your private session ended. Sign in again to continue.' });
  }, [clearConversation]);

  const checkSession = useCallback(async () => {
    authRequest.current?.abort();
    if (chatRequest.current) {
      setError('Your request was paused while your private session was checked. You can retry it below.');
      setCanRetry(true);
    }
    cancelChat();
    const controller = new AbortController();
    authRequest.current = controller;
    const revision = ++authRevision.current;
    setAuth({ phase: 'checking', owner: null, message: '' });
    try {
      const owner = await getTrackingOwner({ signal: controller.signal });
      if (controller.signal.aborted || revision !== authRevision.current) return;
      if (!owner) {
        const hadOwner = Boolean(ownerRef.current);
        ownerRef.current = null;
        clearConversation(); setConfigured(false);
        setAuth({ phase: 'signed-out', owner: null, message: hadOwner ? 'Your private session ended. Sign in again to continue.' : '' });
        return;
      }
      if (ownerRef.current?.id !== owner.id) clearConversation();
      ownerRef.current = owner;
      const status = await getAdvisorStatus({ signal: controller.signal });
      if (controller.signal.aborted || revision !== authRevision.current) return;
      setConfigured(status.configured);
      setAuth({ phase: 'signed-in', owner, message: '' });
    } catch (err) {
      if (controller.signal.aborted || revision !== authRevision.current) return;
      if (err.status === 401 || err.status === 403) { expireSession(); return; }
      setAuth({ phase: 'unavailable', owner: null, message: err.message });
    }
  }, [cancelChat, clearConversation, expireSession]);

  useEffect(() => {
    void checkSession();
    return () => {
      authRequest.current?.abort(); chatRequest.current?.abort();
      authRevision.current += 1; chatRevision.current += 1;
    };
  }, [checkSession]);

  useEffect(() => {
    const onFocus = () => { if (auth.phase === 'signed-in') void checkSession(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [auth.phase, checkSession]);

  useEffect(() => { bottom.current?.scrollIntoView({ block: 'nearest' }); }, [messages.length, busy]);

  const signOut = async () => {
    authRequest.current?.abort();
    const controller = new AbortController();
    authRequest.current = controller;
    const revision = ++authRevision.current;
    ownerRef.current = null;
    clearConversation(); setConfigured(false);
    setAuth({ phase: 'signing-out', owner: null, message: '' });
    try {
      await signOutTrackingOwner({ signal: controller.signal });
      if (!controller.signal.aborted && revision === authRevision.current) setAuth({ phase: 'signed-out', owner: null, message: 'You are signed out of your private workspace.' });
    } catch (err) {
      if (!controller.signal.aborted && revision === authRevision.current) setAuth({ phase: 'signout-failed', owner: null, message: err.message });
    }
  };

  const requestReply = async nextMessages => {
    if (auth.phase !== 'signed-in' || !configured || chatRequest.current || !ownerRef.current) return;
    const ownerId = ownerRef.current.id;
    const controller = new AbortController();
    chatRequest.current = controller;
    const revision = ++chatRevision.current;
    setMessages(nextMessages); setBusy(true); setError(''); setCanRetry(false);
    try {
      const reply = await askAdvisor(nextMessages, context, { signal: controller.signal });
      if (controller.signal.aborted || revision !== chatRevision.current || ownerRef.current?.id !== ownerId) return;
      setMessages([...nextMessages, { role: 'assistant', content: reply }]);
    } catch (err) {
      if (controller.signal.aborted || revision !== chatRevision.current) return;
      if (err.status === 401 || err.status === 403) { expireSession(); return; }
      setError(err.message); setCanRetry(true);
    } finally {
      if (revision === chatRevision.current) { chatRequest.current = null; setBusy(false); }
    }
  };

  const send = (text = draft) => {
    const content = text.trim();
    if (!content || content.length > 6000 || auth.phase !== 'signed-in' || !configured || chatRequest.current) return;
    setDraft('');
    void requestReply([...messages, { role: 'user', content }]);
  };

  return <section className="pv-inventory pv-advisor" aria-labelledby="advisor-title">
    <header className="pv-inventory-heading"><div><p className="pv-inventory-eyebrow">A CLEARER PLAN</p><h1 id="advisor-title">Your advisor<span>.</span></h1><p className="pv-inventory-intro">Assess what you have, strengthen your plans, and think through what comes next.</p></div>{auth.phase === 'signed-in' && <button type="button" className="pv-inventory-button pv-inventory-button-secondary" onClick={signOut}><Icon name="shield" size={16} />Sign out</button>}</header>

    {auth.phase !== 'signed-in' ? <>
      {['checking', 'signing-out'].includes(auth.phase) ? <div className="pv-advisor-status" role="status"><Icon name="shield" size={22} />{auth.phase === 'checking' ? 'Checking your private session…' : 'Signing out…'}</div>
        : ['unavailable', 'signout-failed'].includes(auth.phase) ? <div className="pv-advisor-status pv-advisor-status-error" role="alert"><Icon name="shield" size={22} /><div><strong>{auth.phase === 'signout-failed' ? 'Sign-out has not completed' : 'Your private connection is unavailable'}</strong><p>{auth.message}</p></div><button type="button" className="pv-inventory-button pv-inventory-button-secondary" onClick={auth.phase === 'signout-failed' ? signOut : checkSession}>Try again</button></div>
          : <TrackingOwnerSignIn onSignedIn={checkSession} notice={auth.message} description="Sign in to assess your supplies and plans with your private preparedness advisor." detail="Only your owner account can open this conversation or send your app context to the advisor." buttonLabel="Open your advisor" />}
    </> : <>
      <div className="pv-advisor-account"><span><Icon name="shield" size={15} />Only you · {auth.owner.email}</span><span>Current app context · Private conversation</span></div>
      <ContextDetails context={context} />
      {context?.meta?.isSample && <p className="pv-advisor-sample"><Icon name="book" size={15} />This workspace includes sample data. Your advisor will distinguish examples from confirmed supplies and plans.</p>}
      {!configured && <div className="pv-advisor-setup" role="status"><Icon name="compass" size={22} /><div><strong>Your private sign-in is connected.</strong><p>The advisor connection still needs to be set up before it can answer questions.</p></div><button type="button" className="pv-inventory-button pv-inventory-button-secondary" onClick={checkSession}>Check connection</button></div>}

      <div className="pv-advisor-workspace">
        <div className="pv-advisor-conversation-heading"><span><Icon name="compass" size={16} />Preparation, thought through.</span><button type="button" className="pv-advisor-text-button" onClick={clearConversation} disabled={!messages.length && !draft && !busy}><Icon name="plus" size={14} />New conversation</button></div>
        {!messages.length ? <div className="pv-advisor-welcome"><span className="pv-advisor-mark"><Icon name="compass" size={28} /></span><h2>What would you like to work through?</h2><p>Start with a review, or bring an idea of your own.</p><div className="pv-advisor-starters">{STARTERS.map(starter => <button type="button" key={starter.label} disabled={!configured || busy} onClick={() => send(starter.prompt)}><Icon name={starter.icon} size={20} /><strong>{starter.label}</strong><span>{starter.detail}</span><Icon name="arrow" size={15} /></button>)}</div></div>
          : <div className="pv-advisor-messages" role="log" aria-label="Conversation with your advisor" aria-live="polite" aria-relevant="additions text">{messages.map((message, index) => <article key={index} className={`pv-advisor-message is-${message.role}`}><h2>{message.role === 'user' ? 'You' : 'Your advisor'}</h2><div>{message.content}</div></article>)}{busy && <p className="pv-advisor-thinking" role="status"><span />Reviewing your question and app context…</p>}<div ref={bottom} /></div>}
        {error && <div className="pv-advisor-error" role="alert"><p>{error}</p>{canRetry && !busy && <button type="button" className="pv-advisor-text-button" onClick={() => requestReply(messages)}>Try again<Icon name="arrow" size={14} /></button>}</div>}
        <form className="pv-advisor-composer" onSubmit={event => { event.preventDefault(); send(); }}><label htmlFor="advisor-question">Ask your advisor</label><textarea id="advisor-question" ref={composer} value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.nativeEvent.isComposing) { event.preventDefault(); send(); } }} disabled={!configured || busy} maxLength={6000} rows={3} placeholder="How long could my household manage a power outage?" /><div><span>{busy ? 'Your conversation stays on this page.' : 'Ctrl / ⌘ + Enter to send'}{draft.length > 5500 && ` · ${6000 - draft.length} characters left`}</span><button type="submit" className="pv-inventory-button pv-inventory-button-primary" disabled={!configured || busy || !draft.trim()}>{busy ? 'Thinking…' : 'Ask advisor'}<Icon name="arrow" size={16} /></button></div></form>
        <p className="pv-advisor-footnote">OpenAI processes your question and app context to reply. Check important details and follow official guidance in an emergency.</p>
      </div>
    </>}
  </section>;
}
