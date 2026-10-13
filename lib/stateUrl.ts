/** Public URL of an archived state document ("what Jev saw") in R2, or null when no public base is configured. */
export const stateUrl = (base: string | null, hash: string): string | null => (base ? `${base.replace(/\/+$/, '')}/state/${hash}.json` : null);
