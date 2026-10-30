import { isLocalEdition } from './runtime-mode.js';
import { Fragment, useEffect, useId, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Icon } from './brand.jsx';
import { useDialogFocus } from './useDialogFocus.js';
import RadioPlayer from './RadioPlayer.jsx';
import RadioTalk from './RadioTalk.jsx';
import './inventory.css';
import './communications.css';

const SECTIONS = [['scanner', 'Radio'], ['talk', 'Radio services'], ['commsplan', 'Communications plan']];
const BANDS = { noaa: 'NOAA', ham2m: '2m', ham70cm: '70cm', hamhf: 'HF', gmrs: 'GMRS', frs: 'FRS', murs: 'MURS', cb: 'CB', marine: 'Marine', custom: 'Custom' };
const DEFAULT_CHANNELS = [
  ['162.400', 'NOAA WX1', 'noaa'], ['146.520', '2m Calling', 'ham2m'], ['146.550', 'Emergency Simplex', 'ham2m'],
  ['462.5625', 'GMRS Ch 1', 'gmrs'], ['462.5750', 'GMRS Emergency', 'gmrs'], ['27.065', 'CB Ch 9 Emergency', 'cb'],
  ['27.185', 'CB Ch 19 Highway', 'cb'], ['156.800', 'Marine Ch 16', 'marine'], ['151.820', 'MURS Ch 1', 'murs'],
  ['14.300', '20m Emergency', 'hamhf'], ['7.200', '40m Phone Net', 'hamhf'], ['147.000', 'Local Repeater', 'ham2m'],
].map(([freq, name, band]) => ({ freq, name, band }));
const FIELDS = {
  call: [['sign', 'Call sign'], ['person', 'Person']],
  code: [['code', 'Code word'], ['meaning', 'Meaning'], ['action', 'Action to take']],
  rally: [['name', 'Rally point name'], ['coords', 'Coordinates'], ['location', 'Location description'], ['marker', 'Marker or identifier'], ['supplies', 'Cached supplies'], ['use', 'When to use this point']],
};
const EMPTY_PLAN = { altFreqs: [], schedule: [] };
const readArray = (key, fallback) => { try { const value = JSON.parse(localStorage.getItem(key) || 'null'); return Array.isArray(value) ? value : fallback; } catch { return fallback; } };
const matches = (value, query) => Object.values(value || {}).filter(value => typeof value === 'string' || typeof value === 'number').join(' ').toLowerCase().includes(query.trim().toLowerCase());
const quantity = item => Number.isFinite(Number(item.quantity)) ? Math.max(0, Number(item.quantity)) : 0;
const licenseLabel = value => ({ ham: 'HAM license', gmrs: 'GMRS license', marine: 'Marine license', none: 'License-free' }[value] || value || 'Not recorded');

