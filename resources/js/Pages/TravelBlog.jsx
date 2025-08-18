import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { FaCalendarAlt, FaUser, FaClock, FaTags, FaSearch, FaFilter, FaHeart, FaShare, FaBookmark } from 'react-icons/fa';
import Navbar from './Common/Navbar';
import Footer from './Common/Footer';

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
      image: "https://images.unsplash.com/photo-1502602898536-47ad22581b52?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2070&q=80",
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

  return (
    <>
      <Navbar forceScrolled={true} />
      <div className="min-h-screen bg-gray-50">
        {/* Hero Section */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-700 text-white py-20">
          <div className="container mx-auto px-4 text-center">
            <h1 className="text-5xl font-bold mb-6">Travel Blog</h1>
            <p className="text-xl max-w-3xl mx-auto">
              Discover inspiring travel stories, expert tips, and insider knowledge from our team of travel enthusiasts. 
              Get inspired for your next adventure with Jetsetterss.
            </p>
          </div>
        </div>

        <div className="container mx-auto px-4 py-16">
          {/* Search and Filter Section */}
          <section className="mb-12">
            <div className="flex flex-col lg:flex-row gap-6 items-center justify-between">
              {/* Search Bar */}
              <div className="relative flex-1 max-w-md">
                <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search articles, destinations, tips..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Category Filter */}
              <div className="flex flex-wrap gap-2">
                {categories.map((category) => (
                  <button
                    key={category.id}
                    onClick={() => setSelectedCategory(category.id)}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
                      selectedCategory === category.id
                        ? 'bg-blue-600 text-white shadow-lg'
                        : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
                    }`}
                  >
                    {category.name} ({category.count})
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* Featured Post */}
          {featuredPost && (
            <section className="mb-16">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Featured Article</h2>
              <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
                <div className="lg:flex">
                  <div className="lg:w-1/2">
                    <img 
                      src={featuredPost.image} 
                      alt={featuredPost.title}
                      className="w-full h-64 lg:h-full object-cover"
                    />
                  </div>
                  <div className="lg:w-1/2 p-8">
                    <div className="flex items-center gap-4 mb-4">
                      <span className="bg-blue-100 text-blue-800 text-xs px-3 py-1 rounded-full font-medium">
                        {featuredPost.category}
                      </span>
                      <span className="text-sm text-gray-500">Featured</span>
                    </div>
                    <h3 className="text-2xl font-bold text-gray-900 mb-4">{featuredPost.title}</h3>
                    <p className="text-gray-600 mb-6">{featuredPost.excerpt}</p>
                    
                    <div className="flex items-center gap-6 mb-6 text-sm text-gray-500">
                      <div className="flex items-center gap-2">
                        <FaUser />
                        <span>{featuredPost.author}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <FaCalendarAlt />
                        <span>{new Date(featuredPost.publishDate).toLocaleDateString()}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <FaClock />
                        <span>{featuredPost.readTime}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <Link 
                        to={`/blog/${featuredPost.id}`}
                        className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium"
                      >
                        Read Full Article
                      </Link>
                      <button className="p-3 text-gray-400 hover:text-red-500 transition-colors">
                        <FaHeart />
                      </button>
                      <button className="p-3 text-gray-400 hover:text-blue-500 transition-colors">
                        <FaShare />
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
                <article key={post.id} className="bg-white rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition-shadow duration-300">
                  {/* Post Image */}
                  <div className="relative h-48 overflow-hidden">
                    <img 
                      src={post.image} 
                      alt={post.title}
                      className="w-full h-full object-cover hover:scale-110 transition-transform duration-300"
                    />
                    <div className="absolute top-4 left-4">
                      <span className="bg-blue-600 text-white text-xs px-3 py-1 rounded-full font-medium">
                        {post.category}
                      </span>
                    </div>
                  </div>

                  {/* Post Content */}
                  <div className="p-6">
                    <h3 className="text-xl font-bold text-gray-900 mb-3 line-clamp-2">{post.title}</h3>
                    <p className="text-gray-600 mb-4 line-clamp-3">{post.excerpt}</p>

                    {/* Tags */}
                    <div className="flex flex-wrap gap-2 mb-4">
                      {post.tags.slice(0, 3).map((tag, index) => (
                        <span 
                          key={index}
                          className="bg-gray-100 text-gray-700 text-xs px-2 py-1 rounded-full"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>

                    {/* Meta Information */}
                    <div className="flex items-center justify-between text-sm text-gray-500 mb-4">
                      <div className="flex items-center gap-2">
                        <FaUser />
                        <span>{post.author}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <FaClock />
                        <span>{post.readTime}</span>
                      </div>
                    </div>

                    {/* Engagement Stats */}
                    <div className="flex items-center justify-between text-sm text-gray-500 mb-4">
                      <div className="flex items-center gap-4">
                        <span>{post.likes} likes</span>
                        <span>{post.views} views</span>
                      </div>
                      <span>{new Date(post.publishDate).toLocaleDateString()}</span>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2">
                      <Link 
                        to={`/blog/${post.id}`}
                        className="flex-1 bg-blue-600 text-white text-center py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors font-medium"
                      >
                        Read More
                      </Link>
                      <button className="p-2 text-gray-400 hover:text-red-500 transition-colors">
                        <FaHeart />
                      </button>
                      <button className="p-2 text-gray-400 hover:text-blue-500 transition-colors">
                        <FaBookmark />
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>

          {/* Newsletter Signup */}
          <section className="bg-gradient-to-r from-blue-600 to-purple-700 rounded-2xl p-12 text-center text-white">
            <h2 className="text-3xl font-bold mb-4">Stay Updated with Travel Inspiration</h2>
            <p className="text-xl mb-8 max-w-2xl mx-auto">
              Get the latest travel stories, tips, and destination guides delivered to your inbox every week.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center max-w-md mx-auto">
              <input
                type="email"
                placeholder="Enter your email"
                className="flex-1 px-4 py-3 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-white"
              />
              <button className="bg-white text-blue-600 px-6 py-3 rounded-lg font-semibold hover:bg-gray-100 transition-colors">
                Subscribe
              </button>
            </div>
          </section>
        </div>
      </div>
      <Footer />
    </>
  );
};

export default TravelBlog; 