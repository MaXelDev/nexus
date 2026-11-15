// Placeholder until /v1/summary lands (Android step 3): every request is refused.
// Deployed early only so `wrangler secret put` has a Worker to attach secrets to.
export default {
  fetch: () => Response.json({ error: "not_found" }, { status: 404 }),
};
