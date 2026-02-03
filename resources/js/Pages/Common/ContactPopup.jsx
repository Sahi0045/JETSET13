import React, { useState } from 'react';
import './ContactPopup.css';
import supabase from '../../lib/supabase';

const ContactPopup = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    console.log('Contact form submitted:', { name, email, message });

    try {
      // Store in Supabase contact_inquiries table
      const { data, error: supabaseError } = await supabase
        .from('contact_inquiries')
        .insert([
          {
            name: name,
            email: email,
            message: message,
            status: 'new'
          }
        ]);

      if (supabaseError) {
        console.error('Supabase error:', supabaseError);
        setError('Failed to submit. Please try again.');
        return;
      }

      // Send email notifications via Resend
      try {
        await fetch('/api/email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'contact', name, email, message })
        });
        console.log('Contact email notifications sent');
      } catch (emailError) {
        console.error('Email notification error:', emailError);
      }

      // Show success message
      setSubmitted(true);

      // Reset form after 3 seconds and close popup
      setTimeout(() => {
        setName('');
        setEmail('');
        setMessage('');
        setSubmitted(false);
        setIsOpen(false);
      }, 3000);
    } catch (err) {
      console.error('Contact form error:', err);
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const togglePopup = () => {
    setIsOpen(!isOpen);
    setError('');
  };

  return (
    <div className="contact-us-container">
      <a
        href="https://wa.me/18775387380"
        target="_blank"
        rel="noopener noreferrer"
        className="whatsapp-button"
        aria-label="Chat on WhatsApp"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
        </svg>
      </a>
      <button
        className="contact-us-button"
        onClick={togglePopup}
      >
        Contact Us
      </button>

      {isOpen && (
        <div className="contact-popup-overlay">
          <div className="contact-popup">
            <button className="close-button" onClick={togglePopup}>×</button>

            {!submitted ? (
              <>
                <h2>Contact Us</h2>
                <p>Have questions? We'd love to hear from you!</p>

                <form onSubmit={handleSubmit}>
                  <div className="form-group">
                    <label htmlFor="name">Name</label>
                    <input
                      type="text"
                      id="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      disabled={loading}
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="email">Email</label>
                    <input
                      type="email"
                      id="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      disabled={loading}
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="message">Message</label>
                    <textarea
                      id="message"
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      rows="4"
                      required
                      disabled={loading}
                    ></textarea>
                  </div>

                  {error && <p className="error-message" style={{ color: 'red', fontSize: '14px', marginBottom: '10px' }}>{error}</p>}

                  <button type="submit" className="submit-button" disabled={loading}>
                    {loading ? 'Sending...' : 'Send Message'}
                  </button>
                </form>
              </>
            ) : (
              <div className="success-message">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                  <polyline points="22 4 12 14.01 9 11.01"></polyline>
                </svg>
                <h3>Thank You!</h3>
                <p>Your message has been sent successfully. We'll get back to you soon!</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ContactPopup; 