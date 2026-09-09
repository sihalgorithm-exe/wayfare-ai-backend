import { randomUUID } from 'node:crypto';

// --- What this is for ---
// Wayfare's frontend and this AI Planner frontend are separate deployed
// apps (see README "Connecting the Feasibility Engine"). The hand-off works
// like this:
//   1. Once the Feasibility Engine marks a trip feasible, Wayfare's backend
//      POSTs the trip JSON to POST /api/trips on this service.
//   2. This service stores it and returns { sessionId }.
//   3. Wayfare's frontend redirects the browser to
//      <AI_PLANNER_FRONTEND_URL>/plan/<sessionId>.
//   4. The AI Planner frontend calls GET /api/trips/:sessionId to fetch the
//      trip, then POST /api/plan to generate the itinerary.
// This avoids putting a large JSON payload in the URL and avoids needing the
// two frontends to share an origin (so localStorage/sessionStorage can't be
// used to pass data between them).
//
// This in-memory Map is intentionally simple for a hackathon prototype: it's
// fine for a single backend instance and disappears on restart. For
// production, swap it for a Supabase table (see README) -- nothing outside
// this file needs to change, since routes only call get/set/exists below.
const store = new Map();
const TTL_MS = 60 * 60 * 1000; // 1 hour, long enough for a planning session

export function saveTrip(tripInput) {
  const sessionId = randomUUID();
  store.set(sessionId, { tripInput, expiresAt: Date.now() + TTL_MS });
  return sessionId;
}

export function getTrip(sessionId) {
  const entry = store.get(sessionId);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    store.delete(sessionId);
    return null;
  }
  return entry.tripInput;
}

// Lazy cleanup so an abandoned Map doesn't grow forever during a long-running
// demo session -- called opportunistically, not on a timer, to keep this
// dependency-free.
export function sweepExpired() {
  const now = Date.now();
  for (const [id, entry] of store.entries()) {
    if (entry.expiresAt < now) store.delete(id);
  }
}
