import { isLocalEdition } from './runtime-mode.js';
import { useEffect, useRef, useState } from 'react';
import { useDialogFocus } from './useDialogFocus.js';
import { Brand, Icon } from './brand.jsx';
import PrepChat from './PrepChat.jsx';
import { useTheme } from './theme.js';

const destinations = [
  { id: 'dashboard', label: 'Overview', icon: 'grid', group: 'YOUR EVERYDAY' },
  { id: 'location', label: 'Location', icon: 'compass' },
  { id: 'calendar', label: 'Calendar', icon: 'calendar' },
  { id: 'offline-maps', label: 'Maps', icon: 'map' },
  { id: 'food', label: 'Food', icon: 'leaf' },
  { id: 'water', label: 'Water', icon: 'water' },
  { id: 'power', label: 'Power', icon: 'bolt' },
  { id: 'preps', label: 'Supplies', icon: 'box' },
  { id: 'vehicles', label: 'Vehicles', icon: 'vehicle' },
  { id: 'property', label: 'Property', icon: 'home' },
  { id: 'comms', label: 'Communications', icon: 'radio' },
  { id: 'surveillance', label: 'Surveillance', icon: 'camera' },
  { id: 'community', label: 'Your people', icon: 'users' },
  { id: 'rationing', label: 'Rationing', icon: 'ration' },
  { id: 'board', label: 'Community board', icon: 'advisor' },
  { id: 'bugout', label: 'Bug Out', icon: 'box', group: 'PLAN AHEAD' },
  { id: 'farming', label: 'Farm', icon: 'leaf' },
  { id: 'simulate', label: 'Scenario lab', icon: 'compass' },
  { id: 'systems', label: 'Resource planning', icon: 'bolt' },
  { id: 'dependencies', label: 'Dependencies', icon: 'bolt' },
  { id: 'skills', label: 'Skills', icon: 'book', group: 'REFERENCE LIBRARY' },
  { id: 'farm-guides', label: 'Farm guides', icon: 'leaf' },
  { id: 'codes', label: 'Codes', icon: 'key' },
  { id: 'manuals', label: 'Manuals', icon: 'book' },
  { id: 'emergency', label: 'Emergency', icon: 'shield' },
];

function PropertyDialog({ onClose, children }) {
  const ref = useDialogFocus(onClose);
  return <div className="pv-modal-backdrop" onClick={onClose}><section ref={ref} className="pv-dialog" role="dialog" aria-modal="true" aria-labelledby="property-title" onClick={e => e.stopPropagation()}>{children}</section></div>;
}

