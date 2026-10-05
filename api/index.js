/*
 * Vercel entry point. vercel.json rewrites every /api/* request here;
 * the Express app itself (server/index.js) is a plain (req, res)
 * handler, which is exactly the shape a Vercel Node.js function
 * expects — no adapter needed.
 */
export { default } from "../server/index.js";
