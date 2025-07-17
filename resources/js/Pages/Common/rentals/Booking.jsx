"use client"

import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, CreditCard, User, Calendar, Users, Shield, Check,
  AlertCircle, Loader2, X
} from 'lucide-react';
import Navbar from '../Navbar';
import Footer from '../Footer';
import axios from 'axios';

export default function Booking() {
  const navigate = useNavigate();
  const location = useLocation();
  const bookingData = location.state;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [bookingId, setBookingId] = useState('');
  const [paymentInfo, setPaymentInfo] = useState({
    method: 'CREDIT_CARD',
    cardNumber: '',
    expiryDate: '',
    cvv: '',
    cardHolderName: '',
    cardType: 'VISA',
    paymentOption: 'pay_now' // 'pay_now' or 'pay_at_hotel'
  });

  const [bookingRequest, setBookingRequest] = useState({
    name: '',
    email: '',
    phone: '',
    specialRequests: '',
    title: 'MR'
  });

  const handleBack = () => {
    navigate(-1);
  };

  const handlePaymentChange = (e) => {
    const { name, value } = e.target;
    setPaymentInfo(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleBookingRequestChange = (e) => {
    const { name, value } = e.target;
    setBookingRequest(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      console.log('Starting hotel booking with Arc Pay integration...');
      
      // Step 1: Create hotel booking
      const bookingRequestData = {
        action: 'bookHotel',
        hotelId: bookingData?.hotelData?.hotelId || 'HOTEL001',
        offerId: bookingData?.hotelData?.offerId || 'OFFER001',
        guestDetails: {
          firstName: bookingRequest.name.split(' ')[0] || 'Guest',
          lastName: bookingRequest.name.split(' ').slice(1).join(' ') || 'User',
          email: bookingRequest.email,
          phone: bookingRequest.phone
        },
        checkInDate: bookingData?.checkInDate || '2025-07-25',
        checkOutDate: bookingData?.checkOutDate || '2025-07-28',
        totalPrice: bookingData?.totalPrice || 299.99,
        currency: 'USD',
        specialRequests: bookingRequest.specialRequests
      };

      const hotelBookingResponse = await axios.post('https://prod-opznkssex-shubhams-projects-4a867368.vercel.app/api/hotels', bookingRequestData);

      if (hotelBookingResponse.data.success) {
        const booking = hotelBookingResponse.data.booking;
        console.log('Hotel booking created:', booking.bookingReference);
        setBookingId(booking.bookingReference);

        // Step 2: Create Arc Pay payment order (if paying now)
        if (paymentInfo.paymentOption === 'pay_now') {
          const paymentData = {
            action: 'createPayment',
            bookingReference: booking.bookingReference,
            amount: bookingData?.totalPrice || 299.99,
            currency: 'USD',
            guestDetails: bookingRequestData.guestDetails,
            hotelDetails: {
              name: bookingData?.hotelData?.name || 'Hotel',
              address: bookingData?.hotelData?.address || 'Location'
            }
          };

          const paymentResponse = await axios.post('https://prod-opznkssex-shubhams-projects-4a867368.vercel.app/api/hotels', paymentData);

          if (paymentResponse.data.success) {
            console.log('Arc Pay order created successfully');
            
            // Redirect to Arc Pay payment page or show success
            if (paymentResponse.data.paymentUrl) {
              window.location.href = paymentResponse.data.paymentUrl;
              return;
            }
          }
        }
        
        setSuccess(true);
      } else {
        throw new Error(hotelBookingResponse.data.error || 'Failed to create booking');
      }
    } catch (err) {
      console.error('Booking error:', err);
      const errorDetail = err.response?.data?.message || 
                         err.response?.data?.error ||
                         err.message ||
                         'Failed to process booking. Please try again.';
      setError(errorDetail);
    } finally {
      setLoading(false);
    }
  };

  if (!bookingData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">No Booking Data</h2>
          <p className="text-gray-600 mb-6">Please select a hotel and room first.</p>
          <button
            onClick={handleBack}
            className="bg-[#0061ff] hover:bg-blue-700 text-white px-6 py-3 rounded-md transition-colors"
          >
            Back to Hotels
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <Navbar forceScrolled={true} />
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-4xl mx-auto px-4">
          <button
            onClick={handleBack}
            className="flex items-center text-gray-600 hover:text-[#0061ff] transition-colors mb-8"
          >
            <ArrowLeft size={20} className="mr-2" />
            Back to Hotel Details
          </button>

          <div className="bg-white rounded-xl shadow-lg p-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-6">Complete Your Booking</h1>

            {/* Booking Summary */}
            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Booking Summary</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Hotel</p>
                  <p className="font-medium">{bookingData.hotelData.name}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Room Type</p>
                  <p className="font-medium">{bookingData.roomType.name}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Check-in</p>
                  <p className="font-medium">{bookingData.checkInDate}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Check-out</p>
                  <p className="font-medium">{bookingData.checkOutDate}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Guests</p>
                  <p className="font-medium">{bookingData.guestCount.adults} adults, {bookingData.guestCount.children} children</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Total Price</p>
                  <p className="font-medium">${bookingData.totalPrice}</p>
                </div>
              </div>

              {/* Upfront Payment Section */}
              <div className="mt-6 pt-6 border-t border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Upfront Payment</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Room Price</span>
                    <span className="font-medium">${bookingData.totalPrice}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Taxes & Fees</span>
                    <span className="font-medium">${(bookingData.totalPrice * 0.12).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Service Charge</span>
                    <span className="font-medium">$30.00</span>
                  </div>
                  <div className="pt-3 border-t border-gray-200">
                    <div className="flex justify-between font-bold text-lg">
                      <span>Total Upfront Payment</span>
                      <span className="text-[#0061ff]">
                        ${(bookingData.totalPrice + (bookingData.totalPrice * 0.12) + 30).toFixed(2)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 mt-2">
                      The remaining balance will be charged at the hotel during check-in.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Payment Options */}
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Payment Options</h2>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => setPaymentInfo(prev => ({ ...prev, paymentOption: 'pay_now' }))}
                  className={`p-4 rounded-lg border-2 transition-colors ${
                    paymentInfo.paymentOption === 'pay_now'
                      ? 'border-[#0061ff] bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">Pay Now</span>
                    <CreditCard className="h-5 w-5 text-[#0061ff]" />
                  </div>
                  <p className="text-sm text-gray-600">Complete payment now and get instant confirmation</p>
                </button>
                <button
                  onClick={() => setPaymentInfo(prev => ({ ...prev, paymentOption: 'pay_at_hotel' }))}
                  className={`p-4 rounded-lg border-2 transition-colors ${
                    paymentInfo.paymentOption === 'pay_at_hotel'
                      ? 'border-[#0061ff] bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">Pay at Hotel</span>
                    <Calendar className="h-5 w-5 text-[#0061ff]" />
                  </div>
                  <p className="text-sm text-gray-600">Pay when you check in at the hotel</p>
                </button>
              </div>
            </div>

            {/* Booking Request Form */}
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Booking Information</h2>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                      <select
                        name="title"
                        value={bookingRequest.title}
                        onChange={(e) => setBookingRequest(prev => ({ ...prev, title: e.target.value }))}
                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        required
                      >
                        <option value="MR">Mr</option>
                        <option value="MRS">Mrs</option>
                        <option value="MS">Ms</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                      <input
                        type="text"
                        name="name"
                        value={bookingRequest.name}
                        onChange={handleBookingRequestChange}
                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="John Doe"
                        required
                        pattern="^[A-Za-z\s\-'\.]*$"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <input
                      type="email"
                      name="email"
                      value={bookingRequest.email}
                      onChange={handleBookingRequestChange}
                      className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="john@example.com"
                      required
                      pattern="^[a-zA-Z0-9._+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9.-]+$"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                    <input
                      type="tel"
                      name="phone"
                      value={bookingRequest.phone}
                      onChange={handleBookingRequestChange}
                      className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="+1 234 567 8900"
                      required
                      pattern="^[+][1-9][0-9]{4,18}$"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Special Requests (Optional)</label>
                    <textarea
                      name="specialRequests"
                      value={bookingRequest.specialRequests}
                      onChange={handleBookingRequestChange}
                      className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Any special requests for your stay"
                      rows="3"
                      maxLength="120"
                    />
                  </div>
                </div>
              </div>

              {/* Payment Form - Only show if Pay Now is selected */}
              {paymentInfo.paymentOption === 'pay_now' && (
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">Payment Information</h2>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Card Type</label>
                      <select
                        name="cardType"
                        value={paymentInfo.cardType}
                        onChange={handlePaymentChange}
                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        required
                      >
                        <option value="VI">Visa</option>
                        <option value="CA">Mastercard</option>
                        <option value="AX">American Express</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Card Number</label>
                      <input
                        type="text"
                        name="cardNumber"
                        value={paymentInfo.cardNumber}
                        onChange={handlePaymentChange}
                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="1234 5678 9012 3456"
                        required
                        pattern="[0-9]{16}"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Expiry Date</label>
                        <input
                          type="text"
                          name="expiryDate"
                          value={paymentInfo.expiryDate}
                          onChange={handlePaymentChange}
                          className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="MM/YY"
                          required
                          pattern="(0[1-9]|1[0-2])\/([0-9]{2})"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">CVV</label>
                        <input
                          type="text"
                          name="cvv"
                          value={paymentInfo.cvv}
                          onChange={handlePaymentChange}
                          className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="123"
                          required
                          pattern="[0-9]{3,4}"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Card Holder Name</label>
                      <input
                        type="text"
                        name="cardHolderName"
                        value={paymentInfo.cardHolderName}
                        onChange={handlePaymentChange}
                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="JOHN DOE"
                        required
                      />
                    </div>
                  </div>
                </div>
              )}

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-md p-4">
                  <div className="flex items-center">
                    <X className="h-5 w-5 text-red-500 mr-2" />
                    <p className="text-red-700">{error}</p>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#0061ff] hover:bg-blue-700 text-white py-3 rounded-lg transition-colors font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Check className="h-5 w-5" />
                    {paymentInfo.paymentOption === 'pay_now' ? 'Complete Booking & Pay Now' : 'Complete Booking'}
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
}