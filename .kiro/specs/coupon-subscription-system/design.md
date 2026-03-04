# Technical Design: Coupon and Subscription System

## Overview

The Jetsetters Coupon and Subscription System is a comprehensive promotional and membership platform designed to drive customer acquisition, retention, and revenue growth. The system provides three core capabilities:

1. **VIP Membership Management**: Multi-tier subscription system with exclusive benefits, instant discounts, and premium perks
2. **Promotional Coupon Engine**: Flexible coupon code creation, validation, and redemption with advanced stacking rules
3. **Intelligent Discount Calculation**: Real-time price computation with support for complex discount combinations and business rules

The system targets Gen Z customers with a mobile-first, gamified experience while maintaining enterprise-grade security, scalability, and fraud prevention. It integrates seamlessly with the existing Jetsetters travel booking platform (flights, hotels, packages, cruises) and payment infrastructure.

### Key Design Goals

- **Performance**: Sub-2-second coupon validation and sub-1-second discount calculation at 95th percentile
- **Scalability**: Support 10,000+ concurrent coupon validations and 1,000+ concurrent subscription transactions
- **Flexibility**: Configurable discount rules, stacking policies, and membership tiers without code changes
- **Security**: Comprehensive fraud prevention, rate limiting, and audit logging
- **Extensibility**: Partner integration support, A/B testing capabilities, and personalization engine

## Architecture

### System Components

The system follows a microservices-inspired modular architecture within the existing Express.js monolith, with clear separation of concerns:

```
┌─────────────────────────────────────────────────────────────────┐
│                        API Gateway Layer                         │
│                    (Express.js Routes)                           │
└────────────┬────────────────────────────────────────────────────┘
             │
             ├──────────────┬──────────────┬──────────────┐
             │              │              │              │
    ┌────────▼────────┐ ┌──▼──────────┐ ┌─▼────────────┐ ┌──────────────┐
    │ Subscription    │ │   Coupon    │ │  Discount    │ │ Notification │
    │   Manager       │ │   Engine    │ │ Calculator   │ │   Service    │
    └────────┬────────┘ └──┬──────────┘ └─┬────────────┘ └──────────────┘
             │              │              │
             └──────────────┴──────────────┘
                           │
             ┌─────────────┴─────────────┐
             │                           │
    ┌────────▼────────┐         ┌───────▼────────┐
    │   PostgreSQL    │         │     Redis      │
    │   (Supabase)    │         │    (Cache)     │
    └─────────────────┘         └────────────────┘
```

### Component Responsibilities

#### 1. Subscription Manager
- Manages VIP membership tiers, pricing, and benefits configuration
- Handles subscription lifecycle (create, upgrade, downgrade, pause, cancel)
- Tracks membership status, renewal dates, and payment history
- Generates membership cards and manages VIP benefits
- Implements gamification (points, badges, leaderboards, referrals)
- Coordinates with Payment Gateway for subscription billing

#### 2. Coupon Engine
- Creates and manages coupon codes with validation rules
- Validates coupon eligibility (expiry, usage limits, restrictions)
- Tracks redemption events and usage analytics
- Supports time-limited offers and flash sales
- Implements fraud detection and abuse prevention
- Provides personalized offer recommendations

#### 3. Discount Calculator
- Computes final prices after applying all eligible discounts
- Enforces stacking rules and discount precedence
- Validates discount limits (max 90% off)
- Handles multi-currency calculations
- Provides itemized discount breakdowns
- Ensures idempotent price calculations

#### 4. Notification Service
- Sends subscription renewal reminders
- Alerts customers about expiring offers
- Delivers personalized promotional notifications
- Supports email, push notifications, and in-app messages
- Manages notification preferences and timing optimization

### Technology Stack


**Backend**:
- Node.js 18+ with Express.js framework
- PostgreSQL 14+ via Supabase (primary data store)
- Redis 7+ via ioredis (caching and rate limiting)
- JWT for authentication and session management

**Frontend**:
- React 18+ with React Router for SPA navigation
- Tailwind CSS for responsive, mobile-first UI
- Lucide React for iconography
- React Datepicker for date selection

**External Integrations**:
- Payment Gateway: Existing ARC Pay integration
- Email Service: Resend for transactional emails
- Analytics: Custom event tracking system

### Deployment Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    Load Balancer (Vercel)                     │
└────────────────────────┬─────────────────────────────────────┘
                         │
         ┌───────────────┴───────────────┐
         │                               │
┌────────▼────────┐            ┌────────▼────────┐
│  Express.js     │            │  Express.js     │
│  Instance 1     │            │  Instance 2     │
└────────┬────────┘            └────────┬────────┘
         │                               │
         └───────────────┬───────────────┘
                         │
         ┌───────────────┴───────────────┐
         │                               │
┌────────▼────────┐            ┌────────▼────────┐
│   Supabase      │            │     Redis       │
│   PostgreSQL    │            │     Cluster     │
└─────────────────┘            └─────────────────┘
```

### Data Flow Patterns

#### Subscription Creation Flow
```
User → API Gateway → Subscription Manager → Payment Gateway
                           ↓
                    PostgreSQL (subscriptions table)
                           ↓
                    Notification Service → Email/Push
```

#### Coupon Validation Flow
```
User → API Gateway → Coupon Engine → Redis Cache (check)
                           ↓
                    PostgreSQL (if cache miss)
                           ↓
                    Discount Calculator → Final Price
```

#### Checkout with Discounts Flow
```
User → API Gateway → Discount Calculator
                           ↓
                    Subscription Manager (get instant discount)
                           ↓
                    Coupon Engine (validate coupons)
                           ↓
                    Apply stacking rules → Final Price
                           ↓
                    Payment Gateway → Booking Confirmation
```

## Components and Interfaces


### API Endpoints

#### Subscription Management API

```javascript
// Create new subscription
POST /api/subscriptions
Body: {
  userId: string,
  tierId: string,
  billingCycle: 'monthly' | 'annual',
  autoRenew: boolean,
  paymentMethodId: string
}
Response: {
  subscriptionId: string,
  status: 'active' | 'pending',
  startDate: timestamp,
  endDate: timestamp,
  membershipCardId: string
}

// Get subscription details
GET /api/subscriptions/:subscriptionId
Response: {
  subscriptionId: string,
  userId: string,
  tier: { id, name, benefits, instantDiscount },
  status: 'active' | 'paused' | 'cancelled' | 'expired',
  billingCycle: string,
  startDate: timestamp,
  endDate: timestamp,
  autoRenew: boolean,
  totalSavings: number
}

// Upgrade/downgrade subscription
PUT /api/subscriptions/:subscriptionId/tier
Body: {
  newTierId: string,
  effectiveDate: 'immediate' | 'next_billing'
}

// Cancel subscription
DELETE /api/subscriptions/:subscriptionId
Query: { immediate: boolean }

// Pause subscription
POST /api/subscriptions/:subscriptionId/pause
Body: { pauseDuration: number } // max 90 days

// Get membership tiers
GET /api/subscriptions/tiers
Response: [{
  id: string,
  name: string,
  description: string,
  monthlyPrice: number,
  annualPrice: number,
  instantDiscount: number,
  benefits: string[],
  features: object
}]
```

#### Coupon Management API

```javascript
// Create coupon (admin only)
POST /api/coupons
Body: {
  code: string,
  discountType: 'percentage' | 'fixed',
  discountValue: number,
  validFrom: timestamp,
  validUntil: timestamp,
  usageLimit: number,
  perUserLimit: number,
  minBookingAmount: number,
  maxDiscount: number,
  stackable: boolean,
  bookingTypes: string[],
  regionRestrictions: string[],
  tierRestrictions: string[]
}

