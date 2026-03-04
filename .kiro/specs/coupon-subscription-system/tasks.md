# Implementation Plan: Coupon and Subscription System

## Overview

This implementation plan breaks down the Jetsetters Coupon and Subscription System into discrete, actionable coding tasks. The system provides VIP membership management, promotional coupon engine, and intelligent discount calculation with gamification features. Implementation follows a phased approach: database schema → backend services → frontend UI → integration → testing.

The system integrates with the existing Jetsetters platform (Express.js backend, React frontend, PostgreSQL via Supabase, Redis caching) and ARC Pay payment gateway.

## Tasks

- [ ] 1. Database Schema and Migrations
  - [ ] 1.1 Create membership tiers and subscriptions tables
    - Create migration file `backend/migrations/subscription-tables.sql`
    - Define `membership_tiers` table with pricing, benefits, features, instant discount percentage
    - Define `subscriptions` table with user references, tier references, status, billing cycle, dates, auto-renewal
    - Define `subscription_history` table for audit trail of all subscription changes
    - Add indexes for performance (user_id, status, end_date, next_billing_date)
    - Add unique constraint for active subscriptions per user
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 1.8, 14.6_

  - [ ]* 1.2 Write property test for subscription data persistence
    - **Property 1: Subscription Data Persistence**
    - **Validates: Requirements 1.3, 1.8**

  - [ ] 1.3 Create coupons and redemptions tables
    - Create migration file for coupon-related tables
    - Define `coupons` table with code, discount type/value, validity period, usage limits, stacking rules, restrictions
    - Define `coupon_redemptions` table with coupon/user/booking references, amounts, status, metadata
    - Add indexes for coupon code lookups, user redemptions, booking references
    - Add check constraints for discount types and status values
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.6, 18.1_


  - [ ]* 1.4 Write property tests for coupon data persistence and validation
    - **Property 3: Coupon Code Format Validation**
    - **Property 4: Coupon Data Persistence**
    - **Validates: Requirements 2.1, 2.2, 18.1**

  - [ ] 1.5 Create gamification and referral tables
    - Create migration file for gamification features
    - Define `gamification_points` table with user references, points, reason, expiry
    - Define `user_achievements` table with user references, achievement types, badges, unlock dates
    - Define `referrals` table with referrer/referee user IDs, referral codes, status, rewards
    - Add indexes for user lookups and leaderboard queries
    - _Requirements: 8.1, 8.2, 8.3, 9.1, 9.2, 9.3, 9.5_

  - [ ] 1.6 Create discount transactions table
    - Create migration file for discount tracking
    - Define `discount_transactions` table with booking references, amounts, discounts applied (JSONB), calculation details
    - Add indexes for booking and user lookups, analytics queries
    - _Requirements: 4.5, 13.1, 13.5_

  - [ ] 1.7 Seed initial membership tiers
    - Create seed data file with three tiers: Silver, Gold, Platinum
    - Define pricing (monthly/annual), instant discount percentages (5%, 10%, 15%)
    - Define benefits arrays and features objects for each tier
    - Insert seed data into membership_tiers table
    - _Requirements: 1.1, 5.2, 5.4_

- [ ] 2. Backend Core Services - Subscription Manager
  - [ ] 2.1 Create SubscriptionManager service class
    - Create `backend/services/subscription-manager.js`
    - Implement class structure with database and cache dependencies
    - Add error handling utilities (ValidationError, NotFoundError, ConflictError classes)
    - Add logging configuration
    - _Requirements: 1.1, 1.2_

  - [ ] 2.2 Implement tier management methods
    - Implement `getTiers()` - fetch all active tiers with caching
    - Implement `getTierById(tierId)` - fetch specific tier with cache
    - Add Redis caching with 1-hour TTL for tier data
    - _Requirements: 1.1_


  - [ ] 2.3 Implement subscription creation and lifecycle methods
    - Implement `createSubscription(data)` - create new subscription with payment processing
    - Implement `getSubscription(subscriptionId)` - fetch subscription with tier details
    - Implement `getUserActiveSubscription(userId)` - get user's active subscription with caching
    - Implement `cancelSubscription(subscriptionId, immediate)` - cancel with optional immediate effect
    - Implement `pauseSubscription(subscriptionId, duration)` - pause up to 90 days
    - Implement `resumeSubscription(subscriptionId)` - resume paused subscription
    - Generate unique membership card IDs using UUID
    - Validate only one active subscription per user
    - Record all actions in subscription_history table
    - _Requirements: 1.2, 1.3, 1.4, 14.1, 14.2, 14.6_

  - [ ]* 2.4 Write property tests for subscription lifecycle
    - **Property 1: Subscription Data Persistence**
    - **Property 34: Subscription Cancellation Processing**
    - **Property 35: Subscription Pause and Resume Round-Trip**
    - **Validates: Requirements 1.3, 1.8, 14.1, 14.2**

  - [ ] 2.5 Implement tier upgrade and downgrade methods
    - Implement `upgradeTier(subscriptionId, newTierId)` - immediate upgrade with prorated payment
    - Implement `downgradeTier(subscriptionId, newTierId)` - schedule for next billing cycle
    - Calculate prorated amounts for upgrades
    - Update subscription_history with old and new tier IDs
    - Invalidate user subscription cache on tier changes
    - _Requirements: 1.6, 14.3_

  - [ ]* 2.6 Write property tests for tier changes
    - **Property 2: Subscription Tier Upgrade Immediacy**
    - **Property 36: Downgrade Scheduling**
    - **Property 37: Subscription History Completeness**
    - **Validates: Requirements 1.6, 14.3, 14.6**

  - [ ] 2.7 Implement instant discount and benefits methods
    - Implement `getInstantDiscount(userId)` - get user's tier instant discount percentage
    - Implement `checkBenefitEligibility(userId, benefit)` - verify user has specific benefit
    - Implement `getTotalSavings(userId)` - calculate cumulative savings from instant discounts
    - Cache instant discount values with 10-minute TTL
    - _Requirements: 5.2, 5.3, 5.6, 6.1, 6.2, 6.4_


  - [ ]* 2.8 Write property tests for instant discounts and benefits
    - **Property 16: Instant Discount Application by Subscription Status**
    - **Property 17: Tier Discount Hierarchy**
    - **Property 19: Subscription Savings Accumulation**
    - **Property 20: Free Cancellation Benefit**
    - **Validates: Requirements 5.3, 5.4, 5.6, 5.7, 6.4**

  - [ ] 2.9 Implement renewal and billing methods
    - Implement `processRenewal(subscriptionId)` - handle subscription renewal with payment
    - Implement `checkExpiringSubscriptions()` - find subscriptions expiring in 24 hours
    - Implement `sendRenewalReminders()` - send reminders at 7 days and 1 day before expiry
    - Implement retry logic for failed renewal payments (3 attempts over 72 hours)
    - Update subscription status to 'expired' if renewal fails
    - _Requirements: 1.4, 1.7, 12.5, 12.6, 14.4_

