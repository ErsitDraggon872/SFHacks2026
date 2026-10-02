/** npm run demo:reset — restore bookings and snapshots from seed. OWNER: C3. */
import { resetCollection } from "../lib/db";

resetCollection("bookings");
resetCollection("snapshots");
console.log("Demo data reset: bookings and snapshots restored from seed.");
