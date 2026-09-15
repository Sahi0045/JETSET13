import { describe, expect, it } from 'vitest';
import { NAME_MISSING, NAME_NOT_LATIN, toPnrName, travellerNameProblem } from '../../shared/passengerName.js';

/**
 * One name rule for the review page, checkout and the PNR.
 *
 * The chain kept A-Z after decomposing accents, so a letter with no
 * decomposition vanished - "Łukasz" was booked as UKASZ, "Øyvind" as YVIND - and
 * a name in another script became empty, which the chain refused only after
 * payment. The order route then refunded the customer.
 */

describe('toPnrName', () => {
  it('spells letters that do not decompose in Latin rather than dropping them', () => {
    expect(toPnrName('Łukasz')).toBe('LUKASZ');
    expect(toPnrName('Øyvind')).toBe('OYVIND');
    expect(toPnrName('Ærøskøbing')).toBe('AEROSKOBING');
    expect(toPnrName('Weiß')).toBe('WEISS');
    expect(toPnrName('Đorđević')).toBe('DORDEVIC');
    expect(toPnrName('Þórður')).toBe('THORDUR');
  });

  it('keeps what the chain always kept', () => {
    expect(toPnrName('José')).toBe('JOSE');
    expect(toPnrName("O'Brien")).toBe('OBRIEN');
    expect(toPnrName('Anne-Marie  van der Berg')).toBe('ANNE-MARIE VAN DER BERG');
  });
});

describe('travellerNameProblem', () => {
  it('accepts a name the PNR can print, transliterated letters included', () => {
    expect(travellerNameProblem({ firstName: 'Łukasz', lastName: 'Żółć' })).toBeNull();
    expect(travellerNameProblem({ firstName: 'Mary-Jane', lastName: "O'Neil" })).toBeNull();
  });

  it('asks for a missing name', () => {
    expect(travellerNameProblem({ firstName: ' ', lastName: 'Doe' })).toBe(NAME_MISSING);
  });

  it('refuses a name in another script, which the PNR would leave empty', () => {
    expect(travellerNameProblem({ firstName: 'Иван', lastName: 'Petrov' })).toBe(NAME_NOT_LATIN);
    expect(travellerNameProblem({ firstName: 'Asha', lastName: 'राव' })).toBe(NAME_NOT_LATIN);
  });

  it('refuses a name that would still lose a letter', () => {
    expect(travellerNameProblem({ firstName: 'Anna', lastName: 'Smithə' })).toBe(NAME_NOT_LATIN);
  });

  it('says what to do: type it as the passport prints it, in Latin letters', () => {
    expect(NAME_NOT_LATIN).toMatch(/as they are printed on the passport or ID in Latin letters/);
  });
});
