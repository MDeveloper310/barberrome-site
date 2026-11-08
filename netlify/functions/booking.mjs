import { relay } from "./_relay.mjs";
export default (req) => relay(req, { envVar: "BOOKING_WEBHOOK_URL", required: ["name", "email", "message"], kind: "booking" });
