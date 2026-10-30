import { Fragment, useMemo, useState } from 'react';
import { Icon } from './brand.jsx';
import { StatusPanel, StatusRing, StatusBreakdown } from './StatusCharts.jsx';
import {
  EMP_PROTECTION_OPTIONS, VEHICLE_DISTANCE_UNITS, VEHICLE_EMERGENCY_EQUIPMENT, VEHICLE_FUEL_UNITS,
  linkVehicleSupply, prepareVehicleUpdate, recordVehicleService, splitVehicleInventory,
  vehicleDateKey, vehicleServiceStatus, vehicleServiceReadiness, vehicleReadinessSummary, vehicleSupplyQuantity, vehicleTankSummary,
} from './vehicles.js';
import './inventory.css';
import './vehicles.css';

const dateLabel = value => value ? new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not recorded';
const numberLabel = value => value === '' || value === null || value === undefined ? 'Not recorded' : Number(value).toLocaleString();
const detailFields = ['fuelType', 'tankFuel', 'tankCapacity', 'fuelUnit', 'mileage', 'mileageUnit', 'hoursOnEngine', 'lastServiceDate', 'nextService', 'nextServiceMileage', 'nextServiceHours', 'empProtection', 'empProtectionNotes'];

function Field({ label, children, hint }) {
  return <label className="pv-vehicle-field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}
function SaveActions({ saving, onCancel, label = 'Save vehicle details' }) {
  return <div className="pv-vehicle-form-actions"><button type="button" className="pv-inventory-button pv-inventory-button-secondary" disabled={saving} onClick={onCancel}>Cancel</button><button type="submit" className="pv-inventory-button pv-inventory-button-primary" disabled={saving}>{saving ? 'Saving…' : label}</button></div>;
}
function VehicleDetailsForm({ item, onUpdate, onCancel }) {
  const [draft, setDraft] = useState(() => ({ ...Object.fromEntries(detailFields.map(key => [key, item.fields?.[key] ?? ''])), empProtection: item.fields?.empProtection || 'not-recorded', emergencyEquipment: Array.isArray(item.fields?.emergencyEquipment) ? item.fields.emergencyEquipment : [] }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const change = (key, value) => setDraft(old => ({ ...old, [key]: value }));
  const input = (key, label, type = 'text', hint) => <Field label={label} hint={hint}><input type={type} min={type === 'number' ? 0 : undefined} step={type === 'number' ? 'any' : undefined} value={draft[key]} onChange={event => change(key, event.target.value)}/></Field>;
  const select = (key, label, options) => <Field label={label}><select value={draft[key]} onChange={event => change(key, event.target.value)}><option value="">Choose a unit</option>{options.map(option => <option key={option}>{option}</option>)}</select></Field>;
  const submit = async event => {
    event.preventDefault(); setError(''); setSaving(true);
    try { if (await onUpdate(prepareVehicleUpdate(item, draft)) === false) throw new Error('The vehicle could not be saved. Please try again.'); onCancel(); }
    catch (failure) { setError(failure.message || 'The vehicle could not be saved.'); }
    finally { setSaving(false); }
  };
  return <form className="pv-vehicle-form" onSubmit={submit}>
    <h3>Vehicle details</h3>
    <fieldset disabled={saving}><legend>Fuel &amp; current readings</legend><div className="pv-vehicle-form-grid">
      {input('fuelType', 'Fuel / energy type', 'text', 'For example: gasoline, diesel, electric or human powered')}
      {input('tankFuel', 'Fuel in tank', 'number')}{input('tankCapacity', 'Tank capacity', 'number')}{select('fuelUnit', 'Tank unit', VEHICLE_FUEL_UNITS)}
      {input('mileage', 'Current odometer', 'number')}{select('mileageUnit', 'Distance unit', VEHICLE_DISTANCE_UNITS)}{input('hoursOnEngine', 'Current engine hours', 'number')}
    </div></fieldset>
    <fieldset disabled={saving}><legend>Service schedule</legend><div className="pv-vehicle-form-grid">
      {input('lastServiceDate', 'Last completed service', 'date')}{input('nextService', 'Next service date', 'date')}
      {input('nextServiceMileage', 'Next service odometer', 'number', 'Enter readings in the selected unit. Values are not converted automatically.')}{input('nextServiceHours', 'Next service engine hours', 'number')}
    </div><p className="pv-vehicle-note">Use the interval specified for your vehicle. A date or meter reading can trigger a reminder; updating readings keeps mileage and hour reminders current.</p></fieldset>
    <fieldset disabled={saving}><legend>EMP protection record</legend><div className="pv-vehicle-form-grid">
      <Field label="Recorded protection"><select value={draft.empProtection} onChange={event => change('empProtection', event.target.value)}>{EMP_PROTECTION_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
      <Field label="Equipment, storage & verification notes"><textarea rows={3} maxLength={4000} value={draft.empProtectionNotes} onChange={event => change('empProtectionNotes', event.target.value)}/></Field>
    </div><p className="pv-vehicle-note">This records your preparations. An installed device or stored spare does not establish that a vehicle will survive an EMP.</p></fieldset>
    <fieldset disabled={saving}><legend>Emergency equipment aboard</legend><div className="pv-vehicle-checklist">{VEHICLE_EMERGENCY_EQUIPMENT.map(([id, label]) => <label key={id}><input type="checkbox" checked={draft.emergencyEquipment.includes(id)} onChange={event => change('emergencyEquipment', event.target.checked ? [...draft.emergencyEquipment, id] : draft.emergencyEquipment.filter(value => value !== id))}/><span>{label}</span></label>)}</div><p className="pv-vehicle-note">These are checkmarks for equipment aboard this vehicle. They do not add or deduct inventory.</p></fieldset>
    {error && <p role="alert" className="pv-vehicle-error">{error}</p>}<SaveActions saving={saving} onCancel={onCancel}/>
  </form>;
}

function ServiceForm({ item, onUpdate, onCancel }) {
  const [draft, setDraft] = useState(() => ({ date: vehicleDateKey(), summary: '', odometer: item.fields?.mileage ?? '', odometerUnit: item.fields?.mileageUnit || '', hours: item.fields?.hoursOnEngine ?? '', nextService: '', nextServiceMileage: '', nextServiceHours: '', oilChanged: false }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const change = (key, value) => setDraft(old => ({ ...old, [key]: value }));
  const input = (key, label, type = 'number') => <Field label={label}><input type={type} min={type === 'number' ? 0 : undefined} max={key === 'date' ? vehicleDateKey() : undefined} step={type === 'number' ? 'any' : undefined} required={key === 'date'} value={draft[key]} onChange={event => change(key, event.target.value)}/></Field>;
  const submit = async event => {
    event.preventDefault(); setError(''); setSaving(true);
    try { const updated = recordVehicleService(item, draft, { id: crypto.randomUUID() }); if (await onUpdate(updated) === false) throw new Error('Service could not be saved. Please try again.'); onCancel(); }
    catch (failure) { setError(failure.message || 'Service could not be saved.'); }
    finally { setSaving(false); }
  };
  return <form className="pv-vehicle-form" onSubmit={submit}>
    <h3>Record completed service</h3><fieldset disabled={saving}><legend>Work completed</legend><div className="pv-vehicle-form-grid">
      {input('date', 'Service date', 'date')}{input('odometer', 'Odometer at service')}
      <Field label="Odometer unit"><select value={draft.odometerUnit} onChange={event => change('odometerUnit', event.target.value)}><option value="">Choose a unit</option>{VEHICLE_DISTANCE_UNITS.map(unit => <option key={unit}>{unit}</option>)}</select></Field>
      {input('hours', 'Engine hours at service')}
      <Field label="What was done"><textarea required maxLength={2000} rows={3} value={draft.summary} onChange={event => change('summary', event.target.value)} placeholder="Oil and filter replaced; checked tyres and spare…"/></Field>
    </div><label className="pv-vehicle-service-checkbox"><input type="checkbox" checked={draft.oilChanged} onChange={event => change('oilChanged', event.target.checked)}/><span>Included an oil change</span></label></fieldset>
    <fieldset disabled={saving}><legend>Schedule the next service</legend><div className="pv-vehicle-form-grid">{input('nextService', 'Next service date', 'date')}{input('nextServiceMileage', 'Next service odometer')}{input('nextServiceHours', 'Next service engine hours')}</div><p className="pv-vehicle-note">For the latest service, these values replace the previous reminders. Leave blank if the next service is not scheduled yet. Older entries add to history without changing the current schedule.</p></fieldset>
    {error && <p role="alert" className="pv-vehicle-error">{error}</p>}<SaveActions saving={saving} onCancel={onCancel} label="Save service record"/>
  </form>;
}

function VehicleDetails({ item, supplies, categories, onUpdate, onEdit, onSupplies }) {
  const [mode, setMode] = useState(null);
  const fields = item.fields || {};
  const status = vehicleServiceStatus(item);
  const equipment = Array.isArray(fields.emergencyEquipment) ? fields.emergencyEquipment : [];
  const history = Array.isArray(fields.vehicleServiceLog) ? fields.vehicleServiceLog.filter(entry => entry && typeof entry === 'object').sort((a, b) => String(b.date).localeCompare(String(a.date))) : [];
  const linked = supplies.filter(supply => supply.fields?.vehicleId === item.id);
  return <div className="pv-vehicle-details" id={`vehicle-${encodeURIComponent(item.id)}`}>
    <div className="pv-vehicle-details-heading"><h2>{item.name} details</h2><div className="pv-vehicle-actions"><button className="pv-inventory-button pv-inventory-button-secondary" type="button" onClick={() => onEdit(item)}>Edit inventory item</button><button className="pv-inventory-button pv-inventory-button-secondary" type="button" onClick={() => setMode(mode === 'details' ? null : 'details')}>Vehicle details</button><button className="pv-inventory-button pv-inventory-button-primary" type="button" onClick={() => setMode(mode === 'service' ? null : 'service')}><Icon name="plus" size={15}/>Log service</button></div></div>
    {mode === 'details' ? <VehicleDetailsForm key={`details-${item.id}`} item={item} onUpdate={onUpdate} onCancel={() => setMode(null)}/> : mode === 'service' ? <ServiceForm key={`service-${item.id}`} item={item} onUpdate={onUpdate} onCancel={() => setMode(null)}/> : <>
      <dl className="pv-vehicle-facts"><div><dt>Odometer</dt><dd>{numberLabel(fields.mileage)} {fields.mileage !== '' && fields.mileage != null && (fields.mileageUnit || '(unit needed)')}</dd></div><div><dt>Engine hours</dt><dd>{numberLabel(fields.hoursOnEngine)}</dd></div><div><dt>Last service</dt><dd>{dateLabel(fields.lastServiceDate)}</dd></div><div><dt>Next service</dt><dd>{dateLabel(fields.nextService)}</dd></div><div><dt>Service at odometer</dt><dd>{numberLabel(fields.nextServiceMileage)} {fields.nextServiceMileage !== '' && fields.nextServiceMileage != null && (fields.mileageUnit || '(unit needed)')}</dd></div><div><dt>Service at engine hours</dt><dd>{numberLabel(fields.nextServiceHours)}</dd></div></dl>
      {status.reasons.length > 0 && <ul className="pv-vehicle-reminders">{status.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>}
      <div className="pv-vehicle-detail-columns"><section><h3>EMP protection</h3><p>{EMP_PROTECTION_OPTIONS.find(([id]) => id === fields.empProtection)?.[1] || 'Not recorded'}</p>{fields.empProtectionNotes && <p className="pv-vehicle-preserve">{fields.empProtectionNotes}</p>}<p className="pv-vehicle-note">A preparation record, not a guarantee of protection.</p></section><section><h3>Equipment aboard</h3>{equipment.length ? <ul className="pv-vehicle-equipment-list">{VEHICLE_EMERGENCY_EQUIPMENT.filter(([id]) => equipment.includes(id)).map(([id, label]) => <li key={id}><Icon name="check" size={13}/>{label}</li>)}</ul> : <p>No equipment checked yet.</p>}<button type="button" className="pv-vehicle-text-button" onClick={() => setMode('details')}>Update checklist <Icon name="arrow" size={13}/></button></section></div>
      <section className="pv-vehicle-linked"><h3>Linked fuel &amp; spares <span>{linked.length}</span></h3>{linked.length ? <ul>{linked.map(supply => <li key={supply.id}><span>{supply.name}</span><span>{vehicleSupplyQuantity(supply, categories).label}</span></li>)}</ul> : <p>No supplies linked yet. Assign stored fuel or compatible parts from the tabs above.</p>}<button type="button" className="pv-vehicle-text-button" onClick={onSupplies}>Manage fuel &amp; spares <Icon name="arrow" size={13}/></button></section>
      <section className="pv-vehicle-service-history"><h3>Service history <span>{history.length}</span></h3>{history.length ? <ol>{history.map(entry => <li key={entry.id}><div><time dateTime={entry.date}>{dateLabel(entry.date)}</time>{entry.odometer !== '' && entry.odometer != null && <span>{numberLabel(entry.odometer)} {entry.odometerUnit}</span>}{entry.hours !== '' && entry.hours != null && <span>{numberLabel(entry.hours)} engine hours</span>}</div><p>{entry.summary}</p>{entry.oilChanged && <span className="pv-inventory-item-type">Oil changed</span>}</li>)}</ol> : <p>No service entries yet. Log completed work to build a maintenance history.</p>}</section>
    </>}
  </div>;
}

export default function VehiclesView({ items = [], categories = {}, onAdd, onEdit, onRemove, onUpdate, onOpenCategory }) {
  const [tab, setTab] = useState('vehicles');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('name');
  const [expandedId, setExpandedId] = useState(null);
  const [addType, setAddType] = useState('car');
  const [removeItem, setRemoveItem] = useState(null);
  const [pending, setPending] = useState(null);
  const [error, setError] = useState('');
  const groups = useMemo(() => splitVehicleInventory(items), [items]);
  const summary = vehicleReadinessSummary(groups.vehicles);
  const labels = { vehicles: 'Vehicles', fuel: 'Fuel storage', parts: 'Parts & supplies' };
  const filtersActive = Boolean(query.trim()) || filter !== 'all';
  const changeTab = value => { setTab(value); setFilter('all'); setQuery(''); setRemoveItem(null); setSort('name'); setAddType(value === 'vehicles' ? 'car' : value === 'fuel' ? 'gasoline' : 'spareParts'); };
  const visible = useMemo(() => groups[tab].filter(item => {
    const term = query.trim().toLowerCase();
    if (term && ![item.name, item.location, item.fields?.vMake, item.fields?.vModel, item.fields?.partFor, item.fields?.partDesc, item.fields?.fuelType, categories[item.category]?.subTypes?.[item.subType]?.label].join(' ').toLowerCase().includes(term)) return false;
    if (tab === 'vehicles') return filter === 'all' || (filter.startsWith('chart-') ? vehicleServiceReadiness(item) === filter.slice(6) : filter === 'attention' ? ['due', 'soon'].includes(vehicleServiceStatus(item).status) : vehicleServiceStatus(item).status === filter);
    return filter === 'all' || (filter === 'unassigned' ? !item.fields?.vehicleId : item.fields?.vehicleId === filter);
  }).sort((a, b) => sort === 'service' && tab === 'vehicles' ? ({ due: 0, soon: 1, unrecorded: 2, scheduled: 3 }[vehicleServiceStatus(a).status] - { due: 0, soon: 1, unrecorded: 2, scheduled: 3 }[vehicleServiceStatus(b).status] || a.name.localeCompare(b.name)) : a.name.localeCompare(b.name)), [groups, tab, query, filter, sort, categories]);
  const assignVehicle = async (item, vehicleId) => {
    setPending(item.id); setError('');
    try { if (await onUpdate(linkVehicleSupply(item, vehicleId, groups.vehicles)) === false) throw new Error('The assignment could not be saved.'); }
    catch (failure) { setError(failure.message || 'The assignment could not be saved.'); }
    finally { setPending(null); }
  };
  const confirmRemove = async () => {
    setPending(removeItem.id); setError('');
    try { if (await onRemove(removeItem.id) === false) throw new Error('The item could not be removed.'); setRemoveItem(null); }
    catch (failure) { setError(failure.message || 'The item could not be removed.'); }
    finally { setPending(null); }
  };
  const addOptions = Object.entries(categories[tab === 'fuel' ? 'fuel' : 'vehicles']?.subTypes || {}).filter(([key]) => tab === 'fuel' || (tab === 'parts' ? ['spareParts', 'fluids', 'tires', 'engineOil', 'sparkPlug', 'battery', 'toolkit'].includes(key) : !['spareParts', 'fluids', 'tires', 'engineOil', 'sparkPlug', 'battery', 'toolkit'].includes(key)));
  return <section className="pv-inventory pv-vehicles" aria-labelledby="vehicles-title">
    <header className="pv-inventory-heading"><div><h1 id="vehicles-title">Your vehicles<span>.</span></h1><p className="pv-inventory-intro">Vehicles, fuel, parts and maintenance.</p></div><div className="pv-inventory-actions"><label className="pv-inventory-select"><span className="pv-inventory-sr-only">New {tab === 'vehicles' ? 'vehicle' : 'supply'} type</span><select value={addType} onChange={event => setAddType(event.target.value)}>{addOptions.map(([id, type]) => <option key={id} value={id}>{type.label}</option>)}</select></label><button type="button" className="pv-inventory-button pv-inventory-button-primary" onClick={() => onAdd(tab === 'fuel' ? 'fuel' : 'vehicles', addType)}><Icon name="plus" size={17}/>Add {tab === 'vehicles' ? 'vehicle' : tab === 'fuel' ? 'fuel' : 'part'}</button></div></header>
    <StatusPanel title="Vehicle status" eyebrow="" summary={`${summary.availableCount} on hand · ${summary.service.due} service due · ${summary.service.soon} due soon · ${summary.service.unknown} need details`} note={`${summary.excludedCount ? `${summary.excludedCount} zero-stock or uncounted vehicle records are excluded. ` : ''}Based on saved schedules and readings, not a roadworthiness check.`}>
      <StatusRing title="Service schedule" value={summary.availableCount} label="vehicle records" emptyLabel="No vehicles on hand" segments={[
        { id: 'current', label: 'Not due', value: summary.service.current, tone: 'good' },
        { id: 'soon', label: 'Due within 30 days', value: summary.service.soon, tone: 'warning' },
        { id: 'due', label: 'Due now', value: summary.service.due, tone: 'danger' },
        { id: 'unknown', label: 'Schedule / readings needed', value: summary.service.unknown, tone: 'unknown' },
      ].map(segment => ({ ...segment, onClick: () => { changeTab('vehicles'); setFilter(`chart-${segment.id}`); } }))}/>
      <StatusBreakdown title="Fuel in each tank" rows={summary.tanks.map(tank => ({ ...tank, onClick: () => { changeTab('vehicles'); setQuery(tank.label); setExpandedId(tank.id); } }))} note={summary.tanks.length ? 'Green: at least half full. Amber: under half. Red: empty. Stored fuel is separate.' : 'Add tank readings for fuel-powered vehicles.'}/>
    </StatusPanel>
    <div className="pv-inventory-workspace"><div className="pv-vehicle-tabs" role="group" aria-label="Vehicle inventory section">{Object.entries(labels).map(([key, label]) => <button key={key} type="button" aria-pressed={tab === key} onClick={() => changeTab(key)}>{label}<span>{groups[key].length}</span></button>)}</div>
      <div className="pv-inventory-toolbar"><div className="pv-inventory-search"><Icon name="search" size={18}/><input aria-label={`Search ${labels[tab].toLowerCase()}`} type="search" placeholder={tab === 'vehicles' ? 'Search vehicles, make or location…' : 'Search supplies or compatibility…'} value={query} onChange={event => setQuery(event.target.value)}/></div><div className="pv-inventory-filters"><label className="pv-inventory-select"><span className="pv-inventory-sr-only">Filter {labels[tab].toLowerCase()}</span><select value={filter} onChange={event => setFilter(event.target.value)}>{tab === 'vehicles' ? <><option value="all">All service statuses</option><option value="chart-current">On hand · service not due</option><option value="chart-soon">On hand · due within 30 days</option><option value="chart-due">On hand · service due</option><option value="chart-unknown">On hand · schedule / readings needed</option><option value="attention">Service needs attention</option><option value="due">Service due</option><option value="unrecorded">No service schedule</option><option value="scheduled">Service scheduled</option></> : <><option value="all">All assignments</option><option value="unassigned">Shared / unassigned</option>{groups.vehicles.map(vehicle => <option value={vehicle.id} key={vehicle.id}>{vehicle.name}</option>)}</>}</select></label></div></div>
      <div className="pv-inventory-results-bar"><p aria-live="polite"><strong>{visible.length}</strong> {visible.length === 1 ? 'record' : 'records'}{filtersActive && <button type="button" onClick={() => { setQuery(''); setFilter('all'); }}>Clear filters <Icon name="close" size={12}/></button>}</p><label className="pv-inventory-sort">Sort by <select aria-label="Sort vehicles and supplies" value={sort} onChange={event => setSort(event.target.value)}><option value="name">Name, A–Z</option>{tab === 'vehicles' && <option value="service">Service priority</option>}</select></label></div>
      {error && <p className="pv-vehicle-error" role="alert">{error}</p>}
      {removeItem && <div className="pv-vehicle-remove" role="group" aria-label="Confirm removal"><p>Remove <strong>{removeItem.name}</strong> from your inventory?{removeItem.category === 'vehicles' && !groups.parts.some(part => part.id === removeItem.id) ? ' Linked supplies stay in inventory.' : ''}</p><div><button type="button" className="pv-inventory-button pv-inventory-button-secondary" disabled={Boolean(pending)} onClick={() => setRemoveItem(null)}>Keep item</button><button type="button" className="pv-inventory-button pv-inventory-button-danger" disabled={Boolean(pending)} onClick={confirmRemove}>Remove item</button></div></div>}
      {visible.length ? <div className="pv-inventory-table-scroll"><table className="pv-inventory-table pv-vehicles-table"><thead><tr><th scope="col">{tab === 'vehicles' ? 'Vehicle' : 'Item'}</th><th scope="col">{tab === 'vehicles' ? 'Fuel in tank' : 'On hand'}</th><th scope="col">{tab === 'vehicles' ? 'Service' : 'Assigned vehicle'}</th><th scope="col">{tab === 'vehicles' ? 'EMP record' : 'Location'}</th><th scope="col"><span className="pv-inventory-sr-only">Actions</span></th></tr></thead><tbody>{visible.map(item => {
        const expanded = expandedId === item.id;
        const toggle = () => setExpandedId(expanded ? null : item.id);
        const status = vehicleServiceStatus(item);
        const tank = vehicleTankSummary(item);
        const vehicleExists = groups.vehicles.some(vehicle => vehicle.id === item.fields?.vehicleId);
        return <Fragment key={item.id}><tr className={expanded && tab === 'vehicles' ? 'is-expanded' : ''}><td><div className="pv-inventory-item"><span className="pv-inventory-item-symbol"><Icon name={tab === 'vehicles' ? 'compass' : 'box'} size={18}/></span><div><button type="button" className="pv-inventory-item-name" onClick={tab === 'vehicles' ? toggle : () => onEdit(item)} aria-expanded={tab === 'vehicles' ? expanded : undefined} aria-controls={tab === 'vehicles' && expanded ? `vehicle-${encodeURIComponent(item.id)}` : undefined}>{item.name}</button><span className="pv-inventory-item-type">{categories[item.category]?.subTypes?.[item.subType]?.label || item.subType}{tab === 'vehicles' && item.location ? ` · ${item.location}` : ''}</span>{tab === 'vehicles' && <span className="pv-inventory-item-type">{vehicleSupplyQuantity(item, categories).label} on hand</span>}{tab !== 'vehicles' && item.fields?.partFor && <span className="pv-inventory-item-type">For: {item.fields.partFor}</span>}</div></div></td>
          {tab === 'vehicles' ? <><td><span>{tank.current === null ? 'Not recorded' : `${numberLabel(tank.current)} ${tank.unit || '(unit needed)'}`}{tank.capacity !== null && tank.unit && <small className="pv-inventory-item-type">of {numberLabel(tank.capacity)} {tank.unit}</small>}</span>{tank.percent !== null && <div className="pv-vehicle-tank" role="meter" aria-label={`${item.name} tank level`} aria-valuenow={tank.percent} aria-valuemin={0} aria-valuemax={100} aria-valuetext={`${tank.percent}% full`}><span style={{ width: `${tank.percent}%` }}/></div>}{item.fields?.fuelType && <span className="pv-inventory-item-type">{item.fields.fuelType}</span>}</td><td><span className={`pv-inventory-status ${status.status === 'due' ? 'is-danger' : status.status === 'soon' ? 'is-warning' : 'is-empty'}`}><i/>{status.label}</span><span className="pv-inventory-item-type">{status.nextDate ? dateLabel(status.nextDate) : status.status !== 'unrecorded' ? 'Meter-based reminder' : 'Add a date or meter reading'}</span></td><td><span className="pv-vehicle-emp">{EMP_PROTECTION_OPTIONS.find(([id]) => id === item.fields?.empProtection)?.[1] || 'Not recorded'}</span></td></> : <><td>{vehicleSupplyQuantity(item, categories).label}</td><td><select className="pv-vehicle-assignment" aria-label={`Assign ${item.name} to a vehicle`} disabled={pending === item.id} value={item.fields?.vehicleId || ''} onChange={event => assignVehicle(item, event.target.value)}><option value="">Shared / unassigned</option>{item.fields?.vehicleId && !vehicleExists && <option value={item.fields.vehicleId}>Vehicle unavailable</option>}{groups.vehicles.map(vehicle => <option key={vehicle.id} value={vehicle.id}>{vehicle.name}</option>)}</select></td><td><span className="pv-inventory-location">{item.location || 'Not recorded'}</span></td></>}
          <td><div className="pv-inventory-row-actions"><button type="button" onClick={() => onEdit(item)} aria-label={`Edit ${item.name}`}><Icon name="edit" size={15}/></button><button type="button" onClick={() => setRemoveItem(item)} className="pv-inventory-delete" aria-label={`Remove ${item.name}`}><Icon name="trash" size={15}/></button>{tab === 'vehicles' && <button type="button" aria-label={`${expanded ? 'Hide' : 'Show'} ${item.name} details`} aria-expanded={expanded} onClick={toggle}><Icon name="chevron" size={15}/></button>}</div></td></tr>
          {tab === 'vehicles' && expanded && <tr className="pv-vehicle-detail-row"><td colSpan={5}><VehicleDetails item={item} supplies={[...groups.fuel, ...groups.parts]} categories={categories} onUpdate={onUpdate} onEdit={onEdit} onSupplies={() => changeTab('parts')}/></td></tr>}
        </Fragment>;
      })}</tbody></table></div> : <div className="pv-inventory-empty"><span><Icon name={filtersActive ? 'search' : 'compass'} size={28}/></span><h2>{filtersActive ? 'No matching records' : `No ${labels[tab].toLowerCase()} yet`}</h2><p>{filtersActive ? 'Try another search or clear the filter.' : tab === 'vehicles' ? 'Add a vehicle, then record its fuel, maintenance schedule and emergency equipment.' : 'Add what you have on hand. These records use your existing supplies inventory.'}</p><button type="button" className="pv-inventory-button pv-inventory-button-primary" onClick={filtersActive ? () => { setQuery(''); setFilter('all'); } : () => onAdd(tab === 'fuel' ? 'fuel' : 'vehicles', addType)}>{filtersActive ? 'Clear filters' : `Add ${tab === 'vehicles' ? 'vehicle' : tab === 'fuel' ? 'fuel' : 'part'}`}</button></div>}
      <div className="pv-inventory-footer"><Icon name="box" size={15}/><span>{tab === 'fuel' ? 'Stored fuel is separate from tank readings. Linking a record does not reserve or duplicate stock.' : tab === 'parts' ? 'Parts stay in your inventory. Check compatibility before assigning them to a vehicle.' : 'Service status reflects your recorded dates and meter readings.'}</span>{tab === 'fuel' && onOpenCategory && <button type="button" className="pv-vehicle-text-button" onClick={() => onOpenCategory('fuel')}>Open fuel inventory <Icon name="arrow" size={13}/></button>}</div>
    </div>
  </section>;
}
