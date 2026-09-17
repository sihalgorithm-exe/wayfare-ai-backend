// Builds the prompt sent to the LLM.
//
// IMPORTANT DESIGN CHOICE: the LLM is only ever asked to write short pieces of
// natural-language narration (why a hotel fits, a one-line trip intro, a
// one-line title per day). It is never asked to invent times, distances,
// prices, ratings or ordering -- those are computed deterministically in
// routingService.js / timetableService.js / hotelScoringService.js and simply
// handed to the LLM as already-decided facts to explain. This is what lets us
// honor "do not fabricate hotel prices/ratings/distances/travel times" while
// still getting a genuinely personalized-feeling result.
export function buildNarrativeSystemPrompt() {
  return [
    'You are the narration layer of Wayfare, a trip-planning assistant.',
    'You are given an itinerary and a hotel ranking that another part of the',
    'system has already computed from real data. Your only job is to write',
    'short, warm, specific explanations of choices that have ALREADY been made.',
    '',
    'Rules:',
    '- Never invent or alter a number: no new prices, ratings, distances, times, or IDs.',
    '- Only reference facts present in the input JSON you are given.',
    '- If you are unsure why something was chosen, describe it in general terms',
    '  (e.g. "centrally located") rather than making up a specific reason.',
    '- Keep every field short: 1-2 sentences, conversational, no marketing fluff.',
    '- Respond with ONLY a single JSON object matching the schema you are given.',
    '  No prose before or after it, no markdown code fences.',
  ].join('\n');
}

export function buildNarrativeUserPrompt({ trip, preferences, topHotel, days, budget, budgetStatus }) {
  const payload = {
    trip: {
      city: trip.city,
      numberOfDays: trip.numberOfDays,
      hoursPerDay: trip.hoursPerDay,
    },
    // Already-computed facts, never to be recalculated or second-guessed
    // by the model - include only if the user actually provided a budget.
    budget: budget && budget.valid ? {
      totalBudget: budget.totalBudget,
      estimatedTravelCost: budget.estimatedTravelCost,
      remainingBudget: budget.remainingBudget,
      status: budgetStatus?.status || 'ok',
    } : null,
    preferences: preferences || {},
    recommendedHotel: topHotel && {
      name: topHotel.hotel.name,
      pricePerNight: topHotel.hotel.pricePerNight,
      rating: topHotel.hotel.rating,
      amenities: topHotel.hotel.amenities,
      avgDistanceToDestinationsKm: topHotel.breakdown.avgDistanceKm,
      farthestDestinationKm: topHotel.breakdown.farthestDestinationKm,
    },
    days: days.map((d) => ({
      day: d.day,
      destinations: d.destinations.map((dest) => ({
        id: dest.id,
        name: dest.name,
        category: dest.category,
      })),
    })),
  };

  const schema = {
    type: 'object',
    required: ['hotelReason', 'tripIntro', 'dayTitles'],
    properties: {
      hotelReason: { type: 'string' },
      tripIntro: { type: 'string' },
      dayTitles: {
        type: 'array',
        items: {
          type: 'object',
          required: ['day', 'title'],
          properties: { day: { type: 'number' }, title: { type: 'string' } },
        },
      },
    },
  };

  return [
    'Here is the computed trip data:',
    '```json',
    JSON.stringify(payload, null, 2),
    '```',
    '',
    'Return ONLY a JSON object matching this schema:',
    '```json',
    JSON.stringify(schema, null, 2),
    '```',
    '',
    '- hotelReason: 1-2 sentences on why the recommended hotel fits this specific trip.',
    '- tripIntro: 1 friendly sentence introducing the plan (mention the city and day count).',
        '- dayTitles: a short (3-5 word) theme title for each day, based on the categories of',
    ' the destinations of that day (e.g. \"Temples and river views\").',
    '- If budget.status is "insufficient", tripIntro should gently acknowledge that budget is',
    '  tight for this plan, without inventing a specific alternative price - that figure is',
    '  already provided separately to the user.',
  ].join('\n');
}

