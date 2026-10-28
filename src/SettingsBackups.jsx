import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './brand.jsx';
import { useDialogFocus } from './useDialogFocus.js';
import { LIVE_APP_URL } from './runtime-mode.js';
import './settings-backups.css';

const SECTIONS = [
  { id: 'backups', label: 'Backups', icon: 'download' },
  { id: 'offline', label: 'Offline & local', icon: 'box' },
  { id: 'privacy', label: 'Privacy & services', icon: 'shield' },
];

function displayDate(value) {
  const date = new Date(value);
  return value && Number.isFinite(date.getTime()) ? date.toLocaleString() : 'Not recorded';
}

function RestoreReview({ preview, busy, onConfirm, onCancel }) {
  const [confirmed, setConfirmed] = useState(false);
  const counts = [
    ['Inventory entries', preview.itemCount],
    ['Properties', preview.propertyCount],
    ['People', preview.peopleCount],
    ['Local settings', preview.settingCount],
  ].filter(([, count]) => Number.isFinite(count));
  return <section className="pv-backups-restore-review" aria-label="Review backup before restoring">
    <span className="pv-backups-kicker">READY TO RESTORE</span>
    <h4>{preview.label || 'Your backup'}</h4>
    {counts.length > 0 && <dl className="pv-backups-counts">{counts.map(([label, count]) => <div key={label}><dt>{label}</dt><dd>{count}</dd></div>)}</dl>}
    <p>This replaces the plan and saved settings in this workspace. Download your current plan first if you want to keep both versions.</p>
    <label className="pv-backups-check"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} disabled={busy}/><span>Replace my current plan with this backup.</span></label>
    <div className="pv-backups-actions"><button type="button" className="pv-button pv-primary" disabled={busy || !confirmed} onClick={onConfirm}>{busy === 'restore' ? 'Restoring…' : 'Restore this backup'}</button><button type="button" className="pv-button pv-secondary" disabled={busy} onClick={onCancel}>Cancel restore</button></div>
  </section>;
}

/**
 * Controlled backup actions keep the actual data and encryption in PrepVault.
 * busy is false or an operation name. onImport(file) validates/decrypts and sets
 * restorePreview; onConfirmRestore applies that reviewed snapshot.
 */
