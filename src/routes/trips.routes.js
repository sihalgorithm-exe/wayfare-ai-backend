import { Router } from 'express';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { saveTrip, getTrip, sweepExpired } from '../services/tripSessionStore.js';
import { checkTripInput } from '../validators/validateOutput.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = Router();

// GET /api/trips/example
// Bundled sample trip so the frontend has something to render without the
// real Wayfare/Feasibility Engine running -- used by the "Load example trip"
// button in dev mode. Keep this above the /:sessionId route so "example"
// is never treated as a session id.
router.get('/trips/example', (_req, res) => {
  const data = JSON.parse(
    readFileSync(path.join(__dirname, '..', 'data', 'exampleInput.json'), 'utf-8')
  );
  res.json(data);
});

// POST /api/trips
// Called by Wayfare's backend once the Feasibility Engine approves a trip.
// Body: full tripInput JSON (schemas/tripInput.schema.json). Returns a
// sessionId to redirect the browser with.
router.post('/trips', (req, res) => {
  sweepExpired();
  const { ok, errors } = checkTripInput(req.body);
  if (!ok) {
    return res.status(400).json({ error: 'Invalid trip input', details: errors });
  }
  const sessionId = saveTrip(req.body);
  res.status(201).json({ sessionId });
});

// GET /api/trips/:sessionId
// Called by the AI Planner frontend on load.
router.get('/trips/:sessionId', (req, res) => {
  const tripInput = getTrip(req.params.sessionId);
  if (!tripInput) {
    return res.status(404).json({ error: 'Trip session not found or expired. Start again from Wayfare.' });
  }
  res.json(tripInput);
});

export default router;
