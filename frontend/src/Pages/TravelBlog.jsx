import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { FaCalendarAlt, FaUser, FaClock, FaTags, FaSearch, FaFilter, FaHeart, FaShare, FaBookmark, FaPlane, FaHotel, FaShip, FaSuitcase, FaMapMarkerAlt } from 'react-icons/fa';
import Navbar from './Common/Navbar';
import Footer from './Common/Footer';
import Breadcrumb from '../components/Breadcrumb';
import { SeoOverride } from '../seo/RouteSeo';
import { DESTINATION_IMAGES } from '../data/destinationImages';

const TravelBlog = () => {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const categories = [
    { id: 'all', name: 'All Posts', count: 24 },
    { id: 'destinations', name: 'Destinations', count: 8 },
    { id: 'tips', name: 'Travel Tips', count: 6 },
    { id: 'culture', name: 'Culture', count: 5 },
    { id: 'food', name: 'Food & Dining', count: 3 },
    { id: 'adventure', name: 'Adventure', count: 2 }
  ];

  const blogPosts = [
    {
      id: 1,
      title: "10 Hidden Gems in Bali That Most Tourists Miss",
      excerpt: "Discover the secret spots of Bali that will make your trip truly unforgettable. From hidden waterfalls to secluded beaches, explore the island's best-kept secrets.",
      category: 'destinations',
      author: "Sarah Johnson",
      publishDate: "2024-01-15",
      readTime: "8 min read",
      image: "https://images.unsplash.com/photo-1537953773345-d172ccf13cf1?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2072&q=80",
      tags: ['Bali', 'Hidden Gems', 'Indonesia', 'Travel Tips'],
      featured: true,
      likes: 342,
      views: 1247
    },
    {
      id: 2,
      title: "The Ultimate Paris Food Guide: Where to Eat Like a Local",
      excerpt: "Skip the tourist traps and discover where Parisians actually eat. From cozy bistros to trendy cafes, this guide covers the best culinary experiences in the City of Light.",
      category: 'food',
      author: "Pierre Dubois",
      publishDate: "2024-01-12",
      readTime: "12 min read",
      image: DESTINATION_IMAGES.paris,
      tags: ['Paris', 'Food', 'France', 'Cuisine'],
      featured: false,
      likes: 289,
      views: 987
    },
    {
      id: 3,
      title: "Packing Smart: The Ultimate Travel Checklist for Any Destination",
      excerpt: "Never forget essential items again with our comprehensive packing guide. Learn how to pack efficiently for any type of trip, from weekend getaways to month-long adventures.",
      category: 'tips',
      author: "Emma Rodriguez",
      publishDate: "2024-01-10",
      readTime: "6 min read",
      image: "https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2070&q=80",
      tags: ['Packing', 'Travel Tips', 'Organization', 'Planning'],
      featured: false,
      likes: 156,
      views: 654
    },
    {
      id: 4,
      title: "Tokyo's Best Kept Secrets: Beyond the Tourist Trail",
      excerpt: "Explore the authentic side of Tokyo that most visitors never see. From hidden izakayas to secret gardens, discover the city's most intimate and fascinating spots.",
      category: 'destinations',
      author: "Yuki Tanaka",
      publishDate: "2024-01-08",
      readTime: "10 min read",
      image: "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2071&q=80",
      tags: ['Tokyo', 'Japan', 'Hidden Spots', 'Culture'],
      featured: false,
      likes: 234,
      views: 876
    },
    {
      id: 5,
      title: "Budget Travel: How to See the World Without Breaking the Bank",
      excerpt: "Travel doesn't have to be expensive! Learn proven strategies for finding cheap flights, affordable accommodations, and budget-friendly activities around the world.",
      category: 'tips',
      author: "Mike Chen",
      publishDate: "2024-01-05",
      readTime: "9 min read",
      image: "https://images.unsplash.com/photo-1587595431973-160d0d94add1?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2070&q=80",
      tags: ['Budget Travel', 'Money Saving', 'Travel Tips', 'Planning'],
      featured: false,
      likes: 198,
      views: 743
    },
    {
      id: 6,
      title: "The Art of Slow Travel: Why Taking Your Time Makes All the Difference",
      excerpt: "In our fast-paced world, slow travel offers a refreshing alternative. Learn how to immerse yourself in local cultures and create deeper, more meaningful travel experiences.",
      category: 'culture',
      author: "Isabella Silva",
      publishDate: "2024-01-03",
      readTime: "7 min read",
      image: "https://images.unsplash.com/photo-1518548419970-58e3b4079ab2?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2070&q=80",
      tags: ['Slow Travel', 'Culture', 'Immersion', 'Mindful Travel'],
      featured: false,
      likes: 167,
      views: 589
    }
  ];

  const filteredPosts = blogPosts.filter(post => {
    const matchesCategory = selectedCategory === 'all' || post.category === selectedCategory;
    const matchesSearch = post.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      post.excerpt.toLowerCase().includes(searchQuery.toLowerCase()) ||
      post.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  const featuredPost = blogPosts.find(post => post.featured);

  const SITE_URL = 'https://www.jetsetterss.com';

  const blogSchema = useMemo(() => {
    const postSchemas = blogPosts.map(post => ({
      '@type': 'BlogPosting',
      headline: post.title,
      description: post.excerpt,
      image: post.image,
      datePublished: post.publishDate,
      author: { '@type': 'Person', name: post.author },
      publisher: { '@id': `${SITE_URL}/#organization` },
      url: `${SITE_URL}/travel-blog`,
      keywords: post.tags.join(', '),
      wordCount: parseInt(post.readTime) * 250,
      interactionStatistic: [
        { '@type': 'InteractionCounter', interactionType: 'https://schema.org/LikeAction', userInteractionCount: post.likes },
        { '@type': 'InteractionCounter', interactionType: 'https://schema.org/ReadAction', userInteractionCount: post.views },
      ],
    }));

    return [
      {
        '@context': 'https://schema.org',
        '@type': 'Blog',
        name: 'Jetsetters Travel Blog',
        description: 'Destination spotlights, travel planning tips, packing guides, and insider inspiration from travel experts.',
        url: `${SITE_URL}/travel-blog`,
        publisher: { '@id': `${SITE_URL}/#organization` },
        blogPost: postSchemas,
      },
      {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: 'Travel Blog & Expert Tips',
        description: 'Read destination spotlights, travel planning tips, packing guides, and insider inspiration from the Jetsetters team of travel experts.',
        url: `${SITE_URL}/travel-blog`,
        mainEntity: { '@type': 'ItemList', itemListElement: postSchemas.map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: p.url, name: p.headline })) },
      },
    ];
  }, []);

  return (
    <>
      <SeoOverride
        title="Travel Blog & Expert Tips | Jetsetters"
        description="Read destination spotlights, travel planning tips, packing guides, and insider inspiration from the Jetsetters team of travel experts."
        schema={blogSchema}
      />
      <Navbar forceScrolled={true} />
      <main className="min-h-screen bg-white">
        <Breadcrumb items={[{ name: 'Travel Blog', path: '/travel-blog' }]} />
        {/* Hero Section - Clean Airbnb Style */}
        <section className="border-b border-gray-200 bg-white py-16">
          <div className="container mx-auto px-4 max-w-7xl">
            <h1 className="text-5xl md:text-6xl font-semibold text-neutral-700 mb-4">Travel Blog</h1>
            <p className="text-lg text-neutral-600 max-w-2xl">
              Inspiring stories, expert tips, and insider knowledge to help you plan your next adventure.
            </p>
          </div>
        </section>

        <div className="container mx-auto px-4 max-w-7xl py-12">
          {/* Search and Filter Section */}
          <section className="mb-12">
            <div className="flex flex-col lg:flex-row gap-6 items-start justify-between">
              {/* Search Bar */}
              <div className="relative flex-1 max-w-md w-full">
                <FaSearch className="absolute left-4 top-1/2 transform -translate-y-1/2 text-neutral-400" />
                <input
                  type="text"
                  placeholder="Search articles..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-1 focus:ring-primary-500 focus:border-primary-500 transition-shadow"
                />
              </div>

              {/* Category Filter */}
              <div className="flex flex-wrap gap-3">
                {categories.map((category) => (
                  <button
                    key={category.id}
                    onClick={() => setSelectedCategory(category.id)}
                    className={`px-5 py-2.5 rounded-full text-sm font-medium transition-all duration-200 ${selectedCategory === category.id
                        ? 'bg-neutral-700 text-white'
                        : 'bg-white text-neutral-700 hover:bg-gray-50 border border-gray-300'
                      }`}
                  >
                    {category.name}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* Featured Post */}
          {featuredPost && (
            <section className="mb-16">
              <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow duration-300">
                <div className="lg:flex">
                  <div className="lg:w-1/2">
                    <img
                      src={featuredPost.image}
                      alt={featuredPost.title}
                      className="w-full h-72 lg:h-full object-cover" loading="lazy" decoding="async" />
                  </div>
                  <div className="lg:w-1/2 p-8 lg:p-10">
                    <div className="flex items-center gap-3 mb-4">
                      <span className="text-xs text-primary-500 font-medium uppercase tracking-wide">
                        {featuredPost.category}
                      </span>
                      <span className="w-1.5 h-1.5 rounded-full bg-gray-300"></span>
                      <span className="text-xs text-gray-500">Featured</span>
                    </div>
                    <h3 className="text-3xl font-semibold text-neutral-700 mb-4 leading-tight">{featuredPost.title}</h3>
                    <p className="text-neutral-600 mb-6 leading-relaxed">{featuredPost.excerpt}</p>

                    <div className="flex items-center gap-6 mb-8 text-sm text-neutral-500">
                      <div className="flex items-center gap-2">
                        <FaUser className="text-xs" />
                        <span>{featuredPost.author}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <FaClock className="text-xs" />
                        <span>{featuredPost.readTime}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <Link
                        to="/resources"
                        className="bg-neutral-700 text-white px-6 py-3 rounded-xl hover:bg-neutral-800 transition-colors font-medium"
                      >
                        Explore Travel Guides
                      </Link>
                      <button className="p-3 text-neutral-400 hover:text-primary-500 transition-colors">
                        <FaHeart />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Blog Posts Grid */}
          <section className="mb-20">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {filteredPosts.filter(post => !post.featured).map((post) => (
                <article key={post.id} className="group bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg transition-all duration-300">
                  {/* Post Image */}
                  <div className="relative h-56 overflow-hidden">
                    <img
                      src={post.image}
                      alt={post.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" decoding="async" />
                  </div>

                  {/* Post Content */}
                  <div className="p-6">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-xs text-primary-500 font-medium uppercase tracking-wide">
                        {post.category}
                      </span>
                    </div>
                    <h3 className="text-xl font-semibold text-neutral-700 mb-3 line-clamp-2 leading-snug">{post.title}</h3>
                    <p className="text-neutral-600 mb-4 line-clamp-3 text-sm leading-relaxed">{post.excerpt}</p>

                    {/* Meta Information */}
                    <div className="flex items-center gap-4 text-xs text-neutral-500 mb-4 pb-4 border-b border-gray-100">
                      <div className="flex items-center gap-1.5">
                        <FaUser className="text-[10px]" />
                        <span>{post.author}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <FaClock className="text-[10px]" />
                        <span>{post.readTime}</span>
                      </div>
                    </div>

                    {/* Action Button */}
                    <Link
                      to="/resources"
                      className="inline-flex items-center text-sm font-medium text-neutral-700 hover:text-primary-500 transition-colors"
                    >
                      Read more
                      <svg className="ml-1 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          </section>

          {/* Explore More */}
          <section className="mb-16">
            <h2 className="text-2xl font-semibold text-neutral-700 mb-6">Plan Your Next Adventure</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              <Link to="/flights" className="flex flex-col items-center gap-2 p-5 rounded-xl border border-gray-200 hover:shadow-md transition-all text-center group">
                <FaPlane className="text-2xl text-neutral-400 group-hover:text-primary-500 transition-colors" />
                <span className="text-sm font-medium text-neutral-700">Search Flights</span>
              </Link>
              <Link to="/hotels" className="flex flex-col items-center gap-2 p-5 rounded-xl border border-gray-200 hover:shadow-md transition-all text-center group">
                <FaHotel className="text-2xl text-neutral-400 group-hover:text-primary-500 transition-colors" />
                <span className="text-sm font-medium text-neutral-700">Find Hotels</span>
              </Link>
              <Link to="/cruise" className="flex flex-col items-center gap-2 p-5 rounded-xl border border-gray-200 hover:shadow-md transition-all text-center group">
                <FaShip className="text-2xl text-neutral-400 group-hover:text-primary-500 transition-colors" />
                <span className="text-sm font-medium text-neutral-700">Cruise Deals</span>
              </Link>
              <Link to="/packages" className="flex flex-col items-center gap-2 p-5 rounded-xl border border-gray-200 hover:shadow-md transition-all text-center group">
                <FaSuitcase className="text-2xl text-neutral-400 group-hover:text-primary-500 transition-colors" />
                <span className="text-sm font-medium text-neutral-700">Vacation Packages</span>
              </Link>
              <Link to="/destinations" className="flex flex-col items-center gap-2 p-5 rounded-xl border border-gray-200 hover:shadow-md transition-all text-center group">
                <FaMapMarkerAlt className="text-2xl text-neutral-400 group-hover:text-primary-500 transition-colors" />
                <span className="text-sm font-medium text-neutral-700">Destinations</span>
              </Link>
            </div>
          </section>

          {/* Newsletter Signup */}
          <section className="bg-gray-50 border border-gray-200 rounded-2xl p-12 text-center">
            <h2 className="text-3xl font-semibold text-neutral-700 mb-3">Stay Inspired</h2>
            <p className="text-lg text-neutral-600 mb-8 max-w-2xl mx-auto">
              Get travel stories and tips delivered to your inbox every week.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center max-w-md mx-auto">
              <input
                type="email"
                placeholder="Email address"
                className="flex-1 px-5 py-3.5 rounded-xl border border-gray-300 text-neutral-700 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
              <button className="bg-primary-500 text-white px-7 py-3.5 rounded-xl font-medium hover:bg-primary-600 transition-colors">
                Subscribe
              </button>
            </div>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
};

export default TravelBlog; 