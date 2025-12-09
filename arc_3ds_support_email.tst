Subject: 3DS not triggering for Hosted Checkout – need mandatory 3DS for certification (Merchant: TESTARC05511704)

Hi ARC Support Team,

I am integrating ARC Pay using Hosted Checkout (apiOperation: INITIATE_CHECKOUT) for merchant TESTARC05511704 and need 3D Secure (3DS) to be mandatory for all card transactions to meet ARC certification requirements.

Our requirements are:

1. 3DS must always run for eligible cards (no non-3DS flows).
2. After entering card details on the hosted payment page, the customer must be redirected to the OTP / 3DS challenge page of the issuing bank (or frictionless 3DS if applicable).
3. We are using Hosted Checkout only (not Direct API / Hosted Session) and want to keep card data fully on your hosted pages.
4. We must be able to use the PAY operation with authentication.transactionId and session.id as per your documentation:

{
  "apiOperation": "PAY",
  "transaction": { "reference": "" },
  "authentication": { "transactionId": "" },
  "session": { "id": "" }
}

5. 3DS must be correctly reflected for liability shift and ARC settlement/certification checks.

Our current INITIATE_CHECKOUT request looks like this:

{
  "apiOperation": "INITIATE_CHECKOUT",
  "interaction": {
    "operation": "PURCHASE",
    "returnUrl": "https://www.jetsetterss.com/payment/callback?quote_id=...&inquiry_id=...",
    "cancelUrl": "https://www.jetsetterss.com/inquiry/...?...",
    "merchant": { "name": "JetSet Travel" },
    "displayControl": {
      "billingAddress": "OPTIONAL",
      "customerEmail": "OPTIONAL"
    },
    "timeout": 900
  },
  "order": {
    "id": "<internal_payment_id>",
    "reference": "<internal_payment_id>",
    "amount": "11.00",
    "currency": "USD",
    "description": "Quote Q-xxxx - Travel Booking"
  },
  "customer": {
    "email": "customer@example.com",
    "mobilePhone": "9999999999"
  }
}

When we tried to follow previous guidance to add:

{
  "3DSecure": {
    "authenticationIndicator": "PAYER_AUTHENTICATION",
    "challengeIndicator": "NO_PREFERENCE",
    "transactionType": "PURCHASE",
    "threeDSVersion": "2.1.0"
  }
}

your gateway responded with:

{
  "error": {
    "cause": "INVALID_REQUEST",
    "explanation": "Unexpected parameter '3DSecure.authenticationIndicator'"
  },
  "result": "ERROR"
}

This suggests that the 3DSecure block is not supported on Hosted Checkout INITIATE_CHECKOUT.

What we need from you:

1. Enable 3DS on our merchant profile (TESTARC05511704) so that 3DS is always triggered for Hosted Checkout transactions, or clearly confirm how this is configured on your side (3DS rules, directory server, etc.).
2. Confirm that for Hosted Checkout, 3DS is controlled by merchant configuration, not request-level 3DSecure parameters.
3. Confirm that after 3DS authentication, we can safely call the PAY operation like this:

{
  "apiOperation": "PAY",
  "transaction": { "reference": "<our_reference>" },
  "authentication": { "transactionId": "<3ds_auth_transaction_id>" },
  "session": { "id": "<session_id_from_INITIATE_CHECKOUT>" }
}

4. Provide any official Hosted Checkout + 3DS configuration documentation or example specifically for our ARC Pay environment.

Right now, payments work, but customers are not being taken to any OTP / challenge page, so 3DS is effectively not active, and we cannot complete ARC certification.

Please let us know:
- What exactly you need to configure on the merchant profile,
- Whether any additional flags must be set on your side to make 3DS mandatory for Hosted Checkout.

Thank you,
JetSet Travel Development Team
Merchant: TESTARC05511704


