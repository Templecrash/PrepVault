import { useMemo, useState } from "react";
import { Icon } from "./brand.jsx";
import FoodWaterInfo from "./FoodWaterInfo.jsx";
import OverviewInsights from "./OverviewInsights.jsx";
import LocationView from "./LocationView.jsx";
import OverviewSurveillance from "./OverviewSurveillance.jsx";
import { summarizeOverviewInventory } from "./overview-metrics.js";
import { computeEssentialCoverage } from "./essential-coverage.js";
import "./overview.css";

const ESSENTIALS = [
  { key: "water", icon: "water", name: "Water", tone: "blue" },
  { key: "food", icon: "leaf", name: "Food", tone: "green" },
  { key: "medical", icon: "plus", name: "Medical", tone: "rose" },
  { key: "power", icon: "bolt", name: "Power", tone: "amber" },
];

function EssentialCoverage({ category, stats, coverage, icon, tone, onClick }) {
  return <button type="button" className={`pv-essential pv-tone-${tone}`} onClick={onClick}>
    <span className="pv-essential-top"><span className="pv-icon-tile"><Icon name={icon} size={19} /></span><span>{category?.label}</span><Icon name="arrow" size={15} /></span>
    <span className="pv-essential-count">{coverage.days == null ? '—' : coverage.days.toLocaleString()}<span>{coverage.days === 1 ? 'full day' : 'full days'}</span></span>
    <span className="pv-essential-basis">{coverage.basis}</span>
    <span className="pv-essential-detail">{coverage.detail}</span>
    <span className="pv-essential-foot">{stats.recordedEntries} {stats.recordedEntries === 1 ? 'entry' : 'entries'} · {stats.stockedTypes}/{stats.totalTypes} types in stock</span>
  </button>;
}

