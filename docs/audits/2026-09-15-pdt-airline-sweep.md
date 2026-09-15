# Amadeus PDT airline test: every airline on the Monica ticketing list (15 Sep 2026)

Office SCK1S2400, WSAP 1ASIWJETJEC, code at branch fix/amadeus-class-pairs-and-stuck-cancel (PR #128). One adult with a passport per airline: search, seat check, book (auto-ticket, queue 90 C0), then void and cancel.

**153 airline codes** (the visible part of the list, AA to SC): **62 ticketed**, 17 failed, 12 not sellable on PDT, 33 no fare found, 29 no route tried.

## Ticketed (62)

AD, AC, AA, AH, AF, AR, AT, AV, AY, A3, BP, BT, BR, BW, B0, CI, DE, CA, DL, DY, EI, ET, EY, FI, FJ, GA, GQ, HC, G3, IE, JL, HO, JU, KE, JY, KL, KP, KM, KQ, KX, LA, LO, LH, LY, MK, MH, MS, MU, OB, OU, OS, NX, PG, PD, PK, PR, PX, PY, QR, RJ, RO, SA

## Failed, likely our side (fix in code)

| Airline | Flights | PNR | Amadeus answer |
|---|---|---|---|
| AS | AS1300/X | - | 911 911 NO FARE FOR BOOKING CODE-TRY OTHER PRICING OPTIONS |
| B6 | B63917/L | - | priced 1743.5 USD, expected 294.5 |
| BI | BI423/U | BA3OK6 | 9125 9125 ETKT DISALLOWED - NEED AIRLINE R/LOC-RETRY |
| DM | DM2104/A | BA2WW8 | 10609 10609 MANDATORY SSRFOID MISSING FOR CARRIER |
| H2 | H21621/X | BA2QJX | 10609 10609 MANDATORY SSRFOID MISSING FOR CARRIER |
| IB | IB4001/V | BA3E2M | 1969 1969 VERIFY ITINERARY |
| NT | NT101/Y | BA3ZPH | 10609 10609 MANDATORY SSRFOID MISSING FOR CARRIER |
| OZ | OZ202/K | - | PNR_AddMultiElements committed without returning a record locator |

## Failed, Amadeus or office setup

| Airline | Flights | PNR | Amadeus answer |
|---|---|---|---|
| BF | BF700/X | BA3QBE | 0 0 BF ETKT: SYSTEM UNABLE TO PROCESS |
| CZ | CZ303/V | BA39I8 | 0 0 CZ ETKT: COMMUNICATIONS LINE UNAVAILABLE |
| EN | EN2158/S | BA32UO | 0 0 EN ETKT: NOT AUTHORISED |
| GF | GF7/S | BA3OOV | 8100 8100 ETKT THIS CARRIER NOT VALID THIS MARKET |
| HF | HF706/Q | BA399W | 0 0 HF ETKT: NOT AUTHORISED |
| JX | JX1002/N | BA3RWA | 0 0 JX ETKT: NOT AUTHORISED |
| KC | KC221/E | BA2XOI | 0 0 KC ETKT: NOT AUTHORISED |
| KU | KU101/V | BA3Q6I | 0 0 KU ETKT: NOT AUTHORISED |
| LG | LG4601/G | BA35VS | 0 0 LG ETKT: NOT AUTHORISED |

## Not sellable on PDT (search offered it, the airline refused the seats; the pre-payment seat check blocks these)

| Airline | Flights | PNR | Amadeus answer |
|---|---|---|---|
| AW | AW210/T | - | 288 seat check: segment status UNS (288) |
| CG | CG1500/W | - | timeout of 25000ms exceeded |
| FB | FB851/F | - | 288 seat check: segment status UNS (288) |
| GZ | GZ612/T | - | 288 seat check: segment status UNS (288) |
| JA | JA7730/U | - | 288 seat check: segment status UNS (288) |
| LX | LX16/U | - | 288 seat check: segment status UNS (288) |
| ME | ME229/N | - | 288 seat check: segment status UNS (288) |
| NO | NO430/R | - | 288 seat check: segment status UNS (288) |
| NZ | NZ4/S | - | 288 seat check: segment status UNS (288) |
| PW | PW510/G | - | 288 seat check: segment status UNS (288) |
| P0 | P022/V | - | 288 seat check: segment status UNS (288) |
| RC | RC450/T | - | 288 seat check: segment status UNS (288) |

## No fare found on the routes tried (33)

- AG: AUA-MIA 2026-10-30: 0 offers, 0 plated AG
- AU: AEP-COR 2026-11-05: 0 offers, 0 plated AU
- A9: TBS-VIE 2026-11-10: 0 offers, 0 plated A9; TBS-TLV 2026-11-10: 0 offers, 0 plated A9
- BG: DAC-LHR 2026-11-13: 0 offers, 0 plated BG; DAC-CGP 2026-11-13: 0 offers, 0 plated BG
- CY: LCA-ATH 2026-11-04: 0 offers, 0 plated CY; LCA-LHR 2026-11-04: 0 offers, 0 plated CY
- DT: LAD-LIS 2026-11-10: 0 offers, 0 plated DT; LAD-JNB 2026-11-10: 0 offers, 0 plated DT
- EB: MAD-CUN 2026-11-13: 0 offers, 0 plated EB
- FZ: DXB-BOM: 977 977 No available flight found for the requested segment 1; DXB-KWI: 977 977 No available flight found for the requested segment 1
- GL: CPH-SFJ 2026-11-07: 0 offers, 0 plated GL
- HM: SEZ-JNB 2026-11-14: 0 offers, 0 plated HM
- HU: PEK-HAK 2026-10-27: 0 offers, 0 plated HU; PEK-BRU 2026-10-27: 0 offers, 0 plated HU
- HX: HKG-BKK 2026-10-28: 0 offers, 0 plated HX
- HY: TAS-IST 2026-10-29: 0 offers, 0 plated HY; TAS-JFK 2026-10-29: 0 offers, 0 plated HY
- IZ: TLV-ATH 2026-11-03: 0 offers, 0 plated IZ
- JD: PEK-SYX 2026-11-06: 0 offers, 0 plated JD
- J2: GYD-IST 2026-11-11: 0 offers, 0 plated J2; GYD-LHR 2026-11-11: 0 offers, 0 plated J2
- K6: PNH-REP 2026-11-02: 0 offers, 0 plated K6
- LM: GLA-KOI 2026-11-08: 0 offers, 0 plated LM; ABZ-KOI 2026-11-08: 0 offers, 0 plated LM
- MF: XMN-PEK 2026-10-26: 0 offers, 0 plated MF
- NF: VLI-BNE 2026-11-03: 0 offers, 0 plated NF
- NP: CAI-JED 2026-11-06: 0 offers, 0 plated NP
- OA: ATH-SKG 2026-11-12: 0 offers, 0 plated OA
- OD: KUL-PEN 2026-11-14: 0 offers, 0 plated OD
- OK: PRG-LCA 2026-10-26: 0 offers, 0 plated OK
- OM: ULN-ICN 2026-10-28: 0 offers, 0 plated OM
- PC: SAW-AMS 2026-11-02: 0 offers, 0 plated PC; SAW-ADB 2026-11-02: 0 offers, 0 plated PC
- QS: PRG-HER 2026-11-14: 0 offers, 0 plated QS
- QV: VTE-BKK 2026-10-26: 0 offers, 0 plated QV
- RA: KTM-DEL 2026-10-28: 0 offers, 0 plated RA
- RQ: KBL-DXB 2026-11-01: 0 offers, 0 plated RQ
- RZ: SJO-LIR 2026-11-03: 0 offers, 0 plated RZ
- SB: NOU-SYD 2026-11-06: 0 offers, 0 plated SB
- SC: TNA-PEK 2026-11-07: 0 offers, 0 plated SC; TNA-PVG 2026-11-07: 0 offers, 0 plated SC

## No route known to try (29)

AN, BE, DO, D9, E9, FN, GE, GP, H5, I6, KF, KG, LE, LF, LQ, MD, MR, MX, NE, NM, N4, N8, OL, OY, PS, PU, Q4, RW, R3

## Cleanup right after ticketing failed (retried separately)

| Airline | PNR | Ticket | Error |
|---|---|---|---|
| AC | BA34I2 | 014-7491174967 | retrieve 31/Application/FINISH OR IGNORE |
| AT | BA2S9I | 147-7491174973 | retrieve 31/Application/FINISH OR IGNORE |
| AV | BA34EL | 134-7491174974 | retrieve 31/Application/FINISH OR IGNORE |
| BR | BA2WU2 | 695-7491174981 | retrieve 31/Application/FINISH OR IGNORE |
| BW | BA4338 | 106-7491174983 | retrieve 31/Application/FINISH OR IGNORE |
| CI | BA3NEE | 297-7491174985 | retrieve 31/Application/FINISH OR IGNORE |
| CA | BA47QJ | 999-7491174987 | voidTicket timeout of 25000ms exceeded |
| EY | BA2NKY | 607-7491174994 | retrieve 31/Application/FINISH OR IGNORE |
| FI | BA2YPS | 108-7491174995 | retrieve 31/Application/FINISH OR IGNORE |
| FJ | BA2SC8 | 260-7491174996 | retrieve 31/Application/FINISH OR IGNORE |
| HC | BA43NE | 490-7491174998 | retrieve 31/Application/FINISH OR IGNORE |
| JL | BA2OMD | 131-7491175004 | retrieve 31/Application/FINISH OR IGNORE |
| HO | BA3HO8 | 018-7491175002 | voidTicket timeout of 25000ms exceeded |
| KE | BA2WVF | 180-7491175009 | voidTicket 5458 NOT AUTHORISED |
| KQ | BA3A5X | 706-7491175013 | retrieve 31/Application/FINISH OR IGNORE |
| LY | BA3TFM | 114-7491175020 | voidTicket 5245 MESSAGE FUNCTION NOT SUPPORTED |
| MK | BA2Q5A | 239-7491175022 | retrieve 31/Application/FINISH OR IGNORE |
| MH | BA2RER | 232-7491175021 | retrieve 31/Application/FINISH OR IGNORE |
| MS | BA39IS | 077-7491175023 | retrieve 31/Application/FINISH OR IGNORE |
| MU | BA43CU | 781-7491175024 | voidTicket timeout of 25000ms exceeded |
| OB | BA37H8 | 930-7491175026 | retrieve 31/Application/FINISH OR IGNORE |
| NX | BA3OBN | 675-7491175025 | voidTicket timeout of 25000ms exceeded |
| PG | BA4626 | 829-7491175029 | retrieve 31/Application/FINISH OR IGNORE |
| RJ | BA3DZV | 512-7491175036 | retrieve 31/Application/FINISH OR IGNORE |
| RO | BA349U | 281-7491175037 | retrieve 31/Application/FINISH OR IGNORE |