function Search({ value, onChange, label, placeholder }) {
  return <div className="pv-inventory-search"><Icon name="search" size={18}/><input type="search" aria-label={label} placeholder={placeholder} value={value} onChange={event => onChange(event.target.value)}/></div>;
}
function Empty({ title = 'Nothing here yet', children }) {
  return <div className="pv-comms-empty"><Icon name="radio" size={28}/><h3>{title}</h3><p>{children}</p></div>;
}
function Table({ headings, children, label }) {
  return <div className="pv-inventory-table-scroll" tabIndex={0} role="region" aria-label={label}><table className="pv-inventory-table pv-comms-table"><thead><tr>{headings.map((heading, index) => <th key={index} scope="col">{heading || <span className="pv-inventory-sr-only">Actions</span>}</th>)}</tr></thead><tbody>{children}</tbody></table></div>;
}
function Details({ title, count, children, open = false }) {
  return <details className="pv-comms-disclosure pv-inventory-workspace" open={open || undefined}><summary><span>{title}{count !== undefined && <small>{count}</small>}</span><Icon name="chevron" size={17}/></summary><div className="pv-comms-disclosure-body">{children}</div></details>;
}
function SectionHeading({ title, description, children }) {
  return <div className="pv-comms-section-heading"><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{children}</div>;
}
function RowActions({ label, onEdit, onRemove }) {
  return <div className="pv-inventory-row-actions"><button type="button" aria-label={`Edit ${label}`} title="Edit" onClick={onEdit}><Icon name="edit" size={17}/></button><button type="button" className="pv-inventory-delete" aria-label={`Remove ${label}`} title="Remove" onClick={onRemove}><Icon name="trash" size={17}/></button></div>;
}
function RecordEditor({ record, onSave, onClose }) {
  const [draft, setDraft] = useState(() => ({ ...record.value }));
  const ref = useDialogFocus(onClose);
  const id = useId();
  const title = `${record.index < 0 ? 'Add' : 'Edit'} ${{ call: 'call sign', code: 'code word', rally: 'rally point' }[record.kind]}`;
  return <div className="pv-inventory-modal-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose(); }}><section ref={ref} className="pv-comms-dialog" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`}>
    <div className="pv-comms-section-heading"><h2 id={`${id}-title`}>{title}</h2><button type="button" className="pv-comms-icon-button" aria-label="Close editor" onClick={onClose}><Icon name="close" size={20}/></button></div>
    <form onSubmit={event => { event.preventDefault(); onSave(draft); }}><div className="pv-comms-form-grid">{FIELDS[record.kind].map(([key, label], index) => <label className="pv-comms-field" key={key}>{label}<input value={draft[key] || ''} onChange={event => setDraft(previous => ({ ...previous, [key]: event.target.value }))} required={index === 0} maxLength={key === 'coords' ? 120 : 600} placeholder={key === 'coords' ? '45.421°N, 75.690°W or 45.421, -75.690' : undefined}/></label>)}</div><div className="pv-comms-dialog-actions"><button type="button" className="pv-inventory-button pv-inventory-button-secondary" onClick={onClose}>Cancel</button><button className="pv-inventory-button pv-inventory-button-primary">Save changes</button></div></form>
  </section></div>;
}
function coordinates(value) {
  const compass = String(value || '').match(/^\s*([\d.]+)\s*°?\s*([NS])\s*[,\s]+([\d.]+)\s*°?\s*([EW])\s*$/i);
  const decimal = String(value || '').match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  const pair = compass ? [Number(compass[1]) * (compass[2].toUpperCase() === 'S' ? -1 : 1), Number(compass[3]) * (compass[4].toUpperCase() === 'W' ? -1 : 1)] : decimal ? [Number(decimal[1]), Number(decimal[2])] : null;
  return pair && pair.every(Number.isFinite) && Math.abs(pair[0]) <= 90 && Math.abs(pair[1]) <= 180 ? pair : null;
}
function RallyMap({ point, onClose }) {
  const dialog = useDialogFocus(onClose);
  const element = useRef(null);
  const pair = coordinates(point.coords);
  const latitude = pair?.[0]; const longitude = pair?.[1];
  useEffect(() => {
    if (isLocalEdition() || !element.current || latitude === undefined || longitude === undefined) return;
    const map = L.map(element.current, { center: [latitude, longitude], zoom: 15 });
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: 'Esri', maxZoom: 19 }).addTo(map);
    L.circleMarker([latitude, longitude], { radius: 10, color: '#214c39', fillColor: '#73907a', fillOpacity: 0.8, weight: 3 }).addTo(map);
    return () => map.remove();
  }, [latitude, longitude]);
  return <div className="pv-inventory-modal-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose(); }}><section className="pv-comms-dialog pv-comms-map-dialog" role="dialog" aria-modal="true" aria-labelledby="comms-rally-map-title" ref={dialog}><div className="pv-comms-section-heading"><div><h2 id="comms-rally-map-title">{point.name}</h2><p>{point.coords}</p></div><button type="button" className="pv-comms-icon-button" aria-label="Close map" onClick={onClose}><Icon name="close" size={20}/></button></div>{isLocalEdition() ? <p className="pv-comms-map-note">Online map tiles are not loaded in the local edition. Use the saved coordinates and location description, or your saved property map.</p> : pair ? <div ref={element} className="pv-comms-rally-map"/> : <Empty title="Coordinates need an update">Use decimal coordinates or a latitude and longitude with N/S and E/W.</Empty>}<p className="pv-comms-map-note">{point.location}</p></section></div>;
}

