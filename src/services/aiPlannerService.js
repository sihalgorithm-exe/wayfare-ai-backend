import { orderDestinations, splitIntoDays } from './routingService.js';
import { buildDayTimetable } from './timetableService.js';
import { scoreHotels } from './hotelScoringService.js';
import { buildNarrativeSystemPrompt, buildNarrativeUserPrompt } from './promptBuilder.js';
import { getProvider } from './llmProviders/index.js';
import { checkNarrative, checkPlannerOutput } from '../validators/validateOutput.js';

// AIPlannerService: the one entry point the routes call. Everything else in
// services/ is a private implementation detail of this orchestration --
// swapping the LLM provider, tweaking hotel weights, or changing the day-split
// heuristic never has to touch routes/ or the frontend contract.
export async function planTrip(tripInput) {
  const { trip, destinations, hotels, preferences, feasibility, budget } = tripInput;

  if (!feasibility?.feasible) {
    const err = new Error('Trip is not feasible');
    err.status = 422;
    err.publicMessage =
      'This trip has not passed the Feasibility Engine. Send it back there before requesting a plan.';
    throw err;
  }

  // Budget is optional. When present, derive a per-night ceiling from the
  // WORST-CASE remaining budget (the more conservative of the two bounds)
  // divided across nights, and feed that into hotel scoring as a real
  // constraint rather than a vague preset.
  const nights = Math.max(1, (trip.numberOfDays || 1) - 1);
  const effectivePreferences = { ...preferences };
  let budgetStatus = null;

  if (budget && budget.valid) {
    const worstCaseRemaining = budget.remainingBudget.min;
    const maxBudgetPerNight = worstCaseRemaining / nights;
    effectivePreferences.maxBudgetPerNight = maxBudgetPerNight;

    const cheapestHotelPrice = hotels.length
      ? Math.min(...hotels.map((h) => h.pricePerNight))
      : null;

    if (cheapestHotelPrice !== null && cheapestHotelPrice > maxBudgetPerNight) {
      const shortfallPerNight = Math.round(cheapestHotelPrice - maxBudgetPerNight);
      budgetStatus = {
        status: 'insufficient',
        message: `Even the most affordable available hotel is about ₹${shortfallPerNight} more per night than your remaining budget allows. Consider increasing your total budget by roughly ₹${shortfallPerNight * nights} or choosing fewer/closer destinations.`,
      };
    } else {
      budgetStatus = { status: 'ok', message: null };
    }
  }

  // 1. Hotel scoring (needs only destinations, not order/timetable).
  const rankedHotels = scoreHotels(hotels, destinations, effectivePreferences);

  // "Change Hotel" support: if the frontend passed a specific hotel the user
  // picked (see routes/planner.routes.js + ControlsBar.jsx), honour it as the
  // recommendation instead of the top-scored one, but keep using the real
  // score we computed for it so the LLM's "reason" text is still grounded.
  const topHotel = tripInput.selectedHotelId
    ? rankedHotels.find((h) => h.hotel.id === tripInput.selectedHotelId) || rankedHotels[0]
    : rankedHotels[0];

  // 2. Destination order, starting from the recommended hotel.
  const ordered = orderDestinations(destinations, tripInput.route, topHotel?.hotel);

  // 3. Day split.
  const rawDays = splitIntoDays({
    orderedDestinations: ordered,
    numberOfDays: trip.numberOfDays,
    hoursPerDay: trip.hoursPerDay,
  });

  const warnings = [];
  rawDays.forEach((d, idx) => {
    if (d.overBudget) {
      warnings.push(
        `Day ${idx + 1} runs a little over your ${trip.hoursPerDay}-hour budget once travel time between stops is included. Consider removing a destination or adding a day.`
      );
    }
  });

  // 4. Timetable per day.
  const days = rawDays.map((d, idx) => ({
    day: idx + 1,
    destinations: d.destinations,
    activities: buildDayTimetable({ dayDestinations: d.destinations, hotelName: topHotel?.hotel.name }),
  }));

  // 5. Narration from the LLM -- narrow, validated, with a safe fallback.
  const narrative = await getNarrative({ trip, preferences, topHotel, days, budget, budgetStatus });

  // 6. Assemble the response the frontend actually renders.
  if (budgetStatus?.status === 'insufficient') {
    warnings.push(budgetStatus.message);
  }

  const output = {
    tripSummary: {
      city: trip.city,
      numberOfDays: trip.numberOfDays,
      hoursPerDay: trip.hoursPerDay,
      intro: narrative.tripIntro,
      warnings,
      budget: budget && budget.valid ? {
        totalBudget: budget.totalBudget,
        estimatedTravelCost: budget.estimatedTravelCost,
        remainingBudget: budget.remainingBudget,
        status: budgetStatus?.status || 'ok',
      } : null,
    },
    hotelRecommendation: topHotel && {
      hotelId: topHotel.hotel.id,
      name: topHotel.hotel.name,
      pricePerNight: topHotel.hotel.pricePerNight,
      rating: topHotel.hotel.rating,
      amenities: topHotel.hotel.amenities,
      reason: narrative.hotelReason,
      alternatives: rankedHotels.slice(1, 3).map((h) => ({ hotelId: h.hotel.id, name: h.hotel.name })),
    },
    days: days.map((d) => ({
      day: d.day,
      title: narrative.dayTitles.find((t) => t.day === d.day)?.title || `Day ${d.day}`,
      activities: d.activities,
    })),
  };

  const check = checkPlannerOutput(output);
  if (!check.ok) {
    console.warn('planTrip: assembled output failed schema check', check.errors);
  }

  return output;
}

