/**
 * Booking Data Service for Chatbot (READ-ONLY)
 * 
 * Fetches user booking data from Supabase for the AI chatbot context.
 * This service is strictly read-only — no write/edit operations are exposed.
 */
import supabase from '../config/supabase.js';

class BookingDataService {
    /**
     * Fetch all bookings for a user (read-only).
     * Tries the local DB user id, the Supabase auth UUID, and email to handle ID format differences.
     * @param {string} userId - Local DB user id
     * @param {string|null} authUserId - Supabase auth UUID (auth.users.id)
     * @param {string|null} userEmail - User email as final fallback
     * @param {number} limit - Maximum number of bookings to fetch
     * @returns {Promise<Array>} Array of booking summaries
     */
    async getUserBookings(userId, authUserId = null, userEmail = null, limit = 10) {
        if (!userId && !authUserId && !userEmail) return [];

        try {
            // Build OR filter using all available IDs to handle any ID format
            const orFilters = [];
            if (userId) orFilters.push(`user_id.eq.${userId}`);
            if (authUserId && authUserId !== userId) orFilters.push(`user_id.eq.${authUserId}`);
            if (userId) orFilters.push(`booking_details->>'original_user_id'.eq.${userId}`);
            if (authUserId && authUserId !== userId) orFilters.push(`booking_details->>'original_user_id'.eq.${authUserId}`);

            const { data, error } = await supabase
                .from('bookings')
                .select('*')
                .or(orFilters.join(','))
                .order('created_at', { ascending: false })
                .limit(limit);

            if (error) {
                console.warn('Error fetching user bookings for chatbot:', error.message);
                return [];
            }

            const bookings = (data || []).map(booking => this._summarizeBooking(booking));

            // If nothing found and we have email, try a last-resort email-based lookup
            if (bookings.length === 0 && userEmail) {
                return await this._getUserBookingsByEmail(userEmail, limit);
            }

            return bookings;
        } catch (error) {
            console.warn('Failed to fetch user bookings for chatbot:', error.message);
            return [];
        }
    }

    /**
     * Fallback: find bookings by scanning for the user's email in booking_details.
     * Used when ID-based lookup returns nothing (different ID formats between tables).
     * @private
     */
    async _getUserBookingsByEmail(userEmail, limit = 10) {
        try {
            // First get the user's ID from local users table by email
            const { data: userData } = await supabase
                .from('users')
                .select('id')
                .eq('email', userEmail)
                .single();

            if (userData?.id) {
                const { data, error } = await supabase
                    .from('bookings')
                    .select('*')
                    .or(`user_id.eq.${userData.id},booking_details->>'original_user_id'.eq.${userData.id}`)
                    .order('created_at', { ascending: false })
                    .limit(limit);

                if (!error && data?.length > 0) {
                    return data.map(booking => this._summarizeBooking(booking));
                }
            }
            return [];
        } catch (error) {
            console.warn('Email-based booking fallback failed:', error.message);
            return [];
        }
    }

    /**
     * Fetch user's upcoming bookings (future travel dates).
     * @param {string} userId
     * @param {string|null} authUserId
     * @returns {Promise<Array>}
     */
    async getUpcomingBookings(userId, authUserId = null) {
        if (!userId && !authUserId) return [];

        try {
            const orFilters = [];
            if (userId) orFilters.push(`user_id.eq.${userId}`);
            if (authUserId && authUserId !== userId) orFilters.push(`user_id.eq.${authUserId}`);

            const { data, error } = await supabase
                .from('bookings')
                .select('*')
                .or(orFilters.join(','))
                .in('status', ['confirmed', 'paid', 'pending'])
                .order('created_at', { ascending: false })
                .limit(20);

            if (error) {
                console.warn('Error fetching upcoming bookings:', error.message);
                return [];
            }

            // Filter for future dates
            const now = new Date();
            const upcoming = (data || []).filter(booking => {
                const depDate = booking.booking_details?.departure_date;
                if (!depDate) return false;
                return new Date(depDate) >= now;
            });

            return upcoming.map(booking => this._summarizeBooking(booking));
        } catch (error) {
            console.warn('Failed to fetch upcoming bookings:', error.message);
            return [];
        }
    }

    /**
     * Fetch user's recent/past bookings.
     * @param {string} userId
     * @param {string|null} authUserId
     * @returns {Promise<Array>}
     */
    async getRecentBookings(userId, authUserId = null) {
        if (!userId && !authUserId) return [];

        try {
            const orFilters = [];
            if (userId) orFilters.push(`user_id.eq.${userId}`);
            if (authUserId && authUserId !== userId) orFilters.push(`user_id.eq.${authUserId}`);

            const { data, error } = await supabase
                .from('bookings')
                .select('*')
                .or(orFilters.join(','))
                .order('created_at', { ascending: false })
                .limit(5);

            if (error) {
                console.warn('Error fetching recent bookings:', error.message);
                return [];
            }

            return (data || []).map(booking => this._summarizeBooking(booking));
        } catch (error) {
            console.warn('Failed to fetch recent bookings:', error.message);
            return [];
        }
    }

    /**
     * Fetch user profile info (read-only).
     * @param {string} userId
     * @returns {Promise<Object|null>}
     */
    async getUserProfile(userId) {
        if (!userId) return null;

        try {
            const { data, error } = await supabase
                .from('users')
                .select('id, name, first_name, last_name, email, phone, role, created_at')
                .eq('id', userId)
                .single();

            if (error) {
                console.warn('Error fetching user profile for chatbot:', error.message);
                return null;
            }

            return {
                name: data.name || `${data.first_name || ''} ${data.last_name || ''}`.trim(),
                email: data.email,
                phone: data.phone || 'Not provided',
                memberSince: data.created_at,
            };
        } catch (error) {
            console.warn('Failed to fetch user profile:', error.message);
            return null;
        }
    }

