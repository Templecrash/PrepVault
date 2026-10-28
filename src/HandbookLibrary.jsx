import { isLocalEdition } from './runtime-mode.js';
import { useEffect, useRef, useState } from 'react';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { Icon } from './brand.jsx';
import { useDialogFocus } from './useDialogFocus.js';
import { HANDBOOKS } from './handbooks.js';
import { HANDBOOK_VISUALS } from './handbook-visuals.js';
import { SKILL_VISUALS } from './reference-visuals.js';
import GuideIllustration from './GuideIllustration.jsx';
import { handbookStartPage } from './guide-illustration.js';
import { getHandbookUrl, getOfflineLibraryStatus, listSavedHandbooks, prepareOfflineLibrary, removeHandbook, saveHandbook } from './handbook-offline.js';
import './handbook-library.css';

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const categories = [...new Set(HANDBOOKS.map(book => book.category))];
const totalBytes = HANDBOOKS.reduce((sum, book) => sum + book.bytes, 0);
const fileSize = bytes => bytes >= 1000000 ? `${(bytes / 1000000).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1000))} KB`;

export function HandbookReader({ book, onClose, initialPage = 1 }) {
  const dialog = useDialogFocus(onClose);
  const viewportRef = useRef(null);
  const canvasRef = useRef(null);
  const renderTask = useRef(null);
  const [pdf, setPdf] = useState(null);
  const [documentError, setDocumentError] = useState('');
  const [pageNumber, setPageNumber] = useState(() => handbookStartPage(initialPage, book.pages));
  const [pageInput, setPageInput] = useState(() => String(handbookStartPage(initialPage, book.pages)));
  const [zoom, setZoom] = useState(1);
  const [width, setWidth] = useState(0);
  const [rendered, setRendered] = useState({ key: '', error: '', text: '' });
  const url = getHandbookUrl(book);
  const illustratedPages = HANDBOOK_VISUALS[book.id]?.pages || [];
  const renderKey = `${pageNumber}:${zoom}:${width}`;
  const ready = Boolean(pdf) && rendered.key === renderKey && !rendered.error;
  const error = documentError || (rendered.key === renderKey ? rendered.error : '');

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, []);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const observer = new ResizeObserver(entries => setWidth(Math.floor(entries[0].contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadingTask = getDocument({ url, useSystemFonts: true, isEvalSupported: false });
    loadingTask.promise.then(document => {
      if (!cancelled) setPdf(document);
    }).catch(() => {
      if (!cancelled) setDocumentError('This guide could not be opened. Check your connection or save it for offline use, then try again. You can also download the PDF below.');
    });
    return () => {
      cancelled = true;
      renderTask.current?.cancel();
      void loadingTask.destroy().catch(() => {});
    };
  }, [url]);

  useEffect(() => {
    if (!pdf || width <= 0) return;
    let cancelled = false;
    let task;
    const renderPage = async () => {
      try {
        const previousTask = renderTask.current;
        previousTask?.cancel();
        await previousTask?.promise.catch(() => {});
        if (cancelled) return;
        const page = await pdf.getPage(pageNumber);
        if (cancelled || !canvasRef.current) return;
        const pageViewport = page.getViewport({ scale: 1 });
        const scale = Math.max(0.1, width / pageViewport.width) * zoom;
        const viewport = page.getViewport({ scale });
        const outputScale = Math.min(window.devicePixelRatio || 1, 2);
        const canvas = canvasRef.current;
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        task = page.render({ canvas, viewport, transform: outputScale === 1 ? null : [outputScale, 0, 0, outputScale, 0, 0] });
        renderTask.current = task;
        await task.promise;
        if (cancelled) return;
        const content = await page.getTextContent().catch(() => ({ items: [] }));
        if (cancelled) return;
        const text = content.items.map(item => `${item.str || ''}${item.hasEOL ? '\n' : ' '}`).join('').trim();
        setRendered({ key: renderKey, error: '', text });
      } catch (reason) {
        if (!cancelled && reason?.name !== 'RenderingCancelledException') setRendered({ key: renderKey, error: 'This page could not be displayed. Try another page or use the original PDF download.', text: '' });
      }
    };
    void renderPage();
    return () => { cancelled = true; task?.cancel(); };
  }, [pdf, pageNumber, zoom, width, renderKey]);

  const goToPage = next => {
    if (!pdf) return;
    const number = Math.min(pdf.numPages, Math.max(1, Math.floor(Number(next) || pageNumber)));
    setPageNumber(number);
    setPageInput(String(number));
    viewportRef.current?.scrollTo({ top: 0, left: 0 });
  };

  return <div className="pv-handbook-reader-backdrop" onClick={onClose}>
    <section className="pv-handbook-reader" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="handbook-reader-title" onClick={event => event.stopPropagation()}>
      <div className="pv-handbook-reader-heading">
        <div><span className="pv-eyebrow">EMERGENCY LIBRARY</span><h2 id="handbook-reader-title">{book.title}</h2></div>
        <button className="pv-icon-button" type="button" onClick={onClose} aria-label="Close handbook"><Icon name="close"/></button>
      </div>
      <div className="pv-handbook-reader-tools">
        <p>{book.publisher} · {book.edition}{book.audience === 'professional' ? ' · For trained professionals' : ''}</p>
        <a href={url} target="_blank" rel="noreferrer">Open original PDF <Icon name="arrow" size={14}/></a>
        <a href={url} download={book.path.split('/').at(-1)}>Download PDF <Icon name="download" size={14}/></a>
      </div>
      <div className="pv-handbook-page-toolbar">
        <div className="pv-handbook-page-controls">
          <button type="button" disabled={!pdf || pageNumber <= 1} onClick={() => goToPage(pageNumber - 1)} aria-label="Previous page">←</button>
          <form onSubmit={event => { event.preventDefault(); goToPage(pageInput); }}><label>Page <input aria-label="Page number" type="number" min="1" max={pdf?.numPages || 1} disabled={!pdf} value={pageInput} onChange={event => setPageInput(event.target.value)} onBlur={() => goToPage(pageInput)}/></label><span>of {pdf?.numPages || '…'}</span></form>
          <button type="button" disabled={!pdf || pageNumber >= pdf.numPages} onClick={() => goToPage(pageNumber + 1)} aria-label="Next page">→</button>
        </div>
        <div className="pv-handbook-zoom-controls"><button type="button" aria-label="Zoom out" disabled={zoom <= 0.5 || !pdf} onClick={() => setZoom(value => Math.max(0.5, value - 0.25))}>−</button><button type="button" disabled={!pdf} onClick={() => setZoom(1)} aria-label="Fit page to width">{zoom === 1 ? 'Fit width' : `${Math.round(zoom * 100)}%`}</button><button type="button" aria-label="Zoom in" disabled={zoom >= 2.5 || !pdf} onClick={() => setZoom(value => Math.min(2.5, value + 0.25))}>+</button></div>
      </div>
      {illustratedPages.length > 0 && <nav className="pv-handbook-page-figures" aria-label="Illustrated handbook pages"><span>Pictures & diagrams</span>{illustratedPages.map(item => <button type="button" key={item.page} disabled={!pdf} aria-pressed={pageNumber === item.page} onClick={() => goToPage(item.page)}>{item.title} · p. {item.page}</button>)}</nav>}
      <div className="pv-handbook-pages" ref={viewportRef} tabIndex={0} aria-label="Handbook page" aria-busy={!ready && !error}>
        {error ? <div className="pv-handbook-reader-error" role="alert"><p>{error}</p><a href={url} download={book.path.split('/').at(-1)}>Download the original PDF</a></div> : !ready && <p className="pv-handbook-page-loading" role="status">{pdf ? `Rendering page ${pageNumber}…` : 'Opening handbook…'}</p>}
        <canvas ref={canvasRef} className={ready ? '' : 'is-loading'} role="img" aria-label={`${book.title}, page ${pageNumber}${pdf ? ` of ${pdf.numPages}` : ''}`}/>
        {ready && <details className="pv-handbook-page-text"><summary>Page {pageNumber} text</summary><p>{rendered.text || 'This page has no extractable text. The original PDF contains the complete page.'}</p></details>}
      </div>
      <p className="pv-handbook-reader-note">{book.audience === 'professional' ? 'This clinical reference is for trained professionals. ' : ''}Page numbers follow the PDF file. Use the original download to print or keep a separate copy.</p>
    </section>
  </div>;
}

