export function toTitleCaseIfAllCaps(value: string): string {
  if (!/^[A-Z\s]+$/.test(value)) {
    return value;
  }

  return value
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