// Validate coupon
POST /api/coupons/validate
Body: {
  code: string,
  userId: string,
  bookingType: string,
  bookingAmount: number
}
Response: {
  valid: boolean,
  couponId: string,
  discountAmount: number,
  message: string,
  restrictions: object
}

// Apply coupon to booking
POST /api/coupons/apply
Body: {
  code: string,
  userId: string,
  bookingId: string,
  bookingAmount: number
}
Response: {
  redemptionId: string,
  discountApplied: number,
  finalAmount: number
}

// Get user's available coupons
GET /api/coupons/available
Query: { userId, bookingType, amount }
Response: [{
  code: string,
  description: string,
  discountType: string,
  discountValue: number,
  validUntil: timestamp,
  minBookingAmount: number
}]

// Get coupon analytics (admin only)
GET /api/coupons/:couponId/analytics
Response: {
  totalRedemptions: number,
  uniqueUsers: number,
  totalDiscountGiven: number,
  revenueImpact: number,
  conversionRate: number
}
```

#### Discount Calculation API

```javascript
// Calculate final price
POST /api/discounts/calculate
Body: {
  userId: string,
  bookingType: string,
  originalAmount: number,
  couponCodes: string[],
  currency: string
}
Response: {
  originalAmount: number,
  discounts: [{
    type: 'membership' | 'coupon',
    name: string,
    amount: number,
    percentage: number
  }],
  totalDiscount: number,
  finalAmount: number,
  savings: number,
  breakdown: object
}

// Get discount preview
GET /api/discounts/preview
Query: { userId, bookingType, amount, couponCode }
Response: {
  eligible: boolean,
  estimatedDiscount: number,
  finalAmount: number
}
```

#### Gamification API

```javascript
// Get user points and achievements
GET /api/gamification/profile/:userId
Response: {
  totalPoints: number,
  currentTier: string,
  badges: array,
  leaderboardRank: number,
  referralCode: string,
  referralCount: number
}

// Award points
POST /api/gamification/points
Body: {
  userId: string,
  points: number,
  reason: string,
  bookingId: string
}

// Redeem points for coupon
POST /api/gamification/redeem
Body: {
  userId: string,
  points: number
}
Response: {
  couponCode: string,
  discountValue: number
}

// Get leaderboard
GET /api/gamification/leaderboard
Query: { period: 'weekly' | 'monthly' | 'all-time', limit: number }
```

### Service Interfaces


#### SubscriptionManager Service

```javascript
class SubscriptionManager {
  // Tier management
  async getTiers(): Promise<MembershipTier[]>
  async getTierById(tierId: string): Promise<MembershipTier>
  
  // Subscription lifecycle
  async createSubscription(data: CreateSubscriptionDTO): Promise<Subscription>
  async getSubscription(subscriptionId: string): Promise<Subscription>
  async getUserActiveSubscription(userId: string): Promise<Subscription | null>
  async updateSubscription(subscriptionId: string, updates: object): Promise<Subscription>
  async cancelSubscription(subscriptionId: string, immediate: boolean): Promise<void>
  async pauseSubscription(subscriptionId: string, duration: number): Promise<void>
  async resumeSubscription(subscriptionId: string): Promise<void>
  
  // Tier changes
  async upgradeTier(subscriptionId: string, newTierId: string): Promise<Subscription>
  async downgradeTier(subscriptionId: string, newTierId: string): Promise<Subscription>
  
  // Benefits and features
  async getInstantDiscount(userId: string): Promise<number>
  async checkBenefitEligibility(userId: string, benefit: string): Promise<boolean>
  async generateMembershipCard(subscriptionId: string): Promise<string>
  
  // Renewal and billing
  async processRenewal(subscriptionId: string): Promise<boolean>
  async checkExpiringSubscriptions(): Promise<Subscription[]>
  async sendRenewalReminders(): Promise<void>
  
  // Analytics
  async getTotalSavings(userId: string): Promise<number>
  async getSubscriptionMetrics(): Promise<SubscriptionMetrics>
}
```

#### CouponEngine Service

```javascript
class CouponEngine {
  // Coupon CRUD
  async createCoupon(data: CreateCouponDTO): Promise<Coupon>
  async getCoupon(couponId: string): Promise<Coupon>
  async getCouponByCode(code: string): Promise<Coupon>
  async updateCoupon(couponId: string, updates: object): Promise<Coupon>
  async deactivateCoupon(couponId: string): Promise<void>
  
  // Validation
  async validateCoupon(code: string, context: ValidationContext): Promise<ValidationResult>
  async checkEligibility(coupon: Coupon, userId: string, bookingContext: object): Promise<boolean>
  async checkUsageLimit(coupon: Coupon, userId: string): Promise<boolean>
  
  // Redemption
  async applyCoupon(code: string, bookingId: string, userId: string): Promise<Redemption>
  async recordRedemption(couponId: string, userId: string, bookingId: string, amount: number): Promise<void>
  async cancelRedemption(redemptionId: string): Promise<void>
  
  // Discovery and recommendations
  async getAvailableCoupons(userId: string, filters: object): Promise<Coupon[]>
  async getPersonalizedOffers(userId: string): Promise<Coupon[]>
  async getTimeLimitedOffers(): Promise<Coupon[]>
  
  // Analytics and fraud detection
  async getCouponAnalytics(couponId: string): Promise<CouponAnalytics>
  async detectSuspiciousActivity(userId: string): Promise<boolean>
  async blacklistUser(userId: string, couponId: string): Promise<void>
}
```

#### DiscountCalculator Service

```javascript
class DiscountCalculator {
  // Price calculation
  async calculateFinalPrice(context: PriceContext): Promise<PriceBreakdown>
  async applyMembershipDiscount(amount: number, userId: string): Promise<number>
  async applyCouponDiscount(amount: number, coupon: Coupon): Promise<number>
  
  // Stacking logic
  async applyStackableDiscounts(amount: number, discounts: Discount[]): Promise<PriceBreakdown>
  async validateStackingRules(discounts: Discount[]): Promise<boolean>
  async sortDiscountsByPrecedence(discounts: Discount[]): Promise<Discount[]>
  
  // Validation
  async validateMaxDiscount(originalAmount: number, discountedAmount: number): Promise<boolean>
  async roundDiscount(amount: number): Promise<number>
  
  // Multi-currency
  async convertCurrency(amount: number, from: string, to: string): Promise<number>
  async calculateInLocalCurrency(context: PriceContext): Promise<PriceBreakdown>
  
  // Preview and estimation
  async previewDiscount(amount: number, discounts: Discount[]): Promise<number>
  async estimateSavings(userId: string, bookingType: string): Promise<number>
}
```

#### NotificationService Interface

```javascript
class NotificationService {
  // Subscription notifications
  async sendSubscriptionConfirmation(userId: string, subscription: Subscription): Promise<void>
  async sendRenewalReminder(userId: string, daysUntilExpiry: number): Promise<void>
  async sendSubscriptionExpired(userId: string): Promise<void>
  async sendUpgradeConfirmation(userId: string, oldTier: string, newTier: string): Promise<void>
  
