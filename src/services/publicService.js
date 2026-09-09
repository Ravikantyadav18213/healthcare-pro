import api, { unwrap } from "./api.js";

/*
 * Unauthenticated endpoints reachable from the marketing site — no
 * cookie/session required, unlike everything in adminService.js.
 */

export const publicService = {
  submitContact: (payload) => unwrap(api.post("/contact", payload)),
};

export default publicService;
