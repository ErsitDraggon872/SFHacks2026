/** npm run demo:reset — restore bookings and snapshots from seed. OWNER: C3. */
import { resetCollection, writeCollection } from "../lib/db";
import seedSnapshots from "../data/snapshots.seed.json";

resetCollection("bookings");
writeCollection("snapshots", seedSnapshots);
console.log("Demo data reset: bookings and snapshots restored from seed.");