  // Coupon notifications
  async sendCouponAvailable(userId: string, coupon: Coupon): Promise<void>
  async sendCouponExpiring(userId: string, coupon: Coupon, hoursRemaining: number): Promise<void>
  async sendPersonalizedOffer(userId: string, offers: Coupon[]): Promise<void>
  
  // Gamification notifications
  async sendPointsEarned(userId: string, points: number, reason: string): Promise<void>
  async sendBadgeUnlocked(userId: string, badge: Badge): Promise<void>
  async sendLeaderboardUpdate(userId: string, rank: number): Promise<void>
  
  // Preferences
  async updateNotificationPreferences(userId: string, preferences: object): Promise<void>
  async getOptimalSendTime(userId: string): Promise<Date>
}
```

## Data Models


### Database Schema

#### membership_tiers Table
```sql
CREATE TABLE membership_tiers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    monthly_price DECIMAL(10,2) NOT NULL,
    annual_price DECIMAL(10,2) NOT NULL,
    instant_discount_percentage DECIMAL(5,2) NOT NULL DEFAULT 0,
    benefits JSONB NOT NULL DEFAULT '[]',
    features JSONB NOT NULL DEFAULT '{}',
    display_order INTEGER NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Example benefits structure:
-- ["Priority customer support", "Airport lounge access", "Free cancellations", "2x points multiplier"]

-- Example features structure:
-- {
--   "lounge_access": true,
--   "free_cancellations": true,
--   "priority_support": true,
--   "points_multiplier": 2,
--   "early_access_hours": 24
-- }

CREATE INDEX idx_membership_tiers_active ON membership_tiers(active);
CREATE INDEX idx_membership_tiers_display_order ON membership_tiers(display_order);
```

#### subscriptions Table
```sql
CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    tier_id UUID NOT NULL REFERENCES membership_tiers(id),
    status VARCHAR(20) NOT NULL DEFAULT 'active' 
        CHECK (status IN ('active', 'paused', 'cancelled', 'expired', 'pending')),
    billing_cycle VARCHAR(20) NOT NULL CHECK (billing_cycle IN ('monthly', 'annual')),
    start_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    end_date TIMESTAMP WITH TIME ZONE NOT NULL,
    next_billing_date TIMESTAMP WITH TIME ZONE,
    auto_renew BOOLEAN NOT NULL DEFAULT true,
    pause_start_date TIMESTAMP WITH TIME ZONE,
    pause_end_date TIMESTAMP WITH TIME ZONE,
    cancellation_date TIMESTAMP WITH TIME ZONE,
    cancellation_reason TEXT,
    membership_card_id VARCHAR(50) UNIQUE,
    total_savings DECIMAL(10,2) NOT NULL DEFAULT 0,
    payment_method_id VARCHAR(100),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_subscriptions_end_date ON subscriptions(end_date);
CREATE INDEX idx_subscriptions_next_billing_date ON subscriptions(next_billing_date);
CREATE UNIQUE INDEX idx_subscriptions_active_user ON subscriptions(user_id) 
    WHERE status = 'active';
```

#### subscription_history Table
```sql
CREATE TABLE subscription_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL 
        CHECK (action IN ('created', 'upgraded', 'downgraded', 'paused', 'resumed', 'cancelled', 'renewed', 'expired')),
    old_tier_id UUID REFERENCES membership_tiers(id),
    new_tier_id UUID REFERENCES membership_tiers(id),
    amount_charged DECIMAL(10,2),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_subscription_history_subscription_id ON subscription_history(subscription_id);
CREATE INDEX idx_subscription_history_user_id ON subscription_history(user_id);
CREATE INDEX idx_subscription_history_created_at ON subscription_history(created_at DESC);
```

#### coupons Table
```sql
CREATE TABLE coupons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(20) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    discount_type VARCHAR(20) NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
    discount_value DECIMAL(10,2) NOT NULL,
    max_discount DECIMAL(10,2),
    min_booking_amount DECIMAL(10,2) DEFAULT 0,
    currency VARCHAR(3) DEFAULT 'USD',
    valid_from TIMESTAMP WITH TIME ZONE NOT NULL,
    valid_until TIMESTAMP WITH TIME ZONE NOT NULL,
    usage_limit INTEGER,
    per_user_limit INTEGER DEFAULT 1,
    current_usage INTEGER NOT NULL DEFAULT 0,
    stackable BOOLEAN NOT NULL DEFAULT false,
    booking_types VARCHAR(50)[] DEFAULT ARRAY['flight', 'hotel', 'package', 'cruise'],
    tier_restrictions UUID[] DEFAULT NULL,
    region_restrictions VARCHAR(10)[] DEFAULT NULL,
    partner_id VARCHAR(100),
    campaign_id VARCHAR(100),
    status VARCHAR(20) NOT NULL DEFAULT 'active' 
        CHECK (status IN ('active', 'inactive', 'exhausted', 'expired')),
    terms_and_conditions TEXT,
    metadata JSONB DEFAULT '{}',
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_coupons_code ON coupons(code);
CREATE INDEX idx_coupons_status ON coupons(status);
CREATE INDEX idx_coupons_valid_from ON coupons(valid_from);
CREATE INDEX idx_coupons_valid_until ON coupons(valid_until);
CREATE INDEX idx_coupons_campaign_id ON coupons(campaign_id);
CREATE INDEX idx_coupons_partner_id ON coupons(partner_id);
```

#### coupon_redemptions Table
```sql
CREATE TABLE coupon_redemptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    coupon_id UUID NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    discount_amount DECIMAL(10,2) NOT NULL,
    original_amount DECIMAL(10,2) NOT NULL,
    final_amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    status VARCHAR(20) NOT NULL DEFAULT 'applied' 
        CHECK (status IN ('applied', 'cancelled', 'refunded')),
    ip_address INET,
    user_agent TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_coupon_redemptions_coupon_id ON coupon_redemptions(coupon_id);
CREATE INDEX idx_coupon_redemptions_user_id ON coupon_redemptions(user_id);
CREATE INDEX idx_coupon_redemptions_booking_id ON coupon_redemptions(booking_id);
CREATE INDEX idx_coupon_redemptions_created_at ON coupon_redemptions(created_at DESC);
```

#### gamification_points Table
```sql
CREATE TABLE gamification_points (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    points INTEGER NOT NULL,
    reason VARCHAR(100) NOT NULL,
    booking_id UUID REFERENCES bookings(id),
    subscription_id UUID REFERENCES subscriptions(id),
    referral_id UUID,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_gamification_points_user_id ON gamification_points(user_id);
CREATE INDEX idx_gamification_points_created_at ON gamification_points(created_at DESC);
```

#### user_achievements Table
```sql
CREATE TABLE user_achievements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    achievement_type VARCHAR(50) NOT NULL,
    achievement_name VARCHAR(100) NOT NULL,
    achievement_description TEXT,
    badge_icon VARCHAR(200),
    unlocked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, achievement_type, achievement_name)
);

CREATE INDEX idx_user_achievements_user_id ON user_achievements(user_id);
```

#### referrals Table
```sql
CREATE TABLE referrals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    referrer_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    referee_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    referral_code VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' 
        CHECK (status IN ('pending', 'completed', 'rewarded')),
    referrer_reward_type VARCHAR(20),
    referrer_reward_value DECIMAL(10,2),
    referee_reward_type VARCHAR(20),
    referee_reward_value DECIMAL(10,2),
    first_booking_id UUID REFERENCES bookings(id),
    completed_at TIMESTAMP WITH TIME ZONE,
    rewarded_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_referrals_referrer_user_id ON referrals(referrer_user_id);
