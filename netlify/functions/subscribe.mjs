import { relay } from "./_relay.mjs";
export default (req) => relay(req, { envVar: "SUBSCRIBE_WEBHOOK_URL", required: [], kind: "join" });
