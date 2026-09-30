/**
 * A measurement type's display name. A plain lower-case name is capitalised
 * ("temperature" -> "Temperature"), a short one is treated as an acronym
 * ("rpm" -> "RPM"), and a name with its own casing is left alone, so "pH"
 * stays "pH" rather than becoming "PH".
 */
export function displayName(name: string): string {
  if (!name || name !== name.toLowerCase()) return name;
  return name.length <= 3 ? name.toUpperCase() : name.charAt(0).toUpperCase() + name.slice(1);
}