CREATE INDEX idx_referrals_referee_user_id ON referrals(referee_user_id);
CREATE INDEX idx_referrals_referral_code ON referrals(referral_code);
CREATE INDEX idx_referrals_status ON referrals(status);
```

#### discount_transactions Table
```sql
CREATE TABLE discount_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    original_amount DECIMAL(10,2) NOT NULL,
    final_amount DECIMAL(10,2) NOT NULL,
    total_discount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    discounts_applied JSONB NOT NULL DEFAULT '[]',
    calculation_details JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Example discounts_applied structure:
-- [
--   {"type": "membership", "name": "Gold Tier", "amount": 50.00, "percentage": 10},
--   {"type": "coupon", "code": "SUMMER20", "amount": 100.00, "percentage": 20}
-- ]

CREATE INDEX idx_discount_transactions_booking_id ON discount_transactions(booking_id);
CREATE INDEX idx_discount_transactions_user_id ON discount_transactions(user_id);
CREATE INDEX idx_discount_transactions_created_at ON discount_transactions(created_at DESC);
```

### TypeScript Type Definitions


```typescript
// Membership Types
interface MembershipTier {
  id: string;
  name: string;
  description: string;
  monthlyPrice: number;
  annualPrice: number;
  instantDiscountPercentage: number;
  benefits: string[];
  features: {
    loungeAccess?: boolean;
    freeCancellations?: boolean;
    prioritySupport?: boolean;
    pointsMultiplier?: number;
    earlyAccessHours?: number;
    [key: string]: any;
  };
  displayOrder: number;
  active: boolean;
}

interface Subscription {
  id: string;
  userId: string;
  tierId: string;
  tier?: MembershipTier;
  status: 'active' | 'paused' | 'cancelled' | 'expired' | 'pending';
  billingCycle: 'monthly' | 'annual';
  startDate: Date;
  endDate: Date;
  nextBillingDate?: Date;
  autoRenew: boolean;
  pauseStartDate?: Date;
  pauseEndDate?: Date;
  cancellationDate?: Date;
  cancellationReason?: string;
  membershipCardId?: string;
  totalSavings: number;
  paymentMethodId?: string;
  metadata: Record<string, any>;
}

// Coupon Types
interface Coupon {
  id: string;
  code: string;
  name: string;
  description?: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  maxDiscount?: number;
  minBookingAmount: number;
  currency: string;
  validFrom: Date;
  validUntil: Date;
  usageLimit?: number;
  perUserLimit: number;
  currentUsage: number;
  stackable: boolean;
  bookingTypes: string[];
  tierRestrictions?: string[];
  regionRestrictions?: string[];
  partnerId?: string;
  campaignId?: string;
  status: 'active' | 'inactive' | 'exhausted' | 'expired';
  termsAndConditions?: string;
  metadata: Record<string, any>;
}

interface CouponRedemption {
  id: string;
  couponId: string;
  userId: string;
  bookingId: string;
  discountAmount: number;
  originalAmount: number;
  finalAmount: number;
  currency: string;
  status: 'applied' | 'cancelled' | 'refunded';
  ipAddress?: string;
  userAgent?: string;
  metadata: Record<string, any>;
  createdAt: Date;
}

interface ValidationResult {
  valid: boolean;
  couponId?: string;
  discountAmount?: number;
  message: string;
  errorCode?: string;
  restrictions?: {
    minAmount?: number;
    validUntil?: Date;
    bookingTypes?: string[];
    tierRequired?: string;
  };
}

// Discount Types
interface Discount {
  type: 'membership' | 'coupon';
  name: string;
  code?: string;
  amount: number;
  percentage?: number;
  stackable: boolean;
  priority: number;
}

interface PriceBreakdown {
  originalAmount: number;
  discounts: Discount[];
  totalDiscount: number;
  finalAmount: number;
  savings: number;
  currency: string;
  breakdown: {
    subtotal: number;
    membershipDiscount: number;
    couponDiscounts: number;
    taxes?: number;
    fees?: number;
  };
}

interface PriceContext {
  userId: string;
  bookingType: string;
  originalAmount: number;
  couponCodes?: string[];
  currency: string;
  bookingDetails?: Record<string, any>;
}

// Gamification Types
interface GamificationProfile {
  userId: string;
  totalPoints: number;
  availablePoints: number;
  currentTier?: string;
  badges: Badge[];
  leaderboardRank?: number;
  referralCode: string;
  referralCount: number;
  totalReferralRewards: number;
}

interface Badge {
  type: string;
  name: string;
  description: string;
  icon: string;
  unlockedAt: Date;
}

interface PointsTransaction {
  id: string;
  userId: string;
  points: number;
  reason: string;
  bookingId?: string;
  subscriptionId?: string;
  referralId?: string;
  expiresAt?: Date;
  createdAt: Date;
}

interface Referral {
  id: string;
  referrerUserId: string;
  refereeUserId: string;
  referralCode: string;
  status: 'pending' | 'completed' | 'rewarded';
  referrerRewardType?: string;
  referrerRewardValue?: number;
  refereeRewardType?: string;
  refereeRewardValue?: number;
  firstBookingId?: string;
  completedAt?: Date;
  rewardedAt?: Date;
}

// Analytics Types
interface SubscriptionMetrics {
  totalActiveSubscriptions: number;
  newSubscriptionsThisMonth: number;
  cancellationsThisMonth: number;
  churnRate: number;
  averageLifetimeValue: number;
  tierDistribution: Record<string, number>;
  monthlyRecurringRevenue: number;
  annualRecurringRevenue: number;
}

interface CouponAnalytics {
  couponId: string;
  code: string;
  totalRedemptions: number;
  uniqueUsers: number;
  totalDiscountGiven: number;
  averageDiscountPerRedemption: number;
  revenueImpact: number;
  conversionRate: number;
  redemptionsByDay: Record<string, number>;
  topBookingTypes: Record<string, number>;
}
```

### Redis Cache Schema

```typescript
// Cache keys and TTL
const CACHE_KEYS = {
  COUPON: (code: string) => `coupon:${code}`,
  USER_SUBSCRIPTION: (userId: string) => `subscription:user:${userId}`,
  TIER: (tierId: string) => `tier:${tierId}`,
  AVAILABLE_COUPONS: (userId: string) => `coupons:available:${userId}`,
  LEADERBOARD: (period: string) => `leaderboard:${period}`,
  RATE_LIMIT: (userId: string, action: string) => `ratelimit:${userId}:${action}`
};

const CACHE_TTL = {
  COUPON: 300, // 5 minutes
  SUBSCRIPTION: 600, // 10 minutes
  TIER: 3600, // 1 hour
  AVAILABLE_COUPONS: 180, // 3 minutes
  LEADERBOARD: 86400, // 24 hours
  RATE_LIMIT: 60 // 1 minute
};