const COMPANION_SKILLS = {
  'emergency-wound-care': 'protect-wounds',
  'emergency-drinking-water': 'safe-water',
  'food-water-emergencies': 'food-outage',
  'generator-safety': 'generator-co',
  'disaster-response-safety': 'safe-cleanup',
};

function HandbookVisuals({ book, canRead, onRead }) {
  const visual = HANDBOOK_VISUALS[book.id];
  const companion = SKILL_VISUALS[COMPANION_SKILLS[book.id]];
  if (!visual) return null;
  return <div className="pv-handbook-visuals"><strong>{visual.status === 'illustrated' ? 'Pictures & diagrams inside' : 'Text-led reference'}</strong><p>{visual.summary}</p>
    {visual.pages.length > 0 && <div className="pv-handbook-visual-links">{visual.pages.map(item => <button type="button" key={item.page} disabled={!canRead} onClick={() => onRead({ ...book, initialPage: item.page })} title={item.description}>{item.title} · PDF p. {item.page}</button>)}</div>}
    {companion && <details className="pv-handbook-companion"><summary>View PrepVault task picture</summary><GuideIllustration visual={companion}/></details>}
  </div>;
}

export default function HandbookLibrary({ onCrisis, crisisMode }) {
  const [savedOnly, setSavedOnly] = useState(false);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [savedIds, setSavedIds] = useState([]);
  const [checking, setChecking] = useState(true);
  const [capability, setCapability] = useState({ supported: null, ready: false, persistent: false });
  const [online, setOnline] = useState(() => navigator.onLine);
  const [busy, setBusy] = useState(null);
  const [progress, setProgress] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [reading, setReading] = useState(null);
  const mounted = useRef(false);
  const operation = useRef(false);

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    const refresh = async () => {
      try {
        const [ids, status] = await Promise.all([listSavedHandbooks(HANDBOOKS), getOfflineLibraryStatus()]);
        if (!cancelled) { setSavedIds(ids); setCapability(status); }
      } catch (reason) {
        if (!cancelled) setError(reason?.message || 'The saved library could not be checked. Download a PDF to keep a separate copy.');
      } finally {
        if (!cancelled) setChecking(false);
      }
    };
    const updateConnection = () => { setOnline(navigator.onLine); if (!operation.current) void refresh(); };
    const handleFocus = () => { if (!operation.current) void refresh(); };
    void refresh();
    window.addEventListener('online', updateConnection);
    window.addEventListener('offline', updateConnection);
    window.addEventListener('focus', handleFocus);
    return () => {
      cancelled = true;
      mounted.current = false;
      window.removeEventListener('online', updateConnection);
      window.removeEventListener('offline', updateConnection);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  const refreshSaved = async () => {
    const [ids, status] = await Promise.all([listSavedHandbooks(HANDBOOKS), getOfflineLibraryStatus()]);
    if (mounted.current) { setSavedIds(ids); setCapability(status); }
    return ids;
  };

  const saveBooks = async books => {
    if (operation.current || !books.length) return;
    operation.current = true;
    setBusy(books.length === 1 ? books[0].id : 'all');
    setError('');
    setMessage('');
    const failed = [];
    let completed = 0;
    try {
      for (const [index, book] of books.entries()) {
        if (!mounted.current) break;
        setProgress({ current: index + 1, total: books.length, title: book.title });
        try {
          await saveHandbook(book);
          completed += 1;
          if (mounted.current) setSavedIds(current => [...new Set([...current, book.id])]);
        } catch (reason) {
          failed.push(`${book.title}: ${reason?.message || 'Could not save the PDF.'}`);
        }
      }
      await refreshSaved();
      if (mounted.current) {
        if (completed) setMessage(`${completed} ${completed === 1 ? 'guide is' : 'guides are'} saved for offline reading on this device.`);
        if (failed.length) setError(`${failed.length} ${failed.length === 1 ? 'guide could' : 'guides could'} not be saved. ${failed.join(' ')} You can retry; completed files are kept.`);
      }
    } catch (reason) {
      if (mounted.current) setError(reason?.message || 'The saved library could not be verified. Please check it again before going offline.');
    } finally {
      operation.current = false;
      if (mounted.current) { setBusy(null); setProgress(null); }
    }
  };

  const removeSaved = async book => {
    if (operation.current) return;
    operation.current = true;
    setBusy(book.id);
    setError('');
    setMessage('');
    try {
      await removeHandbook(book);
      await refreshSaved();
      if (mounted.current) setMessage(`${book.title} removed from this browser’s offline library. Any PDF you downloaded separately is unchanged.`);
    } catch (reason) {
      if (mounted.current) setError(reason?.message || 'The saved copy could not be removed. Please try again.');
    } finally {
      operation.current = false;
      if (mounted.current) setBusy(null);
    }
  };

  const prepareSavedLibrary = async () => {
    if (operation.current) return;
    operation.current = true;
    setBusy('prepare');
    setError('');
    setMessage('');
    try {
      await prepareOfflineLibrary();
      await refreshSaved();
      if (mounted.current) setMessage('The site is ready to reopen offline on this device.');
    } catch (reason) {
      if (mounted.current) setError(reason?.message || 'Offline setup did not finish. Reconnect and try again.');
    } finally {
      operation.current = false;
      if (mounted.current) setBusy(null);
    }
  };

  const saved = new Set(savedIds);
  const missing = HANDBOOKS.filter(book => !saved.has(book.id));
  const missingBytes = missing.reduce((sum, book) => sum + book.bytes, 0);
  const availableBooks = savedOnly ? HANDBOOKS.filter(book => saved.has(book.id)) : HANDBOOKS;
  const search = query.trim().toLowerCase();
  const visibleBooks = availableBooks.filter(book => (category === 'all' || book.category === category) && (!search || [book.title, book.description, book.publisher, book.category].join(' ').toLowerCase().includes(search)));
  const canSave = !busy && !checking && online && capability.supported !== false;

  return <div className="pv-handbooks">
    <header className="pv-handbook-intro">
      <div><span className="pv-eyebrow">YOUR EMERGENCY REFERENCE</span><h1>Emergency</h1><p>Practical handbooks for the moments that matter. Read now, save for later, and prepare with confidence.</p></div>
    </header>

    <section className="pv-handbook-save-panel" aria-labelledby="handbook-save-title">
      <div className="pv-handbook-save-icon"><Icon name="download" size={24}/></div>
      <div className="pv-handbook-save-copy"><h2 id="handbook-save-title">Build your offline library.</h2><p>{checking ? 'Checking the guides saved on this device…' : <><strong>{savedIds.length} of {HANDBOOKS.length}</strong> guides saved on this device{!online ? ' · You are offline' : ''}.</>}</p><p className="pv-handbook-save-detail">{HANDBOOKS.length} original PDFs · {fileSize(totalBytes)} for the full collection</p></div>
      <button className="pv-button pv-primary" type="button" disabled={!canSave || (missing.length === 0 && capability.ready)} onClick={() => void (missing.length ? saveBooks(missing) : prepareSavedLibrary())}><Icon name={missing.length === 0 && capability.ready && !checking ? 'check' : 'download'} size={17}/>{busy === 'prepare' ? 'Preparing…' : busy ? 'Saving…' : !checking && missing.length === 0 ? capability.ready ? 'All guides saved' : 'Prepare offline access' : `Save ${savedIds.length ? 'remaining' : 'all'} offline`}</button>
      <div className="pv-handbook-save-footer">{capability.supported === false ? 'Offline saving is unavailable in this browser. Use Download PDF to keep files on your device.' : <>{isLocalEdition() ? 'The original PDFs are included in this local app. Save copies here if you also want browser-cached access.' : 'Save while connected, then reopen this same site and choose Emergency.'} {capability.ready && savedIds.length > 0 ? 'The site is saved for offline opening.' : missing.length > 0 ? `Up to ${fileSize(missingBytes)} to download, plus the site.` : ''}</>}</div>
    </section>

    <div className="pv-handbook-pack">{isLocalEdition() ? <><strong>All original PDFs are included.</strong><p>Open the app/handbooks folder in your extracted local app to read the files in any PDF reader. You can also download each guide below.</p></> : <><a href="/handbooks/prepvault-handbook-pack.zip" download="prepvault-handbook-pack.zip"><Icon name="download" size={15}/>Download all PDFs (ZIP)</a><p>Extract the ZIP to read the guides outside your browser. This download is separate from your saved offline library.</p></>}</div>

    {progress && <div className="pv-handbook-progress" role="status"><span>Saving {progress.current} of {progress.total}: {progress.title}</span><progress value={progress.current - 1} max={progress.total} aria-label="Guides saved"/></div>}
    {message && <p className="pv-handbook-message" role="status"><Icon name="check" size={16}/>{message}</p>}
    {error && <p className="pv-handbook-error" role="alert">{error}</p>}

    <div className="pv-handbook-care-note"><Icon name="shield" size={19}/><p>Surgery and clinical manuals are for trained professionals. For urgent care, contact local emergency services.</p>{onCrisis && <button type="button" onClick={onCrisis}>{crisisMode ? 'End emergency mode' : 'Emergency mode'}<Icon name="arrow" size={14}/></button>}</div>

    <section className="pv-handbook-collection" aria-labelledby="handbook-collection-title">
      <div className="pv-handbook-collection-heading"><h2 id="handbook-collection-title">The handbook collection</h2><span>{checking && savedOnly ? 'Checking…' : `${visibleBooks.length} ${visibleBooks.length === 1 ? 'guide' : 'guides'}`}</span></div>
      <div className="pv-handbook-filters"><label className="pv-handbook-search"><Icon name="search" size={17}/><input type="search" aria-label="Search handbooks" placeholder="Search topics, titles, or publishers…" value={query} onChange={event => setQuery(event.target.value)}/></label><label className="pv-handbook-category"><span className="pv-handbook-sr-only">Handbook topic</span><select aria-label="Handbook topic" value={category} onChange={event => setCategory(event.target.value)}><option value="all">All topics</option>{categories.map(value => <option key={value} value={value}>{value}</option>)}</select></label><label className="pv-handbook-saved-filter"><input type="checkbox" checked={savedOnly} onChange={event => setSavedOnly(event.target.checked)}/>Saved offline only</label></div>
      {checking && savedOnly ? <p className="pv-handbook-empty" role="status">Checking this browser’s saved copies…</p> : visibleBooks.length ? <div className="pv-handbook-list">{visibleBooks.map(book => {
        const isSaved = saved.has(book.id);
        const canRead = isLocalEdition() || online || isSaved;
        const url = getHandbookUrl(book);
        return <article className="pv-handbook-card" key={book.id}>
          <div className="pv-handbook-cover" aria-hidden="true"><Icon name={book.category.toLowerCase().includes('water') ? 'water' : book.audience === 'professional' ? 'plus' : 'shield'} size={28}/><span>FIELD<br/>REFERENCE</span></div>
          <div className="pv-handbook-book"><div className="pv-handbook-tags"><span>{book.category}</span>{book.audience === 'professional' && <span className="pv-handbook-professional">Professional reference</span>}{isSaved && <span className="pv-handbook-saved"><Icon name="check" size={12}/>Saved offline</span>}</div><h3>{book.title}</h3><p>{book.description}</p>{book.usageNote && <p className="pv-handbook-edition-note">{book.usageNote}</p>}<div className="pv-handbook-metadata"><a href={book.sourceUrl} target="_blank" rel="noreferrer" title={`View the original source from ${book.publisher}`}>{book.publisher}<Icon name="arrow" size={12}/></a><span>{book.edition}</span><span>PDF · {fileSize(book.bytes)}</span></div><div className="pv-handbook-actions"><button className="pv-button pv-handbook-read" type="button" disabled={!canRead} onClick={() => setReading(book)} aria-label={`Read ${book.title}`}>Read guide<Icon name="arrow" size={14}/></button><a className={!canRead ? 'is-disabled' : undefined} href={url} download={book.path.split('/').at(-1)} aria-disabled={!canRead || undefined} onClick={event => { if (!canRead) event.preventDefault(); }} aria-label={`Download ${book.title} PDF`}><Icon name="download" size={15}/>Download PDF</a>{isSaved ? <button className="pv-handbook-offline-action" type="button" disabled={Boolean(busy) || checking} onClick={() => void removeSaved(book)} aria-label={`Remove ${book.title} from offline library`}>{busy === book.id && !progress ? 'Removing…' : 'Remove offline copy'}</button> : <button className="pv-handbook-offline-action" type="button" disabled={!canSave} onClick={() => void saveBooks([book])} aria-label={`Save ${book.title} offline`}>{busy === book.id ? 'Saving…' : 'Save offline'}</button>}</div><HandbookVisuals book={book} canRead={canRead} onRead={setReading}/><details className="pv-handbook-source-use"><summary>Source &amp; use</summary><p>{book.citation || `${book.title}. ${book.publisher}. ${book.edition}.`}</p><p>{book.license || 'Publisher terms apply.'}{book.licenseUrl && <> <a href={book.licenseUrl} target="_blank" rel="noreferrer">Read license</a></>}</p><p>Original, unmodified PDF. Follow current local guidance and the training requirements stated in the handbook.</p></details></div>
        </article>;
      })}</div> : <div className="pv-handbook-empty"><Icon name={savedOnly && !availableBooks.length ? 'download' : 'search'} size={27}/><h3>{savedOnly && !availableBooks.length ? 'Your offline shelf is ready to fill.' : 'No guides match that search.'}</h3><p>{savedOnly && !availableBooks.length ? 'Save the collection above or view all guides to choose individual handbooks. Saved copies will appear here.' : 'Try a different topic or a shorter search.'}</p>{query || category !== 'all' ? <button type="button" className="pv-text-link" onClick={() => { setQuery(''); setCategory('all'); }}>Clear filters</button> : <button type="button" className="pv-text-link" onClick={() => setSavedOnly(false)}>View all guides <Icon name="arrow" size={14}/></button>}</div>}
    </section>

    <footer className="pv-handbook-footnote"><Icon name="shield" size={17}/><div><p>Offline copies belong to this browser and device. Clearing site data or browser storage cleanup can remove them. Download PDFs for copies you manage yourself. {capability.persistent ? 'Persistent browser storage is enabled. ' : ''}Medical guidance and local procedures can change.</p><p>Original guides are free from their publishers. Included for personal, noncommercial use; publisher licenses apply. No publisher endorses PrepVault.</p></div></footer>
    {reading && <HandbookReader key={`${reading.id}:${reading.initialPage || 1}`} book={reading} initialPage={reading.initialPage || 1} onClose={() => setReading(null)}/>}
  </div>;
}
