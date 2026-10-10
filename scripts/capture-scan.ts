// Captures a live idle scan into fixtures/ as the offline fallback (spec §11).
import { writeFileSync } from 'node:fs';
import { scanAddress } from '../lib/idle';

const address = (process.argv[2] ?? '0xf70da97812cb96acdf810712aa562db8dfa3dbef').toLowerCase();
scanAddress(address).then((r) => {
  writeFileSync(`fixtures/scan-${address}.json`, JSON.stringify(r, null, 1));
  console.log(`idle $${r.idleUsd.toFixed(0)} · ${r.holdings.length} holdings · ${r.suggestions.length} suggestions`);
});