- [ ] 3. Backend Core Services - Coupon Engine
  - [ ] 3.1 Create CouponEngine service class
    - Create `backend/services/coupon-engine.js`
    - Implement class structure with database and cache dependencies
    - Add rate limiting utilities using Redis
    - Add fraud detection helpers
    - _Requirements: 2.1, 15.1_

  - [ ] 3.2 Implement coupon CRUD methods
    - Implement `createCoupon(data)` - create coupon with validation (admin only)
    - Implement `getCoupon(couponId)` - fetch coupon by ID
    - Implement `getCouponByCode(code)` - fetch coupon by code with caching (5-minute TTL)
    - Implement `updateCoupon(couponId, updates)` - update coupon properties
    - Implement `deactivateCoupon(couponId)` - emergency deactivation within 5 minutes
    - Validate coupon code format: 4-20 alphanumeric characters
    - _Requirements: 2.1, 2.2, 2.8, 15.6_

  - [ ]* 3.3 Write property tests for coupon creation and format validation
    - **Property 3: Coupon Code Format Validation**
    - **Property 4: Coupon Data Persistence**
    - **Validates: Requirements 2.1, 2.2, 18.1**


  - [ ] 3.4 Implement coupon validation methods
    - Implement `validateCoupon(code, context)` - comprehensive validation with sub-2-second response time
    - Check coupon existence, expiry, usage limits, minimum booking amount, booking type restrictions
    - Check tier restrictions, region restrictions, validity period
    - Return detailed validation result with error codes and metadata
    - Implement rate limiting: max 5 validation attempts per minute per user
    - Cache validation results for valid coupons (3-minute TTL)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 7.2, 15.1, 18.4, 20.1_

  - [ ]* 3.5 Write property tests for coupon validation
    - **Property 5: Coupon Usage Limit Enforcement**
    - **Property 6: Comprehensive Coupon Validation**
    - **Property 39: Rate Limiting for Redemption Attempts**
    - **Property 40: Eligibility Criteria Validation**
    - **Property 44: Geographic Restriction Enforcement**
    - **Validates: Requirements 2.7, 3.2, 3.3, 3.4, 3.5, 7.2, 15.1, 15.3, 18.4**

  - [ ] 3.6 Implement coupon redemption methods
    - Implement `applyCoupon(code, bookingId, userId)` - apply coupon to booking with transaction safety
    - Implement `recordRedemption(couponId, userId, bookingId, amount)` - create redemption record
    - Implement `cancelRedemption(redemptionId)` - cancel redemption and restore usage count
    - Use database transactions to ensure atomicity (lock coupon row during redemption)
    - Prevent duplicate redemptions on same booking
    - Increment coupon usage count atomically
    - Mark coupon as 'exhausted' when usage limit reached
    - _Requirements: 3.6, 3.7, 3.8, 2.7_

  - [ ]* 3.7 Write property tests for coupon redemption
    - **Property 7: Redemption Event Recording**
    - **Property 8: Duplicate Coupon Prevention**
    - **Property 9: Coupon Redemption Cancellation Round-Trip**
    - **Validates: Requirements 3.6, 3.7, 3.8**

  - [ ] 3.8 Implement coupon discovery and recommendation methods
    - Implement `getAvailableCoupons(userId, filters)` - get user-eligible coupons
    - Implement `getPersonalizedOffers(userId)` - analyze booking history for personalized coupons
    - Implement `getTimeLimitedOffers()` - get active flash sales and time-limited offers
    - Filter by VIP early access (check user subscription tier)
    - Cache available coupons per user (3-minute TTL)
    - _Requirements: 7.1, 7.3, 7.5, 11.1, 11.2, 11.3_


  - [ ]* 3.9 Write property tests for VIP early access
    - **Property 22: VIP Early Access**
    - **Validates: Requirements 7.5**

  - [ ] 3.10 Implement fraud detection and security methods
    - Implement `detectSuspiciousActivity(userId)` - detect rapid redemption attempts, unusual patterns
    - Implement `blacklistUser(userId, couponId)` - prevent user from using specific/all coupons
    - Track redemption velocity and flag suspicious accounts
    - Log all fraud detection events for audit
    - _Requirements: 15.1, 15.2, 15.3, 15.5_

  - [ ]* 3.11 Write property test for blacklist enforcement
    - **Property 41: Blacklist Enforcement**
    - **Validates: Requirements 15.5**

  - [ ] 3.12 Implement coupon analytics methods
    - Implement `getCouponAnalytics(couponId)` - calculate redemption rates, revenue impact, conversion rates
    - Track total redemptions, unique users, total discount given
    - Calculate average discount per redemption
    - Group redemptions by day and booking type
    - _Requirements: 13.1, 13.4_

