import { haversineKm } from '../utils/geo.js';

// --- Why this exists ---
// The spec is explicit: "Do not fabricate distances" and the AI must "respect
// the route and feasibility information provided by the previous engine."
// Destination order and day-splitting are combinatorial/greedy problems with a
// clear correct-ish answer -- they don't need an LLM to guess at, and letting
// an LLM freely reorder stops risks it inventing a route that ignores the
// supplied distances. So we compute order + day split deterministically here,
// then only ask the LLM to turn the *result* into a friendly explanation and
// to slot in meals/breaks (see promptBuilder.js / aiPlannerService.js).

function distanceLookup(route) {
  const map = new Map();
  for (const leg of route || []) {
    map.set(`${leg.from}|${leg.to}`, leg.distanceKm);
    map.set(`${leg.to}|${leg.from}`, leg.distanceKm);
  }
  return map;
}

function distanceBetween(distMap, a, b) {
  const known = distMap.get(`${a.name}|${b.name}`);
  if (known != null) return { km: known, estimated: false };
  return { km: haversineKm(a, b), estimated: true };
}

// Nearest-neighbour ordering starting from the destination closest to the
// hotel (or the first destination if no hotel is chosen yet). Simple,
// explainable, and good enough for the small destination counts a single
// trip will realistically have -- deliberately not an exhaustive TSP solve,
// per "do not over-engineer."
export function orderDestinations(destinations, route, startPoint) {
  const distMap = distanceLookup(route);
  const remaining = [...destinations];
  const ordered = [];

  let current = startPoint;
  while (remaining.length) {
    let bestIdx = 0;
    let best = null;
    for (let i = 0; i < remaining.length; i++) {
      const d = current
        ? distanceBetween(distMap, current, remaining[i])
        : { km: 0, estimated: false };
      if (!best || d.km < best.km) {
        best = d;
        bestIdx = i;
      }
    }
    const next = remaining.splice(bestIdx, 1)[0];
    ordered.push({ ...next, distanceFromPreviousKm: best?.km ?? null, distanceEstimated: best?.estimated ?? false });
    current = next;
  }
  return ordered;
}

// Greedy day-splitter: walk the ordered destinations and pack them into days,
// respecting hoursPerDay. Reserves a fixed travel/meal buffer per day so we
// never claim a day is full when there'd be no time left to actually get
// around and eat -- this is what keeps the generated schedule "possible"
// rather than merely hour-count-feasible.
const MEAL_BUFFER_HOURS = 1.5; // breakfast + lunch, short breaks
const TRAVEL_MINUTES_PER_HOP_DEFAULT = 30;

export function splitIntoDays({ orderedDestinations, numberOfDays, hoursPerDay }) {
  const budget = hoursPerDay - MEAL_BUFFER_HOURS; // hard per-day cap, never exceeded except the last-resort case below
  const costs = orderedDestinations.map((dest) => {
    const travelHours = (dest.distanceFromPreviousKm ?? 0) > 0
      ? Math.max(TRAVEL_MINUTES_PER_HOP_DEFAULT / 60, estimateTravelHours(dest.distanceFromPreviousKm))
      : 0;
    return dest.visitDurationHours + travelHours;
  });

  // Soft per-day target = an even split of the total workload. Filling every
  // day to the hard cap before moving on (pure first-fit) tends to front-load
  // early days and dump whatever's left on the last one, which is exactly
  // what risks an "impossible" final day. Balancing against the average
  // instead spreads destinations more evenly, and the hard cap below still
  // protects any single day from being over-packed whenever there's a later
  // day left to push into.
  const totalCost = costs.reduce((a, b) => a + b, 0);
  const target = Math.min(budget, totalCost / numberOfDays);

  const days = Array.from({ length: numberOfDays }, () => ({
    destinations: [],
    usedHours: 0,
  }));

  let dayIdx = 0;
  orderedDestinations.forEach((dest, i) => {
    const cost = costs[i];
    const day = days[dayIdx];
    const hasItems = day.destinations.length > 0;
    const overTarget = hasItems && day.usedHours + cost > target;
    const overBudget = hasItems && day.usedHours + cost > budget;
    const canAdvance = dayIdx < numberOfDays - 1;

    if ((overTarget || overBudget) && canAdvance) {
      dayIdx += 1;
    }

    days[dayIdx].destinations.push(dest);
    days[dayIdx].usedHours += cost;
  });

  // Mark any day that still exceeds the hard cap after balancing -- this can
  // only happen when there was nowhere left to push overflow (i.e. the last
  // day), which the balancing pass minimises but can't always eliminate given
  // lumpy visit durations. The caller surfaces this as a warning rather than
  // hiding it: see aiPlannerService.js.
  for (const day of days) {
    day.overBudget = day.usedHours > budget;
  }

  return days;
}

// ~40 km/h average, a reasonable assumption for intra-city/short intercity
// hops in this context. Only used to size travel *slots* in the timetable --
// never to invent a distance that wasn't supplied or derived from coordinates.
function estimateTravelHours(km) {
  return km / 40;
}