// Used by the "Change Hotel" control: returns every hotel ranked with its
// score breakdown, so the frontend can show alternatives without generating
// a full plan (and without an LLM call) for each one.
export function rankHotels(tripInput) {
  const { destinations, hotels, preferences } = tripInput;
  return scoreHotels(hotels, destinations, preferences).map((h) => ({
    hotelId: h.hotel.id,
    name: h.hotel.name,
    pricePerNight: h.hotel.pricePerNight,
    rating: h.hotel.rating,
    amenities: h.hotel.amenities,
    score: h.score,
    breakdown: h.breakdown,
  }));
}

async function getNarrative({ trip, preferences, topHotel, days, budget, budgetStatus }) {
  const fallback = buildFallbackNarrative({ trip, topHotel, days });
  try {
    const provider = getProvider();
    const raw = await provider.complete(
      buildNarrativeSystemPrompt(),
      buildNarrativeUserPrompt({ trip, preferences, topHotel, days, budget, budgetStatus })
    );
    const { ok, data, errors } = checkNarrative(raw);
    if (!ok) {
      console.warn('getNarrative: LLM response failed validation, using fallback text', errors);
      return fallback;
    }
    // Fill in any day the LLM skipped rather than leaving it titleless.
    const dayTitles = days.map((d) => data.dayTitles.find((t) => t.day === d.day) || { day: d.day, title: `Day ${d.day}` });
    return { ...data, dayTitles };
  } catch (err) {
    console.warn('getNarrative: LLM call failed, using fallback text:', err.message);
    return fallback;
  }
}

// Plain-template narration used if the LLM is unreachable, misconfigured, or
// returns something that fails validation. The user still gets a complete,
// correct plan -- just with simpler wording. Nothing here is invented data:
// every value it references (hotel name, distance, category) came from the
// deterministic layer above.
function buildFallbackNarrative({ trip, topHotel, days }) {
  return {
    tripIntro: `Here's your ${trip.numberOfDays}-day plan for ${trip.city}.`,
    hotelReason: topHotel
      ? `${topHotel.hotel.name} is well positioned for your selected destinations, averaging about ${topHotel.breakdown.avgDistanceKm} km away.`
      : 'No hotel data was available to score.',
    dayTitles: days.map((d) => ({ day: d.day, title: `Day ${d.day}` })),
  };
}