export default function WorkspaceShell({ activeTab, onNavigate, onHome, properties, propertyId, onProperty, onAddProperty, onRemoveProperty, user, syncStatus, dbStatus, isOffline, onAccount, onLogout, onSetup, onSecurity, onCrisis, crisisMode, emergencyBanner, onSearch, alertCount, inventoryAlertCounts = {}, getPrepChatContext, prepChatResetKey, children }) {
  const { theme, toggleTheme } = useTheme();
  const [calendarDay, setCalendarDay] = useState(() => new Date().getDate());
  useEffect(() => { const timer = setInterval(() => setCalendarDay(new Date().getDate()), 60_000); return () => clearInterval(timer); }, []);
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [propertyOpen, setPropertyOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('home');
  const [search, setSearch] = useState('');
  const searchRef = useRef(null);
  const accountRef = useRef(null);
  useEffect(() => {
    const handleKey = e => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === 'Escape' && !e.defaultPrevented) { setMenuOpen(false); setAccountOpen(false); setPropertyOpen(false); }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);
  useEffect(() => {
    if (!accountOpen) return;
    accountRef.current?.querySelector('.pv-profile-panel')?.scrollIntoView({ block: 'nearest' });
    const closeOutside = event => {
      if (!accountRef.current?.contains(event.target)) setAccountOpen(false);
    };
    const closeWithEscape = event => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      accountRef.current?.querySelector('.pv-profile-trigger')?.focus();
      setAccountOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('focusin', closeOutside);
    document.addEventListener('keydown', closeWithEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('focusin', closeOutside);
      document.removeEventListener('keydown', closeWithEscape);
    };
  }, [accountOpen]);
  const navigate = id => { onNavigate(id); setMenuOpen(false); setAccountOpen(false); window.scrollTo({ top: 0, behavior: 'instant' }); };
  const currentDestination = activeTab === 'emergency-mode' || (activeTab === 'dashboard' && crisisMode) ? { label: 'Emergency mode' } : destinations.find(d => d.id === activeTab) || (activeTab === 'inventory-search' ? { label: 'All inventory' } : activeTab === 'readiness' ? { label: 'Readiness overview' } : null);
  const quickActiveTab = crisisMode && activeTab === 'dashboard' ? 'emergency-mode' : activeTab;
  const quickDestinations = crisisMode ? [{ id: 'emergency-mode', label: 'Emergency', icon: 'shield' }, ...['rationing', 'bugout', 'community'].map(id => destinations.find(destination => destination.id === id))] : destinations.filter(d => ['dashboard', 'preps', 'property', 'community'].includes(d.id));
  const siteName = activeTab === 'board' ? 'Public community' : propertyId === 'all' ? 'All properties' : properties.find(p => p.id === propertyId)?.name || 'My property';
  const status = dbStatus === 'error' ? 'Local save failed' : dbStatus === 'unsaved' ? 'Saving on this device…' : isOffline ? 'Offline · on this device' : syncStatus === 'syncing' ? 'Syncing changes…' : syncStatus === 'synced' ? 'Core data synced' : syncStatus === 'error' ? 'Sync needs attention' : 'Saved on this device';
  return <div className={`pv-workspace${crisisMode ? " is-emergency-mode" : ""}`}>
    <a className="pv-skip" href="#main-content">Skip to content</a>
    {menuOpen && <button className="pv-nav-scrim" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}
    <aside id="pv-main-navigation" className={`pv-sidebar ${menuOpen ? 'is-open' : ''}`} aria-label="Main navigation">
      <button className="pv-brand-home" onClick={() => { setMenuOpen(false); setAccountOpen(false); onHome(); }} aria-label="PrepVault home"><Brand /></button>
      <div className="pv-property-switch">
        <span className="pv-site-icon"><Icon name="home" size={18}/></span>
        <label><span>YOUR SPACE</span><select aria-label="Active property" value={propertyId} onChange={e => onProperty(e.target.value)}><option value="all">All properties</option>{properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <button className="pv-icon-button" aria-label="Manage properties" onClick={() => setPropertyOpen(true)}><Icon name="settings" size={16}/></button>
      </div>
      <nav>{destinations.map(d => <div key={d.id}>{d.group && <div className="pv-nav-group">{d.group}</div>}<button className={`pv-nav-item ${activeTab === d.id ? 'is-active' : ''}`} aria-current={activeTab === d.id ? 'page' : undefined} aria-label={d.label} onClick={() => navigate(d.id)}><Icon name={d.icon} size={19}/><span>{d.label}</span>{d.id === "calendar" && <span className="pv-sidebar-calendar-day" aria-label={`Today is day ${calendarDay}`}>{calendarDay}</span>}{inventoryAlertCounts[d.id] > 0 && <span className="pv-nav-count">{inventoryAlertCounts[d.id]}</span>}</button></div>)}</nav>
      <div className="pv-sidebar-bottom">
        <button className={`pv-emergency ${crisisMode ? 'is-active' : ''}`} onClick={() => { setMenuOpen(false); setAccountOpen(false); onCrisis(); }} aria-current={activeTab === 'emergency-mode' ? 'page' : undefined}><Icon name="shield" size={18}/>{crisisMode ? 'Emergency plan · active' : 'Emergency mode'}<Icon name="arrow" size={16}/></button>
        <button className="pv-settings" onClick={() => { setMenuOpen(false); setAccountOpen(false); onSecurity(); }}><Icon name="settings" size={18}/> Settings & backups</button>
        <div className="pv-sidebar-profile" ref={accountRef} data-pv-profile>
          <button className="pv-settings pv-profile-trigger" aria-expanded={accountOpen} aria-controls={accountOpen ? 'pv-account-menu' : undefined} onClick={() => setAccountOpen(!accountOpen)}><Icon name="users" size={18}/><span>Profile</span><Icon name="chevron" size={14}/></button>
          {accountOpen && <div className="pv-profile-panel" id="pv-account-menu"><strong>{user?.email || 'Personal workspace'}</strong><p>{user?.authProvider === 'neon' ? 'Verified account · saved on this device' : user?.isLocal ? 'Device account' : user ? 'Connected account' : 'No account required'}</p><button onClick={() => { setMenuOpen(false); setAccountOpen(false); onSetup(); }}>Household setup</button><button onClick={() => { setMenuOpen(false); setAccountOpen(false); (user ? onLogout : onAccount)(); }}>{user ? 'Sign out' : 'Sign in / Create account'}</button></div>}
        </div>
        <div className="pv-site-links"><a href={isLocalEdition() ? "/home" : "/"}>Home page</a><a href="/demo">View demo</a></div>
        <div className="pv-sidebar-foot"><span className="pv-status-dot"/>PREPVAULT 2.0<span>Made for real life</span></div>
      </div>
    </aside>
    <div className="pv-main-shell">
      <header className="pv-topbar">
        <button className="pv-mobile-menu pv-icon-button" onClick={() => setMenuOpen(!menuOpen)} aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={menuOpen} aria-controls="pv-main-navigation"><Icon name="menu"/></button>
        <div className="pv-breadcrumb"><span>{siteName}</span><Icon name="chevron" size={14}/><strong>{currentDestination?.label || 'Overview'}</strong></div>
        <form className="pv-global-search" onSubmit={e => { e.preventDefault(); onSearch(search); setSearch(''); }}><Icon name="search" size={17}/><input ref={searchRef} aria-label="Search all inventory" placeholder="Search all inventory…" value={search} onChange={e => setSearch(e.target.value)}/></form>
        <span className={`pv-save-state ${syncStatus === 'error' || dbStatus === 'error' ? 'is-error' : ''}`} title={status}><span className="pv-status-dot"/>{status}</span>
        <button className="pv-icon-button pv-notifications" aria-label={`${alertCount} supply alerts`} onClick={() => onSearch('', 'attention')}><Icon name="bell"/>{alertCount > 0 && <span/>}</button>
        <button className="pv-icon-button pv-theme-toggle" aria-label="Dark mode" aria-pressed={theme === 'dark'} title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} onClick={toggleTheme}><Icon name={theme === 'dark' ? 'sun' : 'moon'} size={20}/></button>
      </header>
      {emergencyBanner}
      <main id="main-content" tabIndex={-1} className="pv-main">{children}</main>
      <footer className="pv-app-footer"><span>PrepVault<span className="pv-foot-sep">/</span>Prepared for whatever comes.</span><button onClick={onSecurity}><Icon name="shield" size={14}/> Your data, your control</button></footer>
    </div>
    <nav className="pv-mobile-nav" aria-label="Quick navigation">{quickDestinations.map(d => <button key={d.id} className={quickActiveTab === d.id ? 'is-active' : ''} aria-current={quickActiveTab === d.id ? 'page' : undefined} onClick={() => navigate(d.id)}><Icon name={d.icon} size={20}/>{d.label}</button>)}<button onClick={() => setMenuOpen(true)} aria-expanded={menuOpen} aria-controls="pv-main-navigation"><Icon name="menu" size={20}/>More</button></nav>
    {getPrepChatContext && <PrepChat key={`${user?.id || 'device'}:${prepChatResetKey}`} getContext={getPrepChatContext} />}
    {propertyOpen && <PropertyDialog onClose={() => setPropertyOpen(false)}><div className="pv-dialog-heading"><div><span className="pv-eyebrow">YOUR PLACES</span><h2 id="property-title">Manage properties</h2></div><button className="pv-icon-button" aria-label="Close properties" onClick={() => setPropertyOpen(false)}><Icon name="close"/></button></div><p className="pv-muted">Keep supplies organized wherever you keep them.</p><div className="pv-property-list">{properties.map(p => <div key={p.id}><Icon name="home"/><button onClick={() => { onProperty(p.id); setPropertyOpen(false); }}>{p.name}</button><span>{p.type}</span>{p.id !== 'prop1' && <button className="pv-icon-button" aria-label={`Delete ${p.name}`} onClick={() => onRemoveProperty(p.id)}><Icon name="trash" size={16}/></button>}</div>)}</div><form onSubmit={e => { e.preventDefault(); if (newName.trim()) { onAddProperty(newName.trim(), newType); setNewName(''); } }}><label className="pv-field">Property name<input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Lake cabin" required maxLength={80}/></label><label className="pv-field">Type<select value={newType} onChange={e => setNewType(e.target.value)}>{['home','cabin','cache','farm','vehicle','office'].map(t => <option key={t} value={t}>{t[0].toUpperCase()+t.slice(1)}</option>)}</select></label><button className="pv-button pv-primary" type="submit"><Icon name="plus" size={17}/>Add property</button></form></PropertyDialog>}
  </div>;
}
