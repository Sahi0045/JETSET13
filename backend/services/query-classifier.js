import geminiService from './gemini.service.js';

class QueryClassifier {
  constructor() {
    this.intents = {
      BOOKING_INQUIRY: 'booking_inquiry',
      ACCOUNT_INFO: 'account_info',
      GENERAL_TRAVEL: 'general_travel',
      POLICY_FAQ: 'policy_faq',
      SUPPORT: 'support',
      GREETING: 'greeting',
      UNKNOWN: 'unknown',
    };

    // Keyword patterns for fallback classification
    this.keywordPatterns = {
      booking_inquiry: [
        /book(ing)?/i,
        /flight/i,
        /hotel/i,
        /reservation/i,
        /itinerary/i,
        /trip/i,
        /travel to/i,
        /fly to/i,
        /stay at/i,
      ],
      account_info: [
        /account/i,
        /profile/i,
        /password/i,
        /login/i,
        /sign in/i,
        /my (booking|trip|reservation)/i,
      ],
      policy_faq: [
        /cancel/i,
        /refund/i,
        /policy/i,
        /change/i,
        /modify/i,
        /baggage/i,
        /luggage/i,
      ],
      support: [
        /help/i,
        /support/i,
        /problem/i,
        /issue/i,
        /error/i,
        /not working/i,
        /speak to (agent|human)/i,
      ],
      greeting: [
        /^(hi|hello|hey|good (morning|afternoon|evening))/i,
        /how are you/i,
        /what can you do/i,
      ],
    };
  }

  /**
   * Classify user query intent using Gemini
   * @param {string} query - User message
   * @param {Object} context - Additional context
   * @returns {Promise<Object>} Classification result
   */
  async classify(query, context = {}) {
    try {
      // Try AI classification first
      const aiClassification = await this._classifyWithAI(query, context);
      return aiClassification;
    } catch (error) {
      console.error('AI classification failed, using fallback:', error);
      // Fall back to keyword-based classification
      return this._classifyWithKeywords(query);
    }
  }

  /**
   * Classify using Gemini AI
   * @private
   */
  async _classifyWithAI(query, context) {
    const classificationPrompt = `Classify the following user query into one of these categories:
- booking_inquiry: Questions about booking flights, hotels, or travel packages
- account_info: Questions about user account, profile, or login
- general_travel: General travel advice, destination info, or recommendations
- policy_faq: Questions about policies (cancellation, refund, baggage, etc.)
- support: Technical issues, complaints, or requests for human assistance
- greeting: Greetings or general conversation starters
- unknown: Cannot be classified into above categories

User Query: "${query}"

Respond with ONLY the category name and confidence (0-1), formatted as: category|confidence

Example: booking_inquiry|0.95`;

    const response = await geminiService.generateResponse(
      classificationPrompt,
      {},
      []
    );

    const [intent, confidenceStr] = response.text.trim().split('|');
    const confidence = parseFloat(confidenceStr) || 0.5;

    // Extract entities from the query
    const entities = this._extractEntities(query);

    return {
      intent: intent.toLowerCase(),
      confidence,
      entities,
      method: 'ai',
    };
  }

  /**
   * Fallback keyword-based classification
   * @private
   */
  _classifyWithKeywords(query) {
    const queryLower = query.toLowerCase();
    let bestMatch = { intent: this.intents.UNKNOWN, score: 0, priority: -1 };

    // Priority order — higher = wins on tie (more specific intents first)
    const priorityMap = {
      policy_faq: 3,
      support: 2,
      account_info: 2,
      greeting: 1,
      booking_inquiry: 0,
    };

    for (const [intent, patterns] of Object.entries(this.keywordPatterns)) {
      let score = 0;
      for (const pattern of patterns) {
        if (pattern.test(query)) {
          score++;
        }
      }

      const priority = priorityMap[intent] ?? 0;
      if (score > bestMatch.score || (score === bestMatch.score && score > 0 && priority > bestMatch.priority)) {
        bestMatch = { intent, score, priority };
      }
    }

    const entities = this._extractEntities(query);

    return {
      intent: bestMatch.intent,
      confidence: bestMatch.score > 0 ? 0.7 : 0.3,
      entities,
      method: 'keyword',
    };
  }

  /**
   * Extract entities from query (dates, destinations, booking IDs, etc.)
   * @private
   */
  _extractEntities(query) {
    const entities = {};

    // Extract booking ID (format: BOOK-XXXXX or similar)
    const bookingIdMatch = query.match(/\b[A-Z]{2,4}-?\d{5,}\b/i);
    if (bookingIdMatch) {
      entities.bookingId = bookingIdMatch[0];
    }

    // Extract dates (basic patterns)
    const datePatterns = [
      /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/,
      /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* \d{1,2},? \d{4}\b/i,
      /\b\d{1,2} (jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*,? \d{4}\b/i,
    ];

    for (const pattern of datePatterns) {
      const match = query.match(pattern);
      if (match) {
        entities.date = match[0];
        break;
      }
    }

    // Extract passenger count
    const passengerMatch = query.match(/\b(\d+)\s*(passenger|person|people|adult|traveler)/i);
    if (passengerMatch) {
      entities.passengers = parseInt(passengerMatch[1]);
    }

    // Extract destinations (cities/countries - basic pattern)
    const toMatch = query.match(/\b(to|in|at)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
    if (toMatch) {
      entities.destination = toMatch[2];
    }

    const fromMatch = query.match(/\b(from)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
    if (fromMatch) {
      entities.origin = fromMatch[2];
    }

    return entities;
  }

  /**
   * Determine routing based on classification
   * @param {Object} classification - Classification result
   * @returns {string} Route identifier
   */
  route(classification) {
    const { intent, confidence } = classification;

    // Low confidence queries go to general handler
    if (confidence < 0.5) {
      return 'general';
    }

    const routeMap = {
      [this.intents.BOOKING_INQUIRY]: 'booking',
      [this.intents.ACCOUNT_INFO]: 'account',
      [this.intents.GENERAL_TRAVEL]: 'general',
      [this.intents.POLICY_FAQ]: 'content',
      [this.intents.SUPPORT]: 'support',
      [this.intents.GREETING]: 'greeting',
      [this.intents.UNKNOWN]: 'general',
    };

    return routeMap[intent] || 'general';
  }
}

export default new QueryClassifier();
