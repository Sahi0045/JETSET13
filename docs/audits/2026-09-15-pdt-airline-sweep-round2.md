# Amadeus PDT airline test, round 2: all 162 codes on the LAT list (15 Sep 2026)

## How the test was run

- **Code:** main at `e1825c2`, which includes #124–#129.
- **When:** 18:17–18:30Z for the main run; follow-up retests and probes ran until 18:57Z.
- **Codes:** the 162 codes on the office's authorised ticketing-airline list. That is Mónica's AA…SC list plus Jonathan's final row: SK SN SQ SS SU SV SY SZ S4.
- **Booking:** one adult with a passport and contact details.
- **Steps:** search, then informative pricing, then the pre-payment seat check, then the booking chain (sell, elements, FOP, PNR pricing, TST, commit, queue 90 C0, wait for the airline locator, issue). Each booking was voided and cancelled immediately.
- **Results:** `2026-09-15-pdt-airline-sweep-round2.json`, which holds the main run only. Retests and probes are described below.

## Result

**Ticketing works on 83 of 162 codes.**

**No failure was traced to our code:**
- All 74 tickets issued in the run have ticket numbers and were queued.
- No booking was left booked but not ticketed.
- Nothing that ticketed in round 1 failed because of our code. CA's first flight was refused by the airline at the seat check (UNS).