- [ ] 4. Backend Core Services - Discount Calculator
  - [ ] 4.1 Create DiscountCalculator service class
    - Create `backend/services/discount-calculator.js`
    - Implement class structure with subscription and coupon service dependencies
    - Add currency conversion utilities
    - Add rounding utilities (2 decimal places)
    - _Requirements: 4.6, 16.3_

  - [ ] 4.2 Implement core price calculation methods
    - Implement `calculateFinalPrice(context)` - main calculation method with sub-1-second response time
    - Implement `applyMembershipDiscount(amount, userId)` - apply instant discount from subscription
    - Implement `applyCouponDiscount(amount, coupon)` - apply single coupon discount
    - Round all discount amounts to 2 decimal places
    - Return detailed price breakdown with original amount, each discount, final amount
    - _Requirements: 4.5, 4.6, 4.7, 5.3, 20.2_


  - [ ]* 4.3 Write property tests for basic discount calculations
    - **Property 13: Price Breakdown Completeness**
    - **Property 14: Discount Rounding Precision**
    - **Validates: Requirements 4.5, 4.6**

  - [ ] 4.4 Implement discount stacking logic
    - Implement `applyStackableDiscounts(amount, discounts)` - apply multiple discounts with rules
    - Implement `validateStackingRules(discounts)` - check if discounts can be combined
    - Implement `sortDiscountsByPrecedence(discounts)` - sort by type (membership first) then value (highest first)
    - Reject additional discounts if non-stackable discount present
    - Apply membership discounts before coupon discounts
    - Apply stackable discounts in descending order by value
    - _Requirements: 4.1, 4.2, 4.3, 5.5_

  - [ ]* 4.5 Write property tests for discount stacking
    - **Property 10: Discount Application Precedence**
    - **Property 11: Non-Stackable Discount Exclusivity**
    - **Property 18: Stackable Discount Combination**
    - **Validates: Requirements 4.1, 4.2, 4.3, 5.5**

  - [ ] 4.6 Implement maximum discount limit enforcement
    - Implement `validateMaxDiscount(originalAmount, discountedAmount)` - ensure final amount >= 10% of original
    - Cap total discount at 90% of original amount
    - Adjust discounts proportionally if limit exceeded
    - _Requirements: 4.4_

  - [ ]* 4.7 Write property test for maximum discount limit
    - **Property 12: Maximum Discount Limit**
    - **Validates: Requirements 4.4**

  - [ ] 4.8 Implement idempotent calculation guarantee
    - Ensure `calculateFinalPrice()` produces identical results for identical inputs
    - Use deterministic sorting and rounding
    - Avoid floating-point precision issues with proper rounding
    - Add calculation hash to discount_transactions for verification
    - _Requirements: 4.8_

  - [ ]* 4.9 Write property test for price calculation idempotence
    - **Property 15: Price Calculation Idempotence**
    - **Validates: Requirements 4.8**


  - [ ] 4.10 Implement multi-currency support
    - Implement `convertCurrency(amount, from, to)` - convert amounts using exchange rates
    - Implement `calculateInLocalCurrency(context)` - calculate prices in user's preferred currency
    - Fetch exchange rates from external API or database
    - Cache exchange rates with 1-hour TTL
    - Maintain discount accuracy across currency conversions
    - _Requirements: 16.1, 16.3, 16.6_

  - [ ]* 4.11 Write property tests for currency conversion
    - **Property 42: Currency Conversion Consistency**
    - **Property 43: Cross-Currency Discount Accuracy**
    - **Validates: Requirements 16.3, 16.6**

  - [ ] 4.12 Implement discount preview and estimation
    - Implement `previewDiscount(amount, discounts)` - estimate discount without applying
    - Implement `estimateSavings(userId, bookingType)` - estimate potential savings for user
    - Return preview without creating redemption records
    - _Requirements: 5.1_

- [ ] 5. Backend Core Services - Gamification
  - [ ] 5.1 Create gamification service methods
    - Create `backend/services/gamification.js`
    - Implement `getProfile(userId)` - get user's points, badges, rank, referral code
    - Implement `awardPoints(userId, points, reason, bookingId)` - award points for actions
    - Implement `redeemPoints(userId, points)` - convert points to coupon code
    - Calculate points proportional to booking value
    - Apply tier points multiplier for VIP members
    - _Requirements: 8.1, 8.3, 6.5_

  - [ ]* 5.2 Write property tests for gamification
    - **Property 21: Points Multiplier by Tier**
    - **Property 23: Points Award Proportionality**
    - **Property 25: Points to Coupon Conversion**
    - **Validates: Requirements 6.5, 8.1, 8.3**

  - [ ] 5.3 Implement achievement and badge system
    - Implement `checkMilestones(userId)` - check if user reached point milestones
    - Implement `unlockBadge(userId, achievement)` - create achievement record
    - Define milestone thresholds (1000, 5000, 10000, 50000 points)
    - Create badge records with unlock timestamps
    - _Requirements: 8.2_


  - [ ]* 5.4 Write property test for milestone badge unlocking
    - **Property 24: Milestone Badge Unlocking**
    - **Validates: Requirements 8.2**

  - [ ] 5.5 Implement leaderboard system
    - Implement `getLeaderboard(period, limit)` - get top point earners (weekly, monthly, all-time)
    - Implement `getUserRank(userId)` - get user's current leaderboard position
    - Cache leaderboard data with 24-hour TTL
    - Update leaderboard daily via scheduled job
    - _Requirements: 8.5_

  - [ ] 5.6 Implement streak bonus system
    - Implement `checkStreak(userId)` - check consecutive monthly bookings
    - Implement `applyStreakBonus(userId, points)` - apply multiplier for streaks
    - Track booking dates to identify consecutive months
    - Apply streak multipliers (2x for 3 months, 3x for 6 months, 5x for 12 months)
    - _Requirements: 8.6_

  - [ ]* 5.7 Write property test for streak bonus multiplier
    - **Property 26: Streak Bonus Multiplier**
    - **Validates: Requirements 8.6**

