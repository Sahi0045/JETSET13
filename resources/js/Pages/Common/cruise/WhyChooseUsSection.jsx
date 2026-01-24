import React from 'react';
import { FaAnchor, FaShip, FaCreditCard, FaHeadset, FaShieldAlt, FaGem } from 'react-icons/fa';

const WhyChooseUsSection = () => {
  const reasons = [
    {
      icon: <FaShip />,
      title: "Exclusive Cruise Deals",
      description: "Access the best prices and promotions available, with exclusive deals you won't find anywhere else."
    },
    {
      icon: <FaHeadset />,
      title: "24/7 Expert Support",
      description: "Our cruise specialists are available around the clock to assist with any questions or concerns."
    },
    {
      icon: <FaAnchor />,
      title: "Vast Selection",
      description: "Choose from over 500 cruise itineraries and 20+ premium cruise lines to find your perfect voyage."
    },
    {
      icon: <FaCreditCard />,
      title: "Flexible Payment Options",
      description: "Book with confidence using our secure payment system with flexible payment plans available."
    },
    {
      icon: <FaShieldAlt />,
      title: "Guaranteed Best Price",
      description: "Our price match guarantee ensures you'll always get the best value for your cruise vacation."
    },
    {
      icon: <FaGem />,
      title: "Premium Experiences",
      description: "Access to exclusive shore excursions, cabin upgrades, and VIP amenities for a truly memorable cruise."
    }
  ];

  return (
    <div className="why-choose-us-section py-16 bg-white">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-800 mb-4">Why Choose JetSet Cruises</h2>
          <p className="text-gray-600 max-w-xl mx-auto">
            Discover why thousands of travelers trust us for their cruise vacations
          </p>
          <div className="w-24 h-1 bg-blue-600 mx-auto mt-6"></div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {reasons.map((reason, index) => (
            <div
              key={index}
              className="bg-white p-6 rounded-xl shadow-md hover:shadow-lg transition-all duration-300 border border-gray-100 hover:border-blue-200 group"
            >
              <div className="w-14 h-14 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center mb-5 group-hover:bg-blue-600 group-hover:text-white transition-all duration-300 text-2xl">
                {reason.icon}
              </div>
              <h3 className="text-xl font-bold text-gray-800 mb-3">{reason.title}</h3>
              <p className="text-gray-600">{reason.description}</p>
            </div>
          ))}
        </div>

        <div className="mt-16 text-center">
          <a
            href="/about"
            className="inline-flex items-center px-8 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors duration-300 shadow-md hover:shadow-lg"
          >
            Learn More About Us
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5 ml-2"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M10.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L12.586 11H5a1 1 0 110-2h7.586l-2.293-2.293a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </a>
        </div>
      </div>

      {/* Testimonial Highlight */}
      <div className="mt-20 bg-gray-50 py-12">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between max-w-5xl mx-auto">
            <div className="md:w-1/2 mb-8 md:mb-0 md:pr-10">
              <div className="text-lg italic text-gray-700 mb-6">
                "JetSet Cruises made booking our family vacation incredibly easy. Their customer service team went above and beyond to help us find the perfect cruise, and their exclusive deals saved us hundreds!"
              </div>
              <div className="flex items-center">
                <img
                  src="/images/testimonial-avatar.jpg"
                  alt="Customer Testimonial"
                  className="w-12 h-12 rounded-full object-cover mr-4"
                  onError={(e) => {
                    e.target.onerror = null;
                    e.target.src = 'https://via.placeholder.com/48';
                  }}
                />
                <div>
                  <div className="font-bold text-gray-800">Michael Thompson</div>
                  <div className="text-sm text-gray-600">Family Cruise to the Bahamas</div>
                </div>
              </div>
            </div>

            <div className="md:w-1/2 bg-white p-6 rounded-xl shadow-md border border-gray-200">
              <h3 className="text-xl font-bold text-gray-800 mb-3">Our Commitment</h3>
              <p className="text-gray-600 mb-4">
                At JetSet Cruises, we're dedicated to providing exceptional service and the best cruise experiences. Our satisfaction guarantee ensures your journey will be everything you dreamed of and more.
              </p>
              <div className="flex items-center text-blue-600 font-medium">
                <FaShieldAlt className="mr-2" />
                <span>100% Satisfaction Guarantee</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WhyChooseUsSection; 