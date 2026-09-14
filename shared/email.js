/**
 * An address a ticket can be sent to.
 *
 * Shared by the review page and checkout, like shared/flightCharge.js, so the
 * page never lets a guest through with an email the server then refuses.
 */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const isUsableEmail = (value) => EMAIL.test(String(value ?? '').trim());