- [ ] 6. Backend Core Services - Referral System
  - [ ] 6.1 Create referral service methods
    - Create `backend/services/referral.js`
    - Implement `generateReferralCode(userId)` - create unique referral code for user
    - Implement `applyReferralCode(userId, referralCode)` - link new user to referrer
    - Implement `processReferralReward(referralId)` - distribute rewards after first booking
    - Validate referral codes are unique across all users
    - Prevent self-referral attempts
    - _Requirements: 9.1, 9.2, 9.3, 9.7_

  - [ ]* 6.2 Write property tests for referral system
    - **Property 27: Unique Referral Code Generation**
    - **Property 28: Referral Link Creation**
    - **Property 29: Referral Reward Distribution**
    - **Property 32: Self-Referral Prevention**
    - **Validates: Requirements 9.1, 9.2, 9.3, 9.7**

  - [ ] 6.3 Implement referral tracking and analytics
    - Implement `getReferralStats(userId)` - get total referrals, earnings, completion rate
    - Implement `checkCampaignBonus(referralId)` - apply campaign bonuses if active
    - Track referral status: pending → completed → rewarded
    - Update referral count and earnings on reward distribution
    - _Requirements: 9.5, 9.6_


  - [ ]* 6.4 Write property tests for referral tracking
    - **Property 30: Referral Tracking Accuracy**
    - **Property 31: Campaign Bonus Application**
    - **Validates: Requirements 9.5, 9.6**

- [ ] 7. Backend API Routes - Subscription Management
  - [ ] 7.1 Create subscription API routes
    - Create `backend/routes/subscriptions.js`
    - Implement POST `/api/subscriptions` - create new subscription
    - Implement GET `/api/subscriptions/:subscriptionId` - get subscription details
    - Implement GET `/api/subscriptions/user/:userId` - get user's active subscription
    - Implement PUT `/api/subscriptions/:subscriptionId/tier` - upgrade/downgrade tier
    - Implement DELETE `/api/subscriptions/:subscriptionId` - cancel subscription
    - Implement POST `/api/subscriptions/:subscriptionId/pause` - pause subscription
    - Implement POST `/api/subscriptions/:subscriptionId/resume` - resume subscription
    - Implement GET `/api/subscriptions/tiers` - get all membership tiers
    - Add authentication middleware (JWT verification)
    - Add request validation middleware
    - Add error handling with standardized error responses
    - _Requirements: 1.2, 1.6, 14.1, 14.2_

  - [ ]* 7.2 Write unit tests for subscription API routes
    - Test successful subscription creation
    - Test duplicate subscription prevention
    - Test tier upgrade/downgrade flows
    - Test cancellation and pause/resume
    - Test authentication and authorization

  - [ ] 7.3 Integrate subscription routes with payment gateway
    - Call ARC Pay API for subscription payment processing
    - Handle payment success and failure responses
    - Implement payment retry logic for failed renewals
    - Store payment method IDs securely
    - Generate itemized receipts with subscription details
    - _Requirements: 12.1, 12.2, 12.5, 12.6, 12.7_

  - [ ]* 7.4 Write property test for payment amount accuracy
    - **Property 33: Payment Amount Accuracy**
    - **Validates: Requirements 12.3**

- [ ] 8. Backend API Routes - Coupon Management
  - [ ] 8.1 Create coupon API routes
    - Create `backend/routes/coupons.js`
    - Implement POST `/api/coupons` - create coupon (admin only)
    - Implement GET `/api/coupons/:couponId` - get coupon details
    - Implement POST `/api/coupons/validate` - validate coupon for booking
    - Implement POST `/api/coupons/apply` - apply coupon to booking
    - Implement GET `/api/coupons/available` - get user's available coupons
    - Implement GET `/api/coupons/:couponId/analytics` - get coupon analytics (admin only)
    - Implement DELETE `/api/coupons/:couponId` - deactivate coupon (admin only)
    - Add admin role verification middleware
    - Add rate limiting middleware (5 requests/minute for validation)
    - _Requirements: 2.1, 2.8, 3.1, 3.6, 13.1, 15.1_


  - [ ]* 8.2 Write unit tests for coupon API routes
    - Test coupon creation with valid/invalid data
    - Test validation with various error conditions
    - Test redemption and duplicate prevention
    - Test rate limiting enforcement
    - Test admin authorization

- [ ] 9. Backend API Routes - Discount Calculation
  - [ ] 9.1 Create discount calculation API routes
    - Create `backend/routes/discounts.js`
    - Implement POST `/api/discounts/calculate` - calculate final price with all discounts
    - Implement GET `/api/discounts/preview` - preview discount without applying
    - Return detailed breakdown with original amount, each discount, final amount, savings
    - Add request validation for required fields
    - _Requirements: 4.5, 5.1_

  - [ ]* 9.2 Write unit tests for discount API routes
    - Test calculation with membership discount only
    - Test calculation with coupon only
    - Test calculation with stacked discounts
    - Test maximum discount limit enforcement
    - Test non-stackable discount rejection

- [ ] 10. Backend API Routes - Gamification and Referrals
  - [ ] 10.1 Create gamification API routes
    - Create `backend/routes/gamification.js`
    - Implement GET `/api/gamification/profile/:userId` - get user's gamification profile
    - Implement POST `/api/gamification/points` - award points (internal use)
    - Implement POST `/api/gamification/redeem` - redeem points for coupon
    - Implement GET `/api/gamification/leaderboard` - get leaderboard
    - _Requirements: 8.1, 8.3, 8.5_

  - [ ] 10.2 Create referral API routes
    - Create `backend/routes/referrals.js`
    - Implement GET `/api/referrals/code/:userId` - get user's referral code
    - Implement POST `/api/referrals/apply` - apply referral code during signup
    - Implement GET `/api/referrals/stats/:userId` - get referral statistics
    - _Requirements: 9.1, 9.2, 9.5_

  - [ ]* 10.3 Write unit tests for gamification and referral routes
    - Test points redemption with sufficient/insufficient points
    - Test leaderboard retrieval
    - Test referral code application
    - Test self-referral prevention

- [ ] 11. Checkpoint - Backend Services Complete
  - Ensure all backend services are implemented and tested
  - Verify database migrations run successfully
  - Test API endpoints with Postman or similar tool
  - Ensure all property tests pass
  - Ask the user if questions arise


