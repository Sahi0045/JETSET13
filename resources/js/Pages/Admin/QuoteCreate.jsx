import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import './AdminPanel.css';

const QuoteCreate = () => {
  const { inquiryId } = useParams();
  const navigate = useNavigate();
  const [inquiry, setInquiry] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [quoteData, setQuoteData] = useState({
    title: '',
    description: '',
    total_amount: '',
    currency: 'USD',
    validity_days: 30,
    terms_conditions: '',
    breakdown: [],
    notes: ''
  });
  const [breakdownItem, setBreakdownItem] = useState({
    item: '',
    description: '',
    quantity: 1,
    unit_price: '',
    amount: ''
  });
  const [activeSection, setActiveSection] = useState('basic');
  const [errors, setErrors] = useState({});

  useEffect(() => {
    fetchInquiryDetails();
  }, [inquiryId]);

  const fetchInquiryDetails = async () => {
    try {
      setLoading(true);
      
      // Get token from localStorage
      const token = localStorage.getItem('adminToken') || localStorage.getItem('token') || localStorage.getItem('supabase_token');
      
      if (!token) {
        console.error('No authentication token found');
        alert('Authentication required. Please log in again.');
        navigate('/admin/login');
        return;
      }

      const response = await fetch(`/api/inquiries?id=${inquiryId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      });

      if (!response.ok) {
        if (response.status === 404) {
          console.warn('Inquiry not found:', inquiryId);
          alert('Inquiry not found. Redirecting to inquiries list.');
          navigate('/admin/inquiries');
          return;
        }
        // Try to parse error response as JSON, fallback to text
        let errorMessage = `Failed to fetch inquiry (${response.status})`;
        try {
          const errorText = await response.text();
          try {
            const errorData = JSON.parse(errorText);
            errorMessage = errorData.message || errorData.error || errorMessage;
          } catch {
            errorMessage = errorText.substring(0, 100);
          }
        } catch (e) {
          // Ignore parse errors
        }
        throw new Error(errorMessage);
      }

      const result = await response.json();

      if (result.success) {
        setInquiry(result.data);
        // Auto-generate title based on inquiry type
        const title = generateQuoteTitle(result.data);
        setQuoteData(prev => ({ ...prev, title }));
      }
    } catch (error) {
      console.error('Error fetching inquiry:', error);
      alert('Failed to load inquiry details');
    } finally {
      setLoading(false);
    }
  };

  const generateQuoteTitle = (inquiry) => {
    const typeMap = {
      flight: `Flight Package - ${inquiry.flight_origin} to ${inquiry.flight_destination}`,
      hotel: `Hotel Accommodation - ${inquiry.hotel_destination}`,
      cruise: `Cruise Experience - ${inquiry.cruise_destination}`,
      package: `Complete Vacation Package - ${inquiry.package_destination}`,
      general: `Custom Travel Solution - ${inquiry.inquiry_subject || 'Personalized Package'}`
    };
    return typeMap[inquiry.inquiry_type] || 'Professional Travel Quote';
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setQuoteData(prev => ({
      ...prev,
      [name]: value
    }));
    // Clear error for this field
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const handleBreakdownItemChange = (e) => {
    const { name, value } = e.target;
    const updatedItem = { ...breakdownItem, [name]: value };

    // Auto-calculate amount if quantity and unit_price are provided
    if (name === 'quantity' || name === 'unit_price') {
      const quantity = name === 'quantity' ? parseFloat(value) || 0 : parseFloat(breakdownItem.quantity) || 0;
      const unitPrice = name === 'unit_price' ? parseFloat(value) || 0 : parseFloat(breakdownItem.unit_price) || 0;
      updatedItem.amount = (quantity * unitPrice).toFixed(2);
    }

    setBreakdownItem(updatedItem);
  };

  const addBreakdownItem = () => {
    if (!breakdownItem.item.trim() || !breakdownItem.amount) {
      setErrors({ breakdown: 'Please fill in item name and amount' });
      return;
    }

    setQuoteData(prev => ({
      ...prev,
      breakdown: [...prev.breakdown, {
        ...breakdownItem,
        id: Date.now() // Add unique ID for each item
      }]
    }));
    setBreakdownItem({
      item: '',
      description: '',
      quantity: 1,
      unit_price: '',
      amount: ''
    });
    setErrors(prev => ({ ...prev, breakdown: '' }));
  };

  const removeBreakdownItem = (index) => {
    setQuoteData(prev => ({
      ...prev,
      breakdown: prev.breakdown.filter((_, i) => i !== index)
    }));
  };

  const updateBreakdownItem = (index, field, value) => {
    setQuoteData(prev => ({
      ...prev,
      breakdown: prev.breakdown.map((item, i) => {
        if (i === index) {
          const updatedItem = { ...item, [field]: value };
          // Recalculate amount if quantity or unit_price changed
          if (field === 'quantity' || field === 'unit_price') {
            const quantity = field === 'quantity' ? parseFloat(value) || 0 : parseFloat(item.quantity) || 0;
            const unitPrice = field === 'unit_price' ? parseFloat(value) || 0 : parseFloat(item.unit_price) || 0;
            updatedItem.amount = (quantity * unitPrice).toFixed(2);
          }
          return updatedItem;
        }
        return item;
      })
    }));
  };

  const calculateTotal = () => {
    const total = quoteData.breakdown.reduce((sum, item) => {
      return sum + (parseFloat(item.amount) || 0);
    }, 0);
    setQuoteData(prev => ({ ...prev, total_amount: total.toFixed(2) }));
  };

  const validateForm = () => {
    const newErrors = {};
    let focusSection = null;

    // Title validation
    if (!quoteData.title.trim()) {
      newErrors.title = 'Quote title is required';
      if (!focusSection) focusSection = 'basic';
    }

    // Breakdown validation
    if (quoteData.breakdown.length === 0) {
      newErrors.breakdown = 'At least one cost breakdown item is required';
      if (!focusSection) focusSection = 'breakdown';
    }

    // Total amount: auto-calc from breakdown if missing/invalid
    const parsedTotal = parseFloat(quoteData.total_amount);
    if (!parsedTotal || parsedTotal <= 0) {
      const computed = quoteData.breakdown.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
      if (computed > 0) {
        setQuoteData(prev => ({ ...prev, total_amount: computed.toFixed(2) }));
      } else {
        newErrors.total_amount = 'Valid total amount is required';
        if (!focusSection) focusSection = 'basic';
      }
    }

    setErrors(newErrors);
    if (focusSection) setActiveSection(focusSection);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) return;

    setSubmitting(true);

    try {
      // Get token from localStorage
      const token = localStorage.getItem('adminToken') || localStorage.getItem('token') || localStorage.getItem('supabase_token');
      
      if (!token) {
        alert('Authentication required. Please log in again.');
        return;
      }

      const response = await fetch('/api/quotes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include',
        body: JSON.stringify({
          ...quoteData,
          inquiry_id: inquiryId,
          breakdown: JSON.stringify(quoteData.breakdown)
        })
      });

      const result = await response.json();

      if (result.success) {
        alert('Quote created successfully!');
        navigate(`/admin/inquiries/${inquiryId}`);
      } else {
        alert('Failed to create quote: ' + result.message);
      }
    } catch (error) {
      console.error('Error creating quote:', error);
      alert('Error creating quote');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendQuote = async () => {
    if (!validateForm()) return;

    setSubmitting(true);

    try {
      // Get token from localStorage
      const token = localStorage.getItem('adminToken') || localStorage.getItem('token') || localStorage.getItem('supabase_token');
      
      if (!token) {
        alert('Authentication required. Please log in again.');
        return;
      }

      // Create quote
      const createResponse = await fetch('/api/quotes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include',
        body: JSON.stringify({
          ...quoteData,
          inquiry_id: inquiryId,
          breakdown: JSON.stringify(quoteData.breakdown)
        })
      });

      const createResult = await createResponse.json();

      if (!createResult.success) {
        throw new Error(createResult.message);
      }

      // Send quote
      const sendResponse = await fetch(`/api/quotes/${createResult.data.id}/send`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include'
      });

      const sendResult = await sendResponse.json();

      if (sendResult.success) {
        alert('Quote created and sent to customer!');
        navigate(`/admin/inquiries/${inquiryId}`);
      } else {
        alert('Quote created but failed to send: ' + sendResult.message);
        navigate(`/admin/inquiries/${inquiryId}`);
      }
    } catch (error) {
      console.error('Error creating/sending quote:', error);
      alert('Error: ' + error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: quoteData.currency,
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const getInquiryTypeIcon = (type) => {
    switch (type) {
      case 'flight': return '✈️';
      case 'hotel': return '🏨';
      case 'cruise': return '🚢';
      case 'package': return '🎒';
      default: return '💬';
    }
  };

  if (loading) {
    return (
      <div className="quote-create">
        <div className="page-loading">
          <div className="loading-spinner-large">
            <div className="spinner-ring"></div>
            <div className="spinner-ring"></div>
            <div className="spinner-ring"></div>
          </div>
          <h3>Loading Inquiry Details...</h3>
          <p>Preparing quote creation form</p>
        </div>
      </div>
    );
  }

  if (!inquiry) {
    return (
      <div className="quote-create">
        <div className="error-state">
          <div className="error-icon">❌</div>
          <h3>Inquiry Not Found</h3>
          <p>The inquiry you're trying to quote for doesn't exist.</p>
          <Link to="/admin/inquiries" className="error-action">
            Back to Inquiries
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="quote-create">
      {/* Page Header */}
      <div className="page-header">
        <div className="header-content">
          <div className="inquiry-info">
            <h1>Create Professional Quote</h1>
            <div className="inquiry-details">
              <div className="inquiry-meta">
                <span className="inquiry-type-badge">
                  <span className="type-icon">{getInquiryTypeIcon(inquiry.inquiry_type)}</span>
                  <span>{inquiry.inquiry_type}</span>
                </span>
                <span className="inquiry-customer">{inquiry.customer_name}</span>
                <span className="inquiry-id">#{inquiry.id}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="header-actions">
          <button
            onClick={() => setShowPreview(!showPreview)}
            className="action-button secondary"
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/>
              <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd"/>
            </svg>
            {showPreview ? 'Hide Preview' : 'Show Preview'}
          </button>
          <Link to={`/admin/inquiries/${inquiryId}`} className="action-button secondary">
            <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd"/>
            </svg>
            Back to Inquiry
          </Link>
        </div>
      </div>

      <div className="quote-create-content">
        {/* Form Sections Navigation */}
        <div className="form-navigation">
          <button
            className={`nav-item ${activeSection === 'basic' ? 'active' : ''}`}
            onClick={() => setActiveSection('basic')}
          >
            <span className="nav-icon">📝</span>
            <span>Basic Info</span>
          </button>
          <button
            className={`nav-item ${activeSection === 'breakdown' ? 'active' : ''}`}
            onClick={() => setActiveSection('breakdown')}
          >
            <span className="nav-icon">💰</span>
            <span>Cost Breakdown</span>
            {quoteData.breakdown.length > 0 && (
              <span className="nav-badge">{quoteData.breakdown.length}</span>
            )}
          </button>
          <button
            className={`nav-item ${activeSection === 'terms' ? 'active' : ''}`}
            onClick={() => setActiveSection('terms')}
          >
            <span className="nav-icon">📋</span>
            <span>Terms & Notes</span>
          </button>
        </div>

        {/* Form Content */}
        <div className="form-container">
          <form onSubmit={handleSubmit} className="quote-form">
            {/* Basic Information Section */}
            {activeSection === 'basic' && (
              <div className="form-section active">
                <div className="section-header">
                  <h3>Basic Quote Information</h3>
                  <p>Provide the essential details for this professional quote</p>
                </div>

                <div className="form-grid">
                  <div className="form-field full-width">
                    <label>Quote Title *</label>
                    <input
                      type="text"
                      name="title"
                      value={quoteData.title}
                      onChange={handleChange}
                      placeholder="e.g., Premium Paris Vacation Package"
                      className={errors.title ? 'error' : ''}
                    />
                    {errors.title && <span className="field-error">{errors.title}</span>}
                  </div>

                  <div className="form-field full-width">
                    <label>Description</label>
                    <textarea
                      name="description"
                      value={quoteData.description}
                      onChange={handleChange}
                      placeholder="Detailed description of what's included in this quote..."
                      rows="4"
                    />
                  </div>

                  <div className="form-field">
                    <label>Total Amount *</label>
                    <div className="currency-input">
                      <select
                        name="currency"
                        value={quoteData.currency}
                        onChange={handleChange}
                        className="currency-select"
                      >
                        <option value="USD">USD ($)</option>
                        <option value="EUR">EUR (€)</option>
                        <option value="GBP">GBP (£)</option>
                        <option value="INR">INR (₹)</option>
                      </select>
                      <input
                        type="number"
                        name="total_amount"
                        value={quoteData.total_amount}
                        onChange={handleChange}
                        placeholder="0.00"
                        step="0.01"
                        min="0"
                        className={errors.total_amount ? 'error' : ''}
                      />
                    </div>
                    {errors.total_amount && <span className="field-error">{errors.total_amount}</span>}
                  </div>

                  <div className="form-field">
                    <label>Validity Period</label>
                    <select
                      name="validity_days"
                      value={quoteData.validity_days}
                      onChange={handleChange}
                    >
                      <option value="7">7 days</option>
                      <option value="14">14 days</option>
                      <option value="30">30 days</option>
                      <option value="60">60 days</option>
                      <option value="90">90 days</option>
                    </select>
                  </div>
                </div>

                <div className="section-actions">
                  <button
                    type="button"
                    onClick={() => setActiveSection('breakdown')}
                    className="next-section-btn"
                  >
                    Continue to Cost Breakdown →
                  </button>
                </div>
              </div>
            )}

            {/* Cost Breakdown Section */}
            {activeSection === 'breakdown' && (
              <div className="form-section active">
                <div className="section-header">
                  <h3>Cost Breakdown</h3>
                  <p>Itemized costs for transparency and professionalism</p>
                </div>

                {errors.breakdown && (
                  <div className="error-message">
                    <span className="error-icon">⚠️</span>
                    {errors.breakdown}
                  </div>
                )}

                {/* Add Item Form */}
                <div className="add-item-form">
                  <h4>Add Cost Item</h4>
                  <div className="item-input-grid">
                    <div className="form-field">
                      <label>Item Name *</label>
                      <input
                        type="text"
                        name="item"
                        value={breakdownItem.item}
                        onChange={handleBreakdownItemChange}
                        placeholder="e.g., Flight Tickets, Hotel Accommodation"
                      />
                    </div>

                    <div className="form-field">
                      <label>Description</label>
                      <input
                        type="text"
                        name="description"
                        value={breakdownItem.description}
                        onChange={handleBreakdownItemChange}
                        placeholder="Optional details"
                      />
                    </div>

                    <div className="form-field">
                      <label>Quantity</label>
                      <input
                        type="number"
                        name="quantity"
                        value={breakdownItem.quantity}
                        onChange={handleBreakdownItemChange}
                        min="1"
                        step="1"
                      />
                    </div>

                    <div className="form-field">
                      <label>Unit Price ({quoteData.currency})</label>
                      <input
                        type="number"
                        name="unit_price"
                        value={breakdownItem.unit_price}
                        onChange={handleBreakdownItemChange}
                        placeholder="0.00"
                        step="0.01"
                        min="0"
                      />
                    </div>

                    <div className="form-field">
                      <label>Total Amount</label>
                      <input
                        type="number"
                        name="amount"
                        value={breakdownItem.amount}
                        readOnly
                        placeholder="Auto-calculated"
                      />
                    </div>

                    <div className="form-field">
                      <label>&nbsp;</label>
                      <button
                        type="button"
                        onClick={addBreakdownItem}
                        className="add-item-button"
                      >
                        <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd"/>
                        </svg>
                        Add Item
                      </button>
                    </div>
                  </div>
                </div>

                {/* Breakdown List */}
                {quoteData.breakdown.length > 0 && (
                  <div className="breakdown-list">
                    <div className="breakdown-header">
                      <h4>Cost Breakdown Items</h4>
                      <button
                        type="button"
                        onClick={calculateTotal}
                        className="calculate-total-btn"
                      >
                        <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd"/>
                        </svg>
                        Calculate Total
                      </button>
                    </div>

                    <div className="breakdown-items">
                      {quoteData.breakdown.map((item, index) => (
                        <div key={item.id || index} className="breakdown-item">
                          <div className="item-details">
                            <div className="item-name">{item.item}</div>
                            {item.description && (
                              <div className="item-description">{item.description}</div>
                            )}
                            <div className="item-quantity-price">
                              {item.quantity > 1 && (
                                <span>{item.quantity} × {formatCurrency(item.unit_price || item.amount)}</span>
                              )}
                            </div>
                          </div>
                          <div className="item-amount">
                            {formatCurrency(item.amount)}
                          </div>
                          <button
                            type="button"
                            onClick={() => removeBreakdownItem(index)}
                            className="remove-item-btn"
                          >
                            <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/>
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>

                    <div className="breakdown-summary">
                      <div className="summary-row">
                        <span className="summary-label">Total Items:</span>
                        <span className="summary-value">{quoteData.breakdown.length}</span>
                      </div>
                      <div className="summary-row total">
                        <span className="summary-label">Grand Total:</span>
                        <span className="summary-value">{formatCurrency(quoteData.total_amount || 0)}</span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="section-actions">
                  <button
                    type="button"
                    onClick={() => setActiveSection('basic')}
                    className="prev-section-btn"
                  >
                    ← Back to Basic Info
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveSection('terms')}
                    className="next-section-btn"
                  >
                    Continue to Terms →
                  </button>
                </div>
              </div>
            )}

            {/* Terms & Conditions Section */}
            {activeSection === 'terms' && (
              <div className="form-section active">
                <div className="section-header">
                  <h3>Terms & Conditions</h3>
                  <p>Set the terms, conditions, and any additional notes for this quote</p>
                </div>

                <div className="form-field full-width">
                  <label>Terms & Conditions</label>
                  <textarea
                    name="terms_conditions"
                    value={quoteData.terms_conditions}
                    onChange={handleChange}
                    placeholder="Enter the terms and conditions for this quote. Include payment terms, cancellation policies, validity period, etc."
                    rows="8"
                  />
                </div>

                <div className="form-field full-width">
                  <label>Additional Notes</label>
                  <textarea
                    name="notes"
                    value={quoteData.notes}
                    onChange={handleChange}
                    placeholder="Any additional notes or special considerations for this quote..."
                    rows="4"
                  />
                </div>

                <div className="section-actions">
                  <button
                    type="button"
                    onClick={() => setActiveSection('breakdown')}
                    className="prev-section-btn"
                  >
                    ← Back to Cost Breakdown
                  </button>
                </div>
              </div>
            )}
          </form>

          {/* Quote Preview */}
          {showPreview && (
            <div className="quote-preview">
              <div className="preview-header">
                <h3>Quote Preview</h3>
                <button
                  onClick={() => setShowPreview(false)}
                  className="close-preview-btn"
                >
                  ✕
                </button>
              </div>

              <div className="preview-content">
                <div className="preview-quote">
                  <div className="preview-title">{quoteData.title || 'Quote Title'}</div>
                  <div className="preview-customer">
                    <strong>For:</strong> {inquiry.customer_name}
                  </div>
                  <div className="preview-amount">
                    <strong>Total:</strong> {formatCurrency(quoteData.total_amount || 0)}
                  </div>
                  {quoteData.description && (
                    <div className="preview-description">{quoteData.description}</div>
                  )}

                  {quoteData.breakdown.length > 0 && (
                    <div className="preview-breakdown">
                      <h5>Cost Breakdown:</h5>
                      {quoteData.breakdown.map((item, index) => (
                        <div key={index} className="preview-item">
                          <span>{item.item}</span>
                          <span>{formatCurrency(item.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Form Actions */}
      <div className="form-footer-actions">
        <div className="action-info">
          {quoteData.breakdown.length > 0 && (
            <span className="total-display">
              Total: {formatCurrency(quoteData.total_amount || 0)}
            </span>
          )}
        </div>

        <div className="action-buttons">
          <button
            type="button"
            onClick={handleSubmit}
            className="action-btn save-draft"
            disabled={submitting}
          >
            {submitting ? (
              <>
                <div className="spinner small"></div>
                Saving...
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M7.707 10.293a1 1 0 10-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 101.414-1.414L11 11.586V6a1 1 0 10-2 0v5.586l-2.293-2.293z"/>
                  <path fillRule="evenodd" d="M4 4a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2H4zm0 2h12v8H4V6z" clipRule="evenodd"/>
                </svg>
                Save as Draft
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleSendQuote}
            className="action-btn send-quote primary"
            disabled={submitting}
          >
            {submitting ? (
              <>
                <div className="spinner small"></div>
                Sending...
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z"/>
                  <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z"/>
                </svg>
                Create & Send to Customer
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default QuoteCreate;