    /**
     * Fetch user's inquiries (read-only).
     * @param {string} userId
     * @param {number} limit
     * @returns {Promise<Array>}
     */
    async getUserInquiries(userId, limit = 5) {
        if (!userId) return [];

        try {
            const { data, error } = await supabase
                .from('inquiries')
                .select('id, inquiry_type, status, customer_name, customer_email, destination, travel_dates, created_at, updated_at')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .limit(limit);

            if (error) {
                console.warn('Error fetching user inquiries for chatbot:', error.message);
                return [];
            }

            return (data || []).map(inquiry => ({
                id: inquiry.id,
                type: inquiry.inquiry_type,
                status: inquiry.status,
                destination: inquiry.destination,
                travelDates: inquiry.travel_dates,
                createdAt: inquiry.created_at,
            }));
        } catch (error) {
            console.warn('Failed to fetch user inquiries:', error.message);
            return [];
        }
    }

    /**
     * Fetch user's quotes (read-only).
     * @param {string} userId
     * @param {number} limit
     * @returns {Promise<Array>}
     */
    async getUserQuotes(userId, limit = 5) {
        if (!userId) return [];

        try {
            const { data, error } = await supabase
                .from('quotes')
                .select('id, quote_number, total_amount, currency, status, valid_until, created_at')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .limit(limit);

            if (error) {
                console.warn('Error fetching user quotes for chatbot:', error.message);
                return [];
            }

            return (data || []).map(quote => ({
                quoteNumber: quote.quote_number,
                amount: quote.total_amount,
                currency: quote.currency,
                status: quote.status,
                validUntil: quote.valid_until,
                createdAt: quote.created_at,
            }));
        } catch (error) {
            console.warn('Failed to fetch user quotes:', error.message);
            return [];
        }
    }

    /**
     * Get a comprehensive booking context for the AI chatbot.
     * Fetches all relevant user data in parallel for efficiency.
     * Accepts multiple ID formats to handle local DB vs Supabase auth UUID differences.
     * @param {string} userId - Local DB user id
     * @param {string|null} authUserId - Supabase auth UUID
     * @param {string|null} userEmail - Email fallback
     * @returns {Promise<Object>} Combined booking context
     */
    async getBookingContext(userId, authUserId = null, userEmail = null) {
        if (!userId && !authUserId && !userEmail) {
            return { authenticated: false };
        }

        try {
            // Fetch all data in parallel for speed
            const [profile, recentBookings, upcomingBookings, inquiries, quotes] = await Promise.all([
                this.getUserProfile(userId || authUserId),
                this.getRecentBookings(userId, authUserId),
                this.getUpcomingBookings(userId, authUserId),
                this.getUserInquiries(userId || authUserId),
                this.getUserQuotes(userId || authUserId),
            ]);

            // If ID-based lookups came back empty, run email fallback for bookings
            let finalRecent = recentBookings;
            let finalUpcoming = upcomingBookings;
            if (recentBookings.length === 0 && userEmail) {
                finalRecent = await this._getUserBookingsByEmail(userEmail, 5);
            }
            if (upcomingBookings.length === 0 && finalRecent.length > 0) {
                const now = new Date();
                finalUpcoming = finalRecent.filter(b => b.departureDate && new Date(b.departureDate) >= now);
            }

            return {
                authenticated: true,
                user: profile,
                recentBookings: finalRecent,
                upcomingBookings: finalUpcoming,
                inquiries,
                quotes,
                totalBookings: finalRecent.length,
            };
        } catch (error) {
            console.warn('Failed to build booking context:', error.message);
            return { authenticated: true, error: 'Failed to load booking data' };
        }
    }

    /**
     * Summarize a booking record into a safe, readable format.
     * Strips sensitive data and formats for AI consumption.
     * @private
     */
    _summarizeBooking(booking) {
        const details = booking.booking_details || {};
        const passengers = booking.passenger_details || [];

        return {
            bookingReference: booking.booking_reference,
            travelType: booking.travel_type,
            status: booking.status,
            paymentStatus: booking.payment_status,
            totalAmount: parseFloat(booking.total_amount) || 0,
            currency: details.currency || 'USD',
            bookingDate: booking.created_at,
            // Flight details
            origin: details.origin || null,
            originCity: details.origin_city || null,
            destination: details.destination || null,
            destinationCity: details.destination_city || null,
            departureDate: details.departure_date || null,
            departureTime: details.departure_time || null,
            arrivalDate: details.arrival_date || null,
            arrivalTime: details.arrival_time || null,
            airline: details.airline_name || details.airline || null,
            flightNumber: details.flight_number || null,
            duration: details.duration || null,
            cabinClass: details.cabin_class || null,
            stops: details.stops ?? null,
            pnr: details.pnr || null,
            // Cruise details
            cruiseName: details.cruise_name || null,
            cruiseDeparture: details.departure || null,
            cruiseArrival: details.arrival || null,
            // Passenger count
            passengerCount: passengers.length,
            // Passenger names (first names only for privacy)
            passengerNames: passengers.map(p =>
                `${p.firstName || p.first_name || ''} ${(p.lastName || p.last_name || '').charAt(0)}.`.trim()
            ).filter(Boolean),
        };
    }
}

export default new BookingDataService();