- [ ] 12. Frontend Components - Subscription Management UI
  - [ ] 12.1 Create membership tiers display component
    - Create `frontend/components/Subscription/MembershipTiers.jsx`
    - Display all available tiers in card layout
    - Show tier name, pricing (monthly/annual toggle), instant discount percentage
    - List benefits and features for each tier
    - Highlight recommended tier
    - Add "Subscribe" button for each tier
    - Make responsive for mobile (vertical scrolling cards)
    - _Requirements: 1.1, 10.1, 10.4_

  - [ ] 12.2 Create subscription management dashboard
    - Create `frontend/components/Subscription/SubscriptionDashboard.jsx`
    - Display current subscription status, tier, start/end dates
    - Show total savings from instant discounts
    - Display membership card with unique ID
    - Add buttons for upgrade, downgrade, pause, cancel
    - Show next billing date and auto-renewal status
    - Make mobile-optimized with touch-friendly controls
    - _Requirements: 1.3, 5.6, 10.1, 14.1, 14.2_

  - [ ] 12.3 Create subscription upgrade/downgrade modal
    - Create `frontend/components/Subscription/TierChangeModal.jsx`
    - Show current tier and selected new tier comparison
    - Display pricing difference and prorated amount for upgrades
    - Show effective date (immediate for upgrades, next billing for downgrades)
    - Add confirmation button with payment processing
    - Handle loading states and error messages
    - _Requirements: 1.6, 14.3_

  - [ ] 12.4 Create subscription cancellation flow
    - Create `frontend/components/Subscription/CancelSubscriptionModal.jsx`
    - Show cancellation confirmation with retention offers
    - Display what benefits will be lost
    - Offer immediate vs. end-of-period cancellation options
    - Collect optional cancellation reason
    - Show confirmation message with final access date
    - _Requirements: 14.1, 14.5_

  - [ ] 12.5 Create mobile wallet membership card
    - Create `frontend/components/Subscription/MembershipCard.jsx`
    - Display digital membership card with tier name, user name, card ID
    - Add "Add to Apple Wallet" and "Add to Google Pay" buttons
    - Generate wallet-compatible pass files
    - Show QR code for partner location scanning
    - _Requirements: 10.3, 10.6_


- [ ] 13. Frontend Components - Coupon Application UI
  - [ ] 13.1 Create coupon input component for checkout
    - Create `frontend/components/Coupon/CouponInput.jsx`
    - Add text input for coupon code entry
    - Add "Apply" button with loading state
    - Show validation errors (expired, invalid, minimum amount not met)
    - Display applied coupon with discount amount and remove button
    - Support one-tap application on mobile
    - _Requirements: 3.1, 3.2, 3.4, 10.2_

  - [ ] 13.2 Create available coupons display
    - Create `frontend/components/Coupon/AvailableCoupons.jsx`
    - Display user's available coupons in card format
    - Show coupon code, description, discount value, expiry date
    - Add countdown timer for time-limited offers
    - Filter by booking type (flights, hotels, packages)
    - Add "Apply" button for each coupon
    - Make vertically scrollable on mobile
    - _Requirements: 7.3, 10.4, 11.2_

  - [ ] 13.3 Create personalized offers section
    - Create `frontend/components/Coupon/PersonalizedOffers.jsx`
    - Display personalized coupon recommendations
    - Show "Recommended for You" badge
    - Display offers based on booking history and preferences
    - Add quick-apply functionality
    - _Requirements: 11.1, 11.2, 11.3_

  - [ ] 13.4 Create flash sales banner
    - Create `frontend/components/Coupon/FlashSaleBanner.jsx`
    - Display active flash sales with countdown timer
    - Show VIP early access badge for eligible users
    - Auto-hide when offer expires
    - Make prominent and eye-catching for Gen Z audience
    - _Requirements: 7.1, 7.3, 7.4, 7.5_

- [ ] 14. Frontend Components - Discount Display
  - [ ] 14.1 Create price breakdown component
    - Create `frontend/components/Discount/PriceBreakdown.jsx`
    - Display original price prominently
    - Show each applied discount (membership, coupons) with amounts
    - Display total savings in highlighted format
    - Show final price in large, bold text
    - Add expandable details section for full calculation
    - _Requirements: 4.5, 5.1_

  - [ ] 14.2 Create instant discount indicator
    - Create `frontend/components/Discount/InstantDiscountBadge.jsx`
    - Show VIP instant discount percentage on product cards
    - Display "VIP Price" vs. regular price
    - Add tooltip explaining membership benefits
    - Make visible throughout booking flow
    - _Requirements: 5.1, 5.3_


- [ ] 15. Frontend Components - Gamification UI
  - [ ] 15.1 Create gamification profile dashboard
    - Create `frontend/components/Gamification/ProfileDashboard.jsx`
    - Display total points, available points, current tier
    - Show earned badges with unlock dates
    - Display leaderboard rank with position indicator
    - Add progress bar to next milestone
    - Show referral code with copy button
    - _Requirements: 8.2, 8.5, 8.7, 9.1_

  - [ ] 15.2 Create points redemption interface
    - Create `frontend/components/Gamification/PointsRedemption.jsx`
    - Show available points and conversion rate
    - Display coupon value preview
    - Add "Redeem Points" button with confirmation
    - Show generated coupon code after redemption
    - _Requirements: 8.3_

  - [ ] 15.3 Create leaderboard component
    - Create `frontend/components/Gamification/Leaderboard.jsx`
    - Display top 10 users with points and ranks
    - Highlight current user's position
    - Add period filter (weekly, monthly, all-time)
    - Show user avatars and achievement badges
    - _Requirements: 8.5_

  - [ ] 15.4 Create achievement badges display
    - Create `frontend/components/Gamification/BadgeCollection.jsx`
    - Display all earned badges in grid layout
    - Show locked badges as grayed out with unlock requirements
    - Add badge details modal with description and unlock date
    - Animate new badge unlocks
    - _Requirements: 8.2_

  - [ ] 15.5 Create streak tracker component
    - Create `frontend/components/Gamification/StreakTracker.jsx`
    - Display current booking streak (consecutive months)
    - Show streak multiplier bonus
    - Add calendar visualization of booking history
    - Display next booking date to maintain streak
    - _Requirements: 8.6_

