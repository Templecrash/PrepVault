import { useEffect, useMemo, useRef, useState } from "react";
import { useDialogFocus } from "./useDialogFocus.js";
import "./inventory.css";

function InventoryIcon({ name, size = 18 }) {
  const paths = {
    search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/></>,
    plus: <path d="M12 5v14M5 12h14"/>,
    minus: <path d="M5 12h14"/>,
    grid: <><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/></>,
    list: <><path d="M8 6h12M8 12h12M8 18h12"/><path d="M4 6h.01M4 12h.01M4 18h.01"/></>,
    scan: <><path d="M8 4H4v4m12-4h4v4M4 16v4h4m12-4v4h-4M7 8v8m3-8v8m4-8v8m3-8v8"/></>,
    box: <><path d="m12 3 9 5-9 5-9-5 9-5ZM3 8v9l9 5 9-5V8M12 13v9M7.5 5.5l9 5"/></>,
    arrow: <path d="M5 12h14m-6-6 6 6-6 6"/>,
    edit: <><path d="m15 5 4 4M4 20l4-1 12-12a2.8 2.8 0 0 0-4-4L4 15v5Z"/></>,
    trash: <><path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    close: <path d="m6 6 12 12M6 18 18 6"/>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.box}</svg>;
}

function quantityOf(item) {
  const value = Number(item.quantity);
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function dateValue(value) {
  if (!value) return null;
  const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value);
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setHours(0, 0, 0, 0);
  return parsed;
}

function conditionOf(item, today) {
  if (quantityOf(item) === 0) return { id: "empty", label: "Out of stock", tone: "empty", detail: "Ready to restock" };
  const expiry = dateValue(item.fields?.expiryDate);
  const refreshed = dateValue(item.fields?.lastRefreshed);
  if (expiry) {
    const days = Math.ceil((expiry - today) / 86400000);
    if (days < 0) return { id: "expired", label: "Expired", tone: "danger", detail: `${Math.abs(days)} days ago` };
    if (days <= 90) return { id: "soon", label: "Expiring soon", tone: "warning", detail: days === 0 ? "Expires today" : `In ${days} days` };
  }
  if (refreshed) {
    const daysLeft = 180 - Math.floor((today - refreshed) / 86400000);
    if (daysLeft <= 30) return { id: "rotation", label: "Refresh due", tone: "warning", detail: daysLeft <= 0 ? "Refresh overdue" : `Refresh in ${daysLeft} days` };
  }
  return { id: "ready", label: "In stock", tone: "ready", detail: expiry ? expiry.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "No expiry recorded" };
}

const STATUS_OPTIONS = [
  ["all", "All statuses"], ["attention", "Needs attention"], ["ready", "In stock"],
  ["maintenance", "Maintenance due"], ["soon", "Expiring soon"], ["expired", "Expired"], ["rotation", "Refresh due"], ["empty", "Out of stock"],
];

function RemoveSupplyDialog({ item, onCancel, onConfirm, fallbackFocusRef }) {
  const dialogRef = useDialogFocus(onCancel);
  useEffect(() => () => {
    // The row no longer exists after removal; return to the inventory search.
    if (document.activeElement === document.body) fallbackFocusRef.current?.focus();
  }, [fallbackFocusRef]);
  return <div className="pv-inventory-modal-backdrop" onClick={onCancel}><div ref={dialogRef} className="pv-inventory-confirm" role="dialog" aria-modal="true" aria-labelledby="remove-supply-title" aria-describedby="remove-supply-description" onClick={event => event.stopPropagation()}><span className="pv-inventory-confirm-icon"><InventoryIcon name="box" size={25}/></span><h2 id="remove-supply-title">Remove this supply?</h2><p id="remove-supply-description"><strong>{item.name}</strong> will be removed from your inventory. You can add it again any time.</p><div><button type="button" className="pv-inventory-button pv-inventory-button-secondary" onClick={onCancel}>Keep supply</button><button type="button" className="pv-inventory-button pv-inventory-button-danger" onClick={onConfirm}>Remove supply</button></div></div></div>;
}

