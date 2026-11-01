import React, { createContext, useContext } from 'react';
import FloatingHelp from './FloatingHelp';

// The home page shows the flights page inside itself and both are wrapped, so
// without this the help buttons were drawn twice, one set over the other.
const HasFloatingHelp = createContext(false);

/**
 * PageWrapper is a higher-order component that wraps all pages with common elements
 * like the WhatsApp, Contact Us and chat buttons
 */
const withPageElements = (WrappedComponent) => {
  const WithPageElements = (props) => {
    const isInsideAnotherPage = useContext(HasFloatingHelp);
    return (
      <HasFloatingHelp.Provider value>
        <WrappedComponent {...props} />
        {!isInsideAnotherPage && <FloatingHelp />}
      </HasFloatingHelp.Provider>
    );
  };
  return WithPageElements;
};

export default withPageElements;
