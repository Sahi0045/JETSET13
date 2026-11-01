import { describe, expect, it } from 'vitest';
import { generateBookingConfirmationTemplate, generateTicketIssuedTemplate } from '../../backend/services/email/templates.js';

const htmlOf = (result) => String(result?.html ?? result);
const alaska = { pnr: 'BMYESL', airline_locators: [{ carrierCode: 'AS', locator: 'QHNFSU' }] };

describe('the PNR in the e-ticket email', () => {
  it("names the airline's code the airline PNR, and ours the GDS PNR", () => {
    const html = htmlOf(generateTicketIssuedTemplate({ bookingReference: 'FLT1', tickets: [{ number: '027-7515321800' }], bookingDetails: alaska }));

    expect(html).toMatch(/Airline PNR[\s\S]*QHNFSU/);
    expect(html).toMatch(/GDS PNR[\s\S]*BMYESL/);
    expect(html).toContain('The airline PNR below is the one on its own website.');
    expect(html).not.toContain('Airline reference');
  });

  it('does not call our code the airline\'s before the airline sends its own', () => {
    const html = htmlOf(generateTicketIssuedTemplate({ bookingReference: 'FLT1', tickets: [{ number: '027-7515321800' }], bookingDetails: { pnr: 'BMYESL' } }));

    expect(html).toMatch(/Booking code \(PNR\)[\s\S]*BMYESL/);
    expect(html).not.toContain('Airline PNR');
    expect(html).not.toContain('Airline reference');
    expect(html).not.toContain('one on its own website');
  });
});

describe('the PNR in the booking confirmation email', () => {
  it("names the airline's code the airline PNR, and ours the GDS PNR", () => {
    const html = htmlOf(generateBookingConfirmationTemplate({ bookingReference: 'FLT1', bookingType: 'flight', paymentAmount: 742.53, bookingDetails: alaska }));

    expect(html).toMatch(/Airline PNR[\s\S]*QHNFSU/);
    expect(html).toMatch(/GDS PNR[\s\S]*BMYESL/);
    expect(html).not.toContain('Airline reference');
  });

  it('calls our code a PNR before the airline sends its own', () => {
    const html = htmlOf(generateBookingConfirmationTemplate({ bookingReference: 'FLT1', bookingType: 'flight', paymentAmount: 742.53, bookingDetails: { PNR: 'BMYESL' } }));

    expect(html).toMatch(/Booking code \(PNR\)[\s\S]*BMYESL/);
    expect(html).not.toContain('Airline reference');
  });
});
