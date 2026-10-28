import { isLocalEdition } from './runtime-mode.js';
import LocalServiceNotice from './LocalServiceNotice.jsx';
import { useEffect, useId, useRef, useState } from 'react';
import { Icon } from './brand.jsx';
import { useDialogFocus } from './useDialogFocus.js';
import { countries } from '../shared/board-locations.js';
import { boardRequest, boardTimestamp, mergeBoardPage } from './message-board.js';
import './inventory.css';
import './message-board.css';

const REASONS = { spam: 'Spam or advertising', unsafe: 'Threatening or harmful content', personal: 'Private information', other: 'Something else' };
const placeName = (country, region) => {
  const place = countries.find(item => item.code === country);
  const area = place?.regions.find(item => item.code === region);
  return [area?.name, place?.name || country].filter(Boolean).join(', ') || 'All countries';
};

function useBoardPages(action, payload, enabled = true, onForbidden) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState({ key: null, data: null, error: '' });
  const pending = useRef(new Set());
  const forbiddenRef = useRef(onForbidden);
  useEffect(() => { forbiddenRef.current = onForbidden; }, [onForbidden]);
  const key = JSON.stringify({ action, payload, revision });
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const request = JSON.parse(key);
    boardRequest(request.action, request.payload, { signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) setState({ key, data, error: '', loadingMore: false });
    }).catch(error => {
      if (!controller.signal.aborted) { setState({ key, data: null, error: error.message, loadingMore: false }); if ([401, 403].includes(error.status)) forbiddenRef.current?.(); }
    });
    return () => controller.abort();
  }, [key, enabled]);
  useEffect(() => {
    const requests = pending.current;
    return () => { for (const request of requests) request.abort(); };
  }, []);
  const current = state.key === key ? state : { data: null, error: '', loadingMore: false };
  const loadMore = async field => {
    if (!current.data?.nextCursor || current.loadingMore) return;
    const controller = new AbortController();
    pending.current.add(controller);
    setState(previous => previous.key === key ? { ...previous, loadingMore: true, error: '' } : previous);
    try {
      const data = await boardRequest(action, { ...payload, cursor: current.data.nextCursor }, { signal: controller.signal });
      if (!controller.signal.aborted) setState(previous => previous.key === key ? { ...previous, data: mergeBoardPage(previous.data, data, field), loadingMore: false, error: '' } : previous);
    } catch (error) {
      if (!controller.signal.aborted) { setState(previous => previous.key === key ? { ...previous, loadingMore: false, error: error.message } : previous); if ([401, 403].includes(error.status)) forbiddenRef.current?.(); }
    } finally { pending.current.delete(controller); }
  };
  return { ...current, loading: enabled && !current.data && !current.error, loadMore, refresh: () => setRevision(value => value + 1) };
}

