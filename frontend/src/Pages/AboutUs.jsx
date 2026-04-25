import React from 'react';
import { Link } from 'react-router-dom';
import { FaHeart, FaShieldAlt, FaUsers, FaGlobe, FaLightbulb, FaRocket, FaPlane, FaArrowRight, FaLinkedin, FaTwitter, FaInstagram, FaFacebook } from 'react-icons/fa';
import Navbar from './Common/Navbar';
import Footer from './Common/Footer';

const AboutUs = () => {
  const stats = [
    { number: "2009", label: "Company Founded" },
    { number: "2M+", label: "Happy Travelers" },
    { number: "150+", label: "Countries Served" },
    { number: "500+", label: "Travel Experts" }
  ];

  const coreValues = [
    {
      title: "Trust and Transparency",
      description: "We prioritize building strong, open relationships with our travelers, founded on mutual trust and honesty in every interaction.",
      icon: <FaShieldAlt className="text-4xl" />
    },
    {
      title: "Customer Growth",
      description: "We foster memorable experiences that encourage personal growth through travel, empowering our customers to explore the world confidently.",
      icon: <FaUsers className="text-4xl" />
    },
    {
      title: "Innovation and Excellence",
      description: "By leveraging cutting-edge technology, we drive creativity and deliver exceptional travel solutions that exceed expectations.",
      icon: <FaLightbulb className="text-4xl" />
    }
  ];

  const leadership = [
    {
      name: "Sarah Mitchell",
      role: "CEO & Co-founder",
      image: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400&h=400&fit=crop&crop=face",
      focusAreas: ["Strategy", "Partnerships", "Regulatory", "Technology Oversight"],
      responsibilities: ["Strategic vision and company direction", "Building key industry partnerships", "Ensuring regulatory compliance", "Overseeing technology initiatives"]
    },
    {
      name: "David Chen",
      role: "CTO & Co-founder",
      image: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400&h=400&fit=crop&crop=face",
      focusAreas: ["Tech Architecture", "Blockchain"],
      responsibilities: ["Leading technology architecture", "Implementing blockchain solutions", "Managing development teams", "Driving innovation in travel tech"]
    },
    {
      name: "Emily Rodriguez",
      role: "Chief Product Officer",
      image: "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=400&h=400&fit=crop&crop=face",
      focusAreas: ["Product Strategy", "User Experience", "Product Development"],
      responsibilities: ["Defining product roadmap", "Enhancing user experience", "Leading product development", "Market research and analysis"]
    },
    {
      name: "Michael Thompson",
      role: "Chief Strategy Advisor",
      image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&fit=crop&crop=face",
      focusAreas: ["Strategy", "Business Development"],
      responsibilities: ["Strategic planning and execution", "Business development initiatives", "Market expansion strategies", "Competitive analysis"]
    },
    {
      name: "Jessica Williams",
      role: "CMO",
      image: "https://images.unsplash.com/photo-1494790108755-2616b612b786?w=400&h=400&fit=crop&crop=face",
      focusAreas: ["Marketing", "Growth", "Brand"],
      responsibilities: ["Leading marketing campaigns", "Driving user growth", "Brand management", "Digital marketing strategy"]
    },
    {
      name: "Alex Kumar",
      role: "Research and Analytics Lead",
      image: "https://images.unsplash.com/photo-1507591064344-4c6ce005b128?w=400&h=400&fit=crop&crop=face",
      focusAreas: ["Research", "Analytics"],
      responsibilities: ["Market research and insights", "Data analysis and reporting", "Performance metrics tracking", "Customer behavior analysis"]
    }
  ];

  const partners = [
    { name: "Amadeus", logo: "https://via.placeholder.com/150x60/055B75/FFFFFF?text=Amadeus" },
    { name: "Sabre", logo: "https://via.placeholder.com/150x60/055B75/FFFFFF?text=Sabre" },
    { name: "Travelport", logo: "https://via.placeholder.com/150x60/055B75/FFFFFF?text=Travelport" },
    { name: "IATA", logo: "https://via.placeholder.com/150x60/055B75/FFFFFF?text=IATA" }
  ];

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-white pt-[71px]">
        {/* Hero Section - Clean and Simple */}
        <section className="relative bg-gradient-to-br from-gray-50 to-white py-20 md:py-32">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto text-center">
              <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold text-gray-900 mb-6 leading-tight">
                Behind the scenes <span className="text-[#055B75]">@Jetsetterss</span>
              </h1>
              <p className="text-xl md:text-2xl text-gray-600 leading-relaxed max-w-3xl mx-auto">
                Our exponential growth and incredible success has been nothing short of a dream.
                It's no surprise that behind it is a strong, decisive leadership and passionate, dependable team.
              </p>
            </div>
          </div>
        </section>

        {/* The Humans Behind the Magic */}
        <section className="py-16 bg-white">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-6">
                The humans behind the magic
              </h2>
              <p className="text-lg md:text-xl text-gray-600 leading-relaxed">
                When we aren't furiously building and shipping our next brilliant idea, we are celebrating
                the small moments - a birthday, an anniversary, a festival, any minor occasion that brings
                us together to share our joy (or order desserts guilt free).
              </p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 max-w-5xl mx-auto">
              {stats.map((stat, index) => (
                <div key={index} className="text-center p-6 rounded-xl bg-gradient-to-br from-gray-50 to-white border border-gray-100">
                  <div className="text-4xl md:text-5xl font-bold text-[#055B75] mb-2">{stat.number}</div>
                  <div className="text-gray-600 font-medium">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Core Values Section */}
        <section className="py-20 bg-gradient-to-br from-gray-50 to-white">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-6">
                We value Trust, Growth, and Collaboration above everything else.
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
              {coreValues.map((value, index) => (
                <div key={index} className="bg-white rounded-2xl p-8 border border-gray-200 hover:border-[#055B75] transition-all duration-300 hover:shadow-lg">
                  <div className="text-[#055B75] mb-6">
                    {value.icon}
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-4">{value.title}</h3>
                  <p className="text-gray-600 leading-relaxed">{value.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Leadership Team */}
        <section className="py-20 bg-white">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-6">
                Leadership & Core Team
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
              {leadership.map((leader, index) => (
                <div key={index} className="group">
                  <div className="bg-white rounded-2xl p-6 border border-gray-200 hover:border-[#055B75] transition-all duration-300 hover:shadow-lg">
                    <h3 className="text-xl font-bold text-gray-900 mb-1">{leader.name}</h3>
                    <p className="text-[#055B75] font-semibold mb-4">{leader.role}</p>
                      
                      <div className="mb-4">
                        <h4 className="text-sm font-semibold text-gray-700 mb-2">Focus Areas:</h4>
                        <div className="flex flex-wrap gap-2">
                          {leader.focusAreas.map((area, idx) => (
                            <span key={idx} className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-full">
                              {area}
                            </span>
                          ))}
                        </div>
                      </div>
                      
                      <div>
                        <h4 className="text-sm font-semibold text-gray-700 mb-2">Key Responsibilities:</h4>
                        <ul className="space-y-1">
                          {leader.responsibilities.map((resp, idx) => (
                            <li key={idx} className="text-sm text-gray-600 flex items-start">
                              <span className="text-[#055B75] mr-2">•</span>
                              {resp}
                            </li>
                          ))}
                        </ul>
                      </div>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="mt-16 text-center">
              <p className="text-gray-600 italic">
                "Incubated by Bennett University (Times of India Group)"
              </p>
            </div>
          </div>
        </section>

        {/* Our Story Section */}
        <section className="py-20 bg-gradient-to-br from-gray-50 to-white">
          <div className="container mx-auto px-4">
            <div className="max-w-5xl mx-auto">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
                <div>
                  <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-6">
                    Our Journey Since 2010
                  </h2>
                  <div className="space-y-4 text-gray-600 text-lg leading-relaxed">
                    <p>
                      Jetsetterss began with a simple vision: to make travel accessible, affordable,
                      and extraordinary for everyone. What started as a small team of passionate travelers
                      has grown into a global platform serving millions.
                    </p>
                    <p>
                      We've built our reputation on trust, innovation, and an unwavering commitment to
                      customer satisfaction. Every day, our team works tirelessly to ensure that your
                      travel experience is seamless from start to finish.
                    </p>
                    <p>
                      Today, we're proud to be recognized as one of the leading travel platforms globally,
                      but we're just getting started. Our mission remains the same: to inspire and enable
                      people to explore the world.
                    </p>
                  </div>
                  <div className="mt-8">
                    <Link
                      to="/careers"
                      className="inline-flex items-center gap-2 bg-[#055B75] text-white px-8 py-4 rounded-lg font-semibold hover:bg-[#034457] transition-all duration-300"
                    >
                      Join Our Team <FaArrowRight />
                    </Link>
                  </div>
                </div>
                <div className="relative">
                  <div className="rounded-2xl overflow-hidden shadow-2xl">
                    <img
                      src="https://images.unsplash.com/photo-1521737604893-d14cc237f11d?q=80&w=1484&auto=format&fit=crop"
                      alt="Jetsetterss Team"
                      className="w-full h-[500px] object-cover"
                    />
                  </div>
                  <div className="absolute -bottom-6 -right-6 bg-[#055B75] text-white p-8 rounded-2xl shadow-xl max-w-xs">
                    <div className="text-4xl font-bold mb-2">15+</div>
                    <div className="text-sm opacity-90">Years of Excellence in Travel Industry</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Partners Section */}
        <section className="py-20 bg-white">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-6">
                Trusted by the best
              </h2>
              <p className="text-lg text-gray-600">
                We partner with industry leaders to bring you the best travel experiences
              </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 max-w-4xl mx-auto">
              {partners.map((partner, index) => (
                <div key={index} className="flex items-center justify-center p-6 bg-gray-50 rounded-xl border border-gray-200 hover:border-[#055B75] transition-all duration-300">
                  <img src={partner.logo} alt={partner.name} className="max-w-full h-auto opacity-60 hover:opacity-100 transition-opacity" />
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Our Offices */}
        <section className="py-20 bg-gradient-to-br from-gray-50 to-white">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-6">
                Our Offices Worldwide
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-1 gap-8 max-w-2xl mx-auto">
              {[
                { city: "New York", type: "Headquarters", country: "USA" }
              ].map((office, index) => (
                <div key={index} className="bg-white rounded-2xl p-8 border border-gray-200 hover:border-[#055B75] transition-all duration-300 hover:shadow-lg text-center">
                  <FaGlobe className="text-4xl text-[#055B75] mx-auto mb-4" />
                  <h3 className="text-xl font-bold text-gray-900 mb-2">{office.city}</h3>
                  <p className="text-gray-600 mb-1">{office.type}</p>
                  <p className="text-sm text-gray-500">{office.country}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-20 bg-[#055B75]">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto text-center text-white">
              <h2 className="text-3xl md:text-4xl font-bold mb-6">
                Ready to Start Your Journey?
              </h2>
              <p className="text-xl mb-10 opacity-90">
                Join millions of travelers who trust Jetsetterss for their adventures
              </p>

              <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
                <Link
                  to="/flights"
                  className="inline-flex items-center justify-center gap-2 bg-white text-[#055B75] px-8 py-4 rounded-lg font-semibold hover:bg-gray-100 transition-all duration-300"
                >
                  <FaPlane /> Book Your Flight
                </Link>
                <Link
                  to="/contact"
                  className="inline-flex items-center justify-center gap-2 border-2 border-white text-white px-8 py-4 rounded-lg font-semibold hover:bg-white hover:text-[#055B75] transition-all duration-300"
                >
                  Contact Us <FaArrowRight />
                </Link>
              </div>

              {/* Social Media */}
              <div className="border-t border-white/20 pt-8">
                <p className="text-sm mb-4 opacity-80">Follow Us</p>
                <div className="flex gap-4 justify-center">
                  <a href="#" className="w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-all duration-300">
                    <FaLinkedin className="text-xl" />
                  </a>
                  <a href="#" className="w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-all duration-300">
                    <FaTwitter className="text-xl" />
                  </a>
                  <a href="#" className="w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-all duration-300">
                    <FaInstagram className="text-xl" />
                  </a>
                  <a href="#" className="w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-all duration-300">
                    <FaFacebook className="text-xl" />
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
      <Footer />
    </>
  );
};

export default AboutUs;