| | Round 1 (153 codes) | Round 2 (162 codes) |
|---|---|---|
| Ticketed in the run | 62 | 74 |
| Ticketing proven overall | 68 (after the #129 proofs) | 83 |

## Ticketing proven (83)

**In the run (74):**

AD AC AA AF AH AT AR AV A3 AY BP BR BT BW B0 CI DE DM DL EI DY EY ET FI FJ FZ GA GQ HC G3 H2 HX IE HO JU JL JY KE J2 KL KM KP KQ KX LA LH LO LY LX MK MH MS MU NX OB OS OU OZ PG PD PK PR PU PX PY QR RJ RO SA SB SK SN SV S4

**On another flight they operate, after the first flight tried failed (8).** Each was ticketed, voided and cancelled:

| Airline | Flight | PNR | Ticket |
|---|---|---|---|
| GZ | GZ614/T RAR-AIT | BAGULO | 755-7491175141 |
| FN | FN8003/K HRE-VFA | BAGRJN | 334-7491175142 |
| ME | ME201/Q BEY-LHR | BAGNQB | 076-7491175143 |
| PW | PW713/V DAR-ZNZ | BAGSS6 | 031-7491175144 |
| NZ | NZ6/S AKL-LAX | BAHZZK | 086-7491175145 |
| IB | IB411/N MAD-BCN | BAEYSI | 075-7491175137 |
| B6 | B6323/L JFK-LAX | BAIH7H | 279-7491175146 |
| AS | AS121/X SEA-HNL | BAIEUS | 027-7491175147 |

**From round 1 (1):** CA ticketed on round 1. It was not rebooked, because CA voids do not complete on PDT (see below).

**Why IB failed in the run:** IB4001 is a codeshare operated by AA. Its segment status is TK, and issuance answers `1969 VERIFY ITINERARY`. Iberia's own flights ticket.

## Ticketing refused by the office setup (14) - for Amadeus

All 14 codes are on the LAT list. Each booking was cancelled cleanly.

| Airline | Flight | Answer at DocIssuance_IssueTicket |
|---|---|---|
| AW | AW208/T ACC-LOS | AW ETKT: INVALID AIRLINE DESIGNATOR/VENDOR SUPPLIER |
| BF | BF700/X ORY-RUN | BF ETKT: NOT AUTHORISED (round 1: SYSTEM UNABLE TO PROCESS) |
| CY | CY380/S LCA-CDG | CY ETKT: NOT AUTHORISED |
| EN | EN2158/S MUC-VRN | EN ETKT: NOT AUTHORISED |
| HF | HF706/Q ABJ-DSS | HF ETKT: NOT AUTHORISED |
| JX | JX1002/N TPE-LAX | JX ETKT: NOT AUTHORISED |
| KC | KC221/E ALA-FRA | KC ETKT: NOT AUTHORISED |
| KU | KU101/V KWI-LHR | KU ETKT: NOT AUTHORISED |
| LG | LG4601/G LUX-LCY | LG ETKT: NOT AUTHORISED |
| NT | NT101/Y LPA-TFN | NT ETKT: NOT AUTHORISED |
| SQ | SQ308/Q SIN-LHR | SQ ETKT: NOT AUTHORISED |
| SS | SS926/L ORY-PTP | SS ETKT: NOT AUTHORISED |
| CZ | CZ303/V CAN-LHR | CZ ETKT: COMMUNICATIONS LINE UNAVAILABLE |
| GF | GF7/S BAH-LHR | 8100 ETKT THIS CARRIER NOT VALID THIS MARKET (GOT to add GF is open) |

## Airline locator never arrives (2) - for Amadeus

We wait 90 s for the airline locator, then retry issuance.

| Airline | Flight | Answer |
|---|---|---|
| BI | BI423/U BWN-SIN | 9125 ETKT DISALLOWED - NEED AIRLINE R/LOC-RETRY |
| CG | CG8638/W POM-LAE | 9125 ETKT DISALLOWED - NEED AIRLINE R/LOC-RETRY. Five earlier CG flights timed out at the seat-check sell. |

## Seats refused on every flight tried (7) - PDT inventory

The airline answered UNS (288) to the sell on every flight it operates that was tried: FB, HM, JA, MF, P0, RC.

NO was UNS in the run, and had no flights on 4 Nov in the retest.

The seat check stops these before payment, so no card is charged.

## No fares on PDT (56) - not our search filter

AG AN AU A9 BG BE DO DT D9 EB E9 GE GL GP HU HY H5 IZ JD I6 KF KG K6 LE LF LM LQ MD MR MX NE NF NM NP N4 N8 OA OD OK OL OM OY PC PS QS QV Q4 RA RQ RW RZ R3 SC SU SY SZ

**The filter was checked.** Each carrier's home route was searched without the airline filter (37 routes). None of these airlines validated a single offer. The same check on LH FRA-JFK returns LH in both filtered and unfiltered searches, so the filter works. OA, QV and NF appear only as the operator of flights that another airline validates.

## Fares quoted but not bookable - PDT fare data

These are a gap in our checkout, not in our booking code.

### B6, flight numbers 37xx and 39xx

- **The refusal follows the flight, not the fare.** Search and informative pricing quote the published fare PI2QUOY1 at $193.40. `Fare_PricePNRWithBookingClass` then answers `NO FARE FOR BOOKING CODE-TRY OTHER PRICING OPTIONS`.
- **Same run, same code.** B6 3982, 3988 and 3996/L JFK-LAX (one 17:45 departure under three numbers) were refused. B6 323/L priced $193.40 with the same fare. The refusal also happens after a bare sell, with no names, SSRs or FOP.
- **Earlier JetBlue mismatches are the same family.** The JFK-LHR price-check failures in both rounds were on B6 3912 and 3917 (quoted $294.50, PNR-priced $1,743.50).
- **These were ruled out:**
  - the FOP (refused with it and without it);
  - the RU option (the fare is RP);
  - the FBA, PFF and VC options.

### AS, class X

- **Search quotes GH5OXUBN at $153.40.** Informative pricing answers 911 on most flights; the checkout pricing step turns that into a 409 before payment.
- **Some pass informative pricing and still fail.** AS83 and AS99 SEA-ANC were refused at PNR pricing. AS1306 was PNR-priced as VH0OXVBN at $267.40.

### Effect today

- The booking chain refuses these before commit, with a 409 "search again", so no booking or ticket is created.
- But PNR pricing only runs after the card is charged, so the customer is refunded.

## Voids and cancellation

**Our code works here.** `cancelBooking` leaves the itinerary intact when a void fails. Voids of HO, B6, AS, GZ, FN, ME, PW, NZ and IB completed.

**HO (Juneyao):**
- The void timed out at our 25 s limit twice, then answered in 3 s.
- On BA3HO8, a first void hours after the timeouts answered a fresh X/O, not 6150. So a timed-out void never completed on Amadeus's side.
- Both HO bookings are now voided and cancelled.

**CA, MU and NX:**
- With a 120 s limit, Amadeus itself answers `101 Application Unknown error` after 60 s.
- One NX booking (BA3OBN) voided on a later retry.

**KE and LY:**
- KE answers `5458 NOT AUTHORISED` to the void.
- LY answers `5245 MESSAGE FUNCTION NOT SUPPORTED`.

**Test tickets still open.** Tickets from 15 Sep can only be voided until the end of that day (UTC). One more void retry was scheduled for about 20:03Z.

| Airline | PNR | Ticket | Reason |
|---|---|---|---|
| KE | BAEDLR | 180-7491175099 | void 5458 NOT AUTHORISED |
| KE | BA2WVF | 180-7491175009 | void 5458 NOT AUTHORISED (round 1) |
| LY | BAEW4D | 114-7491175111 | void 5245 NOT SUPPORTED |
| LY | BA3TFM | 114-7491175020 | void 5245 NOT SUPPORTED (round 1) |
| MU | BAEWD4 | 781-7491175116 | void 101 after 60 s |
| NX | BAF4V8 | 675-7491175117 | void 101 after 60 s |
| CA | BA47QJ | 999-7491174987 | void 101 after 60 s (round 1) |

## Airlines not on the authorised list (tested at about 20:15Z)

Search also returns fares validated by airlines that are not on the list at all. One fare validated by each airline was booked, ticketed, voided and cancelled. Nothing was left open.

| Airline | Flight | Result |
|---|---|---|
| CX | CX251/L HKG-LHR | 2161 PROHIBITED TICKETING CARRIER |
| EK | EK3/K DXB-LHR | 2161 PROHIBITED TICKETING CARRIER |
| QF | QF423/E SYD-MEL | 2161 PROHIBITED TICKETING CARRIER |
| UL | UL503/O CMB-LHR | 2161 PROHIBITED TICKETING CARRIER |
| VN | VN206/E SGN-HAN | VN ETKT: NOT AUTHORISED |
| TK | TK1987/O IST-LHR | Ticketed 235-7491175152, then voided |
| TG | TG916/W BKK-LHR | Ticketed 217-7491175155, then voided |
| WY | WY101/T MCT-LHR | Ticketed 910-7491175153, then voided |
| HR (H1 flights), GP (SG flights) | DEL-BOM, DEL-BLR | UNS at the seat check on every flight tried |
| UA, ZH | EWR-SFO, EWR-LHR, SZX-PEK | UNS at the seat check on every flight tried |
| BA | LHR-JFK, LHR-MAD | No fares validated by BA on PDT |

**What this shows:** being off the list usually means ticketing is refused, but not always. TK, TG, WY and VS ticketed.

**What it means for our search:** after Air India is hidden, DEL-BOM shows only HR- and GP-validated fares, and neither airline has been proven to ticket.

## Recommendations (no code written)

1. **Price the PNR inside the pre-payment seat check.**
   - `confirmSeats` already sells and signs out. Adding `Fare_PricePNRWithBookingClass` after the sell works with no names: B6 323 priced after a bare sell.
   - A refusal or a rise would then be caught before the card is charged. That covers B6 37xx/39xx, AS83/AS99/AS1306, and the JFK-LHR case.
   - The cost is one more call at checkout.
2. **Retry a timed-out void once, in a fresh session.** HO shows the second attempt can succeed, and a repeat is already read correctly: 6150 counts as voided.
3. **Business: customers can pay for tickets we cannot issue.** Search offers the 14 office-blocked carriers, so a customer could pay for a fare we cannot ticket and then be refunded. Either Amadeus enables ETKT on those carriers, or search filters out validating carriers that cannot ticket.

## Questions for Amadeus

- **ETKT authorisation:** please enable it on AW BF CY EN HF JX KC KU LG NT SQ SS; CZ answers "communications line unavailable"; GF is covered by the open GOT. Does production behave the same for these carriers?
- **Airline locator:** BI and CG never return one within 90 s. Is that PDT-only?
- **Void timeouts:** CA, MU and NX voids answer 101 after 60 s, and HO voids time out intermittently.
- **Voids refused:** KE (5458) and LY (5245) refuse voids. Is that office configuration, and does production differ?
- **B6 37xx/39xx:** why do MasterPricer and informative pricing return PI2QUOY1 on these flights when PNR pricing refuses it?
- **Cleanup:** please clear the open test tickets listed above.
