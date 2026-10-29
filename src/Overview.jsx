import { useMemo, useState } from "react";
import { Icon } from "./brand.jsx";
import OverviewInsights from "./OverviewInsights.jsx";
import LocationView from "./LocationView.jsx";
import OverviewSurveillance from "./OverviewSurveillance.jsx";
import { summarizeOverviewInventory } from "./overview-metrics.js";
import { computeEssentialCoverage } from "./essential-coverage.js";
import "./overview.css";

export default function Overview({ items = [], categories = {}, property, alerts = [], onNavigate, onCategory, onAdd, onScan, rationPeople = [], dailyCalTarget = 2000, waterGalPerPerson = 1 }) {
  const [showAllPriorities, setShowAllPriorities] = useState(false);
  const coverage = useMemo(() => computeEssentialCoverage(items, rationPeople.length, dailyCalTarget, waterGalPerPerson), [items, rationPeople.length, dailyCalTarget, waterGalPerPerson]);
  const overview = useMemo(() => {
    const summary = summarizeOverviewInventory(items, categories);
    const itemIds = new Set(items.map(item => item.id));
    const relevantAlerts = alerts.filter(alert => !alert.id || itemIds.has(alert.id));
    const uniqueAlerts = [...new Map(relevantAlerts.map(alert => [`${alert.id || alert.name}-${alert.al}`, alert])).values()]
      .sort((a, b) => Number(b.ac === "#ef4444") - Number(a.ac === "#ef4444"));
    return { summary, priorities: uniqueAlerts };
  }, [items, categories, alerts]);
  const displayedPriorities = showAllPriorities ? overview.priorities : overview.priorities.slice(0, 3);
  const reviewAlert = (alert) => categories[alert.category] ? onCategory(alert.category) : onNavigate("property");
  const propertyName = property?.name || (typeof property === "string" ? property : "Your properties");
  const today = new Date();
  const localDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  return <div className="pv-overview">
    <header className="pv-overview-heading">
      <div><h1>Overview</h1><p><time dateTime={localDate}>{today.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</time></p></div>
      <div className="pv-overview-actions"><button type="button" className="pv-overview-button pv-button-outline" onClick={onScan}><Icon name="scan" size={16}/>Scan barcode</button><button type="button" className="pv-overview-button" onClick={onAdd}><Icon name="plus" size={16}/>Add supplies</button></div>
    </header>

    <OverviewInsights coverage={coverage} summary={overview.summary} priorities={overview.priorities} propertyName={propertyName} onCategory={onCategory} onReview={() => {
      setShowAllPriorities(true);
      const heading = document.getElementById('pv-priorities-title');
      heading?.focus({ preventScroll: true });
      heading?.scrollIntoView({ block: 'start', behavior: 'instant' });
    }} />

    {overview.priorities.length > 0 && <section className="pv-overview-panel pv-priorities" aria-labelledby="pv-priorities-title">
        <div className="pv-panel-heading"><div><h2 id="pv-priorities-title" tabIndex={-1}>Needs attention</h2></div><span className="pv-count-badge">{overview.priorities.length}</span></div>
        <>
          <div className="pv-priority-list" id="pv-priority-list">{displayedPriorities.map((alert, index) => <button type="button" className="pv-priority-row" key={`${alert.id || alert.name}-${alert.al}-${index}`} onClick={() => reviewAlert(alert)}>
            <span className={`pv-priority-icon ${alert.ac === "#ef4444" ? "urgent" : ""}`}><Icon name="clock" size={17} /></span>
            <span className="pv-priority-copy"><strong>{String(alert.name || "Review supplies").replace(/^[^\p{L}\p{N}]+/u, "")}</strong><span>{alert.al || "Ready for review"}</span></span>
            <span className="pv-priority-category">{categories[alert.category]?.label || "Property"}</span><Icon name="chevron" size={16} />
          </button>)}</div>
          {overview.priorities.length > 3 && <button type="button" className="pv-panel-footer-button" aria-expanded={showAllPriorities} aria-controls="pv-priority-list" onClick={() => setShowAllPriorities(value => !value)}>{showAllPriorities ? "Show fewer priorities" : `View all ${overview.priorities.length} priorities`}<Icon name="arrow" size={15} /></button>}
        </>
      </section>}

    <OverviewSurveillance onOpen={() => onNavigate("surveillance")} />
    <LocationView compact onOpen={() => onNavigate("location")} onCategory={onCategory} items={items}/>
  </div>;
}
