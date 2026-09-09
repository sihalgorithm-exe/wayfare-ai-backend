import { Router } from 'express';
import { planTrip, rankHotels } from '../services/aiPlannerService.js';
import { checkTripInput } from '../validators/validateOutput.js';

const router = Router();

// POST /api/plan
// Body: the full trip JSON produced by the Feasibility Engine (see
// schemas/tripInput.schema.json). Returns schemas/plannerOutput.schema.json.
// This is also what "Regenerate Plan" calls again on the frontend -- it's a
// pure function of the input, so calling it twice with the same body and
// LLM_PROVIDER=none-ish behaviour would give the same deterministic backbone
// with freshly-generated narration.
router.post('/plan', async (req, res, next) => {
  const { ok, errors } = checkTripInput(req.body);
  if (!ok) {
    return res.status(400).json({ error: 'Invalid trip input', details: errors });
  }
  try {
    const plan = await planTrip(req.body);
    res.json(plan);
  } catch (err) {
    next(err);
  }
});

// POST /api/hotels/rank
// Same body shape as /plan. Returns every supplied hotel ranked by
// suitability score, for the "Change Hotel" control. No LLM call -- this is
// meant to be fast enough to use interactively.
router.post('/hotels/rank', (req, res, next) => {
  const { ok, errors } = checkTripInput(req.body);
  if (!ok) {
    return res.status(400).json({ error: 'Invalid trip input', details: errors });
  }
  try {
    res.json({ hotels: rankHotels(req.body) });
  } catch (err) {
    next(err);
  }
});

// POST /api/feasibility/mock-check
// --------------------------------------------------------------------------
// THIS IS A STUB, not the real Trip Feasibility Engine. It exists only so
// this repo's frontend has something to call when a demo needs to show the
// "user edits the trip -> re-check before re-planning" flow end-to-end
// without the real Spring Boot service running alongside it.
//
// Replace calls to this route with a call to FEASIBILITY_ENGINE_URL (see
// backend/.env.example) as soon as the real engine is reachable -- see
// README.md "Connecting the Feasibility Engine" for the two ways to do that.
// --------------------------------------------------------------------------
router.post('/feasibility/mock-check', (req, res) => {
  const { trip, destinations } = req.body || {};
  if (!trip || !destinations) {
    return res.status(400).json({ error: 'trip and destinations are required' });
  }
  const estimatedRequiredHours = destinations.reduce((sum, d) => sum + (d.visitDurationHours || 0), 0)
    + destinations.length * 0.5; // rough travel buffer per stop, mirrors routingService's assumptions
  const availableHours = trip.numberOfDays * trip.hoursPerDay;

  res.json({
    feasible: estimatedRequiredHours <= availableHours,
    estimatedRequiredHours: Number(estimatedRequiredHours.toFixed(1)),
    availableHours,
  });
});

export default router;
