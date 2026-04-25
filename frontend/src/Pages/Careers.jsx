import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { FaSearch, FaMapMarkerAlt, FaBriefcase, FaUsers, FaHeart, FaLightbulb, FaRocket, FaGlobe, FaStar, FaArrowRight, FaCheckCircle } from 'react-icons/fa';
import Navbar from './Common/Navbar';
import Footer from './Common/Footer';

const Careers = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('all');
  const [selectedLocation, setSelectedLocation] = useState('all');

  const departments = [
    { id: 'all', name: 'All Teams' },
    { id: 'engineering', name: 'Engineering' },
    { id: 'product', name: 'Product & Design' },
    { id: 'marketing', name: 'Marketing' },
    { id: 'sales', name: 'Sales & Partnerships' },
    { id: 'operations', name: 'Operations' },
    { id: 'customer', name: 'Customer Experience' }
  ];

  const locations = [
    { id: 'all', name: 'All Locations' },
    { id: 'remote', name: 'Remote' },
    { id: 'new-york', name: 'New York, USA' },
    { id: 'london', name: 'London, UK' },
    { id: 'singapore', name: 'Singapore' },
    { id: 'bangalore', name: 'Bangalore, India' }
  ];

  const jobOpenings = [
    {
      id: 1,
      title: "Senior Software Engineer",
      department: "engineering",
      location: "remote",
      locationText: "Remote",
      type: "Full-time",
      description: "Build the future of travel technology. Work on cutting-edge systems that power millions of bookings worldwide.",
      posted: "2 days ago"
    },
    {
      id: 2,
      title: "Product Designer",
      department: "product",
      location: "new-york",
      locationText: "New York, USA",
      type: "Full-time",
      description: "Create beautiful, intuitive experiences that make travel planning effortless and delightful for millions of users.",
      posted: "1 week ago"
    },
    {
      id: 3,
      title: "Marketing Manager",
      department: "marketing",
      location: "london",
      locationText: "London, UK",
      type: "Full-time",
      description: "Drive global marketing campaigns that inspire people to explore the world and discover new destinations.",
      posted: "3 days ago"
    },
    {
      id: 4,
      title: "Customer Success Lead",
      department: "customer",
      location: "singapore",
      locationText: "Singapore",
      type: "Full-time",
      description: "Lead our customer success team in delivering exceptional experiences that turn travelers into lifelong advocates.",
      posted: "5 days ago"
    },
    {
      id: 5,
      title: "Data Scientist",
      department: "engineering",
      location: "bangalore",
      locationText: "Bangalore, India",
      type: "Full-time",
      description: "Use data and AI to personalize travel recommendations and optimize pricing for millions of travelers.",
      posted: "1 week ago"
    },
    {
      id: 6,
      title: "Partnerships Manager",
      department: "sales",
      location: "remote",
      locationText: "Remote",
      type: "Full-time",
      description: "Build strategic partnerships with airlines, hotels, and travel providers to expand our global network.",
      posted: "4 days ago"
    }
  ];

  const benefits = [
    {
      title: "Live and Work Anywhere",
      description: "We know there is no one-size-fits-all approach to work. That's why we give our employees the flexibility to live and work anywhere in the world where regulations allow.",
      icon: <FaGlobe className="text-4xl" />,
      image: "https://images.unsplash.com/photo-1521737711867-e3b97375f902?q=80&w=1587&auto=format&fit=crop"
    },
    {
      title: "We Welcome You",
      description: "Creating connection and belonging begins with a workplace where you're both welcomed and empowered to be your authentic self, so you can deliver your best work.",
      icon: <FaHeart className="text-4xl" />,
      image: "https://images.unsplash.com/photo-1522071820081-009f0129c71c?q=80&w=1470&auto=format&fit=crop"
    },
    {
      title: "Make an Impact",
      description: "Join our global creative community, where passion and collaboration drive innovation to make products that impact the world.",
      icon: <FaRocket className="text-4xl" />,
      image: "https://images.unsplash.com/photo-1600880292203-757bb62b4baf?q=80&w=1470&auto=format&fit=crop"
    }
  ];

  const perks = [
    { title: "Competitive Salary", icon: <FaStar /> },
    { title: "Health & Wellness", icon: <FaHeart /> },
    { title: "Travel Credits", icon: <FaGlobe /> },
    { title: "Learning Budget", icon: <FaLightbulb /> },
    { title: "Flexible Hours", icon: <FaCheckCircle /> },
    { title: "Remote First", icon: <FaUsers /> }
  ];

  const filteredJobs = jobOpenings.filter(job => {
    const matchesDepartment = selectedDepartment === 'all' || job.department === selectedDepartment;
    const matchesLocation = selectedLocation === 'all' || job.location === selectedLocation;
    const matchesSearch = job.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesDepartment && matchesLocation && matchesSearch;
  });

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-white pt-[71px]">
        {/* Hero Section - Large and Inspiring */}
        <section className="relative min-h-[85vh] flex items-center justify-center overflow-hidden">
          {/* Background Image */}
          <div
            className="absolute inset-0 z-0 bg-cover bg-center"
            style={{
              backgroundImage: "url('https://images.unsplash.com/photo-1522202176988-66273c2fd55f?q=80&w=1471&auto=format&fit=crop')",
            }}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/40 to-transparent"></div>
          </div>

          {/* Content */}
          <div className="relative z-10 container mx-auto px-4 py-20 text-white">
            <div className="max-w-4xl">
              <h1 className="text-6xl md:text-7xl lg:text-8xl font-bold mb-8 leading-tight">
                Discover your place at Jetsetterss
              </h1>
              <p className="text-2xl md:text-3xl mb-12 leading-relaxed opacity-90 max-w-3xl">
                Work at one of the most creative places on Earth
              </p>
              <p className="text-xl mb-12 opacity-80 max-w-2xl">
                From our first three customers in 2009, Jetsetterss has welcomed over 2 million travelers,
                all thanks to our passionate team of 500+ travel experts.
              </p>
              <Link
                to="#positions"
                className="inline-flex items-center gap-3 bg-white text-gray-900 px-8 py-4 rounded-lg font-semibold text-lg hover:bg-gray-100 transition-all duration-300 shadow-xl"
              >
                Explore Open Roles <FaArrowRight />
              </Link>
            </div>
          </div>
        </section>

        {/* Benefits Section - Large Cards */}
        <section className="py-24 bg-white">
          <div className="container mx-auto px-4">
            <div className="space-y-24">
              {benefits.map((benefit, index) => (
                <div key={index} className={`flex flex-col ${index % 2 === 0 ? 'lg:flex-row' : 'lg:flex-row-reverse'} gap-12 items-center max-w-7xl mx-auto`}>
                  <div className="flex-1">
                    <div className="rounded-3xl overflow-hidden shadow-2xl">
                      <img
                        src={benefit.image}
                        alt={benefit.title}
                        className="w-full h-[500px] object-cover"
                      />
                    </div>
                  </div>
                  <div className="flex-1 space-y-6">
                    <div className="text-[#055B75]">
                      {benefit.icon}
                    </div>
                    <h2 className="text-4xl md:text-5xl font-bold text-gray-900 leading-tight">
                      {benefit.title}
                    </h2>
                    <p className="text-xl text-gray-600 leading-relaxed">
                      {benefit.description}
                    </p>
                    <Link
                      to="#positions"
                      className="inline-flex items-center gap-2 text-[#055B75] font-semibold text-lg hover:gap-3 transition-all duration-300"
                    >
                      Learn More <FaArrowRight />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Perks Grid */}
        <section className="py-20 bg-gradient-to-br from-gray-50 to-white">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto text-center mb-16">
              <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
                Benefits & Perks
              </h2>
              <p className="text-xl text-gray-600">
                We take care of our team so you can focus on doing your best work
              </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6 max-w-6xl mx-auto">
              {perks.map((perk, index) => (
                <div key={index} className="bg-white rounded-2xl p-6 text-center border border-gray-200 hover:border-[#055B75] hover:shadow-lg transition-all duration-300">
                  <div className="text-[#055B75] text-3xl mb-4 flex justify-center">
                    {perk.icon}
                  </div>
                  <h3 className="text-sm font-semibold text-gray-900">{perk.title}</h3>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Open Positions */}
        <section id="positions" className="py-24 bg-white">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto text-center mb-16">
              <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
                Open the door to your next role
              </h2>
              <p className="text-xl text-gray-600">
                Find the perfect position that matches your skills and passion
              </p>
            </div>

            {/* Filters */}
            <div className="max-w-6xl mx-auto mb-12">
              <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Search */}
                  <div className="relative">
                    <FaSearch className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search roles..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#055B75] focus:border-transparent"
                    />
                  </div>

                  {/* Department */}
                  <select
                    value={selectedDepartment}
                    onChange={(e) => setSelectedDepartment(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#055B75] focus:border-transparent"
                  >
                    {departments.map((dept) => (
                      <option key={dept.id} value={dept.id}>{dept.name}</option>
                    ))}
                  </select>

                  {/* Location */}
                  <select
                    value={selectedLocation}
                    onChange={(e) => setSelectedLocation(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#055B75] focus:border-transparent"
                  >
                    {locations.map((loc) => (
                      <option key={loc.id} value={loc.id}>{loc.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Job Listings */}
            <div className="max-w-6xl mx-auto space-y-4">
              {filteredJobs.map((job) => (
                <div key={job.id} className="bg-white rounded-2xl border border-gray-200 hover:border-[#055B75] hover:shadow-lg transition-all duration-300 p-8">
                  <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
                    <div className="flex-1">
                      <h3 className="text-2xl font-bold text-gray-900 mb-3">{job.title}</h3>
                      <p className="text-gray-600 mb-4 leading-relaxed">{job.description}</p>
                      <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500">
                        <div className="flex items-center gap-2">
                          <FaMapMarkerAlt className="text-[#055B75]" />
                          <span>{job.locationText}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <FaBriefcase className="text-[#055B75]" />
                          <span>{job.type}</span>
                        </div>
                        <div className="text-gray-400">Posted {job.posted}</div>
                      </div>
                    </div>
                    <div>
                      <button className="bg-[#055B75] text-white px-8 py-3 rounded-lg hover:bg-[#034457] transition-all duration-300 font-semibold whitespace-nowrap">
                        Apply Now
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {filteredJobs.length === 0 && (
                <div className="text-center py-16">
                  <FaSearch className="text-5xl text-gray-300 mx-auto mb-4" />
                  <h3 className="text-2xl font-semibold text-gray-600 mb-2">No positions found</h3>
                  <p className="text-gray-500">Try adjusting your search criteria</p>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-24 bg-gradient-to-br from-[#034457] to-[#055B75]">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto text-center text-white">
              <h2 className="text-4xl md:text-5xl font-bold mb-6">
                Don't see the right role?
              </h2>
              <p className="text-xl mb-10 opacity-90 leading-relaxed">
                We're always looking for talented individuals to join our team.
                Send us your resume and we'll keep you in mind for future opportunities.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link
                  to="/contact"
                  className="inline-flex items-center justify-center gap-2 bg-white text-[#055B75] px-8 py-4 rounded-lg font-semibold text-lg hover:bg-gray-100 transition-all duration-300"
                >
                  Get in Touch <FaArrowRight />
                </Link>
                <Link
                  to="/about-us"
                  className="inline-flex items-center justify-center gap-2 border-2 border-white text-white px-8 py-4 rounded-lg font-semibold text-lg hover:bg-white hover:text-[#055B75] transition-all duration-300"
                >
                  Learn About Us
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>
      <Footer />
    </>
  );
};

export default Careers;