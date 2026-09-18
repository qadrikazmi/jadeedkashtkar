import { ComparisonCard } from "./ComparisonCard";

// Purely a results renderer now. Picking fields to compare happens
// directly on the "All fields" cards in Health.jsx (which owns that
// selection state), since the spec calls for reusing those actual cards
// instead of a separate duplicate chip list. Nothing renders here until
// at least one comparison has been created.
export function ComparisonSection({ comparisons = [], fields = [], onDelete }) {
  if (comparisons.length === 0) return null;

  return (
    <div className="flex flex-col gap-3.5">
      {comparisons.map((c) => (
        <ComparisonCard key={c.id} id={c.id} fieldIds={c.fieldIds} fields={fields} onDelete={onDelete} />
      ))}
    </div>
  );
}