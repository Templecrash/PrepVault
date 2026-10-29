import FoodWaterInfo from "./FoodWaterInfo.jsx";
import InventoryRecommendations from "./InventoryRecommendations.jsx";
import { buildEssentialPlanning } from './essential-planning.js';
import { Fragment, useId, useMemo, useState } from 'react';
import { Icon } from './brand.jsx';
import './inventory.css';
import './category-detail.css';

const fieldValue = value => typeof value === 'boolean' ? value ? 'Yes' : 'No' : typeof value === 'object' ? JSON.stringify(value) : String(value);
const hasValue = value => value !== null && value !== undefined && value !== '';
const byName = (a, b) => String(a.name || '').localeCompare(String(b.name || ''));

export default function CategoryDetailView({ catKey, items = [], people, climate, onBack, onAdd, onRemove, onEdit, onQtyChange,
  categories, climates, fieldMeta = {}, refreshStatus, expiryStatus, parseVolMl, standalone = false, planningOverride, onPeople, onRationing, onScan, recommendationPeopleCount = 0, dailyCalTarget = 2000, waterGalPerPerson = 1, propertyId, alerts = [], recommendationActions }) {
  const cat = categories[catKey];
  const ci = useMemo(() => items.filter(item => item.category === catKey), [items, catKey]);
  const p = people || 4;
  const clim = climates[climate] || climates.temperate;
  const firewoodMod = clim.firewoodMod || 1;
  const [query, setQuery] = useState('');
  const [type, setType] = useState('all');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState('name');
  const [expandedId, setExpandedId] = useState(null);
  const id = useId();

  // Food and water share the active dependant and rationing assumptions even
  // when this detail view is opened without a parent planning override.
  const legacyCalc = useMemo(() => {
    if (catKey === "food" || catKey === "water") {
      return buildEssentialPlanning(catKey, ci, recommendationPeopleCount, dailyCalTarget, waterGalPerPerson);
    }
    if (catKey === "fuel") {
      const gasGals = ci.filter((i) => i.subType === "gasoline").reduce((s, i) => s + (i.quantity || 0) * (parseFloat(i.fields?.fuelGallons || i.fields?.gallons) || 5), 0);
      const propTanks = ci.filter((i) => i.subType === "propane").reduce((s, i) => s + (i.quantity || 0), 0);
      const propGals = propTanks * 4.6;
      const genHrs = gasGals * 5.5;
      const heatHrs = propGals * 5.1;
      const cookHrs = propGals * 11;
      return {
        title: "Fuel Conversion",
        icon: "⛽",
        color: genHrs >= 48 ? "#22c55e" : genHrs >= 12 ? "#f59e0b" : "#ef4444",
        bigNum: genHrs.toFixed(1),
        bigUnit: "hrs gen",
        rows: [
          { label: "Gasoline stored", value: gasGals.toFixed(1) + " gallons" },
          { label: "Generator runtime", value: genHrs.toFixed(1) + " hours", note: gasGals.toFixed(1) + " gal × 5.5 hrs/gal" },
          { label: "Propane tanks", value: propTanks + " tanks (" + propGals.toFixed(1) + " gal)" },
          { label: "Propane → heat", value: heatHrs.toFixed(1) + " hours", note: propGals.toFixed(1) + " gal × 5.1 hrs/gal (18k BTU)" },
          { label: "Propane → cooking", value: cookHrs.toFixed(0) + " hours", note: propGals.toFixed(1) + " gal × 11 hrs/gal" },
          { label: "Power autonomy", value: genHrs.toFixed(1) + " hrs at 1kW load", highlight: true },
        ]
      };
    }
    if (catKey === "firewood") {
      const cords = ci.reduce((s, i) => s + (parseFloat(i.fields?.cords) || 0) * (i.quantity || 1), 0);
      const heatDays = cords * 30;
      const fwMod = Math.max(firewoodMod, 0.1);
      const adjusted = heatDays / fwMod;
      return {
        title: "Heat Continuity (Wood)",
        icon: "🔥",
        color: adjusted >= 60 ? "#22c55e" : adjusted >= 14 ? "#f59e0b" : "#ef4444",
        bigNum: adjusted.toFixed(1),
        bigUnit: "days",
        rows: [
          { label: "Firewood stored", value: cords.toFixed(2) + " cords" },
          { label: "Burn rate", value: "~1 cord per 30 days" },
          { label: "Base heating days", value: heatDays.toFixed(1) + " days", note: cords.toFixed(2) + " × 30" },
          { label: "Climate modifier", value: fwMod + "×", note: clim.label || climate },
          { label: "Adjusted continuity", value: adjusted.toFixed(1) + " days", note: heatDays.toFixed(1) + " ÷ " + fwMod, highlight: true },
        ]
      };
    }
    if (catKey === "batteries") {
      const total = ci.reduce((s, i) => s + (i.quantity || 0), 0);
      const rechargeables = ci.filter((i) => i.fields?.rechargeable === "Yes").reduce((s, i) => s + (i.quantity || 0), 0);
      const lightHrs = total * 20;
      const radioHrs = total * 8;
      return {
        title: "Battery Capacity",
        icon: "🔋",
        color: total >= 50 ? "#22c55e" : total >= 20 ? "#f59e0b" : "#ef4444",
        bigNum: total,
        bigUnit: "cells",
        rows: [
          { label: "Total battery cells", value: total },
          { label: "Rechargeable", value: rechargeables + " (" + (total > 0 ? Math.round(rechargeables / total * 100) : 0) + "%)" },
          { label: "Flashlight runtime", value: lightHrs.toLocaleString() + " hours", note: total + " × ~20 hrs/cell" },
          { label: "Radio runtime", value: radioHrs.toLocaleString() + " hours", note: total + " × ~8 hrs/cell" },
          { label: "Equivalent energy", value: (total * 3).toLocaleString() + " Wh", note: total + " × ~3 Wh avg", highlight: true },
        ]
      };
    }
    if (catKey === "medical") {
      const totalItems = ci.reduce((s, i) => s + (i.quantity || 0), 0);
      const expiring = ci.filter((i) => { if (!i.fields?.expiryDate) return false; const d = new Date(i.fields.expiryDate); return d - new Date() < 90 * 24 * 3600 * 1000 && d > new Date(); }).length;
      const expired = ci.filter((i) => { if (!i.fields?.expiryDate) return false; return new Date(i.fields.expiryDate) < new Date(); }).length;
      const subtypesCovered = new Set(ci.map((i) => i.subType)).size;
      const totalSubtypes = Object.keys(cat.subTypes).length;
      return {
        title: "Medical Readiness",
        icon: "💊",
        color: subtypesCovered / totalSubtypes >= 0.6 ? "#22c55e" : subtypesCovered / totalSubtypes >= 0.3 ? "#f59e0b" : "#ef4444",
        bigNum: Math.round(subtypesCovered / totalSubtypes * 100),
        bigUnit: "% coverage",
        rows: [
          { label: "Total medical items", value: totalItems },
          { label: "Categories covered", value: subtypesCovered + " / " + totalSubtypes },
          { label: "Expiring within 90 days", value: expiring, note: expiring > 0 ? "⚠ Check soon" : "None" },
          { label: "Already expired", value: expired, note: expired > 0 ? "🔴 Replace" : "None" },
          { label: "People covered", value: p + " people", highlight: true },
        ]
      };
    }
    if (catKey === "electronics" || catKey === "comms") {
      const channels = new Set();
      ci.forEach((i) => {
        if (i.subType === "satPhone") channels.add("Satellite");
        if (i.subType === "cellPhone") channels.add("Cellular");
        if (i.subType === "radio") channels.add("HAM/GMRS");
        if (i.subType === "weatherRadio") channels.add("Weather Band");
      });
      if (catKey === "comms") items.filter((i) => i.category === "comms").forEach(() => channels.add("HAM/GMRS"));
      const totalDevices = ci.reduce((s, i) => s + (i.quantity || 0), 0);
      return {
        title: "Communication Redundancy",
        icon: "📡",
        color: channels.size >= 3 ? "#22c55e" : channels.size >= 2 ? "#f59e0b" : "#ef4444",
        bigNum: channels.size,
        bigUnit: "channels",
        rows: [
          { label: "Total devices", value: totalDevices },
          { label: "Unique channels", value: channels.size, highlight: true },
          ...([...channels].map((ch) => ({ label: ch, value: "✓", note: "Active" }))),
          { label: "Redundancy level", value: channels.size >= 3 ? "Strong" : channels.size >= 2 ? "Adequate" : "Vulnerable", note: channels.size < 2 ? "Add backup channel" : "" },
        ]
      };
    }
    if (catKey === "firearms" || catKey === "defense") {
      const totalQty = ci.reduce((s, i) => s + (i.quantity || 0), 0);
      const calibers = new Set(ci.map((i) => i.fields?.caliber).filter(Boolean));
      return {
        title: "Defense Inventory",
        icon: "🛡️",
        color: totalQty >= 3 ? "#22c55e" : totalQty >= 1 ? "#f59e0b" : "#ef4444",
        bigNum: totalQty,
        bigUnit: "items",
        rows: [
          { label: "Total items", value: totalQty },
          { label: "Unique calibers", value: calibers.size || "N/A" },
          { label: "People to arm", value: p },
          { label: "Ratio", value: totalQty > 0 ? (totalQty / p).toFixed(1) + " per person" : "0", highlight: true },
        ]
      };
    }
    if (catKey === "alcohol") {
      const totalVol = ci.reduce((s, i) => {
        const vol = parseVolMl(i.fields?.volume || i.fields?.alcVolume);
        return s + vol * (i.quantity || 1);
      }, 0);
      const highAbv = ci.filter((i) => parseFloat(i.fields?.alcABV || i.fields?.abv) >= 60).reduce((s, i) => s + (i.quantity || 0), 0);
      return {
        title: "Barter & Morale Reserve",
        icon: "🥃",
        color: ci.length >= 5 ? "#22c55e" : ci.length >= 2 ? "#f59e0b" : "#ef4444",
        bigNum: (totalVol / 1000).toFixed(1),
        bigUnit: "liters",
        rows: [
          { label: "Total volume", value: (totalVol / 1000).toFixed(1) + " L (" + Math.round(totalVol) + " mL)" },
          { label: "Unique products", value: ci.length },
          { label: "High-proof (≥60% ABV)", value: highAbv + " items", note: "Dual-use: barter + disinfectant" },
          { label: "Barter value", value: ci.length >= 5 ? "High" : ci.length >= 2 ? "Moderate" : "Low", highlight: true },
        ]
      };
    }
    if (catKey === "kids") {
      const diapers = ci.filter((i) => i.subType === "diapers").reduce((s, i) => s + (i.quantity || 0), 0);
      const formula = ci.filter((i) => i.subType === "formula").reduce((s, i) => s + (i.quantity || 0), 0);
      const wipes = ci.filter((i) => i.subType === "wipes").reduce((s, i) => s + (i.quantity || 0), 0);
      const diaperDays = diapers / 8; // ~8 diapers/day
      const formulaDays = formula * 3; // ~1 can per 3 days
      return {
        title: "Child Continuity",
        icon: "👶",
        color: Math.min(diaperDays, formulaDays) >= 14 ? "#22c55e" : Math.min(diaperDays, formulaDays) >= 3 ? "#f59e0b" : "#ef4444",
        bigNum: Math.min(diaperDays, formulaDays).toFixed(1),
        bigUnit: "days",
        rows: [
          { label: "Diapers", value: diapers + " units" },
          { label: "Diaper days", value: diaperDays.toFixed(1) + " days", note: diapers + " ÷ 8/day" },
          { label: "Formula", value: formula + " cans" },
          { label: "Formula days", value: formulaDays.toFixed(1) + " days", note: formula + " × 3 days/can" },
          { label: "Wipes", value: wipes + " packs" },
          { label: "Limiting factor", value: diaperDays < formulaDays ? "Diapers" : "Formula", note: "Shortest supply sets the ceiling", highlight: true },
        ]
      };
    }
    if (catKey === "vehicles") {
      const totalVeh = ci.reduce((s, i) => s + (i.quantity || 0), 0);
      const needService = ci.filter((i) => {
        if (!i.fields?.nextService) return false;
        return new Date(i.fields.nextService) < new Date();
      }).length;
      return {
        title: "Vehicle Readiness",
        icon: "🚗",
        color: needService === 0 && totalVeh > 0 ? "#22c55e" : needService > 0 ? "#f59e0b" : "#ef4444",
        bigNum: totalVeh,
        bigUnit: "vehicles",
        rows: [
          { label: "Total vehicles", value: totalVeh },
          { label: "Overdue for service", value: needService, note: needService > 0 ? "⚠ Schedule maintenance" : "All current" },
          { label: "People per vehicle", value: totalVeh > 0 ? (p / totalVeh).toFixed(1) : "N/A" },
          { label: "Fleet status", value: needService === 0 ? "Ready" : "Needs attention", highlight: true },
        ]
      };
    }
    if (catKey === "nbc") {
      const masks = ci.filter((i) => i.subType === "gasMask").reduce((s, i) => s + (i.quantity || 0), 0);
      const filters = ci.filter((i) => i.subType === "filters").reduce((s, i) => s + (i.quantity || 0), 0);
      const ki = ci.filter((i) => i.subType === "kiTablets").reduce((s, i) => s + (i.quantity || 0), 0);
      const kiDays = ki / Math.max(p, 1); // 1 tab/person/day for 14 days
      const suits = ci.filter((i) => i.subType === "hazmatSuit" || i.subType === "tyvekSuit").reduce((s, i) => s + (i.quantity || 0), 0);
      return {
        title: "CBRN Protection",
        icon: "☢️",
        color: masks >= p && filters > 0 ? "#22c55e" : masks > 0 ? "#f59e0b" : "#ef4444",
        bigNum: Math.round(masks / Math.max(p, 1) * 100),
        bigUnit: "% covered",
        rows: [
          { label: "Gas masks", value: masks },
          { label: "People", value: p },
          { label: "Mask coverage", value: masks >= p ? "Full" : masks + "/" + p + " covered", note: masks >= p ? "1+ per person" : "Need " + (p - masks) + " more", highlight: masks < p },
          { label: "Replacement filters", value: filters },
          { label: "KI tablets", value: ki + " tabs → " + kiDays.toFixed(0) + " doses/person" },
          { label: "Protective suits", value: suits },
          { label: "Protection level", value: masks >= p && filters > 0 && ki >= p * 14 ? "Full" : "Partial", highlight: true },
        ]
      };
    }
    if (catKey === "fishing") {
      const rods = ci.filter((i) => i.subType === "rodReel").reduce((s, i) => s + (i.quantity || 0), 0);
      const tackle = ci.filter((i) => ["hooks", "lures", "line", "bait"].includes(i.subType)).reduce((s, i) => s + (i.quantity || 0), 0);
      const nets = ci.filter((i) => i.subType === "net" || i.subType === "fishTrap").reduce((s, i) => s + (i.quantity || 0), 0);
      return {
        title: "Protein Production",
        icon: "🐟",
        color: rods > 0 && tackle > 0 ? "#22c55e" : rods > 0 ? "#f59e0b" : "#ef4444",
        bigNum: rods + nets,
        bigUnit: "sources",
        rows: [
          { label: "Rods & reels", value: rods },
          { label: "Tackle items", value: tackle + " (hooks, lures, line, bait)" },
          { label: "Nets & traps", value: nets, note: nets > 0 ? "Passive protein collection" : "None — active fishing only" },
          { label: "Est. yield", value: rods > 0 ? "~1-2 lbs/day active" : "0", note: nets > 0 ? "+ passive net yield" : "" },
          { label: "Sustainable protein", value: rods + nets > 0 ? "Yes" : "No", highlight: true },
        ]
      };
    }
    if (catKey === "boat") {
      const vessels = ci.filter((i) => i.subType === "vessel").reduce((s, i) => s + (i.quantity || 0), 0);
      const motors = ci.filter((i) => i.subType === "outboardMotor").reduce((s, i) => s + (i.quantity || 0), 0);
      const pfd = ci.filter((i) => i.subType === "lifeJacket").reduce((s, i) => s + (i.quantity || 0), 0);
      return {
        title: "Marine Readiness",
        icon: "⛵",
        color: vessels > 0 && pfd >= p ? "#22c55e" : vessels > 0 ? "#f59e0b" : "#ef4444",
        bigNum: vessels,
        bigUnit: "vessels",
        rows: [
          { label: "Vessels", value: vessels },
          { label: "Motors", value: motors },
          { label: "PFDs", value: pfd },
          { label: "PFD coverage", value: pfd >= p ? "Full (" + pfd + "/" + p + ")" : pfd + "/" + p + " — need " + (p - pfd) + " more", highlight: pfd < p },
          { label: "Water transport", value: vessels > 0 ? "Available" : "None", highlight: true },
        ]
      };
    }
    if (catKey === "farm") {
      const seeds = ci.filter((i) => i.subType === "seedPacket").reduce((s, i) => s + (i.quantity || 0), 0);
      const crops = new Set(ci.filter((i) => i.subType === "seedPacket").map((i) => i.fields?.cropName)).size;
      const animals = ci.filter((i) => ["chickens", "livestock"].includes(i.subType)).reduce((s, i) => s + (i.quantity || 0), 0);
      return {
        title: "Food Production",
        icon: "🌾",
        color: crops >= 5 ? "#22c55e" : crops >= 2 ? "#f59e0b" : "#ef4444",
        bigNum: crops,
        bigUnit: "crops",
        rows: [
          { label: "Seed packets", value: seeds },
          { label: "Crop varieties", value: crops },
          { label: "Livestock/poultry", value: animals || "None" },
          { label: "People to feed", value: p },
          { label: "Self-sufficiency", value: crops >= 8 && animals > 0 ? "High" : crops >= 4 ? "Partial" : "Low", highlight: true },
        ]
      };
    }
    return null;
  }, [ci, catKey, p, climate, items, firewoodMod, clim.label, cat.subTypes, parseVolMl, recommendationPeopleCount, dailyCalTarget, waterGalPerPerson]);
  const calc = planningOverride === undefined ? legacyCalc : planningOverride;
  const addLabel = standalone && catKey === 'power' ? 'Add power equipment' : standalone && ['food', 'water'].includes(catKey) ? `Add ${catKey}` : 'Add supply';

  const inventory = ci.map(item => ({ item,
    expiry: item.fields?.expiryDate ? expiryStatus(item.fields.expiryDate) : null,
    refresh: item.fields?.lastRefreshed ? refreshStatus(item.fields.lastRefreshed) : null,
  }));
  const subtypeEntries = Object.entries(cat.subTypes);
  const recordedTypes = new Set(ci.map(item => item.subType));
  const quantity = ci.reduce((sum, item) => sum + (item.quantity || 0), 0);
  const filtersActive = Boolean(query.trim()) || type !== 'all' || status !== 'all';
  const clearFilters = () => { setQuery(''); setType('all'); setStatus('all'); };
  const visible = inventory.filter(({ item, expiry, refresh }) => {
    if (type !== 'all' && item.subType !== type) return false;
    if (status === 'attention' && !expiry?.u && !refresh?.u) return false;
    if (status === 'empty' && Number(item.quantity) > 0) return false;
    if (status === 'stocked' && !(Number(item.quantity) > 0)) return false;
    return [item.name, item.location, cat.subTypes[item.subType]?.label, item.notes, ...Object.values(item.fields || {}).filter(hasValue).map(fieldValue)].join(' ').toLowerCase().includes(query.trim().toLowerCase());
  }).sort((a, b) => {
    if (sort === 'quantity') return (a.item.quantity || 0) - (b.item.quantity || 0) || byName(a.item, b.item);
    if (sort === 'type') return String(cat.subTypes[a.item.subType]?.label || a.item.subType).localeCompare(String(cat.subTypes[b.item.subType]?.label || b.item.subType)) || byName(a.item, b.item);
    if (sort === 'attention') return Number(Boolean(b.expiry?.u || b.refresh?.u)) - Number(Boolean(a.expiry?.u || a.refresh?.u)) || byName(a.item, b.item);
    return byName(a.item, b.item);
  });

  return <section className="pv-inventory pv-category-detail" aria-labelledby={`${id}-title`}>
    {!standalone && <button type="button" className="pv-category-back" onClick={onBack}><Icon name="arrow" size={16}/>Back to supplies</button>}
    <header className="pv-inventory-heading">
      <div><p className="pv-inventory-eyebrow">{standalone ? 'YOUR EVERYDAY ESSENTIALS' : 'YOUR SUPPLIES, IN DETAIL'}</p><h1 id={`${id}-title`}>{cat.label}<span>.</span></h1><p className="pv-inventory-intro">{cat.desc}</p></div>
      <div className="pv-inventory-actions">{onRationing && <button type="button" className="pv-inventory-button pv-inventory-button-secondary" onClick={onRationing}><Icon name="ration" size={18}/>Rationing</button>}{onScan && <button type="button" className="pv-inventory-button pv-inventory-button-secondary" onClick={onScan}><Icon name="scan" size={18}/>Scan barcode</button>}<button type="button" className="pv-inventory-button pv-inventory-button-primary" onClick={() => onAdd(catKey)}><Icon name="plus" size={18}/>{addLabel}</button></div>
    </header>
    {onPeople && <div className="pv-category-people"><span>Food and water count only dependants selected in Your People.</span><FoodWaterInfo /><button type="button" className="pv-inventory-button pv-inventory-button-secondary" onClick={onPeople}><Icon name="users" size={16}/>Manage dependants</button></div>}
    <div className="pv-inventory-overview">
      <button type="button" className="pv-inventory-stat pv-inventory-stat-action" aria-pressed={!filtersActive} onClick={clearFilters}><span className="pv-inventory-stat-icon"><Icon name="box" size={22}/></span><div><span className="pv-inventory-stat-value">{ci.length}<small>recorded supplies</small></span><p>{quantity} total quantity recorded</p></div><Icon name="arrow" size={18}/></button>
      <div className="pv-inventory-stat"><span className="pv-inventory-stat-icon"><Icon name="list" size={22}/></span><div><span className="pv-inventory-stat-value">{subtypeEntries.filter(([key]) => recordedTypes.has(key)).length}<small>of {subtypeEntries.length} types recorded</small></span><p>Explore the full category below</p></div></div>
      <div className="pv-inventory-stat"><span className="pv-inventory-stat-icon"><Icon name={calc ? 'compass' : 'users'} size={22}/></span><div><span className="pv-inventory-stat-value">{calc ? calc.bigNum : p}<small>{calc ? calc.bigUnit : 'people in your plan'}</small></span><p>{calc ? calc.title : `${clim.label || climate || 'Temperate'} climate`}</p></div></div>
    </div>

    {calc && <details className="pv-category-analysis">
      <summary><span className="pv-category-summary-icon"><Icon name="compass" size={19}/></span><span><strong>{calc.title}</strong><small>{calc.summary || <>{p} people · {climate || 'temperate'} climate · {quantity} items logged</>}</small></span><span className="pv-category-summary-action">View calculations<Icon name="chevron" size={16}/></span></summary>
      <div className="pv-category-analysis-body"><table><caption className="pv-inventory-sr-only">{calc.title} calculations</caption><thead><tr><th scope="col">Measure</th><th scope="col">Basis</th><th scope="col">Result</th></tr></thead><tbody>{calc.rows.map((row, index) => <tr key={`${row.label}-${index}`} className={row.highlight ? 'is-highlighted' : undefined}><th scope="row">{row.label}</th><td>{row.note || '—'}</td><td>{row.value}</td></tr>)}</tbody></table></div>
    </details>}

    <InventoryRecommendations items={ci} categories={categories} categoryKey={catKey} propertyId={propertyId} peopleCount={recommendationPeopleCount} dailyCalTarget={dailyCalTarget} waterGalPerPerson={waterGalPerPerson} alerts={alerts} onAdd={onAdd} onEdit={onEdit} onManagePeople={onPeople} onRationing={onRationing} actions={recommendationActions}/>

    <div className="pv-inventory-workspace">
      <div className="pv-inventory-toolbar">
        <div className="pv-inventory-search"><Icon name="search" size={18}/><input type="search" aria-label={`Search ${cat.label.toLowerCase()} supplies`} placeholder="Search names, locations or details…" value={query} onChange={event => setQuery(event.target.value)}/></div>
        <div className="pv-inventory-filters">
          <label className="pv-inventory-select"><span className="pv-inventory-sr-only">Supply type</span><select value={type} onChange={event => setType(event.target.value)}><option value="all">All types</option>{subtypeEntries.map(([key, sub]) => <option key={key} value={key}>{sub.label}</option>)}</select></label>
          <label className="pv-inventory-select"><span className="pv-inventory-sr-only">Supply status</span><select value={status} onChange={event => setStatus(event.target.value)}><option value="all">All statuses</option><option value="attention">Needs review</option><option value="stocked">In stock</option><option value="empty">Out of stock</option></select></label>
        </div>
      </div>
      <div className="pv-inventory-results-bar"><p aria-live="polite"><strong>{visible.length}</strong> {visible.length === 1 ? 'supply' : 'supplies'}{filtersActive ? ' found' : ' in this category'}{filtersActive && <button type="button" onClick={clearFilters}>Clear filters <Icon name="close" size={12}/></button>}</p><label className="pv-inventory-sort">Sort by <select aria-label="Sort category supplies" value={sort} onChange={event => setSort(event.target.value)}><option value="name">Name, A–Z</option><option value="type">Type</option><option value="quantity">Quantity, low first</option><option value="attention">Needs review first</option></select></label></div>
      {visible.length ? <table className="pv-inventory-table pv-category-table">
        <thead><tr><th scope="col">Supply</th><th scope="col">Location</th><th scope="col">Quantity</th><th scope="col">Review</th><th scope="col"><span className="pv-inventory-sr-only">Actions</span></th></tr></thead>
        <tbody>{visible.map(({ item, expiry, refresh }) => {
          const expanded = expandedId === item.id;
          const toggle = () => setExpandedId(expanded ? null : item.id);
          const regionId = `${id}-${item.id}`;
          const sub = cat.subTypes[item.subType];
          const fields = Object.entries(item.fields || {}).filter(([, value]) => hasValue(value));
          return <Fragment key={item.id}>
            <tr className={`pv-category-row${expanded ? ' is-expanded' : ''}`}>
              <td className="pv-category-item"><div className="pv-inventory-item"><span className="pv-inventory-item-symbol"><Icon name="box" size={19}/></span><div><button type="button" className="pv-inventory-item-name" onClick={toggle} aria-expanded={expanded} aria-controls={expanded ? regionId : undefined}>{item.name}</button><span className="pv-inventory-item-type">{sub?.label || item.subType || 'Other'}</span></div></div></td>
              <td className="pv-category-location" data-label="Location">{item.location || 'Not recorded'}</td>
              <td className="pv-category-quantity" data-label="Quantity"><div className="pv-category-quantity-wrap"><div className="pv-inventory-quantity"><button type="button" aria-label={`Decrease ${item.name} quantity`} disabled={!onQtyChange || !(Number(item.quantity) > 0)} onClick={() => onQtyChange?.(item.id, -1)}>−</button><span>{item.quantity ?? 0}</span><button type="button" aria-label={`Increase ${item.name} quantity`} disabled={!onQtyChange} onClick={() => onQtyChange?.(item.id, 1)}><Icon name="plus" size={12}/></button></div>{sub?.unit && <small>{sub.unit}</small>}</div></td>
              <td className="pv-category-review" data-label="Review"><div>{expiry && <span className={expiry.u ? 'needs-review' : undefined}>Expiry · {expiry.l}</span>}{refresh && <span className={refresh.u ? 'needs-review' : undefined}>Refresh · {refresh.l}</span>}{!expiry && !refresh && <span>No dates recorded</span>}</div></td>
              <td className="pv-category-actions"><div><button type="button" aria-label={`Edit ${item.name}`} onClick={() => onEdit(item)}><Icon name="edit" size={16}/></button><button type="button" aria-label={`Remove ${item.name}`} onClick={() => onRemove(item.id)}><Icon name="trash" size={16}/></button><button type="button" className="pv-category-toggle" onClick={toggle} aria-label={`${expanded ? 'Hide' : 'Show'} ${item.name} details`} aria-expanded={expanded} aria-controls={expanded ? regionId : undefined}><Icon name="chevron" size={16}/></button></div></td>
            </tr>
            {expanded && <tr className="pv-category-detail-row"><td colSpan={5}><div className="pv-category-record" id={regionId} role="region" aria-label={`${item.name} details`}><div className="pv-category-record-heading"><h2>Supply details</h2><button type="button" onClick={() => onEdit(item)}>Edit details<Icon name="edit" size={13}/></button></div>{fields.length ? <dl>{fields.map(([key, value]) => <div key={key}><dt>{fieldMeta[key]?.label || key}</dt><dd>{fieldValue(value)}</dd></div>)}</dl> : <p>No additional fields recorded for this supply.</p>}{item.notes && <div className="pv-category-record-notes"><h3>Notes</h3><p>{item.notes}</p></div>}</div></td></tr>}
          </Fragment>;
        })}</tbody>
      </table> : <div className="pv-inventory-empty"><span><Icon name={filtersActive ? 'search' : 'box'} size={30}/></span><h2>{filtersActive ? 'No supplies match' : `No ${cat.label.toLowerCase()} supplies yet`}</h2><p>{filtersActive ? 'Try another search or clear your filters to see this category.' : `Add your first ${cat.label.toLowerCase()} supply to start tracking it here.`}</p><button type="button" className="pv-inventory-button pv-inventory-button-primary" onClick={filtersActive ? clearFilters : () => onAdd(catKey)}>{filtersActive ? 'Clear filters' : standalone ? addLabel : 'Add your first supply'}</button></div>}
      <div className="pv-inventory-footer"><Icon name="box" size={15}/><span>Select a supply to see every recorded field. Quantities and edits update your inventory.</span></div>
    </div>

    <details className="pv-category-types">
      <summary><span><strong>Explore this category</strong><small>All {subtypeEntries.length} supply types, including those you have not recorded yet</small></span><Icon name="chevron" size={17}/></summary>
      <div className="pv-category-type-list">{subtypeEntries.map(([key, sub]) => {
        const supplies = ci.filter(item => item.subType === key);
        const total = supplies.reduce((sum, item) => sum + item.quantity, 0);
        return <div className="pv-category-type" key={key}><span>{sub.label}</span><small>{supplies.length ? `${total} ${sub.unit || ''}` : 'None recorded'}</small><button type="button" onClick={() => { if (supplies.length) { setQuery(''); setStatus('all'); setType(key); } else onAdd(catKey, key); }}>{supplies.length ? 'View supplies' : 'Add supply'}<Icon name={supplies.length ? 'arrow' : 'plus'} size={14}/></button></div>;
      })}</div>
    </details>
  </section>;
}