export default function SettingsBackups({
  onClose, itemCount = 0, dbStatus, lastSaved, isOffline = false, user, syncEnabled = false,
  message = '', busy = false,
  exportPw = '', setExportPw, onExport, importPw = '', setImportPw, onImport,
  restorePreview, onConfirmRestore, onCancelRestore,
  encryptedDb = false, setEncryptedDb, dbPassphrase = '', setDbPassphrase,
  onSaveSnapshot, onLoadSnapshot, onRemoveSnapshot, snapshotStatus = {},
  offlineStatus = {}, onPrepareOffline, onOpenEmergency, serviceRows,
  localAppUrl = '/local/prepvault-local.zip', isLocalEdition = false,
}) {
  const id = useId();
  const [section, setSection] = useState('backups');
  const [confirmation, setConfirmation] = useState('');
  const [backupFile, setBackupFile] = useState(null);
  const [removeSnapshot, setRemoveSnapshot] = useState(false);
  const [showPassphrases, setShowPassphrases] = useState(false);
  const content = useRef(null);
  const dismiss = () => { if (!busy) onClose(); };
  const dialog = useDialogFocus(dismiss);
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, []);
  const navigate = next => { setSection(next); content.current?.scrollTo({ top: 0, behavior: 'instant' }); };
  const passwordType = showPassphrases ? 'text' : 'password';
  const cleanMessage = String(message).replace(/^[\p{Extended_Pictographic}\uFE0F\s]+/u, '');
  const planStatus = dbStatus === 'error' ? 'Save needs attention' : ['unsaved', 'saving'].includes(dbStatus) ? 'Saving changes…' : 'Saved on this device';
  const onlineStatus = isLocalEdition ? 'Local edition' : isOffline ? 'No network detected' : 'Network available';
  const services = serviceRows || [
    { name: 'Working plan', status: 'On this device', detail: 'Browser storage keeps your plan between visits. It is not encrypted and can be removed by browser cleanup.' },
    { name: 'Encrypted backups', status: 'Local encryption', detail: 'Your passphrase encrypts the downloaded file on this device. The passphrase is not sent to a server and cannot be recovered.' },
    { name: 'Account & private services', status: isLocalEdition ? 'Use the live website' : user?.authProvider === 'neon' ? 'Signed in' : 'Sign-in required', detail: 'Sign-in, Survival LLM and live tracking need the deployed website and an internet connection. Private services check owner access on the server.' },
    { name: 'Camera & alarm feeds', status: 'Separate connection', detail: 'REVEAL and EyezOn require owner sign-in and a connection to each provider. Provider sessions and photo feeds are not included in backups.' },
    { name: 'Radio & activity notes', status: 'Streams need internet', detail: 'Radio playback uses internet streams. Activity notes are entered manually; automatic transcription and background monitoring are not available.' },
    { name: 'Weather & news', status: 'Optional online feeds', detail: 'Load feeds from Overview when needed. Provider configuration and an internet connection are required; unavailable feeds show an error instead of sample alerts.' },
    { name: 'Google Nest', status: 'Not connected', detail: 'Google Nest monitoring and device control are not available in PrepVault. Use Google Home to manage those devices.' },
    { name: 'Cloud sync', status: syncEnabled ? 'Core records only' : 'Not enabled', detail: syncEnabled ? 'Legacy sync covers inventory, properties and selected settings. Use a complete backup for maps, routes and other planning records.' : 'Signing in does not upload your complete household plan. Use an encrypted backup to move it to another device.' },
  ];

  return createPortal(<div className="pv-backups-backdrop" onClick={dismiss}>
    <section className="pv-backups-dialog" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} aria-busy={Boolean(busy)} ref={dialog} onClick={event => event.stopPropagation()}>
      <header className="pv-backups-header">
        <span className="pv-backups-mark"><Icon name="settings" size={22}/></span>
        <div><span className="pv-backups-kicker">YOUR DATA, YOUR CONTROL</span><h2 id={`${id}-title`}>Settings & backups</h2><p id={`${id}-description`}>Keep a copy. Take your plan with you.</p></div>
        <button type="button" className="pv-backups-close" disabled={Boolean(busy)} aria-label="Close settings and backups" onClick={dismiss}><Icon name="close" size={20}/></button>
      </header>
      <div className="pv-backups-layout">
        <nav className="pv-backups-nav" aria-label="Settings sections">{SECTIONS.map(entry => <button key={entry.id} type="button" aria-current={section === entry.id ? 'page' : undefined} onClick={() => navigate(entry.id)}><Icon name={entry.icon} size={18}/><span>{entry.label}</span></button>)}<p>Back up before changing devices or clearing your browser.</p></nav>
        <div className="pv-backups-content" ref={content}>
          <div className="pv-backups-status"><span><Icon name="box" size={15}/>{itemCount} inventory {itemCount === 1 ? 'entry' : 'entries'}</span><span>{planStatus}</span><span>{onlineStatus}</span></div>
          {cleanMessage && <div className="pv-backups-message" role="status" aria-live="polite">{cleanMessage}</div>}

          {section === 'backups' && <>
            <div className="pv-backups-heading"><span className="pv-backups-kicker">A COPY YOU CONTROL</span><h3>Save your complete plan.</h3><p>Download your recorded collections and local settings in one encrypted file. Restore it here, on another device, or in your local copy of PrepVault.</p></div>
            {restorePreview ? <RestoreReview key={restorePreview.id || restorePreview.label || 'restore'} preview={restorePreview} busy={busy} onConfirm={onConfirmRestore} onCancel={onCancelRestore}/> : <div className="pv-backups-form-grid">
              <form className="pv-backups-card" onSubmit={async event => { event.preventDefault(); if (busy || exportPw.length < 12 || confirmation !== exportPw) return; try { await onExport(); } finally { setConfirmation(''); } }}>
                <div className="pv-backups-card-title"><Icon name="download" size={19}/><h4>Download a backup</h4></div>
                <p>Choose a long, unique passphrase. You’ll need it to open this backup.</p>
                <label className="pv-backups-field"><span>Backup passphrase</span><input type={passwordType} autoComplete="new-password" value={exportPw} onChange={event => setExportPw(event.target.value)} required minLength={12} disabled={Boolean(busy)} aria-describedby={`${id}-passphrase-help`}/></label>
                <label className="pv-backups-field"><span>Confirm passphrase</span><input type={passwordType} autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)} required minLength={12} disabled={Boolean(busy)} aria-invalid={Boolean(confirmation && exportPw && confirmation !== exportPw)} aria-describedby={`${id}-passphrase-help`}/></label>
                <p className="pv-backups-help" id={`${id}-passphrase-help`}>{confirmation && exportPw && confirmation !== exportPw ? 'The passphrases do not match.' : 'At least 12 characters. There is no passphrase recovery.'}</p>
                <label className="pv-backups-check"><input type="checkbox" checked={showPassphrases} onChange={event => setShowPassphrases(event.target.checked)} disabled={Boolean(busy)}/><span>Show passphrases</span></label>
                <button className="pv-button pv-primary" type="submit" disabled={Boolean(busy) || exportPw.length < 12 || confirmation !== exportPw}><Icon name="lock" size={16}/>{busy === 'export' ? 'Encrypting…' : 'Download encrypted backup'}</button>
              </form>
              <form className="pv-backups-card" onSubmit={event => { event.preventDefault(); if (backupFile && !busy) onImport(backupFile); }}>
                <div className="pv-backups-card-title"><Icon name="refresh" size={19}/><h4>Restore a backup</h4></div>
                <p>Choose a PrepVault backup. You’ll review it before anything is replaced.</p>
                <label className="pv-backups-field pv-backups-file"><span>Backup file</span><input type="file" accept=".json,application/json" disabled={Boolean(busy)} required onChange={event => setBackupFile(event.target.files?.[0] || null)}/></label>
                <label className="pv-backups-field"><span>Passphrase <small>for encrypted files</small></span><input type="password" autoComplete="off" value={importPw} onChange={event => setImportPw(event.target.value)} disabled={Boolean(busy)}/></label>
                <p className="pv-backups-help">Older PrepVault backups can still be opened with their original passphrase.</p>
                <button className="pv-button pv-secondary" type="submit" disabled={Boolean(busy) || !backupFile}>{busy === 'import' ? 'Reading backup…' : 'Review backup'}<Icon name="arrow" size={16}/></button>
              </form>
            </div>}
            <details className="pv-backups-details"><summary>What is included?</summary><div><p>Your saved plan records, including supplies, people, properties, map images and markers, routes, access codes, growing records, manual conversation notes and their images, and local planning settings.</p><p>Account credentials, device PINs, connected-service sessions, live positions, camera feeds and Survival LLM conversations are excluded. Downloaded emergency handbooks are separate from your plan backup.</p></div></details>
            <details className="pv-backups-details"><summary>Keep a snapshot in this browser</summary><div>
              <p>A snapshot is an extra restore point on this device. Browser cleanup can remove it along with your working plan, so keep a downloaded backup too.</p>
              <div className="pv-backups-snapshot-status"><strong>{snapshotStatus.exists ? `${snapshotStatus.encrypted ? 'Encrypted' : 'Unencrypted'} snapshot saved` : 'No saved snapshot'}</strong>{snapshotStatus.savedAt && <span>{displayDate(snapshotStatus.savedAt)}</span>}</div>
              <label className="pv-backups-check"><input type="checkbox" checked={encryptedDb} onChange={event => setEncryptedDb(event.target.checked)} disabled={Boolean(busy)}/><span>Encrypt new snapshots</span></label>
              {(encryptedDb || snapshotStatus.encrypted) && <label className="pv-backups-field"><span>Snapshot passphrase</span><input type="password" autoComplete="off" value={dbPassphrase} onChange={event => setDbPassphrase(event.target.value)} disabled={Boolean(busy)}/><small>Use 12 or more characters for a new encrypted snapshot. Use the original passphrase to restore an older one.</small></label>}
              <div className="pv-backups-actions"><button type="button" className="pv-button pv-secondary" disabled={Boolean(busy) || (encryptedDb && dbPassphrase.length < 12)} onClick={onSaveSnapshot}>{busy === 'snapshot-save' ? 'Saving snapshot…' : 'Save snapshot'}</button><button type="button" className="pv-button pv-secondary" disabled={Boolean(busy) || !snapshotStatus.exists} onClick={onLoadSnapshot}>{busy === 'snapshot-load' ? 'Reading snapshot…' : 'Review saved snapshot'}</button>{snapshotStatus.exists && <button type="button" className="pv-backups-text-button" disabled={Boolean(busy)} onClick={() => setRemoveSnapshot(true)}>Remove snapshot</button>}</div>
              {removeSnapshot && <div className="pv-backups-remove"><p>Remove this saved snapshot? Your current working plan stays in place.</p><div className="pv-backups-actions"><button type="button" className="pv-button pv-secondary" disabled={Boolean(busy)} onClick={async () => { await onRemoveSnapshot(); setRemoveSnapshot(false); }}>Remove saved snapshot</button><button type="button" className="pv-backups-text-button" disabled={Boolean(busy)} onClick={() => setRemoveSnapshot(false)}>Keep snapshot</button></div></div>}
            </div></details>
          </>}

          {section === 'offline' && <>
            <div className="pv-backups-heading"><span className="pv-backups-kicker">READY WITHOUT A CONNECTION</span><h3>Take PrepVault with you.</h3><p>Keep this site available in your browser, or download a separate copy to run on your computer.</p></div>
            <section className="pv-backups-card pv-backups-wide-card"><div className="pv-backups-card-title"><Icon name="box" size={20}/><h4>Run on this computer</h4><span className="pv-backups-tag">App + all nine handbooks</span></div><p>The portable download contains the app and emergency handbooks. Your personal data and service credentials are not in the package.</p>
              <ol className="pv-backups-steps"><li><span>1</span><div><strong>Save your plan</strong><p>Download an encrypted backup from the Backups section.</p></div></li><li><span>2</span><div><strong>Download and launch</strong><p>Unzip the local app and run the Start PrepVault launcher. Python 3.8+ or Node.js 18+ must be installed.</p></div></li><li><span>3</span><div><strong>Restore your backup</strong><p>The local copy has its own browser workspace. Open Settings & backups there and restore your saved file.</p></div></li></ol>
              <div className="pv-backups-actions">{isLocalEdition ? <a className="pv-button pv-secondary" href={LIVE_APP_URL} target="_blank" rel="noreferrer">Open live site for updates<Icon name="arrow" size={16}/></a> : localAppUrl && <a className="pv-button pv-primary" href={localAppUrl} download><Icon name="download" size={16}/>Download local app</a>}<button className="pv-button pv-secondary" type="button" onClick={() => navigate('backups')}>Back up my plan</button></div>
              <p className="pv-backups-help">Saved plans, imported maps and included PDFs work locally without the internet. Sign-in, AI, radio, weather, cameras, tracking and the community board need the live website and a connection.</p>
            </section>
            <section className="pv-backups-card pv-backups-wide-card"><div className="pv-backups-card-title"><Icon name="download" size={19}/><h4>Save this site for offline use</h4></div><p>Save app files in this browser for offline reopening. Signed-in workspaces can require online identity verification after a reload; use the local edition for independent access. Keep the same browser and address. Clearing site data can remove the saved copy.</p>
              <dl className="pv-backups-offline-status"><div><dt>App files</dt><dd>{offlineStatus.ready ? 'Saved in this browser' : offlineStatus.supported === false ? 'Not supported in this browser' : 'Not yet confirmed saved'}</dd></div><div><dt>Emergency handbooks</dt><dd>{Number.isFinite(offlineStatus.savedCount) ? `${offlineStatus.savedCount}${Number.isFinite(offlineStatus.totalCount) ? ` of ${offlineStatus.totalCount}` : ''} saved` : 'Check in Emergency'}</dd></div></dl>
              <div className="pv-backups-actions"><button type="button" className="pv-button pv-secondary" onClick={onPrepareOffline} disabled={Boolean(busy) || isOffline || offlineStatus.supported === false || !onPrepareOffline}>{busy === 'offline' ? 'Saving app files…' : offlineStatus.ready ? 'Refresh offline app' : 'Save app for offline use'}</button>{onOpenEmergency && <button type="button" className="pv-backups-text-button" disabled={Boolean(busy)} onClick={onOpenEmergency}>Manage offline handbooks<Icon name="arrow" size={15}/></button>}</div>
            </section>
          </>}

          {section === 'privacy' && <>
            <div className="pv-backups-heading"><span className="pv-backups-kicker">KNOW WHAT IS PROTECTED</span><h3>Your plan. Clear boundaries.</h3><p>Backup encryption protects the backup file. The active plan in browser storage is not encrypted.</p></div>
            <div className="pv-backups-service-list">{services.map(entry => <section key={entry.name}><div><h4>{entry.name}</h4><span className="pv-backups-tag">{entry.status}</span></div><p>{entry.detail}</p></section>)}</div>
            <details className="pv-backups-details"><summary>Backup encryption details</summary><div><dl className="pv-backups-specs">{[['Encryption', 'AES-256-GCM'], ['Key derivation', 'PBKDF2-SHA256'], ['Iterations', '310,000'], ['Salt', '128-bit random per backup'], ['IV', '96-bit random per backup']].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><p>Encryption runs in your browser. A wrong passphrase or altered encrypted content prevents the backup from opening. Store the passphrase separately from the file.</p></div></details>
          </>}
        </div>
      </div>
      <footer className="pv-backups-footer"><span>{lastSaved ? `Last saved ${displayDate(lastSaved)}` : 'Your working plan stays on this device.'}</span><button className="pv-button pv-secondary" type="button" disabled={Boolean(busy)} onClick={dismiss}>Done</button></footer>
    </section>
  </div>, document.body);
}