// Example cached coupon structure
interface CachedCoupon {
  id: string;
  code: string;
  valid: boolean;
  discountType: string;
  discountValue: number;
  restrictions: object;
  expiresAt: number;
}
```


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Subscription Data Persistence

*For any* subscription created in the system, querying that subscription by ID SHALL return all required fields including start date, end date, renewal status, tier information, and membership card ID.

**Validates: Requirements 1.3, 1.8**

### Property 2: Subscription Tier Upgrade Immediacy

*For any* active subscription, when upgraded to a higher tier, the new tier benefits SHALL be immediately available and the subscription record SHALL reflect the new tier ID.

**Validates: Requirements 1.6**

### Property 3: Coupon Code Format Validation

*For any* coupon code creation attempt, codes with length less than 4 characters or greater than 20 characters SHALL be rejected, and only alphanumeric codes SHALL be accepted.

**Validates: Requirements 2.1**

### Property 4: Coupon Data Persistence

*For any* coupon created in the system, querying that coupon SHALL return all required fields including discount type, discount value, validity period, and terms and conditions.

**Validates: Requirements 2.2, 18.1**

### Property 5: Coupon Usage Limit Enforcement

*For any* coupon that has reached its total usage limit, any attempt to redeem that coupon SHALL fail with an "exhausted" status, and the coupon SHALL be marked as exhausted in the database.

**Validates: Requirements 2.7, 3.3**

### Property 6: Comprehensive Coupon Validation

*For any* coupon validation attempt, the system SHALL reject coupons that are: (a) expired with an expiration error, (b) below minimum booking amount with a minimum amount error, (c) restricted to non-matching booking types with a booking type error, or (d) outside their validity period with a validity error.

**Validates: Requirements 3.2, 3.4, 3.5, 7.2**

### Property 7: Redemption Event Recording

*For any* successful coupon application to a booking, a redemption record SHALL be created containing the coupon ID, user ID, booking ID, discount amount, and timestamp.

**Validates: Requirements 3.6**

### Property 8: Duplicate Coupon Prevention

*For any* booking, attempting to apply the same coupon code more than once SHALL fail on the second attempt with a "duplicate redemption" error.

**Validates: Requirements 3.7**

### Property 9: Coupon Redemption Cancellation Round-Trip

*For any* coupon applied to a booking, if the booking is cancelled, the coupon's usage count SHALL be restored to its previous value (decremented by 1).

**Validates: Requirements 3.8**

### Property 10: Discount Application Precedence

*For any* price calculation with multiple discounts, membership instant discounts SHALL be applied before coupon discounts, and stackable discounts SHALL be applied in descending order by discount value.

**Validates: Requirements 4.1, 4.3**

### Property 11: Non-Stackable Discount Exclusivity

*For any* price calculation, if a non-stackable discount is applied, attempting to add any additional discount SHALL fail with a "non-stackable" error.

**Validates: Requirements 4.2**

### Property 12: Maximum Discount Limit

*For any* price calculation, the final amount SHALL be at least 10% of the original amount (total discount SHALL NOT exceed 90%).

**Validates: Requirements 4.4**

### Property 13: Price Breakdown Completeness

*For any* discount calculation, the returned breakdown SHALL contain original amount, each applied discount with its name and value, total discount, and final amount.

**Validates: Requirements 4.5**

### Property 14: Discount Rounding Precision

*For any* percentage discount calculation, the discount amount SHALL be rounded to exactly 2 decimal places.

**Validates: Requirements 4.6**

### Property 15: Price Calculation Idempotence

*For any* booking with discounts, recalculating the final price with the same inputs (user ID, booking amount, coupon codes, currency) SHALL produce the exact same final amount.

**Validates: Requirements 4.8**

### Property 16: Instant Discount Application by Subscription Status

*For any* booking by a user with an active subscription, the instant discount for their tier SHALL be automatically applied; for any booking by a user without an active subscription, no instant discount SHALL be applied.

**Validates: Requirements 5.3, 5.7**

### Property 17: Tier Discount Hierarchy

*For any* two membership tiers where tier A has a higher display order than tier B, tier A's instant discount percentage SHALL be greater than or equal to tier B's instant discount percentage.

**Validates: Requirements 5.4**

### Property 18: Stackable Discount Combination

*For any* booking by a subscribed user with a stackable coupon code, both the membership instant discount and the coupon discount SHALL be applied to the final price.

**Validates: Requirements 5.5**

### Property 19: Subscription Savings Accumulation

*For any* user with an active subscription, after applying an instant discount to a booking, the subscription's total_savings field SHALL be incremented by the discount amount.

**Validates: Requirements 5.6**

### Property 20: Free Cancellation Benefit

*For any* booking by a user whose membership tier includes free cancellations, the cancellation fee SHALL be zero.

**Validates: Requirements 6.4**

### Property 21: Points Multiplier by Tier

*For any* points award to a subscribed user, the points SHALL be multiplied by the tier's points multiplier value.

**Validates: Requirements 6.5**

### Property 22: VIP Early Access

*For any* time-limited offer with early access enabled, VIP members SHALL be able to access the offer before the public start time, while non-VIP members SHALL NOT be able to access it before the public start time.

**Validates: Requirements 7.5**

### Property 23: Points Award Proportionality

*For any* completed booking, the gamification points awarded SHALL be proportional to the booking value (higher booking value results in more points).

**Validates: Requirements 8.1**

### Property 24: Milestone Badge Unlocking

*For any* user reaching a defined point milestone, an achievement badge SHALL be created for that user with the milestone type and unlock timestamp.

**Validates: Requirements 8.2**

### Property 25: Points to Coupon Conversion

*For any* points redemption request, if the user has sufficient points, a coupon SHALL be generated with a discount value equal to the points multiplied by the conversion rate, and the user's available points SHALL be decremented.

**Validates: Requirements 8.3**

### Property 26: Streak Bonus Multiplier

*For any* user with consecutive monthly bookings meeting the streak threshold, points awarded SHALL include the streak multiplier bonus.

**Validates: Requirements 8.6**

### Property 27: Unique Referral Code Generation

*For any* user account, a unique referral code SHALL be generated, and no two users SHALL have the same referral code.

**Validates: Requirements 9.1**

### Property 28: Referral Link Creation

*For any* new user signup with a valid referral code, a referral record SHALL be created linking the referrer and referee user IDs.

**Validates: Requirements 9.2**

### Property 29: Referral Reward Distribution

*For any* referee completing their first booking, both the referrer and referee SHALL receive their configured rewards (points, coupons, or discounts).

**Validates: Requirements 9.3**

### Property 30: Referral Tracking Accuracy

*For any* user who has referred others, the total referral count and total referral earnings SHALL accurately reflect all completed and rewarded referrals.

**Validates: Requirements 9.5**

### Property 31: Campaign Bonus Application

*For any* referral completed during an active campaign period, the rewards SHALL include the campaign bonus in addition to the base referral reward.

**Validates: Requirements 9.6**

### Property 32: Self-Referral Prevention

*For any* referral attempt where the referrer user ID equals the referee user ID, the referral SHALL be rejected with a "self-referral not allowed" error.

**Validates: Requirements 9.7**

### Property 33: Payment Amount Accuracy

*For any* booking transaction with discounts, the amount passed to the payment gateway SHALL exactly equal the final discounted amount calculated by the Discount Calculator.

**Validates: Requirements 12.3**

### Property 34: Subscription Cancellation Processing

*For any* subscription cancellation request, the subscription status SHALL be immediately updated to "cancelled", the cancellation date SHALL be set to the current timestamp, and the end date SHALL be confirmed.

**Validates: Requirements 14.1**

### Property 35: Subscription Pause and Resume Round-Trip

*For any* subscription that is paused and then resumed, the tier ID SHALL remain unchanged, and the benefits SHALL be restored to their pre-pause state.

**Validates: Requirements 14.2**

### Property 36: Downgrade Scheduling

*For any* subscription downgrade request, the tier change SHALL NOT be applied immediately but SHALL be scheduled for the next billing date.

**Validates: Requirements 14.3**

### Property 37: Subscription History Completeness

*For any* subscription with tier changes, cancellations, or renewals, the subscription_history table SHALL contain records for each action with old tier, new tier, and timestamp.

**Validates: Requirements 14.6**

### Property 38: Subscription Reactivation State Restoration

*For any* subscription cancelled and then reactivated within 30 days, the user's gamification points and previous tier benefits SHALL be restored.

**Validates: Requirements 14.7**

### Property 39: Rate Limiting for Redemption Attempts

*For any* user making more than 5 coupon redemption attempts within 1 minute, subsequent attempts SHALL be blocked with a "rate limit exceeded" error.

**Validates: Requirements 15.1**

### Property 40: Eligibility Criteria Validation

*For any* coupon with eligibility criteria (tier restrictions, region restrictions), validation SHALL verify the user meets all criteria before allowing redemption.

**Validates: Requirements 15.3**

### Property 41: Blacklist Enforcement

*For any* user blacklisted from a specific coupon or all promotions, coupon validation SHALL fail with a "user blacklisted" error.

**Validates: Requirements 15.5**

### Property 42: Currency Conversion Consistency

*For any* user changing their currency preference, all prices SHALL be recalculated using the current exchange rate for the new currency.

**Validates: Requirements 16.3**

### Property 43: Cross-Currency Discount Accuracy

*For any* discount applied in a currency different from the booking currency, the discount value SHALL be correctly converted using the current exchange rate while maintaining the intended discount percentage or amount.

**Validates: Requirements 16.6**

### Property 44: Geographic Restriction Enforcement

*For any* coupon with geographic restrictions, validation SHALL check the user's location and reject redemption if the location is not in the allowed regions.

**Validates: Requirements 18.4**

### Property 45: Audit Log Creation

*For any* subscription action (creation, upgrade, downgrade, cancellation, pause, resume) or support agent action, an audit log entry SHALL be created with the action type, user ID, timestamp, and relevant details.

**Validates: Requirements 18.5, 19.5**

### Property 46: Age Verification for Restricted Subscriptions

*For any* subscription tier with age restrictions, the subscription creation SHALL verify the user's age meets the minimum requirement before processing payment.

**Validates: Requirements 18.6**


## Error Handling

### Error Classification

The system implements a comprehensive error handling strategy with standardized error codes and user-friendly messages:

#### Validation Errors (400 series)
```javascript
{
  code: 'INVALID_COUPON_CODE',
  message: 'Coupon code must be 4-20 alphanumeric characters',
  statusCode: 400
}

