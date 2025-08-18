import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { FaSearch, FaMapMarkerAlt, FaBriefcase, FaUsers, FaHeart, FaLightbulb, FaRocket, FaGraduationCap, FaHandshake, FaGlobe, FaStar, FaShieldAlt, FaSmile } from 'react-icons/fa';

const Careers = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('all');

  const departments = [
    { id: 'all', name: 'All Departments', count: 24 },
    { id: 'engineering', name: 'Engineering', count: 8 },
    { id: 'marketing', name: 'Marketing', count: 5 },
    { id: 'sales', name: 'Sales', count: 4 },
    { id: 'customer-support', name: 'Customer Support', count: 3 },
    { id: 'operations', name: 'Operations', count: 2 },
    { id: 'design', name: 'Design', count: 2 }
  ];

  const jobOpenings = [
    {
      id: 1,
      title: "Senior Frontend Developer",
      department: "engineering",
      location: "New York, NY",
      type: "Full-time",
      experience: "5+ years",
      description: "Join our engineering team to build cutting-edge travel technology that millions of users rely on daily.",
      requirements: ["React/Next.js", "TypeScript", "CSS-in-JS", "Performance optimization"],
      posted: "2 days ago"
    },
    {
      id: 2,
      title: "Product Marketing Manager",
      department: "marketing",
      location: "Remote",
      type: "Full-time",
      experience: "3+ years",
      description: "Drive product adoption and market positioning for our innovative travel platform.",
      requirements: ["B2C Marketing", "Product Marketing", "Analytics", "Travel Industry"],
      posted: "1 week ago"
    },
    {
      id: 3,
      title: "Customer Success Specialist",
      department: "customer-support",
      location: "London, UK",
      type: "Full-time",
      experience: "2+ years",
      description: "Help travelers create unforgettable experiences through exceptional customer service.",
      requirements: ["Customer Service", "Travel Knowledge", "Problem Solving", "Multilingual"],
      posted: "3 days ago"
    },
    {
      id: 4,
      title: "UX/UI Designer",
      department: "design",
      location: "San Francisco, CA",
      type: "Full-time",
      experience: "4+ years",
      description: "Create intuitive and beautiful user experiences that make travel planning effortless.",
      requirements: ["Figma", "User Research", "Prototyping", "Design Systems"],
      posted: "5 days ago"
    },
    {
      id: 5,
      title: "Data Scientist",
      department: "engineering",
      location: "Remote",
      type: "Full-time",
      experience: "3+ years",
      description: "Build AI-powered travel recommendations that help users discover perfect destinations.",
      requirements: ["Python", "Machine Learning", "SQL", "Big Data"],
      posted: "1 week ago"
    },
    {
      id: 6,
      title: "Sales Development Representative",
      department: "sales",
      location: "Chicago, IL",
      type: "Full-time",
      experience: "1+ years",
      description: "Generate new business opportunities and help grow our partner network.",
      requirements: ["Sales Experience", "Communication", "CRM Tools", "Travel Industry"],
      posted: "4 days ago"
    }
  ];

  const benefits = [
    {
      title: "Health & Wellness",
      description: "Comprehensive health, dental, and vision coverage for you and your family",
      icon: <FaHeart className="text-3xl text-red-500" />
    },
    {
      title: "Professional Growth",
      description: "Continuous learning opportunities, conferences, and career development programs",
      icon: <FaGraduationCap className="text-3xl text-blue-500" />
    },
    {
      title: "Work-Life Balance",
      description: "Flexible work arrangements, unlimited PTO, and remote work options",
      icon: <FaSmile className="text-3xl text-green-500" />
    },
    {
      title: "Travel Perks",
      description: "Discounted travel rates, travel credits, and exclusive access to destinations",
      icon: <FaGlobe className="text-3xl text-purple-500" />
    },
    {
      title: "Team Building",
      description: "Regular team events, company retreats, and collaborative projects",
      icon: <FaUsers className="text-3xl text-orange-500" />
    },
    {
      title: "Innovation Culture",
      description: "Work on cutting-edge technology and shape the future of travel",
      icon: <FaLightbulb className="text-3xl text-yellow-500" />
    }
  ];

  const cultureValues = [
    {
      title: "Passion for Travel",
      description: "We're united by our love for exploration and discovery",
      icon: <FaGlobe className="text-3xl text-blue-600" />
    },
    {
      title: "Innovation First",
      description: "We encourage creative thinking and bold ideas",
      icon: <FaRocket className="text-3xl text-purple-600" />
    },
    {
      title: "Customer Focus",
      description: "Everything we do is driven by customer needs",
      icon: <FaHeart className="text-3xl text-red-600" />
    },
    {
      title: "Collaboration",
      description: "We believe great things happen when we work together",
      icon: <FaHandshake className="text-3xl text-green-600" />
    }
  ];

  const filteredJobs = jobOpenings.filter(job => {
    const matchesDepartment = selectedDepartment === 'all' || job.department === selectedDepartment;
    const matchesSearch = job.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         job.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         job.requirements.some(req => req.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesDepartment && matchesSearch;
  });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-700 text-white py-20">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-5xl font-bold mb-6">Join Our Team</h1>
          <p className="text-xl max-w-3xl mx-auto">
            Help us revolutionize the travel industry and create extraordinary experiences for millions of people worldwide. 
            At Jetsetterss, we're not just building a company – we're building the future of travel.
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-16">
        {/* Company Culture */}
        <section className="mb-20">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">Why Work at Jetsetterss?</h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Discover what makes our workplace special and why our team loves coming to work every day
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {cultureValues.map((value, index) => (
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

        {/* Benefits */}
        <section className="mb-20">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">Benefits & Perks</h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              We take care of our team so you can focus on doing your best work
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {benefits.map((benefit, index) => (
              <div key={index} className="bg-white rounded-xl shadow-lg p-8 hover:shadow-xl transition-shadow duration-300">
                <div className="mb-6">
                  {benefit.icon}
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-4">{benefit.title}</h3>
                <p className="text-gray-600">{benefit.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Job Search */}
        <section className="mb-20">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">Open Positions</h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Find the perfect role that matches your skills and passion
            </p>
          </div>

          {/* Search and Filter */}
          <div className="mb-8">
            <div className="flex flex-col lg:flex-row gap-6 items-center justify-between">
              {/* Search Bar */}
              <div className="relative flex-1 max-w-md">
                <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search for jobs, skills, or keywords..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Department Filter */}
              <div className="flex flex-wrap gap-2">
                {departments.map((department) => (
                  <button
                    key={department.id}
                    onClick={() => setSelectedDepartment(department.id)}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
                      selectedDepartment === department.id
                        ? 'bg-blue-600 text-white shadow-lg'
                        : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
                    }`}
                  >
                    {department.name} ({department.count})
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Job Listings */}
          <div className="space-y-6">
            {filteredJobs.map((job) => (
              <div key={job.id} className="bg-white rounded-xl shadow-lg p-8 hover:shadow-xl transition-shadow duration-300">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-6">
                  <div>
                    <h3 className="text-2xl font-bold text-gray-900 mb-2">{job.title}</h3>
                    <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 mb-3">
                      <div className="flex items-center gap-2">
                        <FaBriefcase />
                        <span>{job.department}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <FaMapMarkerAlt />
                        <span>{job.location}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <FaUsers />
                        <span>{job.type}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <FaStar />
                        <span>{job.experience}</span>
                      </div>
                    </div>
                    <p className="text-gray-600 mb-4">{job.description}</p>
                  </div>
                  <div className="lg:text-right">
                    <div className="text-sm text-gray-500 mb-2">Posted {job.posted}</div>
                    <button className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium">
                      Apply Now
                    </button>
                  </div>
                </div>

                {/* Requirements */}
                <div>
                  <h4 className="font-semibold text-gray-900 mb-3">Key Requirements:</h4>
                  <div className="flex flex-wrap gap-2">
                    {job.requirements.map((requirement, index) => (
                      <span 
                        key={index}
                        className="bg-blue-100 text-blue-800 text-sm px-3 py-1 rounded-full"
                      >
                        {requirement}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {filteredJobs.length === 0 && (
            <div className="text-center py-12">
              <FaSearch className="text-4xl text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-600 mb-2">No jobs found</h3>
              <p className="text-gray-500">Try adjusting your search criteria or check back later for new opportunities.</p>
            </div>
          )}
        </section>

        {/* Life at Jetsetterss */}
        <section className="mb-20">
          <div className="bg-gradient-to-r from-blue-600 to-purple-700 rounded-2xl p-12 text-white">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold mb-4">Life at Jetsetterss</h2>
              <p className="text-xl max-w-2xl mx-auto">
                See what it's like to be part of our amazing team
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="text-center">
                <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <FaUsers className="text-2xl" />
                </div>
                <h3 className="text-xl font-bold mb-2">Diverse Team</h3>
                <p className="text-blue-100">Work with talented people from around the world</p>
              </div>
              <div className="text-center">
                <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <FaRocket className="text-2xl" />
                </div>
                <h3 className="text-xl font-bold mb-2">Fast-Paced Growth</h3>
                <p className="text-blue-100">Be part of a rapidly expanding company</p>
              </div>
              <div className="text-center">
                <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <FaShieldAlt className="text-2xl" />
                </div>
                <h3 className="text-xl font-bold mb-2">Stable Foundation</h3>
                <p className="text-blue-100">15+ years of success and counting</p>
              </div>
            </div>
          </div>
        </section>

        {/* Call to Action */}
        <section className="text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-6">Don't See the Right Role?</h2>
          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            We're always looking for talented individuals to join our team. Send us your resume and we'll keep you in mind for future opportunities.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link 
              to="/contact"
              className="bg-blue-600 text-white px-8 py-4 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
            >
              Send Resume
            </Link>
            <Link 
              to="/company"
              className="bg-transparent border-2 border-blue-600 text-blue-600 px-8 py-4 rounded-lg font-semibold hover:bg-blue-600 hover:text-white transition-colors"
            >
              Learn More About Us
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
};

export default Careers; 