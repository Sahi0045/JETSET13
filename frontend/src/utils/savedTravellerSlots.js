import { ageInYears } from '../../../shared/flightCharge';

/**
 * Putting a saved traveller into a traveller form on the review page.
 *
 * The fare fixes each form's type - an adult, child or infant fare - so a
 * saved person goes only where their age on the day of travel fits: under 2 an
 * infant, 2 to 11 a child, 12 and over an adult. Someone saved without a date
 * of birth goes only into an adult place, the one type that can travel
 * domestically without one.
 */

const LABEL = { ADULT: 'adult', CHILD: 'child', HELD_INFANT: 'infant', SEATED_INFANT: 'infant' };

/** The fare type a person of this birth date travels on, on this day. */
export const typeForAge = (dateOfBirth, travelDate) => {
  if (!dateOfBirth) return 'ADULT';
  const age = ageInYears(dateOfBirth, travelDate || new Date().toISOString().slice(0, 10));
  if (age === null || age >= 12) return 'ADULT';
  return age < 2 ? 'HELD_INFANT' : 'CHILD';
};

/** True when nothing has been typed into a form yet. */
export const isBlankTraveller = (traveller) => !traveller?.firstName && !traveller?.lastName
  && !traveller?.dateOfBirth && !traveller?.passportNumber;

/**
 * Fill the first empty form of the right type with a saved person.
 *
 * @returns {{ travellers: Array, filledId: number } | { problem: string }}
 */
export function placeSavedTraveller(travellers, person, travelDate) {
  const type = typeForAge(person?.dateOfBirth, travelDate);
  const slot = (travellers ?? []).find((t) => t.type === type && isBlankTraveller(t));
  if (!slot) {
    const hasType = (travellers ?? []).some((t) => t.type === type);
    return {
      problem: hasType
        ? `Every ${LABEL[type]} place on this booking is already filled.`
        : `This booking has no ${LABEL[type]} place. Use "Add or remove travellers" to add one.`,
    };
  }

  return {
    filledId: slot.id,
    travellers: travellers.map((t) => (t.id !== slot.id ? t : {
      ...t,
      firstName: person.firstName || '',
      lastName: person.lastName || '',
      gender: person.gender || t.gender,
      dateOfBirth: person.dateOfBirth || '',
      nationality: person.nationality || t.nationality || '',
      passportNumber: person.passportNumber || '',
      passportExpiry: person.passportExpiry || '',
      savedTravellerId: person.id,
    })),
  };
}

/** Take a saved person back out of the form they filled. */
export const removeSavedTraveller = (travellers, personId, blank) => (travellers ?? [])
  .map((t, index) => (t.savedTravellerId === personId ? blank(t.type, index) : t));

/** A form's traveller as the saved list stores them. */
export const toSavedTraveller = (traveller) => ({
  firstName: traveller.firstName,
  lastName: traveller.lastName,
  gender: traveller.gender,
  dateOfBirth: traveller.dateOfBirth,
  nationality: traveller.nationality,
  passportNumber: traveller.passportNumber,
  passportExpiry: traveller.passportExpiry,
});