{
  code: 'COUPON_EXPIRED',
  message: 'This coupon expired on {expiryDate}',
  statusCode: 400,
  metadata: { expiryDate: '2024-12-31' }
}

{
  code: 'MIN_AMOUNT_NOT_MET',
  message: 'Minimum booking amount of {minAmount} required',
  statusCode: 400,
  metadata: { minAmount: 100.00, currentAmount: 75.00 }
}

{
  code: 'BOOKING_TYPE_MISMATCH',
  message: 'This coupon is only valid for {allowedTypes}',
  statusCode: 400,
  metadata: { allowedTypes: ['flight', 'hotel'] }
}

{
  code: 'DUPLICATE_REDEMPTION',
  message: 'This coupon has already been applied to this booking',
  statusCode: 400
}

{
  code: 'SELF_REFERRAL_NOT_ALLOWED',
  message: 'You cannot use your own referral code',
  statusCode: 400
}
```

#### Authorization Errors (403 series)
```javascript
{
  code: 'USER_BLACKLISTED',
  message: 'You are not eligible to use this promotion',
  statusCode: 403
}

{
  code: 'TIER_RESTRICTION',
  message: 'This offer is only available to {requiredTier} members',
  statusCode: 403,
  metadata: { requiredTier: 'Gold' }
}

{
  code: 'REGION_RESTRICTED',
  message: 'This offer is not available in your region',
  statusCode: 403
}

{
  code: 'AGE_RESTRICTION',
  message: 'You must be at least {minAge} years old to subscribe',
  statusCode: 403,
  metadata: { minAge: 18 }
}
```

#### Resource Errors (404 series)
```javascript
{
  code: 'COUPON_NOT_FOUND',
  message: 'Coupon code not found',
  statusCode: 404
}

{
  code: 'SUBSCRIPTION_NOT_FOUND',
  message: 'Subscription not found',
  statusCode: 404
}

{
  code: 'TIER_NOT_FOUND',
  message: 'Membership tier not found',
  statusCode: 404
}
```

#### Conflict Errors (409 series)
```javascript
{
  code: 'COUPON_EXHAUSTED',
  message: 'This coupon has reached its usage limit',
  statusCode: 409
}

{
  code: 'NON_STACKABLE_DISCOUNT',
  message: 'This discount cannot be combined with other offers',
  statusCode: 409
}

{
  code: 'ACTIVE_SUBSCRIPTION_EXISTS',
  message: 'You already have an active subscription',
  statusCode: 409
}
```

#### Rate Limiting Errors (429 series)
```javascript
{
  code: 'RATE_LIMIT_EXCEEDED',
  message: 'Too many attempts. Please try again in {retryAfter} seconds',
  statusCode: 429,
  metadata: { retryAfter: 60 }
}
```

#### Server Errors (500 series)
```javascript
{
  code: 'PAYMENT_PROCESSING_ERROR',
  message: 'Unable to process payment. Please try again',
  statusCode: 500
}

