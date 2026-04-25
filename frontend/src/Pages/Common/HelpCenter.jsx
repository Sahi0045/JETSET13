import React, { useState, useEffect } from 'react';
import { FileText, Video, Download, Play, Search, ExternalLink, Clock, Eye } from 'lucide-react';

const API_BASE = '/api';

const defaultCategories = [
  { id: 'visa', name: 'Visa Applications', icon: '📋' },
  { id: 'flight', name: 'Flight Booking', icon: '✈️' },
  { id: 'hotel', name: 'Hotel Booking', icon: '🏨' },
  { id: 'insurance', name: 'Travel Insurance', icon: '🛡️' },
  { id: 'general', name: 'General', icon: '📄' }
];

const defaultVideos = [
  { id: '1', title: 'How to Apply for a Visa', description: 'Step-by-step guide to completing your visa application', category: 'visa', duration: 320, thumbnail: 'https://images.unsplash.com/photo-1563013544-824ae1b704d3?w=400', views: 1250 },
  { id: '2', title: 'Booking Your First Flight', description: 'Learn how to search and book flights', category: 'flight', duration: 180, thumbnail: 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=400', views: 980 },
  { id: '3', title: 'Hotel Booking Tips', description: 'Get the best deals on hotel bookings', category: 'hotel', duration: 240, thumbnail: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=400', views: 756 },
  { id: '4', title: 'Understanding Travel Insurance', description: 'Why you need travel insurance and how to choose', category: 'insurance', duration: 290, thumbnail: 'https://images.unsplash.com/photo-1450101499163-c8848c66ca85?w=400', views: 542 },
  { id: '5', title: 'Managing Your Account', description: 'Update profile, preferences, and payment methods', category: 'general', duration: 150, thumbnail: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=400', views: 320 }
];

const defaultDocuments = [
  { id: '1', name: 'Visa Application Form Guide', description: 'Complete guide to filling out visa forms', category: 'visa', fileType: 'PDF', downloads: 2340 },
  { id: '2', name: 'Passport Requirements', description: 'What you need to know about passports', category: 'visa', fileType: 'PDF', downloads: 1890 },
  { id: '3', name: 'Flight Booking Terms', description: 'Understanding booking conditions', category: 'flight', fileType: 'PDF', downloads: 1567 },
  { id: '4', name: 'Hotel Cancellation Policy', description: 'How to cancel and get refunds', category: 'hotel', fileType: 'PDF', downloads: 1234 },
  { id: '5', name: 'Insurance Claim Form', description: 'Template for insurance claims', category: 'insurance', fileType: 'DOCX', downloads: 890 },
  { id: '6', name: 'Travel Checklist', description: 'Essential items for your trip', category: 'general', fileType: 'PDF', downloads: 3456 }
];

export default function HelpCenter() {
  const [activeTab, setActiveTab] = useState('documents');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [documents, setDocuments] = useState(defaultDocuments);
  const [videos, setVideos] = useState(defaultVideos);
  const [playingVideo, setPlayingVideo] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadContent();
  }, [selectedCategory]);

  const loadContent = async () => {
    setLoading(true);
    try {
      const docRes = await fetch(`${API_BASE}/documents?category=${selectedCategory}`);
      const vidRes = await fetch(`${API_BASE}/videos?category=${selectedCategory}`);
      
      const docData = await docRes.json();
      const vidData = await vidRes.json();
      
      if (docData.success && docData.data?.length) setDocuments(docData.data);
      if (vidData.success && vidData.data?.length) setVideos(vidData.data);
    } catch (err) {
      console.log('Using default content');
    } finally {
      setLoading(false);
    }
  };

  const filteredDocs = documents.filter(d => {
    const matchesSearch = d.name.toLowerCase().includes(searchTerm.toLowerCase()) || d.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || d.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const filteredVideos = videos.filter(v => {
    const matchesSearch = v.title.toLowerCase().includes(searchTerm.toLowerCase()) || v.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || v.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div style={{ padding: '24px', color: '#f1f5f9', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: '32px' }}>
        <h1 style={{ fontSize: '32px', fontWeight: '700', margin: '0 0 8px' }}>Help Center</h1>
        <p style={{ color: '#94a3b8', fontSize: '16px' }}>Find guides, templates, and video tutorials</p>
      </div>

      <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', justifyContent: 'center' }}>
        <button onClick={() => setActiveTab('documents')} style={{ padding: '12px 24px', background: activeTab === 'documents' ? '#3b82f6' : '#1e293b', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <FileText size={18} /> Documents
        </button>
        <button onClick={() => setActiveTab('videos')} style={{ padding: '12px 24px', background: activeTab === 'videos' ? '#3b82f6' : '#1e293b', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Video size={18} /> Video Tutorials
        </button>
      </div>

      <div style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: 12, color: '#64748b' }} />
          <input type="text" placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{ width: '100%', padding: '12px 12px 12px 40px', background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#f1f5f9' }} />
        </div>
        <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)} style={{ padding: '12px 16px', background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#f1f5f9' }}>
          <option value="all">All Categories</option>
          {defaultCategories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
        </select>
      </div>

      {activeTab === 'documents' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
          {filteredDocs.map((doc, i) => (
            <div key={i} style={{ background: '#1e293b', borderRadius: '12px', overflow: 'hidden' }}>
              <div style={{ height: '120px', background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <FileText size={48} color="white" />
              </div>
              <div style={{ padding: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <span style={{ padding: '2px 8px', background: '#3b82f6', borderRadius: '4px', fontSize: '12px' }}>{doc.fileType}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#94a3b8', fontSize: '12px' }}><Download size={12} /> {doc.downloads}</span>
                </div>
                <h3 style={{ margin: '0 0 8px', fontSize: '16px' }}>{doc.name}</h3>
                <p style={{ margin: 0, color: '#94a3b8', fontSize: '14px' }}>{doc.description}</p>
                <button style={{ width: '100%', marginTop: '16px', padding: '10px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  <Download size={16} /> Download
                </button>
              </div>
            </div>
          ))}
          {filteredDocs.length === 0 && <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '40px', color: '#64748b' }}>No documents found</div>}
        </div>
      )}

      {activeTab === 'videos' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
          {filteredVideos.map((video, i) => (
            <div key={i} style={{ background: '#1e293b', borderRadius: '12px', overflow: 'hidden' }}>
              <div style={{ position: 'relative', height: '180px', background: `url(${video.thumbnail}) center/cover` }}>
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <button onClick={() => setPlayingVideo(video)} style={{ width: '60px', height: '60px', borderRadius: '50%', background: '#3b82f6', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Play size={24} color="white" />
                  </button>
                </div>
                <div style={{ position: 'absolute', bottom: '8px', right: '8px', background: 'rgba(0,0,0,0.8)', padding: '4px 8px', borderRadius: '4px', fontSize: '12px' }}>{formatDuration(video.duration)}</div>
              </div>
              <div style={{ padding: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <span style={{ padding: '2px 8px', background: '#3b82f6', borderRadius: '4px', fontSize: '12px' }}>{video.category}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#94a3b8', fontSize: '12px' }}><Eye size={12} /> {video.views}</span>
                </div>
                <h3 style={{ margin: '0 0 8px', fontSize: '16px' }}>{video.title}</h3>
                <p style={{ margin: 0, color: '#94a3b8', fontSize: '14px' }}>{video.description}</p>
              </div>
            </div>
          ))}
          {filteredVideos.length === 0 && <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '40px', color: '#64748b' }}>No videos found</div>}
        </div>
      )}

      {playingVideo && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setPlayingVideo(null)}>
          <div style={{ background: '#1e293b', padding: '24px', borderRadius: '12px', maxWidth: '800px', width: '90%' }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 16px' }}>{playingVideo.title}</h2>
            <div style={{ aspectRatio: '16/9', background: '#000', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <p style={{ color: '#64748b' }}>Video player - configure your video service</p>
            </div>
            <p style={{ marginTop: '16px', color: '#94a3b8' }}>{playingVideo.description}</p>
            <button onClick={() => setPlayingVideo(null)} style={{ marginTop: '16px', padding: '10px 20px', background: '#dc2626', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}