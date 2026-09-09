// Turns a day's ordered destinations into a concrete list of timed activities
// (meals, travel, destination visits) matching the plannerOutput schema.
// This is deliberately deterministic and rule-based -- see routingService.js
// for why. The LLM is not involved in arithmetic on times/distances anywhere
// in this file; it only ever narrates the result (see promptBuilder.js).

const DAY_START = '09:00';
const BREAKFAST_MINUTES = 30;
const LUNCH_MINUTES = 60;
const LUNCH_WINDOW = ['12:00', '14:30']; // lunch is inserted the first time the
                                          // clock enters this window between stops
const AVG_SPEED_KMH = 40;
const MIN_TRAVEL_MINUTES = 15;

export function buildDayTimetable({ dayDestinations, hotelName = 'Hotel' }) {
  const activities = [];
  let clock = toMinutes(DAY_START);
  let lunchPlaced = dayDestinations.length === 0;

  activities.push(
    slot(clock, (clock += BREAKFAST_MINUTES), 'meal', { title: 'Breakfast' })
  );

  let previousName = hotelName;

  dayDestinations.forEach((dest, idx) => {
    const travelMinutes = Math.max(
      MIN_TRAVEL_MINUTES,
      Math.round(((dest.distanceFromPreviousKm ?? 0) / AVG_SPEED_KMH) * 60)
    );
    const start = clock;
    clock += travelMinutes;
    activities.push(
      slot(start, clock, 'travel', {
        from: previousName,
        to: dest.name,
        distanceKm: dest.distanceFromPreviousKm != null ? round1(dest.distanceFromPreviousKm) : null,
        distanceEstimated: !!dest.distanceEstimated,
      })
    );

    // Insert lunch once the clock first lands inside the lunch window,
    // before starting the next visit.
    if (!lunchPlaced && withinWindow(clock, LUNCH_WINDOW)) {
      const start2 = clock;
      clock += LUNCH_MINUTES;
      activities.push(slot(start2, clock, 'meal', { title: 'Lunch' }));
      lunchPlaced = true;
    }

    const visitStart = clock;
    clock += dest.visitDurationHours * 60;
    activities.push(
      slot(visitStart, clock, 'destination', {
        destinationId: dest.id,
        title: `Explore ${dest.name}`,
      })
    );

    previousName = dest.name;

    // If this was the last stop and lunch still hasn't happened, place it
    // right after -- better a slightly late lunch than none.
    if (!lunchPlaced && idx === dayDestinations.length - 1) {
      const start3 = clock;
      clock += LUNCH_MINUTES;
      activities.push(slot(start3, clock, 'meal', { title: 'Lunch' }));
      lunchPlaced = true;
    }
  });

  if (dayDestinations.length > 0) {
    const lastDest = dayDestinations[dayDestinations.length - 1];
    const returnKm = lastDest.distanceFromPreviousKm ?? 0; // best-effort; real
    // trips should supply a route leg back to the hotel if it differs.
    const travelMinutes = Math.max(MIN_TRAVEL_MINUTES, Math.round((returnKm / AVG_SPEED_KMH) * 60));
    const start = clock;
    clock += travelMinutes;
    activities.push(
      slot(start, clock, 'travel', {
        from: previousName,
        to: hotelName,
        distanceKm: round1(returnKm),
        distanceEstimated: true,
      })
    );
  }

  return activities;
}

function slot(startMin, endMin, type, rest) {
  return {
    startTime: fromMinutes(startMin),
    endTime: fromMinutes(endMin),
    type,
    ...rest,
  };
}

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function fromMinutes(total) {
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function withinWindow(minutes, [startHHMM, endHHMM]) {
  return minutes >= toMinutes(startHHMM) && minutes <= toMinutes(endHHMM);
}

function round1(n) {
  return Math.round(n * 10) / 10;
}
