import { useId } from 'react';
import { Icon } from './brand.jsx';
import { buildInventoryRecommendations } from './inventory-recommendations.js';
import './inventory-recommendations.css';

export default function InventoryRecommendations({ items = [], categories = {}, categoryKey, propertyId, peopleCount = 0, dailyCalTarget = 2000, waterGalPerPerson = 1, alerts = [], onAdd, onEdit, onManagePeople, onRationing, onCategory, actions }) {
  const headingId = useId();
  const result = buildInventoryRecommendations({ items, categories, categoryKey, propertyId, peopleCount, dailyCalTarget, waterGalPerPerson, alerts });
  const [next, ...remaining] = result.suggestions;
  const actionFor = action => {
    if (action?.kind === 'edit' && onEdit) return () => onEdit(action.item);
    if (action?.kind === 'add' && onAdd) return () => onAdd(action.categoryKey);
    if (action?.kind === 'people' && onManagePeople) return onManagePeople;
    if (action?.kind === 'rationing' && onRationing) return onRationing;
    if (action?.kind === 'category' && action.categoryKey && onCategory) return () => onCategory(action.categoryKey);
    return null;
  };
  if (!next) return null;
  const nextAction = actionFor(next.action);

  return <section className="pv-inventory-recommendations is-compact" aria-labelledby={headingId}>
    <div className="pv-recommendation-next">
      <div><h2 id={headingId}>Next step</h2><p>{next.title}</p></div>
      {nextAction && <button type="button" className="pv-recommendation-action" onClick={nextAction}>{next.action.label}<Icon name="arrow" size={14}/></button>}
      {actions && <div className="pv-inventory-recommendations-actions">{actions}</div>}
    </div>
    <details className="pv-recommendations-more">
      <summary><span>{remaining.length ? `Details & ${remaining.length} more ${remaining.length === 1 ? 'recommendation' : 'recommendations'}` : 'Why this step'}</span><Icon name="chevron" size={13}/></summary>
      <div className="pv-recommendations-details">
        <p className="pv-recommendation-reason">{next.detail}</p>
        {remaining.map(suggestion => {
          const onAction = actionFor(suggestion.action);
          return <article className="pv-recommendation-detail" key={suggestion.id}><div><h3>{suggestion.title}</h3><p>{suggestion.detail}</p></div>{onAction && <button type="button" className="pv-recommendation-action" onClick={onAction}>{suggestion.action.label}<Icon name="arrow" size={14}/></button>}</article>;
        })}
        <p className="pv-recommendation-basis">Based on recorded inventory{propertyId === 'all' ? ' across all properties' : ' at this property'}.</p>
      </div>
    </details>
  </section>;
}
