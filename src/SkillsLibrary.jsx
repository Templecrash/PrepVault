import { useEffect, useState } from 'react';
import { Icon } from './brand.jsx';
import GuideIllustration from './GuideIllustration.jsx';
import { SKILL_VISUALS } from './reference-visuals.js';
import { SKILL_HANDBOOK_VISUALS } from './handbook-visuals.js';
import { HandbookReader } from './HandbookLibrary.jsx';
import { HANDBOOKS } from './handbooks.js';
import { getHandbookUrl, listSavedHandbooks } from './handbook-offline.js';
import { isLocalEdition } from './runtime-mode.js';
import { filterSurvivalSkills, SKILL_CATEGORIES, SKILL_CONTEXTS, SKILL_LEVELS, SKILLS_REVIEWED_AT, SURVIVAL_SKILLS } from './skills-library.js';
import './inventory.css';
import './skills-library.css';

const booksById = new Map(HANDBOOKS.map(book => [book.id, book]));

export default function SkillsLibrary({ onOpenEmergency }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [context, setContext] = useState('all');
  const [level, setLevel] = useState('all');
  const [reading, setReading] = useState(null);
  const [savedIds, setSavedIds] = useState([]);
  const [checking, setChecking] = useState(true);
  const [storageError, setStorageError] = useState(false);
  const [online, setOnline] = useState(() => globalThis.navigator?.onLine !== false);
  const local = isLocalEdition();

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const ids = await listSavedHandbooks(HANDBOOKS);
        if (active) { setSavedIds(ids); setStorageError(false); }
      } catch {
        if (active) setStorageError(true);
      } finally {
        if (active) setChecking(false);
      }
    };
    const connectionChanged = () => { setOnline(navigator.onLine); void refresh(); };
    const focused = () => void refresh();
    void refresh();
    window.addEventListener('online', connectionChanged);
    window.addEventListener('offline', connectionChanged);
    window.addEventListener('focus', focused);
    return () => {
      active = false;
      window.removeEventListener('online', connectionChanged);
      window.removeEventListener('offline', connectionChanged);
      window.removeEventListener('focus', focused);
    };
  }, []);

  const visible = filterSurvivalSkills({ query, category, context, level });
  const filtered = Boolean(query.trim()) || category !== 'all' || context !== 'all' || level !== 'all';
  const clearFilters = () => { setQuery(''); setCategory('all'); setContext('all'); setLevel('all'); };
  const selectContext = value => { clearFilters(); setContext(value); };
  const saved = new Set(savedIds);

  return <section className="pv-inventory pv-skills" aria-labelledby="skills-title">
    <header className="pv-inventory-heading">
      <div><p className="pv-inventory-eyebrow">KNOW WHAT TO DO</p><h1 id="skills-title">Practical skills<span>.</span></h1><p className="pv-inventory-intro">Useful knowledge for staying home, leaving safely, and handling the unexpected.</p></div>
      {onOpenEmergency && <div className="pv-inventory-actions"><button type="button" className="pv-inventory-button pv-inventory-button-primary" onClick={onOpenEmergency}><Icon name="download" size={17}/>Save handbooks offline</button></div>}
    </header>

    <div className="pv-inventory-overview pv-skills-overview">
      <button type="button" className="pv-inventory-stat pv-inventory-stat-action" aria-pressed={!filtered} onClick={clearFilters}><span className="pv-inventory-stat-icon"><Icon name="book" size={22}/></span><div><span className="pv-inventory-stat-value">{SURVIVAL_SKILLS.length}<small>practical skills</small></span><p>Official sources. Clear starting points.</p></div><Icon name="arrow" size={18}/></button>
      <button type="button" className="pv-inventory-stat pv-inventory-stat-action" aria-pressed={context === 'bug-in'} onClick={() => selectContext(context === 'bug-in' ? 'all' : 'bug-in')}><span className="pv-inventory-stat-icon"><Icon name="home" size={22}/></span><div><span className="pv-inventory-stat-value pv-skills-stat-label">Bug in</span><p>Stay safe and capable at home</p></div><Icon name="arrow" size={18}/></button>
      <button type="button" className="pv-inventory-stat pv-inventory-stat-action" aria-pressed={context === 'bug-out'} onClick={() => selectContext(context === 'bug-out' ? 'all' : 'bug-out')}><span className="pv-inventory-stat-icon"><Icon name="compass" size={22}/></span><div><span className="pv-inventory-stat-value pv-skills-stat-label">Bug out</span><p>Prepare to leave and travel safely</p></div><Icon name="arrow" size={18}/></button>
    </div>

    <div className="pv-skills-reference-note"><Icon name="book" size={18}/><p>Start with a topic, then open the full guide. These checklists support preparation and practice; follow local emergency instructions. For urgent medical care, call emergency services.</p></div>

    <div className="pv-inventory-workspace">
      <div className="pv-inventory-toolbar">
        <label className="pv-inventory-search"><Icon name="search" size={18}/><input type="search" aria-label="Search skills" placeholder="Search fire, bleeding, shelter, water…" value={query} onChange={event => setQuery(event.target.value)}/></label>
        <div className="pv-inventory-filters">
          <label className="pv-inventory-select"><span className="pv-inventory-sr-only">Skill topic</span><select aria-label="Skill topic" value={category} onChange={event => setCategory(event.target.value)}><option value="all">All topics</option>{Object.entries(SKILL_CATEGORIES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="pv-inventory-select"><span className="pv-inventory-sr-only">Skill setting</span><select aria-label="Skill setting" value={context} onChange={event => setContext(event.target.value)}><option value="all">All settings</option>{Object.entries(SKILL_CONTEXTS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="pv-inventory-select"><span className="pv-inventory-sr-only">Skill experience</span><select aria-label="Skill experience" value={level} onChange={event => setLevel(event.target.value)}><option value="all">All experience levels</option>{Object.entries(SKILL_LEVELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        </div>
      </div>
      <div className="pv-inventory-results-bar"><p aria-live="polite"><strong>{visible.length}</strong> {visible.length === 1 ? 'skill' : 'skills'}{filtered ? ' found' : ' to explore'}{filtered && <button type="button" onClick={clearFilters}>Clear filters <Icon name="close" size={12}/></button>}</p><span className="pv-skills-review-date">Sources checked {SKILLS_REVIEWED_AT}</span></div>
      {visible.length ? <div className="pv-skills-list">{visible.map(skill => <article className="pv-skills-item" key={skill.id}>
        <details>
          <summary>
            <span className="pv-skills-symbol"><Icon name={skill.icon} size={21}/></span>
            <span className="pv-skills-title"><span className="pv-skills-category">{SKILL_CATEGORIES[skill.category]}</span><strong>{skill.title}</strong><span className="pv-skills-description">{skill.description}</span></span>
            <span className="pv-skills-meta"><span className={`pv-skills-level is-${skill.level}`}>{SKILL_LEVELS[skill.level]}</span><span className="pv-skills-context">{skill.contexts.map(value => SKILL_CONTEXTS[value]).join(' · ')}</span></span>
            <Icon name="chevron" size={17} className="pv-skills-chevron"/>
          </summary>
          <div className="pv-skills-detail">
            <GuideIllustration visual={SKILL_VISUALS[skill.id]}/>
            <div className="pv-skills-checklist"><h2>Start here</h2><ol>{skill.checklist.map(step => <li key={step}>{step}</li>)}</ol><p className="pv-skills-caution"><Icon name="shield" size={16}/><span>{skill.caution}</span></p></div>
            <div className="pv-skills-references"><h2>Go deeper</h2>
              {skill.sources.map(item => <a className="pv-skills-source" href={item.url} key={item.url} target="_blank" rel="noopener noreferrer"><span className="pv-skills-source-tag">Online guide</span><strong>{item.title}</strong><span>{item.publisher} <Icon name="arrow" size={14}/></span></a>)}
              {(SKILL_HANDBOOK_VISUALS[skill.id] || []).length > 0 && <div className="pv-skill-visual-reference"><p>Illustrated pages in the original handbooks</p><div className="pv-handbook-visual-links">{SKILL_HANDBOOK_VISUALS[skill.id].map(reference => {
                const book = booksById.get(reference.bookId);
                if (!book) return null;
                return <button type="button" key={`${reference.bookId}-${reference.page}`} disabled={!local && !online && !saved.has(reference.bookId)} onClick={() => setReading({ ...book, initialPage: reference.page })}>{reference.title} · PDF p. {reference.page}</button>;
              })}</div></div>}
              <h3>Related handbooks</h3>
              {skill.handbookIds.map(id => {
                const book = booksById.get(id);
                if (!book) return null;
                const canRead = local || online || saved.has(id);
                return <div className="pv-skills-book" key={id}><div><strong>{book.title}</strong><span>{book.publisher} · {local ? 'Included in local app' : checking ? 'Checking saved copy…' : saved.has(id) ? 'Saved offline' : 'Save for offline use'}</span></div><div className="pv-skills-book-actions"><button type="button" disabled={!canRead} onClick={() => setReading(book)}><Icon name="book" size={14}/>Read original PDF</button>{canRead && <a href={getHandbookUrl(book)} download={book.path.split('/').at(-1)} aria-label={`Download ${book.title}`}><Icon name="download" size={15}/></a>}</div>{!canRead && <p>Reconnect or open a PDF you downloaded earlier.</p>}</div>;
              })}
            </div>
          </div>
        </details>
      </article>)}</div> : <div className="pv-inventory-empty"><span><Icon name="search" size={30}/></span><h2>No skills match</h2><p>Try another topic or clear your filters to explore the collection.</p><button type="button" className="pv-inventory-button pv-inventory-button-primary" onClick={clearFilters}>Clear filters</button></div>}
      <div className="pv-inventory-footer pv-skills-offline-note"><Icon name="download" size={16}/><p>{local ? 'Checklists, task pictures and included PDFs work in this local app. ' : 'Checklists and task pictures are part of the app; save the site and handbooks in Emergency before going offline. '}Links marked “Online guide” need an internet connection.{!online && ' You are currently offline.'}{storageError && ' Saved PDF status could not be checked.'}</p>{onOpenEmergency && <button type="button" onClick={onOpenEmergency}>Open Emergency <Icon name="arrow" size={14}/></button>}</div>
    </div>
    {reading && <HandbookReader key={`${reading.id}:${reading.initialPage || 1}`} book={reading} initialPage={reading.initialPage || 1} onClose={() => setReading(null)}/>}
  </section>;
}