export default function CommunicationsView({ items = [], people, callSigns = [], setCallSigns, codeWords = [], setCodeWords, rallyPoints = [], setRallyPoints,
  plan = EMPTY_PLAN, frequencies = [], onSupplies }) {
  const [section, setSection] = useState('scanner');
  const [query, setQuery] = useState('');
  const [source, setSource] = useState('saved');
  const [band, setBand] = useState('all');
  const [references, setReferences] = useState(() => readArray('prepvault-reference-channels', DEFAULT_CHANNELS).filter(value => value && typeof value.freq === 'string' && typeof value.name === 'string'));
  const [log, setLog] = useState(() => readArray('prepvault-radio-log', []).filter(value => value && typeof value.text === 'string'));
  const [logChannel, setLogChannel] = useState('');
  const [logText, setLogText] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [frequency, setFrequency] = useState('');
  const [frequencyName, setFrequencyName] = useState('');
  const [formError, setFormError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [editor, setEditor] = useState(null);
  const [mapPoint, setMapPoint] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [now, setNow] = useState(() => new Date());
  const wallet = useRef(null);
  const talkTab = useRef(null);
  useEffect(() => { const interval = setInterval(() => setNow(new Date()), 30_000); return () => clearInterval(interval); }, []);
  const schedule = plan.schedule || [];
  const nextCheckIn = schedule.map(entry => {
    const [hour, minute] = entry.time.split(':').map(Number);
    const date = new Date(now); date.setHours(hour, minute, 0, 0); if (date <= now) date.setDate(date.getDate() + 1);
    return { ...entry, diff: date - now };
  }).sort((a, b) => a.diff - b.diff)[0];
  const equipment = items.filter(item => item.category === 'comms');
  const equipmentCount = equipment.reduce((total, item) => total + quantity(item), 0);
  const chooseSection = value => { setSection(value); setQuery(''); setExpanded(null); };
  const saveDevice = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); setSaveError(''); } catch { setSaveError('These changes could not be saved on this device. Free browser storage before leaving.'); } };
  const updateReferences = next => {
    setReferences(next);
    if (logChannel && !next.some(entry => entry.freq === logChannel)) setLogChannel('');
    saveDevice('prepvault-reference-channels', next);
  };
  const updateLog = next => { setLog(next); saveDevice('prepvault-radio-log', next); };
  const addReference = entry => { if (!references.some(value => value.freq === entry.freq)) updateReferences([...references, { freq: entry.freq, name: entry.name, band: entry.band || 'custom', mode: entry.mode }]); };
  const addCustomReference = event => {
    event.preventDefault();
    if (!/^\d{1,5}(?:\.\d{1,6})?$/.test(frequency.trim()) || Number(frequency) <= 0) { setFormError('Enter a frequency in MHz, such as 146.520.'); return; }
    if (references.some(entry => entry.freq === frequency.trim())) { setFormError('That frequency is already in your saved references.'); return; }
    addReference({ freq: frequency.trim(), name: frequencyName.trim() || `${frequency.trim()} MHz`, band: 'custom' });
    setFrequency(''); setFrequencyName(''); setFormError(''); setShowAdd(false);
  };
  const saveLog = event => {
    event.preventDefault();
    if (!logChannel || !logText.trim()) return;
    updateLog([{ id: crypto.randomUUID(), channel: logChannel, channelName: references.find(entry => entry.freq === logChannel)?.name || logChannel,
      text: logText.trim(), timestamp: new Date().toISOString(), reporter: Array.isArray(people) && people[0]?.name || 'Operator' }, ...log].slice(0, 50));
    setLogText('');
  };
  const edit = (kind, value = {}, index = -1) => setEditor({ kind, value, index });
  const saveRecord = value => {
    const setter = { call: setCallSigns, code: setCodeWords, rally: setRallyPoints }[editor.kind];
    const next = editor.kind === 'rally' && !value.id ? { ...value, id: `rp-${crypto.randomUUID()}` } : value;
    setter(previous => editor.index < 0 ? [...previous, next] : previous.map((record, index) => index === editor.index ? next : record));
    setEditor(null);
  };
  const printCard = () => {
    const popup = window.open('', '_blank', 'width=700,height=600');
    if (!popup) { setSaveError('Allow a pop-up for PrepVault to print the communications card.'); return; }
    popup.opener = null;
    popup.document.title = 'PrepVault communications card';
    const style = popup.document.createElement('style');
    style.textContent = 'body{font:12px system-ui,sans-serif;color:#253b30;padding:28px;max-width:650px;margin:auto}h3{font-size:19px}table{width:100%;border-collapse:collapse}td,th{padding:8px;text-align:left;border-bottom:1px solid #dce4da}p{line-height:1.6}small{color:#53634c}@page{margin:12mm}';
    popup.document.head.appendChild(style);
    popup.document.body.appendChild(wallet.current.cloneNode(true));
    popup.requestAnimationFrame(() => { popup.focus(); popup.print(); });
  };
  const displayedFrequencies = (source === 'saved' ? references : frequencies).filter(entry => (band === 'all' || entry.band === band) && matches(entry, query));
  const visibleCodes = codeWords.map((value, index) => ({ value, index })).filter(({ value }) => matches(value, query));
  const visibleCalls = callSigns.map((value, index) => ({ value, index })).filter(({ value }) => matches(value, query));
  const designatedFrequencies = [plan.primaryFreq, plan.emergencyFreq, ...(plan.altFreqs || [])].filter(Boolean);

  const codeWordsTable = <>{visibleCodes.length ? <Table headings={['Code word', 'Meaning', 'Action', '']} label="Code words">{visibleCodes.map(({ value, index }) => <tr key={index}><td><strong>{value.code}</strong></td><td>{value.meaning}</td><td>{value.action}</td><td><RowActions label={value.code} onEdit={() => edit('code', value, index)} onRemove={() => setCodeWords(previous => previous.filter((_, row) => row !== index))}/></td></tr>)}</Table> : <Empty title={query ? 'No code words match' : 'No code words yet'}>Add a shared word and the action your household should take.</Empty>}</>;
  const callSignsTable = <>{visibleCalls.length ? <Table headings={['Call sign', 'Person', '']} label="Call signs">{visibleCalls.map(({ value, index }) => <tr key={index}><td><strong>{value.sign}</strong></td><td>{value.person}</td><td><RowActions label={value.sign} onEdit={() => edit('call', value, index)} onRemove={() => setCallSigns(previous => previous.filter((_, row) => row !== index))}/></td></tr>)}</Table> : <Empty title={query ? 'No call signs match' : 'No call signs yet'}>Assign a short call sign to each person in your communications plan.</Empty>}</>;

  return <section className="pv-inventory pv-communications" aria-labelledby="communications-title">
    <header className="pv-inventory-heading"><div><p className="pv-inventory-eyebrow">STAY IN TOUCH</p><h1 id="communications-title">Communications<span>.</span></h1><p className="pv-inventory-intro">Listen, coordinate and keep your household connected.</p></div><div className="pv-inventory-actions"><button type="button" className="pv-inventory-button pv-inventory-button-secondary" onClick={() => chooseSection('commsplan')}><Icon name="list" size={18}/>View your plan</button>{onSupplies && <button type="button" className="pv-inventory-button pv-inventory-button-primary" onClick={onSupplies}><Icon name="box" size={18}/>Manage equipment</button>}</div></header>
    <div className="pv-inventory-overview">
      <button type="button" className="pv-inventory-stat pv-inventory-stat-action" onClick={() => chooseSection('scanner')}><span className="pv-inventory-stat-icon"><Icon name="radio" size={22}/></span><div><span className="pv-inventory-stat-value">{references.length}<small>saved frequencies</small></span><p>Your physical radio reference</p></div><Icon name="arrow" size={18}/></button>
      <button type="button" className="pv-inventory-stat pv-inventory-stat-action" onClick={onSupplies}><span className="pv-inventory-stat-icon"><Icon name="box" size={22}/></span><div><span className="pv-inventory-stat-value">{equipmentCount}<small>equipment units</small></span><p>From your supplies inventory</p></div><Icon name="arrow" size={18}/></button>
      <button type="button" className="pv-inventory-stat pv-inventory-stat-action" onClick={() => chooseSection('commsplan')}><span className="pv-inventory-stat-icon"><Icon name="clock" size={22}/></span><div><span className="pv-inventory-stat-value">{nextCheckIn?.time || '—'}<small>next check-in</small></span><p>{nextCheckIn ? `In ${Math.floor(nextCheckIn.diff / 3_600_000)}h ${Math.floor(nextCheckIn.diff / 60_000) % 60}m · local time` : 'No schedule recorded'}</p></div><Icon name="arrow" size={18}/></button>
    </div>
    <nav className="pv-comms-sections" aria-label="Communications sections">{SECTIONS.map(([id, label]) => <button key={id} ref={id === 'talk' ? talkTab : undefined} type="button" aria-current={section === id ? 'page' : undefined} className={section === id ? 'is-active' : ''} onClick={() => chooseSection(id)}>{label}</button>)}</nav>
    {saveError && <p className="pv-comms-error" role="alert">{saveError}</p>}

    <div hidden={section !== 'scanner'} className="pv-comms-stack">
      <div className="pv-inventory-workspace pv-comms-talk-shortcut"><div><h2>Sign in to a radio service</h2><p>Two-way amateur radio for Canada and the US, using your own service account.</p></div><button type="button" className="pv-inventory-button pv-inventory-button-secondary" onClick={() => { chooseSection('talk'); talkTab.current?.focus(); }}><Icon name="radio" size={17}/>Browse radio services</button></div>
      <RadioPlayer/>
      <Details title="Physical radio frequencies" count={references.length}><SectionHeading title="Frequency reference" description="North American references for a physical radio. These rows do not contain internet streams. Use the local feed directory above to listen online."><button type="button" className="pv-inventory-button pv-inventory-button-secondary" onClick={() => setShowAdd(value => !value)} aria-expanded={showAdd}><Icon name="plus" size={17}/>Add frequency</button></SectionHeading>
        {showAdd && <form className="pv-comms-inline-form" onSubmit={addCustomReference}><label className="pv-comms-field">Frequency (MHz)<input value={frequency} onChange={event => setFrequency(event.target.value)} placeholder="146.520" required inputMode="decimal" maxLength={14}/></label><label className="pv-comms-field">Name<input value={frequencyName} onChange={event => setFrequencyName(event.target.value)} placeholder="Local channel" maxLength={100}/></label><button className="pv-inventory-button pv-inventory-button-primary">Save frequency</button>{formError && <p className="pv-comms-error" role="alert">{formError}</p>}</form>}
        <div className="pv-inventory-toolbar"><Search value={query} onChange={setQuery} label="Search frequencies" placeholder="Search frequency, name or use…"/><div className="pv-inventory-filters"><label className="pv-inventory-select"><span className="pv-inventory-sr-only">Frequency list</span><select value={source} onChange={event => setSource(event.target.value)}><option value="saved">Saved frequencies</option><option value="all">Full reference</option></select></label><label className="pv-inventory-select"><span className="pv-inventory-sr-only">Radio band</span><select value={band} onChange={event => setBand(event.target.value)}><option value="all">All bands</option>{Object.entries(BANDS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label></div></div>
        <div className="pv-inventory-results-bar"><p><strong>{displayedFrequencies.length}</strong> frequencies{query && <button type="button" onClick={() => setQuery('')}>Clear search</button>}</p><span className="pv-comms-muted">MHz</span></div>
        {displayedFrequencies.length ? <Table headings={['Frequency', 'Channel', 'Band / mode', source === 'saved' ? 'Reference' : 'License', '']} label="Radio frequency reference">{displayedFrequencies.map((entry, index) => {
          const saved = references.some(value => value.freq === entry.freq);
          return <Fragment key={`${entry.freq}-${entry.name}-${index}`}><tr><td><button type="button" className="pv-inventory-item-name" aria-pressed={logChannel === entry.freq} title="Select this frequency for activity notes" onClick={() => { if (!saved) addReference(entry); setLogChannel(entry.freq); }}>{entry.freq}</button></td><td><strong>{entry.name}</strong>{entry.use && <span className="pv-inventory-item-type">{entry.use}</span>}</td><td>{BANDS[entry.band] || entry.band || 'Custom'}{entry.mode && <span className="pv-inventory-item-type">{entry.mode}</span>}</td><td>{source === 'saved' ? logChannel === entry.freq ? 'Selected for notes' : 'Saved channel' : licenseLabel(entry.license)}</td><td>{source === 'saved' ? <button type="button" className="pv-comms-icon-button" aria-label={`Remove frequency ${entry.name}`} onClick={() => updateReferences(references.filter(value => value.freq !== entry.freq))}><Icon name="trash" size={17}/></button> : <button type="button" className="pv-comms-text-button" disabled={saved} onClick={() => addReference(entry)}>{saved ? 'Saved' : 'Save'}</button>}</td></tr></Fragment>;
        })}</Table> : <Empty title="No frequencies match">Change the band filter or clear your search.</Empty>}
      </Details>
      <Details title="Activity notes" count={log.length}><p className="pv-comms-section-note">Keep a record of what you hear. These are manually saved notes; automatic recording and AI transcription are not available.</p><form className="pv-comms-inline-form" onSubmit={saveLog}><label className="pv-comms-field">Reference channel<select value={logChannel} onChange={event => setLogChannel(event.target.value)} required><option value="">Choose a channel</option>{references.map((entry, index) => <option key={`${entry.freq}-${index}`} value={entry.freq}>{entry.freq} · {entry.name}</option>)}</select></label><label className="pv-comms-field pv-comms-grow">What did you hear?<input value={logText} onChange={event => setLogText(event.target.value)} required maxLength={2000} placeholder="Add an observation…"/></label><button className="pv-inventory-button pv-inventory-button-primary" disabled={!logChannel || !logText.trim()}>Save note</button></form>{log.length ? <div className="pv-comms-log">{log.map(entry => <article key={entry.id}><div><strong>{entry.channelName || entry.channel}</strong><span>{entry.channel}</span><p>{entry.text}</p><small>{entry.timestamp ? new Date(entry.timestamp).toLocaleString() : 'Time not recorded'} · {entry.reporter || 'Operator'}</small></div><button type="button" className="pv-comms-icon-button" aria-label={`Remove note about ${entry.channelName || entry.channel}`} onClick={() => updateLog(log.filter(value => value.id !== entry.id))}><Icon name="trash" size={17}/></button></article>)}</div> : <Empty title="No activity notes yet">Choose a reference channel and record what you heard.</Empty>}</Details>
    </div>

    {section === 'talk' && <RadioTalk/>}

    {section === 'commsplan' && <div className="pv-comms-stack"><div className="pv-inventory-workspace"><SectionHeading title="Designated frequencies" description="Your primary, emergency and backup channels."/><Table headings={['Channel', 'Frequency', 'Mode / power', 'Use']} label="Designated communications frequencies">{designatedFrequencies.map((entry, index) => <tr key={`${entry.freq}-${index}`}><td><strong>{entry.name}</strong><span className="pv-inventory-item-type">{index === 0 ? 'Primary' : index === 1 ? 'Emergency' : 'Backup'}</span></td><td>{entry.freq}</td><td>{entry.mode}<span className="pv-inventory-item-type">{entry.power}</span></td><td>{entry.use}</td></tr>)}</Table></div><div className="pv-inventory-workspace"><SectionHeading title="Check-in schedule" description={nextCheckIn ? `Next: ${nextCheckIn.time} · ${nextCheckIn.desc}` : 'No check-in times recorded.'}/><Table headings={['Time', 'Check-in', 'Duration', 'Attendance']} label="Check-in schedule">{schedule.map(entry => <tr key={entry.time}><td><strong>{entry.time}</strong></td><td>{entry.desc}</td><td>{entry.duration}</td><td>{entry.mandatory ? 'Mandatory' : 'Optional'}</td></tr>)}</Table><div className="pv-inventory-footer"><Icon name="clock" size={15}/><span>Check-in times use this device’s local time.</span></div></div><Details title="Call signs & code words" count={callSigns.length + codeWords.length}><SectionHeading title="Call signs"><button type="button" className="pv-comms-text-button" onClick={() => edit('call')}>Add call sign</button></SectionHeading>{callSignsTable}<SectionHeading title="Code words"><button type="button" className="pv-comms-text-button" onClick={() => edit('code')}>Add code word</button></SectionHeading>{codeWordsTable}{plan.duress && <div className="pv-comms-notice"><h3>Duress signal</h3><p>{plan.duress}</p></div>}</Details>
      <div className="pv-inventory-workspace"><SectionHeading title="Rally points" description="Where to meet if your usual plan changes."><button type="button" className="pv-inventory-button pv-inventory-button-secondary" onClick={() => edit('rally')}><Icon name="plus" size={17}/>Add rally point</button></SectionHeading>{rallyPoints.length ? <Table headings={['Rally point', 'Location', 'When to use', '']} label="Rally points">{rallyPoints.map((point, index) => {
        const isOpen = expanded === point.id;
        return <Fragment key={point.id || index}><tr><td><button type="button" className="pv-inventory-item-name" aria-expanded={isOpen} onClick={() => setExpanded(isOpen ? null : point.id)}>{point.name}</button><span className="pv-inventory-item-type">{point.coords || 'Coordinates not recorded'}</span></td><td>{point.location || 'Not recorded'}</td><td>{point.use || 'Not recorded'}</td><td><RowActions label={point.name} onEdit={() => edit('rally', point, index)} onRemove={() => setRallyPoints(previous => previous.filter((_, row) => row !== index))}/></td></tr>{isOpen && <tr className="pv-comms-detail-row"><td colSpan={4}><div className="pv-comms-record-details"><dl><div><dt>Marker</dt><dd>{point.marker || 'Not recorded'}</dd></div><div><dt>Cached supplies</dt><dd>{point.supplies || 'Not recorded'}</dd></div></dl>{point.coords && <button type="button" className="pv-inventory-button pv-inventory-button-secondary" onClick={() => setMapPoint(point)}><Icon name="map" size={16}/>Open rally map</button>}</div></td></tr>}</Fragment>;
      })}</Table> : <Empty title="Choose a place to meet">Add a rally point with clear directions your household can recognize.</Empty>}</div>
      <Details title="Printable communications card"><SectionHeading title="Keep the essentials with you" description="A compact copy of your frequencies, check-in times and rally points."><button type="button" className="pv-inventory-button pv-inventory-button-secondary" onClick={printCard}><Icon name="download" size={16}/>Print card</button></SectionHeading><div className="pv-comms-wallet" ref={wallet}><h3>PrepVault · Communications card</h3><table><thead><tr><th>Channel</th><th>Frequency</th><th>Mode</th></tr></thead><tbody>{designatedFrequencies.map((entry, index) => <tr key={`${entry.freq}-${index}`}><td>{entry.name}</td><td>{entry.freq}</td><td>{entry.mode}</td></tr>)}</tbody></table><p><strong>Check-in:</strong> {schedule.filter(entry => entry.mandatory).map(entry => entry.time).join(' / ') || 'Not recorded'}</p><p><strong>Call signs:</strong> {callSigns.map(entry => `${entry.sign} — ${entry.person}`).join(' · ') || 'Not recorded'}</p><p><strong>Code words:</strong> {codeWords.map(entry => entry.code).join(' · ') || 'Not recorded'}</p><p><strong>Rally:</strong> {rallyPoints.map(point => point.name).join(' → ') || 'Not recorded'}</p>{plan.duress && <p><strong>Duress:</strong> {plan.duress}</p>}</div></Details>
    </div>}
    {editor && <RecordEditor record={editor} onSave={saveRecord} onClose={() => setEditor(null)}/>} {mapPoint && <RallyMap point={mapPoint} onClose={() => setMapPoint(null)}/>}
  </section>;
}
