import { haversineKm } from '../utils/geo.js';

// --- Hotel suitability score ---
// hotelSuitability = w.location * locationScore
//                   + w.route     * routeScore
//                   + w.price     * priceScore
//                   + w.rating    * ratingScore
//                   + w.amenities * amenitiesScore
//                   + w.preference* preferenceScore
//
// Every sub-score is normalised to 0-1 so the weights below are the only
// thing you need to touch to change behaviour. This score is never shown to
// the user directly (per spec) -- it's only used to pick and rank hotels and
// to ground the plain-language "reason" the LLM writes.
export const DEFAULT_WEIGHTS = {
  location: 0.30,
  route: 0.20,
  price: 0.20,
  rating: 0.15,
  amenities: 0.10,
  preference: 0.05,
};

export function scoreHotels(hotels, destinations, preferences = {}, weights = DEFAULT_WEIGHTS) {
  if (!hotels?.length) return [];

  const distances = hotels.map((h) => avgDistanceToDestinations(h, destinations));
  const maxAvgDist = Math.max(...distances, 1);

  const prices = hotels.map((h) => h.pricePerNight);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);

  const scored = hotels.map((hotel, i) => {
    const avgDistKm = distances[i];
    const farthestDestKm = maxDistanceToDestinations(hotel, destinations);

    const locationScore = 1 - avgDistKm / maxAvgDist; // closer to destinations, on average, is better
    const routeScore = 1 - farthestDestKm / maxAvgDist; // no single destination is a long detour
    const priceScore = priceCompatibility(hotel.pricePerNight, minPrice, maxPrice, preferences.budget);
    const ratingScore = clamp01(hotel.rating / 5);
    const amenitiesScore = amenitiesMatch(hotel.amenities, preferences.mustHaveAmenities);
    const preferenceScore = preferenceMatch(hotel, preferences);

    const total =
      weights.location * clamp01(locationScore) +
      weights.route * clamp01(routeScore) +
      weights.price * priceScore +
      weights.rating * ratingScore +
      weights.amenities * amenitiesScore +
      weights.preference * preferenceScore;

    return {
      hotel,
      score: Number(total.toFixed(4)),
      // Every *Score field below is clamped to 0-1 -- same values the total
      // above is actually computed from -- so this breakdown never shows a
      // number that contradicts the score it explains.
      breakdown: {
        avgDistanceKm: Number(avgDistKm.toFixed(2)),
        farthestDestinationKm: Number(farthestDestKm.toFixed(2)),
        locationScore: Number(clamp01(locationScore).toFixed(2)),
        routeScore: Number(clamp01(routeScore).toFixed(2)),
        priceScore: Number(priceScore.toFixed(2)),
        ratingScore: Number(ratingScore.toFixed(2)),
        amenitiesScore: Number(amenitiesScore.toFixed(2)),
        preferenceScore: Number(preferenceScore.toFixed(2)),
      },
    };
  });

  return scored.sort((a, b) => b.score - a.score);
}

function avgDistanceToDestinations(hotel, destinations) {
  if (!destinations.length) return 0;
  const total = destinations.reduce((sum, d) => sum + haversineKm(hotel, d), 0);
  return total / destinations.length;
}

function maxDistanceToDestinations(hotel, destinations) {
  if (!destinations.length) return 0;
  return Math.max(...destinations.map((d) => haversineKm(hotel, d)));
}

function priceCompatibility(price, min, max, budgetPreference) {
  if (max === min) return 1;
  const normalized = 1 - (price - min) / (max - min); // cheaper -> higher score by default
  if (budgetPreference === 'luxury') {
    // Invert: for a stated luxury preference, higher price within the
    // supplied set is treated as more compatible, not penalised.
    return 1 - normalized;
  }
  return clamp01(normalized);
}

function amenitiesMatch(amenities = [], mustHave = []) {
  if (!mustHave?.length) return 0.5; // neutral when no preference stated
  const have = new Set((amenities || []).map((a) => a.toLowerCase()));
  const hits = mustHave.filter((a) => have.has(a.toLowerCase())).length;
  return hits / mustHave.length;
}

function preferenceMatch(hotel, preferences) {
  if (!preferences || Object.keys(preferences).length === 0) return 0.5;
  let score = 0.5;
  if (preferences.budget === 'budget' && hotel.pricePerNight <= (preferences.maxBudgetPerNight ?? Infinity)) {
    score += 0.25;
  }
  if (preferences.travelStyle === 'luxury' && hotel.rating >= 4.5) {
    score += 0.25;
  }
  return clamp01(score);
}

function clamp01(n) {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}