- [ ] 16. Frontend Components - Referral System UI
  - [ ] 16.1 Create referral dashboard
    - Create `frontend/components/Referral/ReferralDashboard.jsx`
    - Display user's unique referral code with copy button
    - Show total referrals, completed referrals, pending referrals
    - Display total earnings from referrals
    - Add social sharing buttons (WhatsApp, Twitter, Facebook)
    - _Requirements: 9.1, 9.5_

  - [ ] 16.2 Create referral code input for signup
    - Create `frontend/components/Referral/ReferralCodeInput.jsx`
    - Add optional referral code field to signup form
    - Validate referral code on blur
    - Show referrer's name and reward preview
    - Display error for invalid or self-referral codes
    - _Requirements: 9.2, 9.7_


  - [ ] 16.3 Create referral rewards notification
    - Create `frontend/components/Referral/RewardNotification.jsx`
    - Show notification when referral completes first booking
    - Display reward amount and type (points, coupon, discount)
    - Add celebratory animation for reward unlock
    - _Requirements: 9.3, 9.4_

- [ ] 17. Frontend Integration - Booking Flow
  - [ ] 17.1 Integrate discount display in search results
    - Modify flight/hotel/package search result cards
    - Show VIP instant discount badge for subscribed users
    - Display original and discounted prices
    - Add "VIP Exclusive" label for early access offers
    - _Requirements: 5.1, 7.5_

  - [ ] 17.2 Integrate coupon application in checkout
    - Modify checkout page to include CouponInput component
    - Add AvailableCoupons section below payment details
    - Show PriceBreakdown with all discounts
    - Update total price dynamically when coupons applied
    - Validate coupons before payment submission
    - _Requirements: 3.1, 3.6, 4.5_

  - [ ] 17.3 Integrate instant discount in booking confirmation
    - Modify booking confirmation page
    - Show total savings from membership and coupons
    - Display points earned from booking
    - Add prompt to share booking for bonus points
    - _Requirements: 5.6, 8.1, 8.4_

  - [ ] 17.4 Add subscription upsell prompts
    - Add subscription promotion banner on search results for non-subscribers
    - Show potential savings with VIP membership
    - Add "Upgrade to VIP" prompt in checkout for high-value bookings
    - Display tier comparison modal on click
    - _Requirements: 11.4_

- [ ] 18. Frontend Utilities and API Integration
  - [ ] 18.1 Create subscription API client
    - Create `frontend/utils/subscription-api.js`
    - Implement functions for all subscription endpoints
    - Add error handling and retry logic
    - Add loading state management
    - _Requirements: 1.2, 1.6, 14.1_

  - [ ] 18.2 Create coupon API client
    - Create `frontend/utils/coupon-api.js`
    - Implement functions for coupon validation, application, retrieval
    - Add caching for available coupons
    - Add error handling with user-friendly messages
    - _Requirements: 3.1, 3.6_


  - [ ] 18.3 Create discount API client
    - Create `frontend/utils/discount-api.js`
    - Implement price calculation and preview functions
    - Add real-time price updates on coupon changes
    - _Requirements: 4.5_

  - [ ] 18.4 Create gamification API client
    - Create `frontend/utils/gamification-api.js`
    - Implement functions for profile, points, leaderboard, redemption
    - Add WebSocket support for real-time leaderboard updates
    - _Requirements: 8.1, 8.3, 8.5_

  - [ ] 18.5 Create custom React hooks
    - Create `frontend/hooks/useSubscription.js` - manage subscription state
    - Create `frontend/hooks/useCoupons.js` - manage available coupons
    - Create `frontend/hooks/useDiscount.js` - calculate and preview discounts
    - Create `frontend/hooks/useGamification.js` - manage points and badges
    - Add optimistic updates for better UX
    - _Requirements: 1.2, 3.1, 4.5, 8.1_

- [ ] 19. Notification System Integration
  - [ ] 19.1 Create notification service
    - Create `backend/services/notification.js`
    - Implement email notification methods using Resend
    - Implement push notification methods (if mobile app exists)
    - Add notification templates for all event types
    - _Requirements: 1.4, 7.6, 14.4_

  - [ ] 19.2 Implement subscription notifications
    - Send confirmation email on subscription creation
    - Send renewal reminders at 7 days and 1 day before expiry
    - Send expiration notice when subscription expires
    - Send upgrade/downgrade confirmation emails
    - _Requirements: 1.4, 14.4_

  - [ ] 19.3 Implement coupon notifications
    - Send email when personalized offers available
    - Send push notification for flash sales (VIP early access)
    - Send expiry reminders for unused coupons (24 hours before)
    - _Requirements: 7.6, 11.7_

  - [ ] 19.4 Implement gamification notifications
    - Send notification when points earned
    - Send notification when badge unlocked
    - Send notification when leaderboard rank improves
    - Send notification when referral completes first booking
    - _Requirements: 8.2, 9.3_


- [ ] 20. Admin Dashboard Components
  - [ ] 20.1 Create coupon management admin panel
    - Create `frontend/components/Admin/CouponManagement.jsx`
    - Add form to create new coupons with all configuration options
    - Display list of all coupons with status, usage, analytics
    - Add search and filter by status, campaign, partner
    - Add emergency deactivation button
    - Add bulk operations (activate, deactivate, export)
    - _Requirements: 2.1, 2.8, 13.1, 15.6_

  - [ ] 20.2 Create subscription analytics dashboard
    - Create `frontend/components/Admin/SubscriptionAnalytics.jsx`
    - Display total active subscriptions by tier
    - Show monthly/annual recurring revenue
    - Display churn rate and retention metrics
    - Show new subscriptions and cancellations trends
    - Add date range filters and export functionality
    - _Requirements: 13.2, 13.3_

  - [ ] 20.3 Create coupon analytics dashboard
    - Create `frontend/components/Admin/CouponAnalytics.jsx`
    - Display redemption rates by coupon
    - Show total discounts given and revenue impact
    - Display conversion rates and ROI metrics
    - Show top-performing coupons and campaigns
    - Add real-time usage tracking
    - _Requirements: 13.1, 13.4, 13.7_

  - [ ] 20.4 Create customer support tools
    - Create `frontend/components/Admin/SupportTools.jsx`
    - Add customer subscription lookup by user ID or email
    - Display full subscription history and benefits usage
    - Add manual subscription extension capability
    - Add one-time compensation coupon generator
    - Show coupon redemption logs for troubleshooting
    - _Requirements: 19.1, 19.2, 19.4, 19.6_

