// Plain haversine distance in kilometers. Used only as a fallback when the
// feasibility engine hasn't already supplied a distance for a given pair of
// points in `route`. Real supplied distances always win -- see routingService.
export function haversineKm(a, b) {
  const R = 6371;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function toRad(deg) {
  return (deg * Math.PI) / 180;
}
