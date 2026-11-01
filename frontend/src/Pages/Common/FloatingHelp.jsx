import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { Headset, Mail, MessageSquare, X } from 'lucide-react';
import ContactPopup from './ContactPopup';
import useCornerClearance from './useCornerClearance';
import './FloatingHelp.css';

const loadChatbot = () => import('./AIChatbot');
const AIChatbot = lazy(loadChatbot);

const WhatsAppIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
  </svg>
);

/**
 * WhatsApp, Contact Us and the chat assistant, in the corner of every page.
 * On a phone they fold into one Help button, and they step out of the way of
 * bars, menus and sheets on their own (useCornerClearance). The chatbot's code
 * loads once the browser is idle, and the chat stays mounted after it is first
 * opened so closing it keeps the conversation.
 */
export default function FloatingHelp() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isContactOpen, setIsContactOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [hasChatStarted, setHasChatStarted] = useState(false);
  const clusterRef = useRef(null);
  const { covered } = useCornerClearance();

  useEffect(() => {
    const idle = window.requestIdleCallback
      ? window.requestIdleCallback(() => loadChatbot(), { timeout: 4000 })
      : window.setTimeout(() => loadChatbot(), 3000);
    return () => (window.cancelIdleCallback ? window.cancelIdleCallback(idle) : clearTimeout(idle));
  }, []);

  useEffect(() => {
    if (!isExpanded) return undefined;
    const closeOutside = (event) => {
      if (!clusterRef.current?.contains(event.target)) setIsExpanded(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setIsExpanded(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isExpanded]);

  const toggleChat = () => {
    setHasChatStarted(true);
    setIsChatOpen((open) => !open);
    setIsExpanded(false);
  };

  const openContact = () => {
    setIsContactOpen(true);
    setIsExpanded(false);
  };

  const pressLauncher = () => {
    if (isChatOpen) setIsChatOpen(false);
    else setIsExpanded((open) => !open);
  };

  return (
    <>
      <div
        ref={clusterRef}
        className={`floating-help${isExpanded ? ' is-expanded' : ''}`}
        data-covered={covered ? 'true' : undefined}
      >
        <div id="floating-help-actions" className="floating-help__actions">
          <a
            href="https://wa.me/18775387380"
            target="_blank"
            rel="noopener noreferrer"
            className="floating-help__action floating-help__whatsapp"
            aria-label="Chat on WhatsApp"
            onClick={() => setIsExpanded(false)}
          >
            <WhatsAppIcon />
            <span className="floating-help__label">WhatsApp</span>
          </a>
          <button type="button" className="floating-help__action floating-help__contact" aria-label="Contact us" onClick={openContact}>
            <Mail aria-hidden="true" />
            <span className="floating-help__label">Contact Us</span>
          </button>
          <button
            type="button"
            className={`floating-help__action floating-help__chat${isChatOpen ? ' is-open' : ''}`}
            aria-label={isChatOpen ? 'Close chat' : 'Chat with our assistant'}
            aria-expanded={isChatOpen}
            onClick={toggleChat}
          >
            {isChatOpen ? <X aria-hidden="true" /> : <MessageSquare aria-hidden="true" />}
            <span className="floating-help__label">Chat</span>
          </button>
        </div>
        <button
          type="button"
          className={`floating-help__launcher${isExpanded || isChatOpen ? ' is-open' : ''}`}
          aria-label={isChatOpen ? 'Close chat' : 'Help: WhatsApp, contact us or chat'}
          aria-expanded={isExpanded}
          aria-controls="floating-help-actions"
          onClick={pressLauncher}
        >
          {isExpanded || isChatOpen ? <X aria-hidden="true" /> : <Headset aria-hidden="true" />}
        </button>
      </div>

      {isContactOpen && <ContactPopup onClose={() => setIsContactOpen(false)} />}

      {hasChatStarted && (
        <Suspense fallback={null}>
          <AIChatbot isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />
        </Suspense>
      )}
    </>
  );
}