export default function Overview({ items = [], categories = {}, people = 0, property, alerts = [], onNavigate, onCategory, onAdd, onCrisis, onScan, members = [], rationPeople = [], dailyCalTarget = 2000, waterGalPerPerson = 1 }) {
  const [showAllPriorities, setShowAllPriorities] = useState(false);
  const coverage = useMemo(() => computeEssentialCoverage(items, rationPeople.length, dailyCalTarget, waterGalPerPerson), [items, rationPeople.length, dailyCalTarget, waterGalPerPerson]);
  const overview = useMemo(() => {
    const categoryKeys = Object.keys(categories);
    const summary = summarizeOverviewInventory(items, categories);
    const itemIds = new Set(items.map(item => item.id));
    const relevantAlerts = alerts.filter(alert => !alert.id || itemIds.has(alert.id));
    const uniqueAlerts = [...new Map(relevantAlerts.map(alert => [`${alert.id || alert.name}-${alert.al}`, alert])).values()]
      .sort((a, b) => Number(b.ac === "#ef4444") - Number(a.ac === "#ef4444"));
    return { categoryKeys, summary, priorities: uniqueAlerts };
  }, [items, categories, alerts]);
  const essentialsKeys = new Set(ESSENTIALS.map(essential => essential.key));
  const otherCategories = overview.categoryKeys.filter(key => !essentialsKeys.has(key)).slice(0, 6);
  const displayedPriorities = showAllPriorities ? overview.priorities : overview.priorities.slice(0, 4);
  const reviewAlert = (alert) => categories[alert.category] ? onCategory(alert.category) : onNavigate("property");
  const propertyName = property?.name || (typeof property === "string" ? property : "Your properties");
  const today = new Date();
  const localDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  return <div className="pv-overview">
    <header className="pv-overview-heading">
      <div><div className="pv-eyebrow">YOUR EVERYDAY READINESS</div><h1>A little more ready. <span>Every day.</span></h1><p>Know what you have. See what needs you. Keep moving forward.</p></div>
      <div className="pv-overview-date"><Icon name="compass" size={17} /><time dateTime={localDate}>{today.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</time></div>
    </header>

    <OverviewInsights coverage={coverage} summary={overview.summary} priorities={overview.priorities} propertyName={propertyName} onCategory={onCategory} onNavigate={onNavigate} onAdd={onAdd} onReview={() => {
      setShowAllPriorities(true);
      const heading = document.getElementById('pv-priorities-title');
      heading?.focus({ preventScroll: true });
      heading?.scrollIntoView({ block: 'start', behavior: 'instant' });
    }} />

    <section className="pv-essentials-section" aria-labelledby="pv-essentials-title">
      <div className="pv-section-heading"><div><h2 id="pv-essentials-title">Start with the essentials</h2><p>How long your recorded supplies could last.</p></div><button type="button" className="pv-text-link" onClick={() => onNavigate("inventory-search")}>All inventory <Icon name="arrow" size={15} /></button></div>
      <div className="pv-essentials-grid">{ESSENTIALS.filter(essential => categories[essential.key]).map(essential => <EssentialCoverage key={essential.key} coverage={coverage[essential.key]} icon={essential.icon} tone={essential.tone} category={categories[essential.key]} stats={overview.summary.categories.find(row => row.key === essential.key)} onClick={() => onCategory(essential.key)} />)}</div>
      <div className="pv-essential-people"><p className="pv-essential-note">Food and water plan for <strong>{rationPeople.length} {rationPeople.length === 1 ? "dependant" : "dependants"}</strong> selected in Your People.</p><FoodWaterInfo /><button type="button" className="pv-text-link" onClick={() => onNavigate("community")}>Manage dependants<Icon name="arrow" size={14}/></button></div>
    </section>

    <OverviewSurveillance onOpen={() => onNavigate("surveillance")} />

    <LocationView compact onOpen={() => onNavigate("location")} onCategory={onCategory} items={items}/>

    <div className="pv-overview-columns">
      <section className="pv-overview-panel pv-priorities" aria-labelledby="pv-priorities-title">
        <div className="pv-panel-heading"><div><h2 id="pv-priorities-title" tabIndex={-1}>A little attention goes a long way</h2><p>Maintenance, rotation, and the details that matter.</p></div><span className="pv-count-badge">{overview.priorities.length}</span></div>
        {overview.priorities.length ? <>
          <div className="pv-priority-list" id="pv-priority-list">{displayedPriorities.map((alert, index) => <button type="button" className="pv-priority-row" key={`${alert.id || alert.name}-${alert.al}-${index}`} onClick={() => reviewAlert(alert)}>
            <span className={`pv-priority-icon ${alert.ac === "#ef4444" ? "urgent" : ""}`}><Icon name="clock" size={17} /></span>
            <span className="pv-priority-copy"><strong>{String(alert.name || "Review supplies").replace(/^[^\p{L}\p{N}]+/u, "")}</strong><span>{alert.al || "Ready for review"}</span></span>
            <span className="pv-priority-category">{categories[alert.category]?.label || "Property"}</span><Icon name="chevron" size={16} />
          </button>)}</div>
          {overview.priorities.length > 4 && <button type="button" className="pv-panel-footer-button" aria-expanded={showAllPriorities} aria-controls="pv-priority-list" onClick={() => setShowAllPriorities(value => !value)}>{showAllPriorities ? "Show fewer priorities" : `View all ${overview.priorities.length} priorities`}<Icon name="arrow" size={15} /></button>}
        </> : <div className="pv-overview-empty"><span className="pv-icon-tile"><Icon name="check" size={22} /></span><h3>{items.length ? "Nothing flagged right now." : "Your next chapter starts here."}</h3><p>{items.length ? "Keep expiry dates and service details up to date so reminders can work for you." : "Add your first supply to start building a picture of your preparation."}</p><button type="button" className="pv-text-link" onClick={onAdd}>{items.length ? "Add a supply" : "Add your first supply"}<Icon name="plus" size={16} /></button></div>}
      </section>

      <section className="pv-overview-panel pv-beyond" aria-labelledby="pv-beyond-title">
        <div className="pv-panel-heading"><div><h2 id="pv-beyond-title">Beyond the basics</h2><p>A place for every part of your plan.</p></div><Icon name="box" size={19} /></div>
        <div className="pv-category-overview-list">{otherCategories.map(key => {
          const count = items.filter(item => item.category === key).length;
          return <button type="button" key={key} onClick={() => onCategory(key)}><span className={count ? "pv-category-dot recorded" : "pv-category-dot"} /><span>{categories[key].label}</span><span>{count} {count === 1 ? "entry" : "entries"}</span><Icon name="chevron" size={15} /></button>;
        })}</div>
        <button type="button" className="pv-panel-footer-button" onClick={() => onNavigate("inventory-search")}>Browse all {overview.categoryKeys.length} categories<Icon name="arrow" size={15} /></button>
      </section>
    </div>

    <section className="pv-household-strip" aria-label="Your household and quick actions">
      <div className="pv-household-intro"><span className="pv-icon-tile"><Icon name="users" size={21} /></span><div><h2>Preparation is a team effort.</h2><p>{people} {people === 1 ? "person" : "people"} in your directory · {rationPeople.length} {rationPeople.length === 1 ? "dependant" : "dependants"} for food & water</p></div></div>
      <div className="pv-team-initials" aria-hidden="true">{members.slice(0, 4).map((member, index) => <span key={member.id || index}>{String(member.name || "?").slice(0, 1).toUpperCase()}</span>)}{members.length > 4 && <span>+{members.length - 4}</span>}</div>
      <button type="button" className="pv-overview-button pv-button-outline" onClick={() => onNavigate("community")}>Your team<Icon name="arrow" size={16} /></button>
    </section>

    <section className="pv-quick-paths" aria-label="Quick actions">
      {[{ title: "Add to your inventory", subtitle: "One more thing accounted for", icon: "plus", action: onAdd }, { title: "Scan a barcode", subtitle: "Capture supplies in less time", icon: "scan", action: onScan }, { title: "Practice your plan", subtitle: "Explore a scenario", icon: "compass", action: () => onNavigate("simulate") }, { title: "Emergency mode", subtitle: "Bring your immediate plan forward", icon: "shield", action: onCrisis }].map(action => <button type="button" key={action.title} onClick={action.action}><Icon name={action.icon} size={19} /><span><strong>{action.title}</strong><span>{action.subtitle}</span></span><Icon name="arrow" size={15} /></button>)}
    </section>
  </div>;
}
