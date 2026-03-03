class ResponseGenerator {
  constructor() {
    this.templates = {
      greeting: [
        "Hello! I'm your JetSetters travel assistant. How can I help you today?",
        "Hi there! Ready to plan your next adventure? What can I help you with?",
        "Welcome to JetSetters! I'm here to assist with your travel needs.",
      ],
      
      fallback: [
        "I'm not quite sure I understand. Could you rephrase that?",
        "I didn't catch that. Can you provide more details?",
        "I'm having trouble understanding. Could you be more specific?",
      ],

      error: [
        "I'm experiencing some technical difficulties. Please try again in a moment.",
        "Something went wrong on my end. Let me try that again.",
        "I encountered an error. Please try rephrasing your question.",
      ],

      escalation: [
        "I'd like to connect you with a human agent who can better assist you. Would you like me to do that?",
        "This seems like something our support team should handle. Shall I transfer you?",
        "Let me get you in touch with our customer service team for personalized assistance.",
      ],

      noResults: [
        "I couldn't find any information about that. Would you like to try a different search?",
        "No results found. Can you provide more details or try different keywords?",
        "I don't have information on that specific query. How else can I help?",
      ],
    };
  }

  /**
   * Generate a formatted response
   * @param {string} content - Main response content
   * @param {Object} options - Formatting options
   * @returns {Object} Formatted response
   */
  format(content, options = {}) {
    const {
      type = 'text',
      sources = [],
      suggestions = [],
      actions = [],
      metadata = {},
    } = options;

    let formattedContent = content;

    // Add source citations
    if (sources.length > 0) {
      formattedContent += '\n\n---\n**Sources:**\n';
      sources.forEach((source, idx) => {
        formattedContent += `${idx + 1}. [${source.title || 'Reference'}](${source.url})\n`;
      });
    }

    // Add suggestions
    if (suggestions.length > 0) {
      formattedContent += '\n\n**You might also want to:**\n';
      suggestions.forEach(suggestion => {
        formattedContent += `- ${suggestion}\n`;
      });
    }

    return {
      content: formattedContent,
      type,
      actions,
      metadata: {
        ...metadata,
        timestamp: new Date().toISOString(),
      },
    };
  }

  /**
   * Format booking information
   * @param {Object} booking - Booking data
   * @returns {string} Formatted booking info
   */
  formatBooking(booking) {
    const { type, id, destination, date, status, details } = booking;

    let response = `**Your ${type} Booking**\n\n`;
    response += `📋 Booking ID: ${id}\n`;
    response += `📍 Destination: ${destination}\n`;
    response += `📅 Date: ${date}\n`;
    response += `✅ Status: ${status}\n`;

    if (details) {
      response += `\n**Details:**\n`;
      Object.entries(details).forEach(([key, value]) => {
        response += `- ${key}: ${value}\n`;
      });
    }

    return response;
  }

  /**
   * Format flight search results
   * @param {Array} flights - Flight results
   * @returns {string} Formatted flight list
   */
  formatFlights(flights) {
    if (!flights || flights.length === 0) {
      return this.getTemplate('noResults');
    }

    let response = `**Available Flights:**\n\n`;
    
    flights.slice(0, 5).forEach((flight, idx) => {
      response += `${idx + 1}. **${flight.airline}** - ${flight.route}\n`;
      response += `   ⏰ ${flight.departure} → ${flight.arrival}\n`;
      response += `   💰 ${flight.price}\n`;
      response += `   ⏱️ Duration: ${flight.duration}\n\n`;
    });

    if (flights.length > 5) {
      response += `_...and ${flights.length - 5} more options_\n`;
    }

    return response;
  }

  /**
   * Format hotel search results
   * @param {Array} hotels - Hotel results
   * @returns {string} Formatted hotel list
   */
  formatHotels(hotels) {
    if (!hotels || hotels.length === 0) {
      return this.getTemplate('noResults');
    }

    let response = `**Available Hotels:**\n\n`;
    
    hotels.slice(0, 5).forEach((hotel, idx) => {
      response += `${idx + 1}. **${hotel.name}**\n`;
      response += `   ⭐ ${hotel.rating} stars\n`;
      response += `   📍 ${hotel.location}\n`;
      response += `   💰 From ${hotel.price}/night\n\n`;
    });

    if (hotels.length > 5) {
      response += `_...and ${hotels.length - 5} more options_\n`;
    }

    return response;
  }

  /**
   * Format policy information
   * @param {Object} policy - Policy data
   * @returns {string} Formatted policy
   */
  formatPolicy(policy) {
    const { title, content, lastUpdated, url } = policy;

    let response = `**${title}**\n\n`;
    response += content;

    if (lastUpdated) {
      response += `\n\n_Last updated: ${lastUpdated}_`;
    }

    if (url) {
      response += `\n\n[View full policy](${url})`;
    }

    return response;
  }

  /**
   * Get a random template
   * @param {string} type - Template type
   * @returns {string} Random template
   */
  getTemplate(type) {
    const templates = this.templates[type];
    if (!templates || templates.length === 0) {
      return this.templates.fallback[0];
    }

    return templates[Math.floor(Math.random() * templates.length)];
  }

  /**
   * Add citation to response
   * @param {string} content - Response content
   * @param {string} source - Source URL or reference
   * @returns {string} Content with citation
   */
  addCitation(content, source) {
    return `${content}\n\n_Source: ${source}_`;
  }

  /**
   * Create error response
   * @param {Error} error - Error object
   * @param {boolean} includeDetails - Include error details
   * @returns {Object} Formatted error response
   */
  createErrorResponse(error, includeDetails = false) {
    let content = this.getTemplate('error');

    if (includeDetails && process.env.NODE_ENV === 'development') {
      content += `\n\nError: ${error.message}`;
    }

    return this.format(content, {
      type: 'error',
      metadata: {
        error: error.message,
      },
    });
  }

  /**
   * Create escalation response
   * @param {string} reason - Reason for escalation
   * @returns {Object} Formatted escalation response
   */
  createEscalationResponse(reason = '') {
    const content = this.getTemplate('escalation');
    
    return this.format(content, {
      type: 'escalation',
      actions: [
        {
          type: 'contact_support',
          label: 'Contact Support',
          url: '/support',
        },
      ],
      metadata: {
        reason,
      },
    });
  }

  /**
   * Add suggestions to response
   * @param {string} content - Response content
   * @param {Array<string>} suggestions - Suggestion list
   * @returns {string} Content with suggestions
   */
  addSuggestions(content, suggestions) {
    if (!suggestions || suggestions.length === 0) {
      return content;
    }

    return this.format(content, { suggestions }).content;
  }
}

export default new ResponseGenerator();
