import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
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
    <summary><span><Icon name="book" size={16} />What Prep Chat knows</span><span>Current app context<Icon name="chevron" size={14} /></span></summary>
    <div className="pv-advisor-context-body">
      <p>Your current app data is included each time you ask a question.{Number.isFinite(captured) && ` This snapshot was prepared at ${new Date(captured).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`}</p>
      {sections.length > 0 && <ul className="pv-advisor-sections">{sections.map((section, index) => <li key={section.key || index}><span>{section.label}</span>{Number.isFinite(section.count) && <strong>{section.count}</strong>}</li>)}</ul>}
      {limitations.length > 0 && <ul className="pv-advisor-limitations">{limitations.map((limitation, index) => <li key={index}>{limitation}</li>)}</ul>}
      <p>OpenAI processes your questions and the included app context to generate replies. Conversations stay in memory while Prep Chat is open and are cleared when you close it, reload or sign out. <a href="https://developers.openai.com/api/docs/guides/your-data" target="_blank" rel="noreferrer">How OpenAI handles API data<Icon name="arrow" size={12} /></a></p>
    </div>
  </details>;
}

export default function PrivateAdvisor({ getContext }) {
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
  const questionId = useId();
  const context = useMemo(() => auth.phase === 'signed-in' ? getContext() : null, [auth.phase, getContext]);

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
      const reply = await askAdvisor(nextMessages, getContext(), { signal: controller.signal });
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

  return <section className="pv-inventory pv-advisor pv-advisor-floating" aria-label="Prep Chat conversation">
    <div className="pv-advisor-scroll">
      {auth.phase !== 'signed-in' ? <>
        {['checking', 'signing-out'].includes(auth.phase) ? <div className="pv-advisor-status" role="status"><Icon name="shield" size={22} />{auth.phase === 'checking' ? 'Checking your private session…' : 'Signing out…'}</div>
          : ['unavailable', 'signout-failed'].includes(auth.phase) ? <div className="pv-advisor-status pv-advisor-status-error" role="alert"><Icon name="shield" size={22} /><div><strong>{auth.phase === 'signout-failed' ? 'Sign-out has not completed' : 'Your private connection is unavailable'}</strong><p>{auth.message}</p></div><button type="button" className="pv-inventory-button pv-inventory-button-secondary" onClick={auth.phase === 'signout-failed' ? signOut : checkSession}>Try again</button></div>
            : <TrackingOwnerSignIn onSignedIn={checkSession} notice={auth.message} description="Sign in to Prep Chat to assess your supplies and plans." detail="Only your owner account can open this conversation or send your app context to Prep Chat." buttonLabel="Open Prep Chat" />}
      </> : <>
        <div className="pv-advisor-account"><span><Icon name="shield" size={15} />Only you · {auth.owner.email}</span><button type="button" className="pv-advisor-text-button" onClick={signOut}>Sign out</button></div>
        <ContextDetails context={context} />
        {context?.meta?.isSample && <p className="pv-advisor-sample"><Icon name="book" size={15} />Sample workspace · Prep Chat will identify example data.</p>}
        {!configured && <div className="pv-advisor-setup" role="status"><Icon name="compass" size={22} /><div><strong>Your private sign-in is connected.</strong><p>Prep Chat still needs to be connected before it can answer questions.</p></div><button type="button" className="pv-inventory-button pv-inventory-button-secondary" onClick={checkSession}>Check connection</button></div>}
        <div className="pv-advisor-workspace">
          <div className="pv-advisor-conversation-heading"><span><Icon name="advisor" size={16} />Your conversation</span><button type="button" className="pv-advisor-text-button" onClick={clearConversation} disabled={!messages.length && !draft && !busy}><Icon name="plus" size={14} />New conversation</button></div>
          {!messages.length ? <div className="pv-advisor-welcome"><h2>How can I help you prepare?</h2><div className="pv-advisor-starters">{STARTERS.map(starter => <button type="button" key={starter.label} disabled={!configured || busy} onClick={() => send(starter.prompt)}><Icon name={starter.icon} size={20} /><strong>{starter.label}</strong><span>{starter.detail}</span><Icon name="arrow" size={15} /></button>)}</div></div>
            : <div className="pv-advisor-messages" role="log" aria-label="Conversation with Prep Chat" aria-live="polite" aria-relevant="additions text">{messages.map((message, index) => <article key={index} className={`pv-advisor-message is-${message.role}`}><h2>{message.role === 'user' ? 'You' : 'Prep Chat'}</h2><div>{message.content}</div></article>)}{busy && <p className="pv-advisor-thinking" role="status"><span />Reviewing your question and app context…</p>}<div ref={bottom} /></div>}
          {error && <div className="pv-advisor-error" role="alert"><p>{error}</p>{canRetry && !busy && <button type="button" className="pv-advisor-text-button" onClick={() => requestReply(messages)}>Try again<Icon name="arrow" size={14} /></button>}</div>}
        </div>
      </>}
    </div>
    {auth.phase === 'signed-in' && <div className="pv-advisor-compose-area">
      <form className="pv-advisor-composer" onSubmit={event => { event.preventDefault(); send(); }}><label htmlFor={questionId}>Ask Prep Chat</label><textarea id={questionId} ref={composer} value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.nativeEvent.isComposing) { event.preventDefault(); send(); } }} disabled={!configured || busy} maxLength={6000} rows={2} placeholder="Ask about your supplies, plans or an idea…" /><div><span>{busy ? 'Your conversation stays in this chat.' : 'Ctrl / ⌘ + Enter to send'}{draft.length > 5500 && ` · ${6000 - draft.length} characters left`}</span><button type="submit" className="pv-inventory-button pv-inventory-button-primary" disabled={!configured || busy || !draft.trim()}>{busy ? 'Thinking…' : 'Send'}<Icon name="arrow" size={16} /></button></div></form>
      <p className="pv-advisor-footnote">OpenAI processes your question and app context. Check important details. Closing Prep Chat clears this conversation.</p>
    </div>}
  </section>;
}