- [ ] 21. Checkpoint - Frontend Implementation Complete
  - Ensure all frontend components render correctly
  - Test responsive design on mobile devices
  - Verify API integration works end-to-end
  - Test user flows: subscription, coupon application, gamification
  - Ask the user if questions arise


- [ ] 22. Scheduled Jobs and Background Tasks
  - [ ] 22.1 Create subscription renewal job
    - Create `backend/jobs/subscription-renewal.js`
    - Check for subscriptions expiring in 24 hours
    - Process auto-renewal payments
    - Retry failed payments (3 attempts over 72 hours)
    - Update subscription status to expired if all retries fail
    - Run daily at 2 AM UTC
    - _Requirements: 1.7, 12.5, 12.6_

  - [ ] 22.2 Create renewal reminder job
    - Create `backend/jobs/renewal-reminders.js`
    - Send reminders 7 days before expiry
    - Send reminders 1 day before expiry
    - Track sent reminders to avoid duplicates
    - Run daily at 10 AM user's local time
    - _Requirements: 14.4_

  - [ ] 22.3 Create coupon expiry job
    - Create `backend/jobs/coupon-expiry.js`
    - Mark expired coupons as 'expired' status
    - Send expiry notifications for unused coupons (24 hours before)
    - Invalidate coupon cache for expired codes
    - Run every hour
    - _Requirements: 7.4_

  - [ ] 22.4 Create leaderboard update job
    - Create `backend/jobs/leaderboard-update.js`
    - Recalculate leaderboard rankings
    - Update Redis cache with new rankings
    - Send notifications to users who improved rank
    - Run daily at midnight UTC
    - _Requirements: 8.5_

  - [ ] 22.5 Create analytics aggregation job
    - Create `backend/jobs/analytics-aggregation.js`
    - Aggregate daily subscription metrics
    - Aggregate daily coupon redemption metrics
    - Calculate revenue impact and ROI
    - Store aggregated data for reporting
    - Run daily at 3 AM UTC
    - _Requirements: 13.1, 13.2, 13.3_

- [ ] 23. Performance Optimization
  - [ ] 23.1 Implement Redis caching strategy
    - Cache membership tiers (1-hour TTL)
    - Cache user subscriptions (10-minute TTL)
    - Cache coupon codes (5-minute TTL)
    - Cache available coupons per user (3-minute TTL)
    - Cache leaderboard data (24-hour TTL)
    - Implement cache invalidation on updates
    - _Requirements: 20.6_


  - [ ] 23.2 Add database query optimization
    - Add composite indexes for common query patterns
    - Optimize subscription lookup by user_id and status
    - Optimize coupon validation queries
    - Add database connection pooling
    - Implement query result pagination for large datasets
    - _Requirements: 20.1, 20.2, 20.4_

  - [ ] 23.3 Implement rate limiting
    - Add rate limiting for coupon validation (5 requests/minute per user)
    - Add rate limiting for API endpoints (100 requests/minute per user)
    - Use Redis for distributed rate limiting
    - Return 429 status with retry-after header
    - _Requirements: 15.1, 20.1_

  - [ ] 23.4 Add response time monitoring
    - Add performance logging for all service methods
    - Track 95th percentile response times
    - Alert if coupon validation exceeds 2 seconds
    - Alert if discount calculation exceeds 1 second
    - _Requirements: 20.1, 20.2_

- [ ] 24. Security and Compliance
  - [ ] 24.1 Implement audit logging
    - Create `backend/services/audit-logger.js`
    - Log all subscription actions (create, upgrade, cancel, pause)
    - Log all coupon redemptions with IP address and user agent
    - Log all support agent actions on customer accounts
    - Store audit logs for 7 years
    - _Requirements: 18.5, 19.5_

  - [ ]* 24.2 Write property test for audit log creation
    - **Property 45: Audit Log Creation**
    - **Validates: Requirements 18.5, 19.5**

  - [ ] 24.3 Implement fraud detection
    - Detect rapid coupon redemption attempts (>5 per minute)
    - Flag suspicious patterns (multiple accounts, same IP)
    - Implement velocity checks for subscription payments
    - Add device fingerprinting for fraud prevention
    - _Requirements: 15.1, 15.2, 15.7_

  - [ ] 24.4 Add data encryption
    - Encrypt payment method IDs at rest
    - Encrypt sensitive user data (PII)
    - Use HTTPS for all API communications
    - Implement secure session management
    - _Requirements: 12.8_


  - [ ] 24.5 Implement age verification
    - Add age verification for restricted subscription tiers
    - Validate user's date of birth against minimum age requirement
    - Reject subscription creation if age requirement not met
    - _Requirements: 18.6_

  - [ ]* 24.6 Write property test for age verification
    - **Property 46: Age Verification for Restricted Subscriptions**
    - **Validates: Requirements 18.6**

  - [ ] 24.7 Add terms and conditions management
    - Store terms and conditions for each coupon
    - Display terms prominently during coupon application
    - Require acceptance of subscription terms before payment
    - Implement data retention policies for promotional data
    - _Requirements: 18.1, 18.2, 18.3, 18.7_

- [ ] 25. Integration Testing
  - [ ]* 25.1 Write integration tests for subscription lifecycle
    - Test complete subscription flow: create → upgrade → pause → resume → cancel
    - Test payment integration with ARC Pay
    - Test renewal process with successful and failed payments
    - Test subscription reactivation within 30 days
    - _Requirements: 1.2, 1.6, 1.7, 12.1, 14.1, 14.2, 14.7_

  - [ ]* 25.2 Write integration tests for coupon redemption flow
    - Test coupon validation → application → booking completion
    - Test coupon cancellation and usage restoration
    - Test duplicate redemption prevention
    - Test stacking rules enforcement
    - _Requirements: 3.1, 3.6, 3.7, 3.8, 4.2_

  - [ ]* 25.3 Write integration tests for discount calculation
    - Test membership discount + stackable coupon
    - Test non-stackable coupon rejection
    - Test maximum discount limit enforcement
    - Test multi-currency calculations
    - _Requirements: 4.1, 4.2, 4.4, 5.5, 16.3_

  - [ ]* 25.4 Write integration tests for gamification flow
    - Test points award on booking completion
    - Test milestone badge unlocking
    - Test points redemption for coupon
    - Test leaderboard updates
    - _Requirements: 8.1, 8.2, 8.3, 8.5_

  - [ ]* 25.5 Write integration tests for referral flow
    - Test referral code generation and application
    - Test reward distribution on first booking
    - Test self-referral prevention
    - Test campaign bonus application
    - _Requirements: 9.1, 9.2, 9.3, 9.6, 9.7_