{
  code: 'DISCOUNT_CALCULATION_ERROR',
  message: 'Error calculating discount. Please contact support',
  statusCode: 500
}
```

### Error Handling Patterns

#### Service Layer Error Handling
```javascript
class CouponEngine {
  async validateCoupon(code, context) {
    try {
      // Validate input
      if (!code || code.length < 4 || code.length > 20) {
        throw new ValidationError('INVALID_COUPON_CODE', 
          'Coupon code must be 4-20 alphanumeric characters');
      }

      // Fetch coupon with caching
      const coupon = await this.getCouponByCode(code);
      if (!coupon) {
        throw new NotFoundError('COUPON_NOT_FOUND', 'Coupon code not found');
      }

      // Check expiry
      if (new Date() > coupon.validUntil) {
        throw new ValidationError('COUPON_EXPIRED', 
          `This coupon expired on ${coupon.validUntil.toISOString()}`,
          { expiryDate: coupon.validUntil });
      }

      // Check usage limit
      if (coupon.usageLimit && coupon.currentUsage >= coupon.usageLimit) {
        throw new ConflictError('COUPON_EXHAUSTED', 
          'This coupon has reached its usage limit');
      }

      // Check minimum amount
      if (context.bookingAmount < coupon.minBookingAmount) {
        throw new ValidationError('MIN_AMOUNT_NOT_MET',
          `Minimum booking amount of ${coupon.minBookingAmount} required`,
          { minAmount: coupon.minBookingAmount, currentAmount: context.bookingAmount });
      }

      return { valid: true, coupon };
    } catch (error) {
      // Log error for monitoring
      logger.error('Coupon validation error', { code, error: error.message });
      throw error;
    }
  }
}
```

#### API Route Error Handling
```javascript
router.post('/api/coupons/validate', async (req, res) => {
  try {
    const { code, userId, bookingType, bookingAmount } = req.body;
    
    const result = await couponEngine.validateCoupon(code, {
      userId,
      bookingType,
      bookingAmount
    });

    res.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof ValidationError || 
        error instanceof NotFoundError || 
        error instanceof ConflictError) {
      return res.status(error.statusCode).json({
        success: false,
        error: {
          code: error.code,
          message: error.message,
          metadata: error.metadata
        }
      });
    }

    // Unexpected errors
    logger.error('Unexpected error in coupon validation', { error });
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred'
      }
    });
  }
});
```

### Retry and Fallback Strategies

#### Payment Processing Retry
```javascript
async function processSubscriptionPayment(subscriptionId, retryCount = 0) {
  const MAX_RETRIES = 3;
  
  try {
    const result = await paymentGateway.charge(subscriptionId);
    return result;
  } catch (error) {
    if (retryCount < MAX_RETRIES && error.isRetryable) {
      const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff
      await sleep(delay);
      return processSubscriptionPayment(subscriptionId, retryCount + 1);
    }
    throw error;
  }
}
```

#### Cache Fallback
```javascript
async function getCouponByCode(code) {
  try {
    // Try cache first
    const cached = await redis.get(CACHE_KEYS.COUPON(code));
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (cacheError) {
    logger.warn('Cache read error, falling back to database', { error: cacheError });
  }

  // Fallback to database
  const coupon = await db.query('SELECT * FROM coupons WHERE code = $1', [code]);
  
  // Try to cache for next time (fire and forget)
  redis.setex(CACHE_KEYS.COUPON(code), CACHE_TTL.COUPON, JSON.stringify(coupon))
    .catch(err => logger.warn('Cache write error', { error: err }));

  return coupon;
}
```

### Transaction Management

#### Database Transactions for Critical Operations
```javascript
async function applyCouponToBooking(couponCode, bookingId, userId) {
  const client = await db.getClient();
  
  try {
    await client.query('BEGIN');

    // Lock coupon row for update
    const coupon = await client.query(
      'SELECT * FROM coupons WHERE code = $1 FOR UPDATE',
      [couponCode]
    );

    // Validate and apply
    if (coupon.currentUsage >= coupon.usageLimit) {
      throw new ConflictError('COUPON_EXHAUSTED');
    }

    // Create redemption record
    await client.query(
      'INSERT INTO coupon_redemptions (coupon_id, user_id, booking_id, discount_amount) VALUES ($1, $2, $3, $4)',
      [coupon.id, userId, bookingId, discountAmount]
    );

    // Increment usage count
    await client.query(
      'UPDATE coupons SET current_usage = current_usage + 1 WHERE id = $1',
      [coupon.id]
    );

    await client.query('COMMIT');
    return { success: true };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
```


## Testing Strategy

### Dual Testing Approach

The system employs a comprehensive testing strategy combining unit tests and property-based tests:

- **Unit Tests**: Verify specific examples, edge cases, error conditions, and integration points
- **Property-Based Tests**: Verify universal properties across all inputs through randomization

Both approaches are complementary and necessary for comprehensive coverage. Unit tests catch concrete bugs and validate specific scenarios, while property-based tests verify general correctness across a wide input space.

### Property-Based Testing Framework

**Library**: We will use **fast-check** for JavaScript/TypeScript property-based testing.

**Configuration**:
- Minimum 100 iterations per property test (due to randomization)
- Each property test must reference its design document property
- Tag format: `Feature: coupon-subscription-system, Property {number}: {property_text}`

### Test Organization

```
tests/
├── unit/
│   ├── subscription-manager.test.js
│   ├── coupon-engine.test.js
│   ├── discount-calculator.test.js
│   ├── gamification.test.js
│   └── referrals.test.js
├── property/
│   ├── subscription-properties.test.js
│   ├── coupon-properties.test.js
│   ├── discount-properties.test.js
│   ├── gamification-properties.test.js
│   └── referral-properties.test.js
├── integration/
│   ├── checkout-flow.test.js
│   ├── subscription-lifecycle.test.js
│   └── payment-integration.test.js
└── e2e/
    ├── user-subscription-journey.test.js
    └── coupon-redemption-journey.test.js
```

### Property-Based Test Examples

#### Property 15: Price Calculation Idempotence
```javascript
import fc from 'fast-check';
import { describe, it } from 'vitest';
import { DiscountCalculator } from '../services/discount-calculator';

describe('Discount Calculator Properties', () => {
  it('Property 15: Price calculation idempotence - recalculating with same inputs produces same result', async () => {
    // Feature: coupon-subscription-system, Property 15: Price Calculation Idempotence
    
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // userId
        fc.constantFrom('flight', 'hotel', 'package', 'cruise'), // bookingType
        fc.double({ min: 100, max: 10000 }), // originalAmount
        fc.array(fc.string({ minLength: 4, maxLength: 20 }), { maxLength: 3 }), // couponCodes
        fc.constantFrom('USD', 'EUR', 'GBP'), // currency
        async (userId, bookingType, originalAmount, couponCodes, currency) => {
          const calculator = new DiscountCalculator();
          
          const context = {
            userId,
            bookingType,
            originalAmount,
            couponCodes,
            currency
          };

          // Calculate twice with same inputs
          const result1 = await calculator.calculateFinalPrice(context);
          const result2 = await calculator.calculateFinalPrice(context);

          // Final amounts must be identical
          expect(result1.finalAmount).toBe(result2.finalAmount);
          expect(result1.totalDiscount).toBe(result2.totalDiscount);
        }
      ),
      { numRuns: 100 }
    );
  });
});
```

#### Property 9: Coupon Redemption Cancellation Round-Trip
```javascript
it('Property 9: Coupon redemption cancellation restores usage count', async () => {
  // Feature: coupon-subscription-system, Property 9: Coupon Redemption Cancellation Round-Trip
  
  await fc.assert(
    fc.asyncProperty(
      fc.record({
        code: fc.string({ minLength: 4, maxLength: 20 }),
        usageLimit: fc.integer({ min: 1, max: 100 }),
        discountValue: fc.double({ min: 5, max: 100 })
      }),
      fc.uuid(), // userId
      fc.uuid(), // bookingId
      async (couponData, userId, bookingId) => {
        const couponEngine = new CouponEngine();
        
        // Create coupon
        const coupon = await couponEngine.createCoupon({
          ...couponData,
          discountType: 'fixed',
          validFrom: new Date(),
          validUntil: new Date(Date.now() + 86400000)
        });

        const initialUsage = coupon.currentUsage;

        // Apply coupon
        await couponEngine.applyCoupon(coupon.code, bookingId, userId);
        
        const afterApply = await couponEngine.getCoupon(coupon.id);
        expect(afterApply.currentUsage).toBe(initialUsage + 1);

        // Cancel booking (which should restore usage)
        await couponEngine.cancelRedemption(bookingId);

        const afterCancel = await couponEngine.getCoupon(coupon.id);
        expect(afterCancel.currentUsage).toBe(initialUsage);
      }
    ),
    { numRuns: 100 }
  );
});
```

#### Property 12: Maximum Discount Limit
```javascript
it('Property 12: Total discount never exceeds 90% of original amount', async () => {
  // Feature: coupon-subscription-system, Property 12: Maximum Discount Limit
  
  await fc.assert(
    fc.asyncProperty(
      fc.double({ min: 100, max: 10000 }), // originalAmount
      fc.array(
        fc.record({
          type: fc.constantFrom('membership', 'coupon'),
          amount: fc.double({ min: 10, max: 1000 }),
          stackable: fc.boolean()
        }),
        { minLength: 1, maxLength: 5 }
      ),
      async (originalAmount, discounts) => {
        const calculator = new DiscountCalculator();
        
        const result = await calculator.applyStackableDiscounts(originalAmount, discounts);

        // Final amount must be at least 10% of original
        expect(result.finalAmount).toBeGreaterThanOrEqual(originalAmount * 0.1);
        
        // Total discount must not exceed 90%
        expect(result.totalDiscount).toBeLessThanOrEqual(originalAmount * 0.9);
      }
    ),
    { numRuns: 100 }
  );
});
```

#### Property 32: Self-Referral Prevention
```javascript
it('Property 32: Self-referral attempts are rejected', async () => {
  // Feature: coupon-subscription-system, Property 32: Self-Referral Prevention
  
  await fc.assert(
    fc.asyncProperty(
      fc.uuid(), // userId
      fc.string({ minLength: 6, maxLength: 12 }), // referralCode
      async (userId, referralCode) => {
        const subscriptionManager = new SubscriptionManager();
        
        // Generate referral code for user
        await subscriptionManager.generateReferralCode(userId, referralCode);

        // Attempt self-referral
        const result = await subscriptionManager.applyReferralCode(userId, referralCode);

        expect(result.success).toBe(false);
        expect(result.error.code).toBe('SELF_REFERRAL_NOT_ALLOWED');
      }
    ),
    { numRuns: 100 }
  );
});
```

### Unit Test Examples

#### Subscription Creation
```javascript
describe('SubscriptionManager Unit Tests', () => {
  it('should create subscription with all required fields', async () => {
    const manager = new SubscriptionManager();
    
    const subscription = await manager.createSubscription({
      userId: 'user-123',
      tierId: 'tier-gold',
      billingCycle: 'monthly',
      autoRenew: true,
      paymentMethodId: 'pm-123'
    });

    expect(subscription.id).toBeDefined();
    expect(subscription.userId).toBe('user-123');
    expect(subscription.status).toBe('active');
    expect(subscription.startDate).toBeDefined();
    expect(subscription.endDate).toBeDefined();
    expect(subscription.membershipCardId).toBeDefined();
  });

  it('should reject subscription creation if user already has active subscription', async () => {
    const manager = new SubscriptionManager();
    
    await manager.createSubscription({
      userId: 'user-123',
      tierId: 'tier-gold',
      billingCycle: 'monthly'
    });

    await expect(
      manager.createSubscription({
        userId: 'user-123',
        tierId: 'tier-platinum',
        billingCycle: 'annual'
      })
    ).rejects.toThrow('ACTIVE_SUBSCRIPTION_EXISTS');
  });
});
```

#### Coupon Validation Edge Cases
```javascript
describe('CouponEngine Edge Cases', () => {
  it('should reject empty coupon code', async () => {
    const engine = new CouponEngine();
    
    await expect(
      engine.validateCoupon('', { bookingAmount: 100 })
    ).rejects.toThrow('INVALID_COUPON_CODE');
  });

  it('should reject coupon code with special characters', async () => {
    const engine = new CouponEngine();
    
    await expect(
      engine.validateCoupon('TEST@123', { bookingAmount: 100 })
    ).rejects.toThrow('INVALID_COUPON_CODE');
  });

  it('should handle coupon expiring at exact timestamp', async () => {
    const engine = new CouponEngine();
    const now = new Date();
    
    const coupon = await engine.createCoupon({
      code: 'EXPIRING',
      discountType: 'percentage',
      discountValue: 10,
      validFrom: new Date(now.getTime() - 3600000),
      validUntil: now
    });

    // At exact expiry time, should be invalid
    await expect(
      engine.validateCoupon('EXPIRING', { bookingAmount: 100 })
    ).rejects.toThrow('COUPON_EXPIRED');
  });
});
```

### Integration Tests

#### Complete Checkout Flow with Discounts
```javascript
describe('Checkout Integration Tests', () => {
  it('should apply membership discount and stackable coupon in checkout', async () => {
    // Setup
    const user = await createTestUser();
    const subscription = await createTestSubscription(user.id, 'tier-gold');
    const coupon = await createTestCoupon({
      code: 'SUMMER20',
      discountType: 'percentage',
      discountValue: 20,
      stackable: true
    });

    // Create booking
    const booking = await createTestBooking({
      userId: user.id,
      bookingType: 'flight',
      amount: 1000
    });

    // Apply discounts
    const calculator = new DiscountCalculator();
    const result = await calculator.calculateFinalPrice({
      userId: user.id,
      bookingType: 'flight',
      originalAmount: 1000,
      couponCodes: ['SUMMER20'],
      currency: 'USD'
    });

    // Gold tier has 10% instant discount
    // SUMMER20 has 20% discount
    // Expected: 1000 - 100 (10%) - 180 (20% of 900) = 720
    expect(result.finalAmount).toBe(720);
    expect(result.discounts).toHaveLength(2);
    expect(result.discounts[0].type).toBe('membership');
    expect(result.discounts[1].type).toBe('coupon');
  });
});
```

### Performance Tests

```javascript
describe('Performance Tests', () => {
  it('should validate 1000 coupons in under 2 seconds', async () => {
    const engine = new CouponEngine();
    const coupons = await createTestCoupons(1000);
    
    const start = Date.now();
    
    await Promise.all(
      coupons.map(coupon => 
        engine.validateCoupon(coupon.code, { bookingAmount: 100 })
      )
    );
    
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(2000);
  });

  it('should calculate 1000 discount prices in under 1 second', async () => {
    const calculator = new DiscountCalculator();
    
    const start = Date.now();
    
    await Promise.all(
      Array.from({ length: 1000 }, (_, i) => 
        calculator.calculateFinalPrice({
          userId: `user-${i}`,
          bookingType: 'flight',
          originalAmount: 1000,
          couponCodes: [],
          currency: 'USD'
        })
      )
    );
    
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(1000);
  });
});
```

### Test Data Generators

```javascript
// Generators for property-based tests
export const arbitraries = {
  coupon: () => fc.record({
    code: fc.string({ minLength: 4, maxLength: 20 }).filter(s => /^[A-Z0-9]+$/.test(s)),
    discountType: fc.constantFrom('percentage', 'fixed'),
    discountValue: fc.double({ min: 1, max: 100 }),
    minBookingAmount: fc.double({ min: 0, max: 500 }),
    stackable: fc.boolean(),
    bookingTypes: fc.subarray(['flight', 'hotel', 'package', 'cruise'], { minLength: 1 })
  }),

  subscription: () => fc.record({
    userId: fc.uuid(),
    tierId: fc.constantFrom('tier-silver', 'tier-gold', 'tier-platinum'),
    billingCycle: fc.constantFrom('monthly', 'annual'),
    autoRenew: fc.boolean()
  }),

  booking: () => fc.record({
    userId: fc.uuid(),
    bookingType: fc.constantFrom('flight', 'hotel', 'package', 'cruise'),
    amount: fc.double({ min: 50, max: 10000 }),
    currency: fc.constantFrom('USD', 'EUR', 'GBP')
  })
};
```

### Continuous Integration

All tests run automatically on:
- Every pull request
- Every commit to main branch
- Nightly builds for extended property-based test runs (1000+ iterations)

**Test Coverage Goals**:
- Unit test coverage: >80%
- Property test coverage: All 46 correctness properties
- Integration test coverage: All critical user journeys
- E2E test coverage: Complete subscription and coupon redemption flows

