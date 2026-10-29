import { useId, useState } from 'react';
import FoodWaterInfo from './FoodWaterInfo.jsx';
import { Icon } from './brand.jsx';
import { computeRationing } from './rationing.js';
import { buildRationingVisuals } from './rationing-visuals.js';
import { StatusPanel, StatusBar, StatusRing } from './StatusCharts.jsx';
import './rationing.css';

const format = value => value.toLocaleString(undefined, { maximumFractionDigits: 1 });

export default function RationingPlanner({ items, rationPeople, dailyCalTarget, setDailyCalTarget, waterGalPerPerson = 1, categories = {}, onManagePeople, showSummary = true }) {
  const id = useId();
  const [planningDays, setPlanningDays] = useState(14);
  const result = computeRationing(items, rationPeople.length, dailyCalTarget, waterGalPerPerson);
  const visuals = buildRationingVisuals({ items, peopleCount: rationPeople.length, dailyCalTarget, waterGalPerPerson, planningDays, categories });
  const figureNote = visual => visual.value === null ? 'Add details to estimate' : visual.valueLabel.startsWith('≥') ? 'Partial nutrition data' : visual.value < planningDays ? `Below the ${planningDays}-day window` : visual.tone === 'warning' ? 'Review stock details' : `Meets the ${planningDays}-day window`;
  return <section className="pv-rationing" aria-label="Rationing planner">
    {showSummary && <>
      <dl className="pv-rationing-at-glance" aria-label="Recorded supply duration">
        {[['Food', visuals.food], ['Water', visuals.water]].map(([label, visual]) => <div key={label}><dt>{label}</dt><dd>{visual.valueLabel}<small>{figureNote(visual)}</small></dd></div>)}
      </dl>
      <StatusPanel title="Supply insights" eyebrow="" summary={`${planningDays}-day comparison · recorded food and water`} action={<label className="pv-status-window">Planning window<select aria-label="Rationing planning window" value={planningDays} onChange={event => setPlanningDays(Number(event.target.value))}>{[7, 14, 30, 90].map(days => <option key={days} value={days}>{days} days</option>)}</select></label>} note={`Uses ${format(result.waterGalPerPerson)} gallons of water per dependant/day, including cooking and hygiene. This is not a drinking limit. Check stock condition and dietary suitability.`}>
        <StatusBar title="Recorded food" {...visuals.food}/>
        <StatusBar title="Stored water" {...visuals.water}/>
        <StatusRing title="Food calculation details" {...visuals.foodDetails}/>
      </StatusPanel>
    </>}
    {result.omittedFoodCount > 0 && <p className="pv-rationing-notice">{result.omittedFoodCount} food {result.omittedFoodCount === 1 ? 'entry needs' : 'entries need'} calories or servings to count toward the estimate.</p>}
    {!result.peopleCount && <p className="pv-rationing-notice" role="status">Choose dependants to estimate food and water days.</p>}
    <div className="pv-rationing-controls">
      <section className="pv-rationing-card" aria-labelledby={`${id}-target`}>
        <div className="pv-rationing-card-title"><h3 id={`${id}-target`}>Daily calorie target</h3><output htmlFor={`${id}-slider`}>{format(dailyCalTarget)}<span> per person</span></output></div>
        <label className="pv-rationing-range-label" htmlFor={`${id}-slider`}>Calories per person per day</label>
        <input id={`${id}-slider`} className="pv-rationing-slider" type="range" min={1000} max={3000} step={100} value={dailyCalTarget} onChange={event => setDailyCalTarget(Number(event.target.value))}/>
        <div className="pv-rationing-range-ends"><span>1,000</span><span>3,000</span></div>
        <div className="pv-rationing-presets" aria-label="Calorie target presets">{[2000, 1500, 1200].map(target => <button key={target} type="button" aria-pressed={dailyCalTarget === target} onClick={() => setDailyCalTarget(target)}>{format(target)} cal</button>)}</div>
      </section>
      <section className="pv-rationing-card" aria-labelledby={`${id}-people`}>
        <div className="pv-rationing-card-title"><h3 id={`${id}-people`}>Dependants · {result.peopleCount}</h3><FoodWaterInfo /></div>
        <p className="pv-rationing-roster-note">From Your People. Only marked dependants count.</p>
        <div className="pv-rationing-people">{rationPeople.map(person => <span key={person.id}>{person.name}</span>)}</div>
        <button type="button" className="pv-button pv-secondary" onClick={onManagePeople}><Icon name="users" size={15}/>Manage dependants</button>
      </section>
    </div>
    <details className="pv-rationing-breakdown">
      <summary>Inventory breakdown <span>{result.foodItems.length} food · {result.waterItems.length} stored water</span></summary>
      <div className="pv-rationing-inventories">
        <section aria-labelledby={`${id}-food`}><h3 id={`${id}-food`}>Food inventory</h3>{result.foodItems.length ? <>
          <div className="pv-rationing-table-wrap"><table><thead><tr><th scope="col">Item</th><th scope="col">Quantity</th><th scope="col">Cal / serving</th><th scope="col">Total cal</th></tr></thead><tbody>{result.foodItems.map(item => <tr key={item.id}><th scope="row">{item.name}</th><td>{format(item.quantity)}</td><td>{item.hasCalorieData ? format(item.caloriesPerServing) : 'Not recorded'}</td><td>{format(item.totalCalories)}</td></tr>)}</tbody><tfoot><tr><th scope="row" colSpan={3}>Recorded total</th><td>{format(result.totalCalories)}</td></tr></tfoot></table></div>
          {result.peopleCount > 0 && <p className="pv-rationing-footnote">{format(result.totalCalories / result.peopleCount)} recorded calories per person across all stock.</p>}
        </> : <p className="pv-rationing-empty">Add food supplies to your inventory to include them here.</p>}</section>
        <section aria-labelledby={`${id}-water`}><h3 id={`${id}-water`}>Stored water</h3>{result.waterItems.length ? <><dl className="pv-rationing-water-list">{result.waterItems.map(item => <div key={item.id}><dt>{item.name}</dt><dd>{format(item.gallons)} gal</dd></div>)}<div className="is-total"><dt>Recorded total</dt><dd>{format(result.totalWaterGal)} gal</dd></div></dl>{result.peopleCount > 0 && <p className="pv-rationing-footnote">{format(result.totalWaterGal / result.peopleCount)} gallons per person across all stock.</p>}</> : <p className="pv-rationing-empty">Add stored water to your inventory to include it here.</p>}</section>
      </div>
    </details>
    <details className="pv-rationing-breakdown">
      <summary>Meal portions <span>From your recorded food</span></summary>
      <p className="pv-rationing-footnote">One recorded serving per person. These portions are separate from the daily calorie target.</p>
      {result.mealSuggestions.length ? <div className="pv-rationing-portions">{result.mealSuggestions.map(item => <div key={item.id}><span><strong>{format(item.unitsNeeded)} {item.unit} of {item.name}</strong><small>{format(item.servings)} servings per unit · {format(item.caloriesPerServing)} calories per serving · {format(item.quantity)} {item.unit} in stock</small></span>{item.shortOnStock && <span className="pv-rationing-short">Not enough stock</span>}</div>)}</div> : <p className="pv-rationing-empty">{result.peopleCount ? 'Record food quantities, calories and servings to calculate meal portions.' : 'Mark dependants in Your People to calculate meal portions.'}</p>}
    </details>
  </section>;
}
