import { useEffect, useRef, useState } from 'react';
import { Icon } from './brand.jsx';
import { OWNER_SIGN_OUT_EVENT } from './tracking-auth.js';
import { ACCOUNT_SESSION_EVENT } from './account-auth-client.js';
import { getLocalPosts, getLocalPostsStatus } from './local-posts.js';
import { recentPostsUrl } from './local-updates.js';

export default function LocalPosts({ location, onSignIn }) {
  const [state, setState] = useState({ phase: 'checking', posts: [], error: '', fetchedAt: null });
  const request = useRef(null);
  const revision = useRef(0);
  useEffect(() => {
    const status = () => {
      request.current?.abort(); const controller = new AbortController(); request.current = controller;
      const current = ++revision.current;
      setState({ phase: 'checking', posts: [], error: '', fetchedAt: null });
      void getLocalPostsStatus(location, { signal: controller.signal }).then(result => {
        if (!controller.signal.aborted && current === revision.current) setState({ phase: result.configured ? 'ready' : 'not-configured', posts: [], error: '', fetchedAt: null });
      }).catch(error => { if (!controller.signal.aborted && current === revision.current) setState({ phase: [401, 403].includes(error.status) ? 'signed-out' : 'unavailable', posts: [], error: '', fetchedAt: null }); });
    };
    const clear = () => { revision.current++; request.current?.abort(); setState({ phase: 'signed-out', posts: [], error: '', fetchedAt: null }); };
    const cancel = () => { revision.current += 1; request.current?.abort(); };
    const timer = setTimeout(status, 0);
    window.addEventListener(OWNER_SIGN_OUT_EVENT, clear); window.addEventListener(ACCOUNT_SESSION_EVENT, status);
    return () => { clearTimeout(timer); cancel(); window.removeEventListener(OWNER_SIGN_OUT_EVENT, clear); window.removeEventListener(ACCOUNT_SESSION_EVENT, status); };
  }, [location]);
  const load = async () => {
    request.current?.abort(); const controller = new AbortController(); request.current = controller;
    const current = ++revision.current;
    setState(previous => ({ ...previous, phase: 'loading', error: '' }));
    try {
      const result = await getLocalPosts(location, { signal: controller.signal });
      if (!controller.signal.aborted && current === revision.current) setState({ phase: 'loaded', posts: result.posts, fetchedAt: result.fetchedAt, error: '' });
    } catch (error) {
      if (controller.signal.aborted || current !== revision.current) return;
      setState(previous => [401, 403].includes(error.status) ? { phase: 'signed-out', posts: [], error: '', fetchedAt: null } : { ...previous, phase: ['needs_connection', 'credits_required'].includes(error.code) ? 'needs-setup' : 'ready', error: error.message });
    }
  };
  const configured = ['ready', 'loaded', 'loading'].includes(state.phase);
  return <div className="pv-local-posts">
    <header><div><h3>Recent posts on X</h3><p>Mentions of {location.city}, police activity and local disruption. Social posts are not verified alerts.</p></div><a className="pv-text-link" href={recentPostsUrl(location)} target="_blank" rel="noreferrer">Search recent posts<Icon name="arrow" size={14}/></a></header>
    {configured ? <div className="pv-local-posts-actions"><button type="button" className="pv-text-link" disabled={state.phase === 'loading'} onClick={load}>{state.phase === 'loading' ? 'Checking X…' : state.phase === 'loaded' ? 'Refresh X posts' : 'Load posts here'}</button><span>{state.fetchedAt ? `Retrieved ${new Date(state.fetchedAt).toLocaleString()} · ` : ''}Uses your configured X API · refreshed only when requested.</span></div> : state.phase === 'signed-out' && onSignIn ? <p className="pv-local-posts-note"><button type="button" className="pv-text-link" onClick={onSignIn}>Sign in</button> to check the X feed setup, or use the recent-post search.</p> : <p className="pv-local-posts-note">{state.phase === 'checking' ? 'Checking the X connection…' : state.phase === 'needs-setup' ? 'The X connection needs attention before posts can load. Use the search link in the meantime.' : state.phase === 'unavailable' ? 'The in-app X connection could not be checked. The search link opens X directly.' : 'In-app posts need an X API connection. The search link opens X directly.'}</p>}
    {state.error && <p className="pv-local-posts-note" role="status">{state.error}{state.posts.length > 0 && ' Showing previous results.'}</p>}
    {state.phase === 'loaded' && !state.posts.length && <p className="pv-local-posts-note">No matching posts were returned in the last 48 hours. This is not an all-clear.</p>}
    {state.posts.length > 0 && <ol className="pv-local-updates-list">{state.posts.map(post => <li key={post.id}><div><a href={`https://x.com/${post.author.username}`} target="_blank" rel="noreferrer">{post.author.name} · @{post.author.username}</a><time dateTime={post.createdAt}>{new Date(post.createdAt).toLocaleString()}</time></div><p className="pv-local-post-text">{post.text}</p><a className="pv-text-link" href={post.url} target="_blank" rel="noreferrer">View post on X<Icon name="arrow" size={13}/></a></li>)}</ol>}
  </div>;
}