function RegionFields({ country, region, onCountry, onRegion, prefix, browsing = false, disabled = false }) {
  const regions = countries.find(item => item.code === country)?.regions || [];
  return <div className="pv-board-region-fields">
    <label className="pv-board-field"><span>Country</span><select aria-label={`${prefix} country`} value={country} onChange={event => onCountry(event.target.value)} disabled={disabled} required={!browsing}><option value="">{browsing ? 'All countries' : 'Choose a country'}</option>{countries.map(item => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label>
    <label className="pv-board-field"><span>State / province</span><select aria-label={`${prefix} state or province`} value={region} onChange={event => onRegion(event.target.value)} disabled={disabled || !country || !regions.length}><option value="">{!country ? 'Choose a country first' : regions.length ? 'Country-wide / all regions' : 'Country-wide'}</option>{regions.map(item => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label>
  </div>;
}

function BoardDialog({ title, children, onClose, busy }) {
  const titleId = useId();
  const ref = useDialogFocus(() => { if (!busy) onClose(); });
  return <div className="pv-inventory-modal-backdrop" onClick={() => { if (!busy) onClose(); }}><section ref={ref} className="pv-board-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={event => event.stopPropagation()}><header><h2 id={titleId}>{title}</h2><button type="button" className="pv-board-icon-button" onClick={onClose} disabled={busy} aria-label="Close dialog"><Icon name="close" size={20}/></button></header>{children}</section></div>;
}

function PostMeta({ post }) {
  return <div className="pv-board-post-meta"><span>{post.alias || 'Anonymous'}{post.owned && <small>You</small>}</span><time dateTime={post.createdAt}>{boardTimestamp(post.createdAt)}</time></div>;
}

function PostActions({ post, onAction }) {
  if (post.removed) return null;
  return <div className="pv-board-post-actions">{post.owned && <button type="button" onClick={() => onAction({ type: 'remove', post })}><Icon name="trash" size={14}/>Remove my post</button>}<button type="button" onClick={() => onAction({ type: 'report', post })}><Icon name="shield" size={14}/>Report</button></div>;
}

function ErrorNotice({ message, onRetry }) {
  return <div className="pv-board-error" role="alert"><span>{message}</span>{onRetry && <button type="button" onClick={onRetry}>Try again<Icon name="refresh" size={14}/></button>}</div>;
}

function EmptyState({ icon = 'advisor', title, children }) {
  return <div className="pv-inventory-empty"><span><Icon name={icon} size={30}/></span><h2>{title}</h2><p>{children}</p></div>;
}

function ThreadView({ id, revision, sessionReady, alias, online, onBack, onAction, onChanged, onSessionExpired }) {
  const resource = useBoardPages('thread', { id, revision, identity: alias || '' }, sessionReady);
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const pending = useRef(null);
  useEffect(() => () => pending.current?.abort(), []);
  const thread = resource.data?.thread;
  const submit = async event => {
    event.preventDefault();
    if (busy || !body.trim()) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true); setError(''); setSent(false);
    try {
      await boardRequest('reply', { threadId: id, body: body.trim() }, { signal: controller.signal });
      if (!controller.signal.aborted) { setBody(''); setSent(true); resource.refresh(); onChanged(); }
    } catch (failure) { if (!controller.signal.aborted) { setError(failure.message); if (failure.status === 401) onSessionExpired(); } }
    finally { if (!controller.signal.aborted) setBusy(false); }
  };
  return <div className="pv-board-thread">
    <div className="pv-board-thread-nav"><button type="button" className="pv-board-back" onClick={onBack}><Icon name="arrow" size={16}/>All conversations</button><button type="button" className="pv-board-text-button" onClick={resource.refresh} disabled={resource.loading || busy}><Icon name="refresh" size={15}/>Refresh</button></div>
    {resource.error && <ErrorNotice message={resource.error} onRetry={resource.refresh}/>}
    {resource.loading && <div className="pv-board-loading" role="status">Loading conversation…</div>}
    {thread && <><article className="pv-board-root-post"><div className="pv-board-location"><Icon name="map" size={15}/>{placeName(thread.country, thread.region)}</div><h2>{thread.removed ? 'Removed conversation' : thread.title}</h2><PostMeta post={thread}/><p className="pv-board-message">{thread.removed ? 'This post has been removed. Replies remain visible.' : thread.body}</p><PostActions post={thread} onAction={onAction}/></article>
      <section className="pv-board-replies" aria-labelledby="board-replies-title"><header><h3 id="board-replies-title">Replies</h3><span>{thread.replyCount ?? resource.data.replies.length}</span></header>{resource.data.replies.length ? resource.data.replies.map(reply => <article className="pv-board-reply" key={reply.id}><PostMeta post={reply}/><p className={`pv-board-message${reply.removed ? ' is-removed' : ''}`}>{reply.removed ? 'This reply has been removed.' : reply.body}</p><PostActions post={reply} onAction={onAction}/></article>) : <p className="pv-board-no-replies">Be the first to add a helpful reply.</p>}{resource.data.nextCursor && <button type="button" className="pv-board-load-more" onClick={() => resource.loadMore('replies')} disabled={resource.loadingMore}>{resource.loadingMore ? 'Loading…' : 'Load more replies'}</button>}</section>
      {!thread.removed && <form className="pv-board-reply-form" onSubmit={submit}><div><h3>Add a reply</h3><p>Posting as {alias || 'an anonymous neighbor'}</p></div><label className="pv-board-field"><span className="pv-inventory-sr-only">Your reply</span><textarea aria-label="Your reply" value={body} onChange={event => { setBody(event.target.value); setSent(false); }} maxLength={2000} rows={4} required disabled={busy} placeholder="Share something useful with the conversation…"/></label><div className="pv-board-form-footer"><span>{body.length.toLocaleString()} / 2,000</span><button type="submit" className="pv-inventory-button pv-inventory-button-primary" disabled={busy || !body.trim() || !alias || !online}>{busy ? 'Posting…' : 'Post reply'}<Icon name="arrow" size={15}/></button></div>{error && <ErrorNotice message={error}/>}<p className="pv-board-status" role="status">{sent ? 'Your reply is posted.' : ''}</p></form>}
    </>}
  </div>;
}

function ModerationView({ onBack, onAction, onAccessLost, revision }) {
  const resource = useBoardPages('moderation', { revision }, true, onAccessLost);
  const reports = resource.data?.reports || [];
  return <div className="pv-board-moderation"><div className="pv-board-thread-nav"><button type="button" className="pv-board-back" onClick={onBack}><Icon name="arrow" size={16}/>All conversations</button><button type="button" className="pv-board-text-button" onClick={resource.refresh} disabled={resource.loading}><Icon name="refresh" size={15}/>Refresh</button></div><div className="pv-board-section-heading"><h2>Reported posts</h2><p>Only you can review these reports. Hiding a conversation also hides its replies.</p></div>{resource.error && <ErrorNotice message={resource.error} onRetry={resource.refresh}/>}{resource.loading && <div className="pv-board-loading" role="status">Loading reports…</div>}{resource.data && !reports.length && <EmptyState icon="check" title="No open reports">Reported messages will appear here for review.</EmptyState>}{reports.map(post => <article className="pv-board-report" key={post.id}><div className="pv-board-location">{placeName(post.country, post.region)} · {post.reportCount} {post.reportCount === 1 ? 'report' : 'reports'}</div><h3>{post.title || 'Reply in a conversation'}</h3><PostMeta post={post}/><p className="pv-board-message">{post.body}</p><p className="pv-board-report-reasons">Reasons: {(post.reasons || []).map(reason => REASONS[reason] || reason).join(', ')}</p><div className="pv-board-post-actions"><button type="button" onClick={() => onAction({ type: 'moderate', post, decision: 'dismiss' })}><Icon name="check" size={14}/>Dismiss reports</button><button type="button" onClick={() => onAction({ type: 'moderate', post, decision: 'hide' })}><Icon name="shield" size={14}/>Hide post</button></div></article>)}{resource.data?.nextCursor && <button type="button" className="pv-board-load-more" disabled={resource.loadingMore} onClick={() => resource.loadMore('reports')}>{resource.loadingMore ? 'Loading…' : 'Load more reports'}</button>}</div>;
}

function MessageBoardOnline({ standalone = false }) {
  const [session, setSession] = useState(null);
  const [sessionError, setSessionError] = useState('');
  const [sessionRevision, setSessionRevision] = useState(0);
  const [country, setCountry] = useState('');
  const [region, setRegion] = useState('');
  const [threadId, setThreadId] = useState(null);
  const [threadRevision, setThreadRevision] = useState(0);
  const [moderating, setModerating] = useState(false);
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState({ country: '', region: '', title: '', body: '' });
  const [action, setAction] = useState(null);
  const [reportReason, setReportReason] = useState('spam');
  const [busy, setBusy] = useState(false);
  const [mutationError, setMutationError] = useState('');
  const [notice, setNotice] = useState('');
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);
  const pending = useRef(null);
  const sessionReady = Boolean(session || sessionError);
  const canModerate = Boolean(session?.canModerate);
  const list = useBoardPages('list', { country, region, identity: session?.alias || '' }, sessionReady);

  useEffect(() => {
    const controller = new AbortController();
    boardRequest('session', {}, { signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) { setSession(data); setSessionError(''); }
    }).catch(error => { if (!controller.signal.aborted) setSessionError(error.message); });
    return () => controller.abort();
  }, [sessionRevision]);
  useEffect(() => {
    const handleOnline = () => setOnline(navigator.onLine);
    window.addEventListener('online', handleOnline); window.addEventListener('offline', handleOnline);
    return () => { window.removeEventListener('online', handleOnline); window.removeEventListener('offline', handleOnline); pending.current?.abort(); };
  }, []);

  const loseModeratorAccess = () => {
    setSession(previous => previous ? { ...previous, canModerate: false } : previous);
    setModerating(false);
    setAction(previous => previous?.type === 'moderate' ? null : previous);
    setNotice('Owner verification is needed to review reports. Sign in through Survival LLM, then reopen this page.');
  };
  useEffect(() => {
    if (!canModerate) return;
    let controller;
    const check = () => {
      if (document.hidden) return;
      controller?.abort();
      const request = new AbortController();
      controller = request;
      boardRequest('session', {}, { signal: request.signal }).then(data => {
        if (request.signal.aborted) return;
        setSession(data);
        if (!data.canModerate) {
          setModerating(false);
          setAction(previous => previous?.type === 'moderate' ? null : previous);
          setNotice('Owner verification is needed to review reports. Sign in through Survival LLM, then reopen this page.');
        }
      }).catch(() => {
        if (request.signal.aborted) return;
        setSession(previous => previous ? { ...previous, canModerate: false } : previous);
        setModerating(false);
        setAction(previous => previous?.type === 'moderate' ? null : previous);
        setNotice('Owner verification is unavailable. Reopen this page to review reports.');
      });
    };
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    const timer = moderating ? setInterval(check, 60000) : null;
    return () => { controller?.abort(); clearInterval(timer); window.removeEventListener('focus', check); document.removeEventListener('visibilitychange', check); };
  }, [canModerate, moderating]);

  const refresh = () => { list.refresh(); setThreadRevision(value => value + 1); };
  const returnToList = () => { setThreadId(null); setModerating(false); setNotice(''); list.refresh(); };
  const sessionExpired = () => { setSession(null); setSessionError('Your anonymous session expired. Refresh it to post again; your draft stays here.'); };
  const retrySession = () => { setSession(null); setSessionError(''); setSessionRevision(value => value + 1); };
  const beginCompose = () => { setDraft(previous => previous.title.trim() || previous.body.trim() ? previous : { ...previous, country: country || previous.country, region: country ? region : previous.region }); setMutationError(''); setComposing(true); };
  const beginAction = next => { setAction(next); setReportReason('spam'); setMutationError(''); };
  const submit = async event => {
    event.preventDefault();
    if (busy || !draft.title.trim() || !draft.body.trim() || !draft.country) return;
    const controller = new AbortController(); pending.current = controller;
    setBusy(true); setMutationError('');
    try {
      const data = await boardRequest('create', { ...draft, title: draft.title.trim(), body: draft.body.trim() }, { signal: controller.signal });
      if (!controller.signal.aborted) { setComposing(false); setDraft({ country: draft.country, region: draft.region, title: '', body: '' }); setThreadId(data.id); setModerating(false); setNotice('Your conversation is posted.'); refresh(); }
    } catch (error) { if (!controller.signal.aborted) { setMutationError(error.message); if (error.status === 401) sessionExpired(); } }
    finally { if (!controller.signal.aborted) setBusy(false); }
  };
  const performAction = async event => {
    event.preventDefault();
    if (busy || !action) return;
    const controller = new AbortController(); pending.current = controller;
    setBusy(true); setMutationError('');
    try {
      await boardRequest(action.type, { id: action.post.id, reason: reportReason, decision: action.decision }, { signal: controller.signal });
      if (!controller.signal.aborted) {
        const message = action.type === 'report' ? 'Report sent for review.' : action.type === 'remove' ? 'Your post has been removed.' : action.decision === 'hide' ? 'The post is hidden.' : 'Reports dismissed.';
        setAction(null); setNotice(message); refresh();
      }
    } catch (error) { if (!controller.signal.aborted) { setMutationError(error.message); if ([401, 403].includes(error.status) && action.type === 'moderate') loseModeratorAccess(); else if (error.status === 401) sessionExpired(); } }
    finally { if (!controller.signal.aborted) setBusy(false); }
  };
  const threads = list.data?.threads || [];
  const content = <section className="pv-inventory pv-board" aria-labelledby="board-title">
    <header className="pv-inventory-heading"><div><p className="pv-inventory-eyebrow">SHARED KNOWLEDGE, STRONGER COMMUNITIES</p><h1 id="board-title">Community board<span>.</span></h1><p className="pv-inventory-intro">Ask a question. Share an idea. Learn from people near you.</p></div><div className="pv-inventory-actions">{!standalone && <a className="pv-inventory-button pv-inventory-button-secondary pv-board-public-link" href="/community" target="_blank" rel="noopener noreferrer">Open public board<Icon name="arrow" size={16}/></a>}{session?.canModerate && <button type="button" className="pv-inventory-button pv-inventory-button-secondary" onClick={() => { setModerating(true); setThreadId(null); }}>Review reports</button>}<button type="button" className="pv-inventory-button pv-inventory-button-primary" onClick={beginCompose} disabled={!session?.alias || !online}><Icon name="plus" size={17}/>New conversation</button></div></header>
    <div className="pv-board-privacy"><Icon name="users" size={21}/><div><strong>Public conversations. No name or sign-in required.</strong><p>Your posts use an anonymous browser identity. Your private plans stay in your workspace.</p></div><details><summary>How privacy works</summary><p>Your browser keeps a cookie for 30 days so you can remove your own posts. Expiry or clearing it loses that control. Posts and chosen regions are public; do not include contact details or precise locations. The service may retain network information in operational logs. This board is not an emergency response service.</p></details></div>
    {!online && <ErrorNotice message="You’re offline. Connect to the internet to read new messages or post."/>}
    {sessionError && <ErrorNotice message={sessionError} onRetry={retrySession}/>}
    <p className="pv-board-status" role="status">{notice}</p>
    {moderating && canModerate ? <ModerationView onBack={returnToList} onAction={beginAction} onAccessLost={loseModeratorAccess} revision={threadRevision}/> : threadId ? <ThreadView key={threadId} id={threadId} revision={threadRevision} sessionReady={sessionReady} alias={session?.alias} online={online} onSessionExpired={sessionExpired} onBack={returnToList} onAction={beginAction} onChanged={list.refresh}/> : <div className="pv-inventory-workspace">
      <div className="pv-board-toolbar"><div><h2>Find your community</h2><p>Browse a country, narrow to a region, or see every conversation.</p></div><RegionFields prefix="Browse" browsing country={country} region={region} onCountry={value => { setCountry(value); setRegion(''); }} onRegion={setRegion}/></div>
      <div className="pv-board-list-heading"><span>{country ? placeName(country, region) : 'All countries'}<small>Newest conversations first</small></span><button type="button" className="pv-board-text-button" onClick={list.refresh} disabled={list.loading}><Icon name="refresh" size={15}/>Refresh</button></div>
      {list.error && <ErrorNotice message={list.error} onRetry={list.refresh}/>}
      {(!sessionReady || list.loading) && <div className="pv-board-loading" role="status">Loading conversations…</div>}
      {list.data && !threads.length && <EmptyState title="Start a conversation">No conversations here yet. Ask a question or share something useful from your region.</EmptyState>}
      <div className="pv-board-thread-list">{threads.map(thread => <article key={thread.id} className="pv-board-thread-row"><span className="pv-board-thread-symbol"><Icon name="advisor" size={21}/></span><div className="pv-board-thread-main"><div className="pv-board-location">{placeName(thread.country, thread.region)}</div><h2><button type="button" onClick={() => { setThreadId(thread.id); setNotice(''); }}>{thread.title}</button></h2><p>{thread.body}</p><PostMeta post={thread}/></div><button type="button" className="pv-board-reply-count" aria-label={`Open ${thread.title}, ${thread.replyCount || 0} replies`} onClick={() => { setThreadId(thread.id); setNotice(''); }}><span>{thread.replyCount || 0}</span><small>{thread.replyCount === 1 ? 'reply' : 'replies'}</small><Icon name="chevron" size={16}/></button></article>)}</div>
      {list.data?.nextCursor && <button type="button" className="pv-board-load-more" onClick={() => list.loadMore('threads')} disabled={list.loadingMore}>{list.loadingMore ? 'Loading…' : 'Load more conversations'}</button>}
      <div className="pv-inventory-footer"><Icon name="shield" size={15}/><span>Keep it helpful, respectful and relevant. Report spam or private information for review.</span></div>
    </div>}
    {composing && <BoardDialog title="Start a conversation" onClose={() => setComposing(false)} busy={busy}><form onSubmit={submit}><p className="pv-board-dialog-intro">Posting publicly as <strong>{session?.alias}</strong>. Choose the community this conversation belongs to.</p><RegionFields prefix="Post" country={draft.country} region={draft.region} onCountry={value => setDraft(previous => ({ ...previous, country: value, region: '' }))} onRegion={value => setDraft(previous => ({ ...previous, region: value }))} disabled={busy}/><label className="pv-board-field"><span>Title</span><input value={draft.title} onChange={event => setDraft(previous => ({ ...previous, title: event.target.value }))} maxLength={120} required disabled={busy} placeholder="What would you like to discuss?"/></label><label className="pv-board-field"><span>Message</span><textarea value={draft.body} onChange={event => setDraft(previous => ({ ...previous, body: event.target.value }))} maxLength={4000} rows={6} required disabled={busy} placeholder="Share a question, experience or practical idea…"/></label><div className="pv-board-form-footer"><span>{draft.body.length.toLocaleString()} / 4,000</span><div><button type="button" className="pv-inventory-button pv-inventory-button-secondary" onClick={() => setComposing(false)} disabled={busy}>Cancel</button><button type="submit" className="pv-inventory-button pv-inventory-button-primary" disabled={busy || !session?.alias || !draft.country || !draft.title.trim() || !draft.body.trim() || !online}>{busy ? 'Posting…' : 'Post conversation'}</button></div></div>{mutationError && <ErrorNotice message={mutationError} onRetry={sessionError ? retrySession : undefined}/>}</form></BoardDialog>}
    {action && <BoardDialog title={action.type === 'report' ? 'Report this post' : action.type === 'remove' ? 'Remove your post?' : action.decision === 'hide' ? 'Hide this post?' : 'Dismiss these reports?'} onClose={() => setAction(null)} busy={busy}><form onSubmit={performAction}>{action.type === 'report' ? <><p className="pv-board-dialog-intro">Reports are sent privately to the board moderator.</p><label className="pv-board-field"><span>Reason</span><select value={reportReason} onChange={event => setReportReason(event.target.value)} disabled={busy}>{Object.entries(REASONS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label></> : <p className="pv-board-dialog-intro">{action.type === 'remove' ? 'Your message will no longer be shown. Replies from other people remain visible.' : action.decision === 'hide' ? 'This message will no longer appear publicly. Hiding a conversation also hides its replies.' : 'Keep this post visible and mark its current reports as reviewed.'}</p>}<div className="pv-board-dialog-actions"><button type="button" className="pv-inventory-button pv-inventory-button-secondary" onClick={() => setAction(null)} disabled={busy}>Cancel</button><button type="submit" className="pv-inventory-button pv-inventory-button-primary" disabled={busy || !session?.alias || !online}>{busy ? 'Saving…' : action.type === 'report' ? 'Send report' : action.type === 'remove' ? 'Remove my post' : action.decision === 'hide' ? 'Hide post' : 'Dismiss reports'}</button></div>{mutationError && <ErrorNotice message={mutationError} onRetry={sessionError ? retrySession : undefined}/>}</form></BoardDialog>}
  </section>;
  return content;
}

export default function MessageBoard(props) {
  return isLocalEdition() ? <LocalServiceNotice title="Community board needs the live site." path="/community">Public conversations are held on the live website. This download does not keep a copy of community posts.</LocalServiceNotice> : <MessageBoardOnline {...props} />;
}
