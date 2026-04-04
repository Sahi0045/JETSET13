import React, { useState, useEffect } from 'react';
import './DocumentCenter.css';

const DocumentCenter = ({ 
  apiEndpoint = '/api/documents',
  categories = ['all', 'templates', 'guides', 'videos', 'forms']
}) => {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState('grid');

  useEffect(() => {
    fetchDocuments();
  }, [activeCategory]);

  const fetchDocuments = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('adminToken') || localStorage.getItem('token') || localStorage.getItem('supabase_token');
      
      const url = activeCategory === 'all' 
        ? `${apiEndpoint}?action=list`
        : `${apiEndpoint}?action=list&category=${activeCategory}`;
      
      const response = await fetch(url, {
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
          'Content-Type': 'application/json'
        }
      });
      
      const data = await response.json();
      if (data.success) {
        setDocuments(data.data || getMockDocuments());
      } else {
        setDocuments(getMockDocuments());
      }
    } catch (err) {
      setDocuments(getMockDocuments());
    } finally {
      setLoading(false);
    }
  };

  const getMockDocuments = () => {
    return [
      { id: 1, title: 'Flight Booking Form', category: 'templates', type: 'pdf', size: '245 KB', downloads: 1240 },
      { id: 2, title: 'Hotel Reservation Template', category: 'templates', type: 'pdf', size: '180 KB', downloads: 980 },
      { id: 3, title: 'Travel Insurance Claim Form', category: 'forms', type: 'pdf', size: '320 KB', downloads: 756 },
      { id: 4, title: 'Visa Application Guide', category: 'guides', type: 'pdf', size: '1.2 MB', downloads: 2100 },
      { id: 5, title: 'How to Book a Flight', category: 'videos', type: 'video', duration: '5:30', views: 5600 },
      { id: 6, title: 'Hotel Search Tutorial', category: 'videos', type: 'video', duration: '4:15', views: 3200 },
      { id: 7, title: 'Package Booking Steps', category: 'guides', type: 'pdf', size: '890 KB', downloads: 1450 },
      { id: 8, title: 'Payment Methods Guide', category: 'guides', type: 'pdf', size: '456 KB', downloads: 890 }
    ];
  };

  const filteredDocuments = documents.filter(doc => 
    doc.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getFileIcon = (type) => {
    switch (type) {
      case 'pdf': return 'picture_as_pdf';
      case 'video': return 'play_circle';
      case 'doc': return 'description';
      default: return 'insert_drive_file';
    }
  };

  const handleDownload = (doc) => {
    if (doc.type === 'video') {
      window.open(doc.url || '#', '_blank');
    } else {
      const link = document.createElement('a');
      link.href = doc.url || '#';
      link.download = doc.title;
      link.click();
    }
  };

  return (
    <div className="document-center">
      <div className="document-header">
        <div className="header-content">
          <h2>Document Center</h2>
          <p>Access templates, guides, and video tutorials</p>
        </div>
        
        <div className="header-controls">
          <div className="search-box">
            <span className="material-symbols-outlined">search</span>
            <input
              type="text"
              placeholder="Search documents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          
          <div className="view-toggle">
            <button 
              className={viewMode === 'grid' ? 'active' : ''} 
              onClick={() => setViewMode('grid')}
            >
              <span className="material-symbols-outlined">grid_view</span>
            </button>
            <button 
              className={viewMode === 'list' ? 'active' : ''} 
              onClick={() => setViewMode('list')}
            >
              <span className="material-symbols-outlined">view_list</span>
            </button>
          </div>
        </div>
      </div>

      <div className="category-tabs">
        {categories.map(cat => (
          <button
            key={cat}
            className={`category-tab ${activeCategory === cat ? 'active' : ''}`}
            onClick={() => setActiveCategory(cat)}
          >
            {cat.charAt(0).toUpperCase() + cat.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading documents...</p>
        </div>
      ) : filteredDocuments.length === 0 ? (
        <div className="empty-state">
          <span className="material-symbols-outlined">folder_open</span>
          <p>No documents found</p>
        </div>
      ) : (
        <div className={`document-${viewMode}`}>
          {filteredDocuments.map(doc => (
            <div key={doc.id} className="document-card">
              <div className="document-icon">
                <span className="material-symbols-outlined">{getFileIcon(doc.type)}</span>
              </div>
              <div className="document-info">
                <h4>{doc.title}</h4>
                <div className="document-meta">
                  <span className="doc-type">{doc.type.toUpperCase()}</span>
                  {doc.type === 'video' ? (
                    <span className="doc-duration">{doc.duration}</span>
                  ) : (
                    <span className="doc-size">{doc.size}</span>
                  )}
                </div>
                <div className="document-stats">
                  {doc.type === 'video' ? (
                    <span><span className="material-symbols-outlined">visibility</span> {doc.views?.toLocaleString()}</span>
                  ) : (
                    <span><span className="material-symbols-outlined">download</span> {doc.downloads?.toLocaleString()}</span>
                  )}
                </div>
              </div>
              <button 
                className="download-btn"
                onClick={() => handleDownload(doc)}
              >
                {doc.type === 'video' ? (
                  <span className="material-symbols-outlined">play_arrow</span>
                ) : (
                  <span className="material-symbols-outlined">download</span>
                )}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default DocumentCenter;