- [ ] 26. End-to-End Testing
  - [ ]* 26.1 Write E2E test for VIP subscription journey
    - User views membership tiers
    - User subscribes to Gold tier
    - User sees instant discount on search results
    - User completes booking with VIP discount
    - User views total savings in dashboard
    - _Requirements: 1.1, 1.2, 5.1, 5.3, 5.6_

  - [ ]* 26.2 Write E2E test for coupon redemption journey
    - User searches for flights
    - User views available coupons
    - User applies coupon at checkout
    - User sees price breakdown with discount
    - User completes payment with discounted price
    - _Requirements: 3.1, 3.6, 4.5, 12.3_

  - [ ]* 26.3 Write E2E test for gamification journey
    - User completes booking and earns points
    - User unlocks achievement badge
    - User views leaderboard rank
    - User redeems points for coupon
    - User applies generated coupon to next booking
    - _Requirements: 8.1, 8.2, 8.3, 8.5_

  - [ ]* 26.4 Write E2E test for referral journey
    - User A generates referral code
    - User B signs up with referral code
    - User B completes first booking
    - Both users receive rewards
    - User A sees updated referral stats
    - _Requirements: 9.1, 9.2, 9.3, 9.5_

- [ ] 27. Performance Testing
  - [ ]* 27.1 Load test coupon validation endpoint
    - Simulate 10,000 concurrent validation requests
    - Verify 95th percentile response time < 2 seconds
    - Verify no errors or timeouts
    - _Requirements: 20.1, 20.4_

  - [ ]* 27.2 Load test discount calculation endpoint
    - Simulate 1,000 concurrent calculation requests
    - Verify 95th percentile response time < 1 second
    - Verify calculation accuracy under load
    - _Requirements: 20.2_

  - [ ]* 27.3 Load test subscription creation endpoint
    - Simulate 1,000 concurrent subscription transactions
    - Verify no degradation in response time
    - Verify payment gateway integration stability
    - _Requirements: 20.3_


- [ ] 28. Documentation
  - [ ] 28.1 Create API documentation
    - Document all subscription API endpoints with request/response examples
    - Document all coupon API endpoints with validation rules
    - Document all discount calculation endpoints
    - Document all gamification and referral endpoints
    - Include authentication requirements and error codes
    - Use OpenAPI/Swagger format
    - _Requirements: All API endpoints_

  - [ ] 28.2 Create admin user guide
    - Document how to create and manage coupons
    - Document how to view analytics and reports
    - Document how to use support tools
    - Document emergency procedures (coupon deactivation, subscription extension)
    - Include screenshots and examples
    - _Requirements: 2.1, 13.1, 19.1, 19.4_

  - [ ] 28.3 Create developer integration guide
    - Document database schema and relationships
    - Document service architecture and dependencies
    - Document caching strategy and invalidation rules
    - Document scheduled jobs and their schedules
    - Document fraud detection rules
    - _Requirements: All backend services_

  - [ ] 28.4 Create user help documentation
    - Document how to subscribe and manage membership
    - Document how to apply coupons and view discounts
    - Document gamification features (points, badges, leaderboard)
    - Document referral program
    - Include FAQs and troubleshooting
    - _Requirements: 1.1, 3.1, 8.1, 9.1_

- [ ] 29. Deployment and Configuration
  - [ ] 29.1 Create environment configuration
    - Add environment variables for payment gateway credentials
    - Add environment variables for Redis connection
    - Add environment variables for email service (Resend)
    - Add environment variables for feature flags
    - Document all required environment variables
    - _Requirements: 12.1, 12.8_

  - [ ] 29.2 Set up database migrations
    - Create migration scripts for production deployment
    - Add rollback scripts for each migration
    - Test migrations on staging environment
    - Document migration order and dependencies
    - _Requirements: All database tables_


  - [ ] 29.3 Configure scheduled jobs
    - Set up cron jobs or task scheduler for background tasks
    - Configure job monitoring and alerting
    - Test job execution on staging
    - Document job schedules and dependencies
    - _Requirements: 1.7, 7.4, 8.5, 14.4_

  - [ ] 29.4 Set up monitoring and alerting
    - Configure application performance monitoring (APM)
    - Set up alerts for slow API responses
    - Set up alerts for failed payments
    - Set up alerts for high error rates
    - Configure log aggregation and search
    - _Requirements: 20.1, 20.2_

  - [ ] 29.5 Create deployment checklist
    - Database migrations executed
    - Environment variables configured
    - Scheduled jobs configured
    - Monitoring and alerting active
    - Seed data loaded (membership tiers)
    - Payment gateway integration tested
    - Cache warming completed
    - _Requirements: All deployment tasks_

- [ ] 30. Final Checkpoint and Launch Preparation
  - Verify all tasks completed
  - Run full test suite (unit, property, integration, E2E)
  - Verify all 46 correctness properties pass
  - Test on staging environment with production-like data
  - Perform security audit
  - Review performance metrics
  - Ensure all documentation complete
  - Ask the user if questions arise before production deployment

## Notes

- Tasks marked with `*` are optional testing tasks and can be skipped for faster MVP delivery
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at major milestones
- Property tests validate universal correctness properties across all inputs
- Unit tests validate specific examples, edge cases, and error conditions
- Integration tests validate component interactions and data flow
- E2E tests validate complete user journeys
- The implementation follows a phased approach: database → backend → frontend → integration → testing
- All code should be production-ready with proper error handling, logging, and security measures
- Performance requirements: coupon validation <2s, discount calculation <1s at 95th percentile
- The system integrates with existing Jetsetters platform and ARC Pay payment gateway

