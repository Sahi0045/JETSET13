import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import Navbar from './Navbar';
import Footer from './Footer';

const InquiryDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [inquiry, setInquiry] = useState(null);
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchInquiryDetails();
  }, [id]);

  const fetchInquiryDetails = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const token = localStorage.getItem('token') || localStorage.getItem('adminToken') || localStorage.getItem('supabase_token');
      
      if (!token) {
        setError('Authentication required. Please log in.');
        setLoading(false);
        return;
      }

      const inquiryResponse = await fetch(`/api/inquiries?id=${id}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      });

      if (!inquiryResponse.ok) {
        if (inquiryResponse.status === 404) {
          setError('Inquiry not found');
          setLoading(false);
          return;
        }
        if (inquiryResponse.status === 403) {
          setError('You do not have permission to view this inquiry');
          setLoading(false);
          return;
        }
        throw new Error(`Failed to fetch inquiry (${inquiryResponse.status})`);
      }

      const inquiryData = await inquiryResponse.json();

      if (inquiryData.success) {
        setInquiry(inquiryData.data);
        
        // Quotes might be included in the inquiry response
        if (inquiryData.data.quotes && Array.isArray(inquiryData.data.quotes)) {
          setQuotes(inquiryData.data.quotes);
        } else {
          // Fetch quotes separately if not included
          const quotesResponse = await fetch(`/api/quotes?inquiryId=${id}`, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            credentials: 'include'
          });
          
          if (quotesResponse.ok) {
            const quotesData = await quotesResponse.json();
            if (quotesData.success) {
              setQuotes(Array.isArray(quotesData.data) ? quotesData.data : []);
            }
          }
        }
      } else {
        setError(inquiryData.message || 'Failed to load inquiry');
      }
    } catch (err) {
      console.error('Error fetching inquiry details:', err);
      setError(err.message || 'An error occurred while loading the inquiry');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'processing': return 'bg-blue-100 text-blue-800';
      case 'quoted': return 'bg-green-100 text-green-800';
      case 'booked': return 'bg-purple-100 text-purple-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      case 'expired': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'pending': return 'Pending Review';
      case 'processing': return 'Processing';
      case 'quoted': return 'Quote Sent';
      case 'booked': return 'Booked';
      case 'cancelled': return 'Cancelled';
      case 'expired': return 'Expired';
      default: return status;
    }
  };

  const getInquiryTypeIcon = (type) => {
    switch (type) {
      case 'flight': return '✈️';
      case 'hotel': return '🏨';
      case 'cruise': return '🚢';
      case 'package': return '🎒';
      case 'general': return '💬';
      default: return '📝';
    }
  };

  const getInquiryTypeName = (type) => {
    switch (type) {
      case 'flight': return 'Flight';
      case 'hotel': return 'Hotel';
      case 'cruise': return 'Cruise';
      case 'package': return 'Package';
      case 'general': return 'General';
      default: return 'Inquiry';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f0f7fc]">
        <Navbar />
        <div className="container mx-auto px-4 py-8">
          <div className="flex-1 bg-white rounded-lg shadow-sm p-8 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading inquiry details...</p>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#f0f7fc]">
        <Navbar />
        <div className="container mx-auto px-4 py-8">
          <div className="bg-white rounded-lg shadow-sm p-8">
            <div className="text-center">
              <p className="text-red-600 mb-4">{error}</p>
              <button
                onClick={() => navigate('/my-trips')}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Back to My Trips
              </button>
            </div>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  if (!inquiry) {
    return (
      <div className="min-h-screen bg-[#f0f7fc]">
        <Navbar />
        <div className="container mx-auto px-4 py-8">
          <div className="bg-white rounded-lg shadow-sm p-8 text-center">
            <p className="text-gray-600 mb-4">Inquiry not found</p>
            <button
              onClick={() => navigate('/my-trips')}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Back to My Trips
            </button>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  const sentQuotes = quotes.filter(q => q.status === 'sent' || q.status === 'accepted');

  return (
    <div className="min-h-screen bg-[#f0f7fc]">
      <Navbar />
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <button
            onClick={() => navigate('/my-trips')}
            className="text-blue-600 hover:text-blue-800 flex items-center gap-2"
          >
            ← Back to My Trips
          </button>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <span className="text-3xl">{getInquiryTypeIcon(inquiry.inquiry_type)}</span>
                {getInquiryTypeName(inquiry.inquiry_type)} Inquiry
              </h1>
              <p className="text-sm text-gray-500 mt-1">ID: {inquiry.id?.slice(-8)}</p>
            </div>
            <span className={`px-4 py-2 text-sm font-medium rounded-full ${getStatusColor(inquiry.status)}`}>
              {getStatusText(inquiry.status)}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div>
              <p className="text-sm text-gray-500">Submitted</p>
              <p className="font-medium">{new Date(inquiry.created_at).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Last Updated</p>
              <p className="font-medium">{new Date(inquiry.updated_at).toLocaleString()}</p>
            </div>
            {inquiry.expires_at && (
              <div>
                <p className="text-sm text-gray-500">Expires</p>
                <p className="font-medium">{new Date(inquiry.expires_at).toLocaleString()}</p>
              </div>
            )}
            <div>
              <p className="text-sm text-gray-500">Priority</p>
              <p className="font-medium capitalize">{inquiry.priority || 'Normal'}</p>
            </div>
          </div>

          <div className="border-t pt-6">
            <h2 className="text-lg font-semibold mb-4">Inquiry Details</h2>
            
            {inquiry.inquiry_type === 'flight' && (
              <div className="space-y-2">
                <p><strong>Route:</strong> {inquiry.flight_origin} → {inquiry.flight_destination}</p>
                {inquiry.flight_departure_date && <p><strong>Departure:</strong> {new Date(inquiry.flight_departure_date).toLocaleDateString()}</p>}
                {inquiry.flight_return_date && <p><strong>Return:</strong> {new Date(inquiry.flight_return_date).toLocaleDateString()}</p>}
                {inquiry.flight_passengers && <p><strong>Passengers:</strong> {inquiry.flight_passengers}</p>}
                {inquiry.flight_class && <p><strong>Class:</strong> {inquiry.flight_class}</p>}
              </div>
            )}

            {inquiry.inquiry_type === 'hotel' && (
              <div className="space-y-2">
                <p><strong>Destination:</strong> {inquiry.hotel_destination}</p>
                {inquiry.hotel_checkin_date && <p><strong>Check-in:</strong> {new Date(inquiry.hotel_checkin_date).toLocaleDateString()}</p>}
                {inquiry.hotel_checkout_date && <p><strong>Check-out:</strong> {new Date(inquiry.hotel_checkout_date).toLocaleDateString()}</p>}
                {inquiry.hotel_rooms && <p><strong>Rooms:</strong> {inquiry.hotel_rooms}</p>}
                {inquiry.hotel_guests && <p><strong>Guests:</strong> {inquiry.hotel_guests}</p>}
                {inquiry.hotel_room_type && <p><strong>Room Type:</strong> {inquiry.hotel_room_type}</p>}
              </div>
            )}

            {inquiry.inquiry_type === 'cruise' && (
              <div className="space-y-2">
                <p><strong>Destination:</strong> {inquiry.cruise_destination}</p>
                {inquiry.cruise_departure_date && <p><strong>Departure:</strong> {new Date(inquiry.cruise_departure_date).toLocaleDateString()}</p>}
                {inquiry.cruise_duration && <p><strong>Duration:</strong> {inquiry.cruise_duration} days</p>}
                {inquiry.cruise_passengers && <p><strong>Passengers:</strong> {inquiry.cruise_passengers}</p>}
                {inquiry.cruise_cabin_type && <p><strong>Cabin Type:</strong> {inquiry.cruise_cabin_type}</p>}
              </div>
            )}

            {inquiry.inquiry_type === 'package' && (
              <div className="space-y-2">
                <p><strong>Destination:</strong> {inquiry.package_destination}</p>
                {inquiry.package_start_date && <p><strong>Start Date:</strong> {new Date(inquiry.package_start_date).toLocaleDateString()}</p>}
                {inquiry.package_end_date && <p><strong>End Date:</strong> {new Date(inquiry.package_end_date).toLocaleDateString()}</p>}
                {inquiry.package_travelers && <p><strong>Travelers:</strong> {inquiry.package_travelers}</p>}
                {inquiry.package_budget_range && <p><strong>Budget:</strong> {inquiry.package_budget_range}</p>}
                {inquiry.package_interests && inquiry.package_interests.length > 0 && (
                  <p><strong>Interests:</strong> {Array.isArray(inquiry.package_interests) ? inquiry.package_interests.join(', ') : inquiry.package_interests}</p>
                )}
              </div>
            )}

            {inquiry.inquiry_type === 'general' && (
              <div className="space-y-2">
                {inquiry.inquiry_subject && <p><strong>Subject:</strong> {inquiry.inquiry_subject}</p>}
                {inquiry.inquiry_message && (
                  <div>
                    <strong>Message:</strong>
                    <p className="mt-1 text-gray-700 whitespace-pre-wrap">{inquiry.inquiry_message}</p>
                  </div>
                )}
              </div>
            )}

            {inquiry.special_requirements && (
              <div className="mt-4">
                <strong>Special Requirements:</strong>
                <p className="mt-1 text-gray-700">{inquiry.special_requirements}</p>
              </div>
            )}

            {inquiry.budget_range && (
              <div className="mt-4">
                <strong>Budget Range:</strong> {inquiry.budget_range}
              </div>
            )}
          </div>
        </div>

        {sentQuotes.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-xl font-semibold mb-4">Quotes</h2>
            <div className="space-y-4">
              {sentQuotes.map((quote) => (
                <div key={quote.id} className="border border-green-200 rounded-lg p-4 bg-green-50">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h3 className="font-semibold text-green-800">Quote #{quote.quote_number}</h3>
                      <p className="text-sm text-gray-600">Status: {quote.status}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-green-700">
                        ${quote.total_amount} {quote.currency || 'USD'}
                      </p>
                    </div>
                  </div>
                  
                  {quote.breakdown && Array.isArray(quote.breakdown) && quote.breakdown.length > 0 && (
                    <div className="mt-3 mb-3">
                      <p className="text-sm font-semibold text-gray-700 mb-2">Breakdown:</p>
                      <ul className="space-y-1">
                        {quote.breakdown.map((item, idx) => (
                          <li key={idx} className="text-sm text-gray-600 flex justify-between">
                            <span>{item.description || item.item || 'Item'}</span>
                            <span>${item.amount || item.price || 0}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {quote.admin_notes && (
                    <div className="mt-3 p-3 bg-white rounded border border-green-200">
                      <p className="text-sm font-semibold text-gray-700 mb-1">Notes:</p>
                      <p className="text-sm text-gray-600">{quote.admin_notes}</p>
                    </div>
                  )}

                  {quote.expires_at && (
                    <p className="text-xs text-gray-500 mt-2">
                      Expires: {new Date(quote.expires_at).toLocaleString()}
                    </p>
                  )}

                  <div className="mt-4">
                    <Link
                      to="/quote-detail"
                      state={{ quoteData: quote, inquiryData: inquiry }}
                      className="inline-block px-4 py-2 bg-green-600 text-white text-sm rounded-md hover:bg-green-700"
                    >
                      View Full Quote Details
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {quotes.length === 0 && inquiry.status !== 'quoted' && (
          <div className="bg-white rounded-lg shadow-sm p-6 text-center">
            <p className="text-gray-600">No quotes have been sent yet. Our team is working on your inquiry.</p>
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
};

export default InquiryDetail;

