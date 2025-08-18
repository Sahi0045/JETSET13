import React from 'react';
import { Link } from 'react-router-dom';
import { FaGlobe, FaHeart, FaShieldAlt, FaUsers, FaRocket, FaAward, FaHandshake, FaLightbulb, FaChartLine, FaStar } from 'react-icons/fa';
import Navbar from './Common/Navbar';
import Footer from './Common/Footer';

const Company = () => {
  const companyStats = [
    {
      number: "15+",
      label: "Years of Experience",
      icon: <FaAward className="text-3xl text-blue-600" />
    },
    {
      number: "2M+",
      label: "Happy Travelers",
      icon: <FaUsers className="text-3xl text-green-600" />
    },
    {
      number: "150+",
      label: "Countries Served",
      icon: <FaGlobe className="text-3xl text-purple-600" />
    },
    {
      number: "4.9/5",
      label: "Customer Rating",
      icon: <FaStar className="text-3xl text-yellow-500" />
    }
  ];

  const values = [
    {
      title: "Customer First",
      description: "Every decision we make is guided by what's best for our customers. We believe in putting their needs and satisfaction above everything else.",
      icon: <FaHeart className="text-4xl text-red-500" />
    },
    {
      title: "Innovation",
      description: "We constantly push boundaries to create better travel experiences through technology, creativity, and forward-thinking solutions.",
      icon: <FaLightbulb className="text-4xl text-yellow-500" />
    },
    {
      title: "Integrity",
      description: "We operate with complete transparency, honesty, and ethical practices in all our business relationships and customer interactions.",
      icon: <FaShieldAlt className="text-4xl text-blue-500" />
    },
    {
      title: "Excellence",
      description: "We strive for excellence in every aspect of our service, from customer support to the travel experiences we curate.",
      icon: <FaStar className="text-4xl text-purple-500" />
    },
    {
      title: "Collaboration",
      description: "We believe in the power of partnerships and teamwork, both within our organization and with our global network of travel partners.",
      icon: <FaHandshake className="text-4xl text-green-500" />
    },
    {
      title: "Growth",
      description: "We're committed to continuous improvement and growth, both as a company and in helping our customers grow through travel.",
      icon: <FaChartLine className="text-4xl text-orange-500" />
    }
  ];

  const milestones = [
    {
      year: "2009",
      title: "Company Founded",
      description: "Jetsetterss was born from a simple idea: making world-class travel accessible to everyone."
    },
    {
      year: "2012",
      title: "First Million Customers",
      description: "Reached our first million happy travelers, proving the demand for quality travel experiences."
    },
    {
      year: "2015",
      title: "Global Expansion",
      description: "Expanded operations to serve customers in over 50 countries worldwide."
    },
    {
      year: "2018",
      title: "Technology Innovation",
      description: "Launched our AI-powered travel recommendation engine and mobile app."
    },
    {
      year: "2021",
      title: "Sustainability Initiative",
      description: "Committed to carbon-neutral operations and sustainable travel partnerships."
    },
    {
      year: "2024",
      title: "Industry Leader",
      description: "Recognized as one of the top 10 travel companies globally with over 2 million satisfied customers."
    }
  ];

  const leadership = [
    {
      name: "Sarah Mitchell",
      position: "Chief Executive Officer",
      image: "https://images.unsplash.com/photo-1494790108755-2616b612b786?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2070&q=80",
      bio: "Sarah has over 20 years of experience in the travel industry and has been instrumental in Jetsetterss's growth from startup to industry leader.",
      linkedin: "#"
    },
    {
      name: "Michael Chen",
      position: "Chief Technology Officer",
      image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2070&q=80",
      bio: "Michael leads our technology innovation, ensuring we stay ahead of industry trends and provide cutting-edge travel solutions.",
      linkedin: "#"
    },
    {
      name: "Emily Rodriguez",
      position: "Chief Customer Officer",
      image: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2070&q=80",
      bio: "Emily ensures every customer interaction exceeds expectations, driving our commitment to exceptional service.",
      linkedin: "#"
    },
    {
      name: "David Thompson",
      position: "Chief Financial Officer",
      image: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2070&q=80",
      bio: "David manages our financial strategy and ensures sustainable growth while maintaining our commitment to customer value.",
      linkedin: "#"
    }
  ];

  return (
    <>
      <Navbar forceScrolled={true} />
      <div className="min-h-screen bg-gray-50">
        {/* Hero Section */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-700 text-white py-20">
          <div className="container mx-auto px-4 text-center">
            <h1 className="text-5xl font-bold mb-6">About Jetsetterss</h1>
            <p className="text-xl max-w-3xl mx-auto">
              We're more than just a travel company. We're your partners in creating unforgettable experiences 
              and making the world more accessible, one journey at a time.
            </p>
          </div>
        </div>

        <div className="container mx-auto px-4 py-16">
          {/* Company Stats */}
          <section className="mb-20">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
              {companyStats.map((stat, index) => (
                <div key={index} className="text-center">
                  <div className="mb-4">
                    {stat.icon}
                  </div>
                  <div className="text-3xl font-bold text-gray-900 mb-2">{stat.number}</div>
                  <div className="text-gray-600">{stat.label}</div>
                </div>
              ))}
            </div>
          </section>

          {/* Our Story */}
          <section className="mb-20">
            <div className="max-w-4xl mx-auto text-center">
              <h2 className="text-4xl font-bold text-gray-900 mb-8">Our Story</h2>
              <div className="prose prose-lg mx-auto text-gray-600">
                <p className="mb-6">
                  Founded in 2009, Jetsetterss began as a small team of passionate travelers with a big dream: 
                  to democratize luxury travel and make extraordinary experiences accessible to everyone.
                </p>
                <p className="mb-6">
                  What started as a simple booking platform has evolved into a comprehensive travel ecosystem 
                  that serves millions of travelers worldwide. We've grown from a startup in a garage to an 
                  industry leader, but our core mission remains the same: to inspire and enable people to 
                  explore the world.
                </p>
                <p>
                  Today, we're proud to have helped over 2 million people create memories that last a lifetime, 
                  and we're just getting started. Our journey continues as we innovate, expand, and find new 
                  ways to make travel more accessible, sustainable, and extraordinary.
                </p>
              </div>
            </div>
          </section>

          {/* Mission & Vision */}
          <section className="mb-20">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
              <div className="bg-white rounded-xl shadow-lg p-8">
                <div className="text-center mb-6">
                  <FaRocket className="text-5xl text-blue-600 mx-auto mb-4" />
                  <h3 className="text-2xl font-bold text-gray-900">Our Mission</h3>
                </div>
                <p className="text-gray-600 text-center">
                  To inspire and enable people to explore the world by providing exceptional travel experiences, 
                  innovative technology, and personalized service that makes every journey extraordinary.
                </p>
              </div>
              
              <div className="bg-white rounded-xl shadow-lg p-8">
                <div className="text-center mb-6">
                  <FaGlobe className="text-5xl text-purple-600 mx-auto mb-4" />
                  <h3 className="text-2xl font-bold text-gray-900">Our Vision</h3>
                </div>
                <p className="text-gray-600 text-center">
                  To be the world's most trusted and innovative travel platform, connecting people with 
                  transformative experiences that enrich their lives and broaden their perspectives.
                </p>
              </div>
            </div>
          </section>

          {/* Our Values */}
          <section className="mb-20">
            <div className="text-center mb-12">
              <h2 className="text-4xl font-bold text-gray-900 mb-4">Our Values</h2>
              <p className="text-xl text-gray-600 max-w-2xl mx-auto">
                The principles that guide everything we do and every decision we make
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {values.map((value, index) => (
                <div key={index} className="bg-white rounded-xl shadow-lg p-8 text-center hover:shadow-xl transition-shadow duration-300">
                  <div className="mb-6">
                    {value.icon}
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-4">{value.title}</h3>
                  <p className="text-gray-600">{value.description}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Company Timeline */}
          <section className="mb-20">
            <div className="text-center mb-12">
              <h2 className="text-4xl font-bold text-gray-900 mb-4">Our Journey</h2>
              <p className="text-xl text-gray-600 max-w-2xl mx-auto">
                Key milestones that have shaped our company's growth and success
              </p>
            </div>
            
            <div className="max-w-4xl mx-auto">
              <div className="relative">
                {/* Timeline Line */}
                <div className="absolute left-1/2 transform -translate-x-px h-full w-0.5 bg-blue-200"></div>
                
                {milestones.map((milestone, index) => (
                  <div key={index} className={`relative flex items-center mb-12 ${
                    index % 2 === 0 ? 'flex-row' : 'flex-row-reverse'
                  }`}>
                    {/* Timeline Dot */}
                    <div className="absolute left-1/2 transform -translate-x-1/2 w-4 h-4 bg-blue-600 rounded-full border-4 border-white shadow-lg"></div>
                    
                    {/* Content */}
                    <div className={`w-5/12 ${index % 2 === 0 ? 'pr-8 text-right' : 'pl-8 text-left'}`}>
                      <div className="bg-white rounded-lg shadow-md p-6">
                        <div className="text-2xl font-bold text-blue-600 mb-2">{milestone.year}</div>
                        <h3 className="text-xl font-bold text-gray-900 mb-2">{milestone.title}</h3>
                        <p className="text-gray-600">{milestone.description}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Leadership Team */}
          <section className="mb-20">
            <div className="text-center mb-12">
              <h2 className="text-4xl font-bold text-gray-900 mb-4">Leadership Team</h2>
              <p className="text-xl text-gray-600 max-w-2xl mx-auto">
                Meet the passionate leaders who drive our mission and vision forward
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
              {leadership.map((leader, index) => (
                <div key={index} className="bg-white rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition-shadow duration-300">
                  <div className="h-48 overflow-hidden">
                    <img 
                      src={leader.image} 
                      alt={leader.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="p-6 text-center">
                    <h3 className="text-xl font-bold text-gray-900 mb-2">{leader.name}</h3>
                    <p className="text-blue-600 font-medium mb-3">{leader.position}</p>
                    <p className="text-gray-600 text-sm mb-4">{leader.bio}</p>
                    <a 
                      href={leader.linkedin}
                      className="inline-block bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium"
                    >
                      Connect on LinkedIn
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Call to Action */}
          <section className="bg-gradient-to-r from-blue-600 to-purple-700 rounded-2xl p-12 text-center text-white">
            <h2 className="text-3xl font-bold mb-4">Join Us on Our Journey</h2>
            <p className="text-xl mb-8 max-w-2xl mx-auto">
              Whether you're looking to travel with us or join our team, we'd love to hear from you.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link 
                to="/careers"
                className="bg-white text-blue-600 px-8 py-4 rounded-lg font-semibold hover:bg-gray-100 transition-colors"
              >
                View Careers
              </Link>
              <Link 
                to="/contact"
                className="bg-transparent border-2 border-white text-white px-8 py-4 rounded-lg font-semibold hover:bg-white hover:text-blue-600 transition-colors"
              >
                Get in Touch
              </Link>
            </div>
          </section>
        </div>
      </div>
      <Footer />
    </>
  );
};

export default Company; 