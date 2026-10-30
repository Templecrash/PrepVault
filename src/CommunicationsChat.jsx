import { useEffect, useRef, useState } from 'react';
import { supabase, supabaseConfigured } from './supabase.js';
import { Icon } from './brand.jsx';
import { CONVERSATION_NOTES_KEY, MAX_CONVERSATION_NOTES, readConversationNotes, validateConversationNotes } from './conversation-notes.js';
import { readWorkspaceOwner } from './account-workspace.js';

const PIN_KEY = 'prepvault-secure-pin';
const EMPTY_MESSAGES = [];
const readSetting = key => { try { return localStorage.getItem(key); } catch { return null; } };
function initialMessages(userId, sampleChat) {
  try {
    const hasSaved = localStorage.getItem(CONVERSATION_NOTES_KEY) !== null || localStorage.getItem(`prepvault-chat-${userId || 'guest'}`) !== null;
    return { messages: hasSaved ? readConversationNotes(localStorage, userId) : userId ? [] : sampleChat, error: '' };
  } catch (error) { return { messages: [], error: error.message }; }
}

export default function CommunicationsChat({ user, members = [], sampleChat = [] }) {
  const cloudUserId = supabaseConfigured && user && !user.isLocal && user.authProvider !== 'neon' ? user.id : null;
  const localKey = `workspace:${user?.id || 'guest'}`;
  const [initial] = useState(() => initialMessages(user?.id || null, sampleChat));
  const [localMessages, setLocalMessages] = useState(initial.messages);
  const localMessagesRef = useRef(localMessages);
  const [cloudState, setCloudState] = useState({ key: '', messages: [] });
  const [communities, setCommunities] = useState([]);
  const [selected, setSelected] = useState('local');
  const [draft, setDraft] = useState('');
  const [error, setError] = useState(initial.error);
  const [sending, setSending] = useState(false);
  const [retry, setRetry] = useState(0);
  const [pinHash, setPinHash] = useState(() => readSetting(PIN_KEY));
  const [unlocked, setUnlocked] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [checkingPin, setCheckingPin] = useState(false);
  const sendingRef = useRef(false);
  const alive = useRef(true);
  const contextRef = useRef(localKey);
  const endRef = useRef(null);
  const isCloud = Boolean(cloudUserId) && selected !== 'local';
  const contextKey = isCloud ? `${cloudUserId}:${selected}` : localKey;
  const messages = isCloud ? (cloudState.key === contextKey ? cloudState.messages : EMPTY_MESSAGES) : localMessages;
  const loading = isCloud && cloudState.key !== contextKey && !error;

  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (!cloudUserId) return;
    let cancelled = false;
    async function loadCommunities() {
      try {
        const { data, error: responseError } = await supabase.from('community_members')
          .select('community_id, communities(name)').eq('user_id', cloudUserId).order('joined_at', { ascending: true });
        if (responseError) throw responseError;
        if (cancelled) return;
        const options = (data || []).filter(row => row.community_id).map(row => ({ id: row.community_id, name: row.communities?.name || `Community ${row.community_id.slice(0, 8)}` }));
        setCommunities(options);
        const saved = readSetting(`prepvault-chat-community-${cloudUserId}`);
        const next = options.some(option => option.id === saved) ? saved : 'local';
        contextRef.current = next === 'local' ? localKey : `${cloudUserId}:${next}`;
        setSelected(next);
      } catch { if (!cancelled) setError('Your communities could not be loaded. Check your connection and retry.'); }
    }
    loadCommunities();
    return () => { cancelled = true; };
  }, [cloudUserId, localKey, retry]);

  useEffect(() => {
    if (!isCloud) return;
    let cancelled = false;
    const key = `${cloudUserId}:${selected}`;
    const mapMessage = message => ({ id: message.id, from: message.user_id === cloudUserId ? 'p1' : message.user_id,
      text: message.text || '', createdAt: message.created_at,
      ts: new Date(message.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }), senderName: message.display_name || 'Member' });
    const merge = incoming => {
      if (cancelled) return;
      setCloudState(previous => {
        const existing = previous.key === key ? previous.messages : [];
        const combined = new Map([...existing, ...incoming].map(message => [message.id, message]));
        return { key, messages: [...combined.values()].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)).slice(-100) };
      });
    };
    const fetchMessages = async () => {
      try {
        const { data, error: responseError } = await supabase.from('messages')
          .select('id, community_id, user_id, display_name, text, created_at').eq('community_id', selected).order('created_at', { ascending: false }).limit(100);
        if (responseError) throw responseError;
        merge((data || []).map(mapMessage));
      } catch { if (!cancelled) setError('This conversation could not be loaded. Your draft is still here; retry when connected.'); }
    };
    const channel = supabase.channel(`messages-${key}`).on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'messages', filter: `community_id=eq.${selected}`,
    }, payload => { if (payload.new.community_id === selected) merge([mapMessage(payload.new)]); }).subscribe(status => {
      if (cancelled) return;
      if (status === 'SUBSCRIBED') fetchMessages();
      if (['CHANNEL_ERROR', 'TIMED_OUT'].includes(status)) setError('Live message updates disconnected. Retry to reconnect; your draft is still here.');
    });
    fetchMessages();
    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [isCloud, cloudUserId, selected, retry]);

  useEffect(() => { if (unlocked) endRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [messages, unlocked]);

  const appendLocal = message => {
    if (initial.error) { setError(initial.error); return false; }
    try {
      const currentOwner = readWorkspaceOwner(localStorage);
      if (currentOwner !== undefined && currentOwner !== (user?.id || null)) { setError('The active account changed in another tab. Reload before saving a note.'); return false; }
      const next = validateConversationNotes([...localMessagesRef.current, message].slice(-MAX_CONVERSATION_NOTES));
      localStorage.setItem(CONVERSATION_NOTES_KEY, JSON.stringify(next));
      localMessagesRef.current = next;
      setLocalMessages(next);
      return true;
    } catch (reason) {
      setError(reason?.name === 'QuotaExceededError' ? 'This device has no room for this note. Your earlier notes are unchanged; download a backup and free browser storage.' : 'This note could not be saved. Your earlier notes and draft are unchanged. Use text up to 10,000 characters or a PNG, JPEG, WebP or GIF smaller than 2 MB.');
      return false;
    }
  };
  const unlock = async event => {
    event.preventDefault();
    if (checkingPin) return;
    if (!/^\d{4,6}$/.test(pin)) { setPinError('Enter a 4–6 digit PIN.'); return; }
    setCheckingPin(true);
    try {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${pin}prepvault-secure-comms-salt`));
      const hashed = Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
      if (!alive.current) return;
      if (pinHash && hashed !== pinHash) { setPinError('That PIN did not match. Try again.'); return; }
      if (!pinHash) { localStorage.setItem(PIN_KEY, hashed); setPinHash(hashed); }
      setUnlocked(true); setPin(''); setPinError('');
    } catch { if (alive.current) setPinError('The device lock could not be opened. Check that browser storage is available.'); }
    finally { if (alive.current) setCheckingPin(false); }
  };
  const send = async event => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || sendingRef.current) return;
    setError('');
    if (!isCloud) {
      if (appendLocal({ id: `local-${crypto.randomUUID()}`, from: 'p1', text, ts: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) })) setDraft('');
      return;
    }
    const key = contextKey;
    sendingRef.current = true; setSending(true);
    try {
      const { data, error: responseError } = await supabase.from('messages').insert({ community_id: selected, user_id: cloudUserId, text,
        display_name: user.email?.split('@')[0] || 'You', message_type: 'text' }).select('id, community_id, user_id, display_name, text, created_at').single();
      if (responseError) throw responseError;
      if (!alive.current || contextRef.current !== key) return;
      if (data) {
        const message = { id: data.id, from: 'p1', text: data.text, createdAt: data.created_at, ts: new Date(data.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) };
        setCloudState(previous => ({ key, messages: [...(previous.key === key ? previous.messages.filter(existing => existing.id !== message.id) : []), message].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)).slice(-100) }));
      }
      setDraft(current => current.trim() === text ? '' : current);
    } catch { if (alive.current && contextRef.current === key) setError('Your message was not sent. Check your connection and try again.'); }
    finally { sendingRef.current = false; if (alive.current) setSending(false); }
  };
  const attach = event => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) { setError('Choose a PNG, JPEG, WebP or GIF image.'); return; }
    if (isCloud) { setError('Choose On this device to save an image locally. Community chat supports text messages.'); return; }
    if (file.size > 2 * 1024 * 1024) { setError('Choose an image smaller than 2 MB for on-device storage.'); return; }
    const key = contextKey;
    const reader = new FileReader();
    reader.onload = () => {
      if (!alive.current || contextRef.current !== key) return;
      setError('');
      appendLocal({ id: `local-${crypto.randomUUID()}`, from: 'p1', text: '', image: reader.result, ts: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) });
    };
    reader.onerror = () => { if (alive.current) setError('The image could not be read. Please choose it again.'); };
    reader.readAsDataURL(file);
  };

  if (!unlocked) return <section className="pv-comms-lock pv-inventory-workspace" aria-labelledby="comms-chat-title">
    <span className="pv-comms-lock-icon"><Icon name="key" size={27}/></span>
    <h2 id="comms-chat-title">Your conversations</h2><p>{pinHash ? 'Enter your device PIN to open your messages.' : 'Set a device PIN to keep this chat screen locked when you step away.'}</p>
    <form onSubmit={unlock}><label className="pv-comms-field">{pinHash ? 'Device PIN' : 'Choose a 4–6 digit PIN'}<input type="password" inputMode="numeric" autoComplete="off" maxLength={6} value={pin} onChange={event => { setPin(event.target.value.replace(/\D/g, '')); setPinError(''); }} aria-invalid={Boolean(pinError)} aria-describedby={pinError ? 'comms-pin-error' : undefined}/></label><button className="pv-inventory-button pv-inventory-button-primary" disabled={checkingPin}>{checkingPin ? 'Opening…' : pinHash ? 'Unlock chat' : 'Set PIN & open'}</button></form>
    {pinError && <p id="comms-pin-error" className="pv-comms-error" role="alert">{pinError}</p>}<small>This device PIN only hides the chat screen; it does not encrypt messages or protect them from someone with access to browser storage.</small>
  </section>;

  return <section className="pv-inventory-workspace pv-comms-chat" aria-label="Conversations">
    <div className="pv-comms-section-heading"><div><h2>Your conversations</h2><p>{isCloud ? 'Shared with your selected community.' : 'Saved on this device and included in complete plan backups. These notes are not sent to other people.'}</p></div><button type="button" className="pv-inventory-button pv-inventory-button-secondary" onClick={() => setUnlocked(false)}><Icon name="key" size={16}/>Lock chat</button></div>
    <div className="pv-inventory-toolbar"><label className="pv-comms-field pv-comms-chat-selector">Conversation<select aria-label="Chat conversation" disabled={sending} value={selected} onChange={event => {
      const next = event.target.value;
      contextRef.current = next === 'local' ? localKey : `${cloudUserId}:${next}`;
      setSelected(next); setError('');
      if (cloudUserId) { try { localStorage.setItem(`prepvault-chat-community-${cloudUserId}`, next); } catch { /* Selection still works. */ } }
    }}><option value="local">On this device</option>{communities.map(community => <option key={community.id} value={community.id}>{community.name}</option>)}</select></label><span className="pv-comms-muted">{cloudUserId && !communities.length ? 'No joined communities available.' : `${members.length} household ${members.length === 1 ? 'member' : 'members'}`}</span></div>
    {error && <div className="pv-comms-error" role="alert">{error}{cloudUserId && <button type="button" className="pv-comms-text-button" onClick={() => { setError(''); setRetry(value => value + 1); }}>Retry connection</button>}</div>}
    <div className="pv-comms-chat-history" role="log" aria-label="Messages" aria-live="polite" aria-relevant="additions">
      {loading && <p className="pv-comms-muted" role="status">Loading community messages…</p>}
      {!loading && !messages.length && <div className="pv-comms-empty"><Icon name="advisor" size={28}/><h3>{isCloud ? 'Start the conversation' : 'A place to keep a note'}</h3><p>{isCloud ? 'Your community messages will appear here.' : 'Write a household note, attach an image, or choose a community to send a message.'}</p></div>}
      {messages.map(message => {
        const sender = members.find(member => member.id === message.from);
        const mine = message.from === 'p1';
        return <article key={message.id} className={`pv-comms-message${mine ? ' is-own' : ''}`}><div className="pv-comms-message-meta"><strong>{mine ? 'You' : sender?.name || message.senderName || 'Member'}</strong><span>{message.ts}</span></div><div className="pv-comms-message-body">{message.image && <img src={message.image} alt="Image attached to this conversation" loading="lazy"/>}{message.text}</div></article>;
      })}<div ref={endRef}/>
    </div>
    <form className="pv-comms-chat-compose" onSubmit={send}><label className="pv-comms-attach" title={isCloud ? 'Images are available in on-device chat' : 'Attach image'}><Icon name="camera" size={19}/><span className="pv-inventory-sr-only">Attach an image</span><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={attach}/></label><label className="pv-inventory-sr-only" htmlFor="comms-message">Message</label><input id="comms-message" maxLength={10000} value={draft} onChange={event => setDraft(event.target.value)} placeholder={isCloud ? 'Message this community…' : 'Write an on-device note…'}/><button className="pv-inventory-button pv-inventory-button-primary" disabled={sending || !draft.trim()}>{sending ? 'Sending…' : isCloud ? 'Send' : 'Save note'}</button></form>
    <div className="pv-inventory-footer"><Icon name="key" size={14}/><span>Screen lock only · On-device notes are not encrypted; community messages are not end-to-end encrypted.</span></div>
  </section>;
}
