import React from 'react';
import ContactPopup from './ContactPopup';
import AIChatbot from './AIChatbot';

/**
 * PageWrapper is a higher-order component that wraps all pages with common elements
 * like the ContactPopup and AIChatbot
 */
const withPageElements = (WrappedComponent) => {
  return (props) => (
    <>
      <WrappedComponent {...props} />
      <ContactPopup />
      <AIChatbot />
    </>
  );
};

export default withPageElements; 