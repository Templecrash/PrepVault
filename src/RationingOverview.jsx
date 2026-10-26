import { useId, useState } from 'react';
import { Icon } from './brand.jsx';
import RationingPlanner from './RationingPlanner.jsx';
import { computeRationing } from './rationing.js';

export default function RationingOverview(props) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const { items, rationPeople, dailyCalTarget } = props;
  const summary = computeRationing(items, rationPeople.length, dailyCalTarget);
  const days = value => value == null ? '—' : value.toLocaleString();
  return <section className="pv-overview-rationing" aria-labelledby={`${id}-heading`}>
    <div className="pv-section-heading">
      <div><h2 id={`${id}-heading`}>Rationing</h2><p>Plan how long your recorded food and water could last.</p></div>
      <button className="pv-text-link" type="button" onClick={() => setOpen(value => !value)} aria-expanded={open} aria-controls={open ? `${id}-calculator` : undefined}>{open ? 'Close calculator' : 'Open calculator'}<Icon name={open ? 'close' : 'arrow'} size={16}/></button>
    </div>
    {open ? <div id={`${id}-calculator`}><RationingPlanner {...props}/></div> : <>
      <dl className="pv-rationing-snapshot">
        <div><dt><Icon name="leaf" size={17}/>Food</dt><dd>{days(summary.foodDays)}<span>full days</span></dd><dd className="pv-rationing-stat-note">{summary.totalCalories.toLocaleString()} calories recorded</dd></div>
        <div><dt><Icon name="water" size={17}/>Stored water</dt><dd>{days(summary.waterDays)}<span>full days</span></dd><dd className="pv-rationing-stat-note">{summary.totalWaterGal.toLocaleString()} gallons recorded</dd></div>
        <div><dt><Icon name="users" size={17}/>People in this plan</dt><dd>{summary.peopleCount}<span>{summary.peopleCount === 1 ? 'person' : 'people'}</span></dd><dd className="pv-rationing-stat-note">{dailyCalTarget.toLocaleString()} cal + 1 gal per person daily</dd></div>
      </dl>
      <p className="pv-rationing-snapshot-note">{!summary.peopleCount ? 'Add a person in the calculator to estimate days.' : 'Estimates use the selected property’s inventory and your current plan.'}{summary.omittedFoodCount > 0 && ` ${summary.omittedFoodCount} food ${summary.omittedFoodCount === 1 ? 'entry needs' : 'entries need'} nutrition details to be counted.`}</p>
    </>}
  </section>;
}