export default function InventoryView({ items = [], categories = {}, onCategory, onAdd, onEdit, onRemove, onQtyChange, onScan, people = 4, alerts = [], initialQuery = "", initialStatus = "all" }) {
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState(initialStatus);
  const [view, setView] = useState("list");
  const [sort, setSort] = useState("name");
  const [pageState, setPageState] = useState({ key: "", number: 1 });
  const [pendingDelete, setPendingDelete] = useState(null);
  const searchInputRef = useRef(null);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayTime = today.getTime();

  const inventory = useMemo(() => items.map(item => { const alert = alerts.find(a => a.id === item.id); const condition = conditionOf(item, todayTime); return { ...item, condition: condition.id === "ready" && alert ? {id:"maintenance",label:"Review due",tone:"warning",detail:alert.al} : condition }; }), [items, todayTime, alerts]);
  const categoryEntries = Object.entries(categories);
  const populated = new Set(items.filter(item => quantityOf(item) > 0 && categories[item.category]).map(item => item.category)).size;
  const attention = inventory.filter(item => item.condition.id !== "ready").length;
  const stocked = inventory.filter(item => quantityOf(item) > 0).length;
  const narrowed = useMemo(() => {
    const term = query.trim().toLowerCase();
    const result = inventory.filter(item => {
      if (category !== "all" && item.category !== category) return false;
      if (status === "attention" && item.condition.id === "ready") return false;
      if (status !== "all" && status !== "attention" && item.condition.id !== status) return false;
      const categoryData = categories[item.category];
      const haystack = [item.name, item.location, item.notes, categoryData?.label, categoryData?.subTypes?.[item.subType]?.label, ...Object.values(item.fields || {})].join(" ").toLowerCase();
      return !term || haystack.includes(term);
    });
    result.sort((a, b) => {
      if (sort === "quantity") return quantityOf(a) - quantityOf(b) || (a.name || "").localeCompare(b.name || "");
      if (sort === "quantity-desc") return quantityOf(b) - quantityOf(a) || (a.name || "").localeCompare(b.name || "");
      if (sort === "expiry") return (dateValue(a.fields?.expiryDate)?.getTime() ?? Infinity) - (dateValue(b.fields?.expiryDate)?.getTime() ?? Infinity) || (a.name || "").localeCompare(b.name || "");
      if (sort === "category") return (categories[a.category]?.label || a.category).localeCompare(categories[b.category]?.label || b.category) || (a.name || "").localeCompare(b.name || "");
      return (a.name || "").localeCompare(b.name || "");
    });
    return result;
  }, [inventory, query, category, status, categories, sort]);
  const filteredCategories = categoryEntries.filter(([key, info]) => {
    if (category !== "all" && key !== category) return false;
    if (status !== "all") return narrowed.some(item => item.category === key);
    return !query.trim() || info.label.toLowerCase().includes(query.trim().toLowerCase()) || narrowed.some(item => item.category === key);
  });
  const pageKey = [query,category,status,sort].join("|");
  const totalPages = Math.max(1, Math.ceil(narrowed.length / 25));
  const currentPage = pageState.key === pageKey ? Math.min(pageState.number, totalPages) : 1;
  const shownItems = narrowed.slice((currentPage - 1) * 25, currentPage * 25);
  const filtersActive = query || category !== "all" || status !== "all";
  const clearFilters = () => { setQuery(""); setCategory("all"); setStatus("all"); };

  return <section className="pv-inventory" aria-labelledby="inventory-title">
    <header className="pv-inventory-heading">
      <div><p className="pv-inventory-eyebrow">KNOW WHAT YOU HAVE</p><h1 id="inventory-title">Your supplies<span>.</span></h1><p className="pv-inventory-intro">A place for everything your household depends on.</p></div>
      <div className="pv-inventory-actions">
        <button type="button" className="pv-inventory-button pv-inventory-button-secondary" onClick={onScan}><InventoryIcon name="scan"/>Scan barcode</button>
        <button type="button" className="pv-inventory-button pv-inventory-button-primary" onClick={() => onAdd?.()}><InventoryIcon name="plus"/>Add supply</button>
      </div>
    </header>

    <div className="pv-inventory-overview">
      <div className="pv-inventory-stat"><span className="pv-inventory-stat-icon"><InventoryIcon name="box" size={22}/></span><div><span className="pv-inventory-stat-value">{stocked}<small>supplies in stock</small></span><p>Across your selected location</p></div></div>
      <div className="pv-inventory-stat"><span className="pv-inventory-stat-icon"><InventoryIcon name="grid" size={22}/></span><div><span className="pv-inventory-stat-value">{populated}<span className="pv-inventory-stat-total"> / {categoryEntries.length}</span><small>categories covered</small></span><p>Planning for {people} {Number(people) === 1 ? "person" : "people"}</p></div></div>
      <button type="button" className={`pv-inventory-stat pv-inventory-stat-action${status === "attention" ? " is-selected" : ""}`} onClick={() => { setStatus(status === "attention" ? "all" : "attention"); setView("list"); }} aria-pressed={status === "attention"}><span className={`pv-inventory-stat-icon${attention ? " is-amber" : ""}`}><InventoryIcon name={attention ? "clock" : "check"} size={22}/></span><div><span className="pv-inventory-stat-value">{attention}<small>need attention</small></span><p>{attention ? "Review expiry, refreshes & stock" : "Everything is looking good"}</p></div><InventoryIcon name="arrow"/></button>
    </div>

    <div className="pv-inventory-workspace">
      <div className="pv-inventory-toolbar">
        <div className="pv-inventory-search"><InventoryIcon name="search"/><input ref={searchInputRef} aria-label="Search inventory" type="search" placeholder="Search supplies, locations or details…" value={query} onChange={event => setQuery(event.target.value)}/></div>
        <div className="pv-inventory-filters">
          <label className="pv-inventory-select"><span className="pv-inventory-sr-only">Filter by category</span><select value={category} onChange={event => setCategory(event.target.value)}><option value="all">All categories</option>{categoryEntries.map(([key, info]) => <option value={key} key={key}>{info.label}</option>)}</select></label>
          <label className="pv-inventory-select"><span className="pv-inventory-sr-only">Filter by status</span><select value={status} onChange={event => setStatus(event.target.value)}>{STATUS_OPTIONS.map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>
          <div className="pv-inventory-view-toggle" role="group" aria-label="Inventory view"><button type="button" aria-label="List view" aria-pressed={view === "list"} onClick={() => setView("list")}><InventoryIcon name="list"/></button><button type="button" aria-label="Category grid view" aria-pressed={view === "grid"} onClick={() => setView("grid")}><InventoryIcon name="grid"/></button></div>
        </div>
      </div>
      <div className="pv-inventory-results-bar"><p aria-live="polite"><strong>{view === "list" ? narrowed.length : filteredCategories.length}</strong> {view === "list" ? (narrowed.length === 1 ? "supply" : "supplies") : "categories"}{filtersActive ? " found" : " in your inventory"}{filtersActive && <button type="button" onClick={clearFilters}>Clear filters <InventoryIcon name="close" size={12}/></button>}</p>{view === "list" && <label className="pv-inventory-sort">Sort by <select aria-label="Sort supplies" value={sort} onChange={event => setSort(event.target.value)}><option value="name">Name, A–Z</option><option value="category">Category</option><option value="expiry">Soonest expiry</option><option value="quantity">Quantity, low to high</option><option value="quantity-desc">Quantity, high to low</option></select></label>}</div>

      {view === "list" ? <>
        {narrowed.length > 0 ? <div className="pv-inventory-table-scroll" tabIndex={0} role="region" aria-label="Supplies table; scroll horizontally for more columns"><table className="pv-inventory-table"><thead><tr><th scope="col">Supply</th><th scope="col">Category</th><th scope="col">Location</th><th scope="col">Quantity</th><th scope="col">Status / expiry</th><th scope="col"><span className="pv-inventory-sr-only">Actions</span></th></tr></thead><tbody>{shownItems.map(item => {
          const categoryData = categories[item.category];
          const subtype = categoryData?.subTypes?.[item.subType];
          return <tr key={item.id}><td><div className="pv-inventory-item"><span className="pv-inventory-item-symbol" aria-hidden="true">{categoryData?.icon || <InventoryIcon name="box"/>}</span><div><button type="button" className="pv-inventory-item-name" onClick={() => onEdit?.(item)}>{item.name}</button><span className="pv-inventory-item-type">{subtype?.label || "Supply"}</span></div></div></td><td><button type="button" className="pv-inventory-category-link" onClick={() => onCategory?.(item.category)}>{categoryData?.label || item.category}<InventoryIcon name="arrow" size={12}/></button></td><td><span className={`pv-inventory-location${!item.location || item.location === "?" ? " is-unset" : ""}`}>{item.location && item.location !== "?" ? item.location : "Not set"}</span></td><td><div className="pv-inventory-quantity"><button type="button" aria-label={`Decrease quantity of ${item.name}`} disabled={quantityOf(item) <= 0} onClick={() => onQtyChange?.(item.id, -1)}><InventoryIcon name="minus" size={12}/></button><span aria-label={`${quantityOf(item)} ${subtype?.unit || "units"}`}>{quantityOf(item).toLocaleString()}</span><button type="button" aria-label={`Increase quantity of ${item.name}`} onClick={() => onQtyChange?.(item.id, 1)}><InventoryIcon name="plus" size={12}/></button></div></td><td><span className={`pv-inventory-status is-${item.condition.tone}`}><i/>{item.condition.label}</span><span className="pv-inventory-expiry">{item.condition.detail}</span></td><td><div className="pv-inventory-row-actions"><button type="button" title="Edit supply" aria-label={`Edit ${item.name}`} onClick={() => onEdit?.(item)}><InventoryIcon name="edit" size={16}/></button><button type="button" className="pv-inventory-delete" title="Remove supply" aria-label={`Remove ${item.name}`} onClick={event => { event.currentTarget.focus(); setPendingDelete(item); }}><InventoryIcon name="trash" size={16}/></button></div></td></tr>;
        })}</tbody></table></div> : <div className="pv-inventory-empty"><span><InventoryIcon name={filtersActive ? "search" : "box"} size={30}/></span><h2>{filtersActive ? "No supplies match" : "Make room for peace of mind."}</h2><p>{filtersActive ? "Try a different search or clear your filters." : "Start with your water, food and everyday essentials. Add your first supply to build a clearer picture."}</p><button type="button" className="pv-inventory-button pv-inventory-button-primary" onClick={filtersActive ? clearFilters : () => onAdd?.()}>{filtersActive ? "Clear filters" : "Add your first supply"}</button></div>}
      </> : <div className="pv-inventory-category-grid">{filteredCategories.map(([key, info]) => {
        const categoryItems = inventory.filter(item => item.category === key);
        const visibleItems = narrowed.filter(item => item.category === key);
        const categoryAttention = categoryItems.filter(item => item.condition.id !== "ready").length;
        const types = Object.keys(info.subTypes || {}).length;
        const covered = new Set(categoryItems.filter(item => quantityOf(item) > 0).map(item => item.subType)).size;
        return <button type="button" className="pv-inventory-category-card" key={key} onClick={() => onCategory?.(key)} aria-label={`View ${info.label}: ${categoryItems.length} supplies`}><div className="pv-inventory-category-card-top"><span aria-hidden="true">{info.icon || <InventoryIcon name="box" size={24}/>}</span><InventoryIcon name="arrow"/></div><h2>{info.label}</h2><p>{info.desc || "Keep track of your supplies."}</p><div className="pv-inventory-category-meter" aria-label={`${covered} of ${types} supply types stocked`}><span style={{ width: `${Math.min(100, types ? covered / types * 100 : 0)}%` }}/></div><footer><span><strong>{filtersActive ? visibleItems.length : categoryItems.length}</strong> {filtersActive ? "matching" : "supplies"}</span><span className={categoryAttention ? "pv-inventory-category-attention" : ""}>{categoryAttention ? `${categoryAttention} to review` : `${covered}/${types} types`}</span></footer></button>;
      })}{filteredCategories.length === 0 && <div className="pv-inventory-empty"><h2>No categories match</h2><p>Clear your filters to see every category.</p><button type="button" className="pv-inventory-button pv-inventory-button-primary" onClick={clearFilters}>Clear filters</button></div>}</div>}
      <div className="pv-inventory-pagination">{view === "list" && totalPages > 1 && <><span>Page {currentPage} of {totalPages} · {narrowed.length} supplies</span><button disabled={currentPage === 1} onClick={() => setPageState({key: pageKey, number: currentPage - 1})}>Previous</button><button disabled={currentPage === totalPages} onClick={() => setPageState({key: pageKey, number: currentPage + 1})}>Next</button></>}</div><div className="pv-inventory-footer"><InventoryIcon name="check" size={14}/><span>Small steps today. More confidence tomorrow.</span></div>
    </div>

    {pendingDelete && <RemoveSupplyDialog item={pendingDelete} onCancel={() => setPendingDelete(null)} onConfirm={() => { onRemove?.(pendingDelete.id); setPendingDelete(null); }} fallbackFocusRef={searchInputRef}/>}
  </section>;
}
