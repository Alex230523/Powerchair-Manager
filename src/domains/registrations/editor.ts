import type { Field } from "./schema";

/**
 * Wave 17 (F1): moving and removing questions in the form editor. A
 * condition may only point at an earlier question, so a move or a removal
 * drops the conditions it breaks; undoing a removal puts them back.
 */
const valid = (fields: Field[]) =>
  fields.map((f, i) => (f.condition && !fields.slice(0, i).some((v) => v.key === f.condition!.key) ? { ...f, condition: undefined } : f));

export function moveField(fields: Field[], from: number, to: number) {
  if (from === to || from < 0 || to < 0 || from >= fields.length || to >= fields.length) return fields;
  const next = [...fields];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return valid(next);
}

export type Removed = { field: Field; index: number; conditions: Record<string, Field["condition"]> };

export function removeField(fields: Field[], index: number): { fields: Field[]; removed: Removed } {
  const field = fields[index];
  const conditions = Object.fromEntries(fields.filter((f) => f.condition?.key === field.key).map((f) => [f.key, f.condition]));
  return {
    fields: fields.filter((_, n) => n !== index).map((f) => (f.condition?.key === field.key ? { ...f, condition: undefined } : f)),
    removed: { field, index, conditions },
  };
}

/** Puts a removed question back where it was, with the conditions that pointed at it. */
export function restoreField(fields: Field[], r: Removed) {
  if (fields.some((f) => f.key === r.field.key)) return fields;
  const next = [...fields];
  next.splice(Math.min(r.index, next.length), 0, r.field);
  return valid(next.map((f) => (r.conditions[f.key] && !f.condition ? { ...f, condition: r.conditions[f.key] } : f)));
}
