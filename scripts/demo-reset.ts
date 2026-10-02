/** npm run demo:reset — restore bookings from seed and clear snapshots. OWNER: C3 (initial version by C1). */
import { resetCollection } from "../lib/db";

resetCollection("bookings");
resetCollection("snapshots");
console.log("Demo data reset: bookings restored from seed, snapshots cleared.");
