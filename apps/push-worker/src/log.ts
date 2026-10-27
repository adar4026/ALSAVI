/**
 * Structured one-line logs (Workers Observability). Only a device-id prefix
 * — never an endpoint, key, token or schedule.
 */
export function log(evt: string, fields: Record<string, unknown> & { device?: string }): void {
  const { device, ...rest } = fields;
  console.log(JSON.stringify({ evt, device: device ? device.slice(0, 8) : undefined, ...rest }));
}
