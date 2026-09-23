// Position is remembered by explicit model identity. No prose matching or clinical filtering.
export function keepPositions(previous, incoming) {
 const current = new Map(incoming.map(item => [item.id, item]));
 const kept = previous.filter(item => current.has(item.id)).map(item => current.get(item.id));
 const known = new Set(kept.map(item => item.id));
 return [...kept, ...incoming.filter(item => !known.has(item.id))];
}
export function placeLane(previous, incoming, lane) {
 if (!previous) return incoming;
 const keys = lane === 'assessment' ? ['vitals','history','exam'] : lane === 'plan' ? ['management'] : [];
 return {...incoming, ...Object.fromEntries(keys.map(key => [key, keepPositions(previous[key] || [], incoming[key] || [])]))};
}
export function describeChange(before, after) {
 if (!before) return '';
 if (before.state !== after.state) return `${before.state} → ${after.state}`;
 const fields = ['text','detail','dose','route','value','unit'];
 return fields.some(field => (before[field] || '') !== (after[field] || '')) ? 'Updated from the conversation' : '';
}
export function clinicalMarkup(item, escape) {
 const lead = `<span class="cue-text">${escape(item.text)}</span>`;
 const dose = item.dose ? ` <span class="dose">${escape(item.dose)}</span>` : '';
 const route = item.route ? ` <span class="route">${escape(item.route)}</span>` : '';
 const detail = item.detail ? ` <span class="cue-detail">${escape(item.detail)}</span>` : '';
 return lead + dose + route + detail;
}
