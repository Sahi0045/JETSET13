const imageUrl = (photoId) =>
  `https://images.unsplash.com/photo-${photoId}?auto=format&fit=crop&w=1600&q=80`;

export const DESTINATION_IMAGES = Object.freeze({
  losAngeles: imageUrl('1534190239940-9ba8944ea261'),
  miami: imageUrl('1507525428034-b723cf961d3e'),
  paris: imageUrl('1526778548025-fa2f459cd5c1'),
  nice: imageUrl('1499856871958-5b9627545d1a'),
});
