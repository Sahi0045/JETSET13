/** "057-7513754072", or "057-7513754072-73" for a conjunction set ending at 057-7513754073. */
export function printedTicketNumber(ticket) {
  const number = String(ticket?.number ?? '');
  const last = String(ticket?.conjunctionTo ?? '');
  return last && last !== number ? `${number}-${last.slice(-2)}` : number;
}
