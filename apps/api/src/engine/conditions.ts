export type ConditionOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "not_contains"
  | "starts_with"
  | "ends_with"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "exists"
  | "empty"
  | "regex";

export const CONDITION_OPERATORS: ConditionOperator[] = [
  "equals",
  "not_equals",
  "contains",
  "not_contains",
  "starts_with",
  "ends_with",
  "gt",
  "gte",
  "lt",
  "lte",
  "exists",
  "empty",
  "regex",
];

function asString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  return null;
}

/**
 * Evaluate a condition against a resolved variable value.
 * Returns { result, reason } where reason explains the evaluation.
 */
export function evaluateCondition(
  operator: ConditionOperator,
  actual: unknown,
  expected: unknown
): { result: boolean; reason: string } {
  switch (operator) {
    case "equals": {
      const a = asString(actual);
      const b = asString(expected);
      const numA = asNumber(a);
      const numB = asNumber(b);
      const ok = numA !== null && numB !== null ? numA === numB : a === b;
      return { result: ok, reason: `"${a}" ${ok ? "=" : "≠"} "${b}"` };
    }
    case "not_equals": {
      const { result } = evaluateCondition("equals", actual, expected);
      return { result: !result, reason: `"${asString(actual)}" ${!result ? "≠" : "="} "${asString(expected)}"` };
    }
    case "contains": {
      const ok = asString(actual).includes(asString(expected));
      return { result: ok, reason: `"${asString(actual)}" ${ok ? "contains" : "does not contain"} "${asString(expected)}"` };
    }
    case "not_contains": {
      const { result } = evaluateCondition("contains", actual, expected);
      return { result: !result, reason: `"${asString(actual)}" ${!result ? "does not contain" : "contains"} "${asString(expected)}"` };
    }
    case "starts_with": {
      const ok = asString(actual).startsWith(asString(expected));
      return { result: ok, reason: `"${asString(actual)}" ${ok ? "starts with" : "does not start with"} "${asString(expected)}"` };
    }
    case "ends_with": {
      const ok = asString(actual).endsWith(asString(expected));
      return { result: ok, reason: `"${asString(actual)}" ${ok ? "ends with" : "does not end with"} "${asString(expected)}"` };
    }
    case "gt": {
      const a = asNumber(actual);
      const b = asNumber(expected);
      if (a === null || b === null) return { result: false, reason: "non-numeric values compared" };
      return { result: a > b, reason: `${a} ${a > b ? ">" : "≤"} ${b}` };
    }
    case "gte": {
      const a = asNumber(actual);
      const b = asNumber(expected);
      if (a === null || b === null) return { result: false, reason: "non-numeric values compared" };
      return { result: a >= b, reason: `${a} ${a >= b ? "≥" : "<"} ${b}` };
    }
    case "lt": {
      const a = asNumber(actual);
      const b = asNumber(expected);
      if (a === null || b === null) return { result: false, reason: "non-numeric values compared" };
      return { result: a < b, reason: `${a} ${a < b ? "<" : "≥"} ${b}` };
    }
    case "lte": {
      const a = asNumber(actual);
      const b = asNumber(expected);
      if (a === null || b === null) return { result: false, reason: "non-numeric values compared" };
      return { result: a <= b, reason: `${a} ${a <= b ? "≤" : ">"} ${b}` };
    }
    case "exists": {
      const ok = actual !== null && actual !== undefined && actual !== "";
      return { result: ok, reason: ok ? "value exists" : "value is missing" };
    }
    case "empty": {
      const ok = actual === null || actual === undefined || actual === "";
      return { result: ok, reason: ok ? "value is empty" : "value is present" };
    }
    case "regex": {
      try {
        const ok = new RegExp(asString(expected)).test(asString(actual));
        return { result: ok, reason: `"${asString(actual)}" ${ok ? "matches" : "does not match"} /${asString(expected)}/` };
      } catch (err) {
        return { result: false, reason: `invalid regex: ${(err as Error).message}` };
      }
    }
    default:
      return { result: false, reason: `unknown operator: ${operator}` };
  }
}
