import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import './AdminPanel.css';

const QuoteCreate = () => {
  const { inquiryId } = useParams();
  const navigate = useNavigate();
  const [inquiry, setInquiry] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [quoteData, setQuoteData] = useState({
    title: '',
    description: '',
    total_amount: '',
    currency: 'USD',
    validity_days: 30,
    terms_conditions: '',
    breakdown: []
  });
  const [breakdownItem, setBreakdownItem] = useState({
    item: '',
    amount: ''
  });

  useEffect(() => {
    fetchInquiryDetails();
  }, [inquiryId]);

  const fetchInquiryDetails = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/inquiries/${inquiryId}`, {
        credentials: 'include'
      });
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
      flight: `Flight Quote - ${inquiry.flight_origin} to ${inquiry.flight_destination}`,
      hotel: `Hotel Quote - ${inquiry.hotel_destination}`,
      cruise: `Cruise Quote - ${inquiry.cruise_destination}`,
      package: `Package Quote - ${inquiry.package_destination}`,
      general: `Travel Quote - ${inquiry.inquiry_subject || 'Custom Package'}`
    };
    return typeMap[inquiry.inquiry_type] || 'Travel Quote';
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setQuoteData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleBreakdownItemChange = (e) => {
    const { name, value } = e.target;
    setBreakdownItem(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const addBreakdownItem = () => {
    if (breakdownItem.item && breakdownItem.amount) {
      setQuoteData(prev => ({
        ...prev,
        breakdown: [...prev.breakdown, { ...breakdownItem }]
      }));
      setBreakdownItem({ item: '', amount: '' });
    }
  };

  const removeBreakdownItem = (index) => {
    setQuoteData(prev => ({
      ...prev,
      breakdown: prev.breakdown.filter((_, i) => i !== index)
    }));
  };

  const calculateTotal = () => {
    const total = quoteData.breakdown.reduce((sum, item) => {
      return sum + (parseFloat(item.amount) || 0);
    }, 0);
    setQuoteData(prev => ({ ...prev, total_amount: total.toFixed(2) }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!quoteData.title || !quoteData.total_amount) {
      alert('Please fill in required fields');
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch('/api/quotes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
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
    // First create the quote, then send it
    if (!quoteData.title || !quoteData.total_amount) {
      alert('Please fill in required fields');
      return;
    }

    setSubmitting(true);

    try {
      // Create quote
      const createResponse = await fetch('/api/quotes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
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

  if (loading) {
    return <div className="admin-loading">Loading inquiry details...</div>;
  }

  if (!inquiry) {
    return <div className="error-message">Inquiry not found</div>;
  }

  return (
    <div className="quote-create-page">
      <div className="page-header">
        <div className="header-content">
          <h1>Create Quote</h1>
          <p>For Inquiry: {inquiry.customer_name} - {inquiry.inquiry_type}</p>
        </div>
        <div className="header-actions">
          <Link to={`/admin/inquiries/${inquiryId}`} className="action-btn secondary-btn">
            Cancel
          </Link>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="quote-form">
        <div className="form-section">
          <h3>Basic Information</h3>
          
          <div className="form-group">
            <label>Quote Title *</label>
            <input
              type="text"
              name="title"
              value={quoteData.title}
              onChange={handleChange}
              placeholder="e.g., Paris Vacation Package"
              required
            />
          </div>

          <div className="form-group">
            <label>Description</label>
            <textarea
              name="description"
              value={quoteData.description}
              onChange={handleChange}
              placeholder="Detailed description of the travel package..."
              rows="4"
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Total Amount *</label>
              <input
                type="number"
                name="total_amount"
                value={quoteData.total_amount}
                onChange={handleChange}
                placeholder="0.00"
                step="0.01"
                min="0"
                required
              />
            </div>

            <div className="form-group">
              <label>Currency</label>
              <select
                name="currency"
                value={quoteData.currency}
                onChange={handleChange}
              >
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
                <option value="GBP">GBP (£)</option>
                <option value="INR">INR (₹)</option>
              </select>
            </div>

            <div className="form-group">
              <label>Validity (Days)</label>
              <input
                type="number"
                name="validity_days"
                value={quoteData.validity_days}
                onChange={handleChange}
                min="1"
                max="90"
              />
            </div>
          </div>
        </div>

        <div className="form-section">
          <h3>Cost Breakdown</h3>
          
          <div className="breakdown-input">
            <input
              type="text"
              name="item"
              value={breakdownItem.item}
              onChange={handleBreakdownItemChange}
              placeholder="Item name (e.g., Flight Tickets)"
            />
            <input
              type="number"
              name="amount"
              value={breakdownItem.amount}
              onChange={handleBreakdownItemChange}
              placeholder="Amount"
              step="0.01"
              min="0"
            />
            <button type="button" onClick={addBreakdownItem} className="add-item-btn">
              + Add Item
            </button>
          </div>

          {quoteData.breakdown.length > 0 && (
            <div className="breakdown-list">
              {quoteData.breakdown.map((item, index) => (
                <div key={index} className="breakdown-item">
                  <span className="item-name">{item.item}</span>
                  <span className="item-amount">${parseFloat(item.amount).toFixed(2)}</span>
                  <button
                    type="button"
                    onClick={() => removeBreakdownItem(index)}
                    className="remove-item-btn"
                  >
                    ×
                  </button>
                </div>
              ))}
              <div className="breakdown-total">
                <button type="button" onClick={calculateTotal} className="calculate-btn">
                  Calculate Total
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="form-section">
          <h3>Terms & Conditions</h3>
          
          <div className="form-group">
            <textarea
              name="terms_conditions"
              value={quoteData.terms_conditions}
              onChange={handleChange}
              placeholder="Enter terms and conditions for this quote..."
              rows="6"
            />
          </div>
        </div>

        <div className="form-actions">
          <button
            type="submit"
            className="submit-btn"
            disabled={submitting}
          >
            {submitting ? 'Creating...' : 'Save as Draft'}
          </button>
          
          <button
            type="button"
            onClick={handleSendQuote}
            className="send-btn primary-btn"
            disabled={submitting}
          >
            {submitting ? 'Sending...' : 'Create & Send to Customer'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default QuoteCreate;
