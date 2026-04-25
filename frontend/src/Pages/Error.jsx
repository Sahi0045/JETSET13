import React from 'react';
import { useLocation } from 'react-router-dom';
import Navbar from './Common/Navbar';
import Footer from './Common/Footer';
import withPageElements from './Common/PageWrapper';

const Error = () => {
  const location = useLocation();
  const status = location.state?.status || 404;

  const title = {
    404: 'Page Not Found',
    500: 'Server Error',
    503: 'Service Unavailable',
  }[status] || 'Error';

  const description = {
    404: 'Sorry, the page you are looking for could not be found.',
    500: 'Whoops, something went wrong on our servers.',
    503: 'Sorry, we are doing some maintenance. Please check back soon.',
  }[status] || 'An error occurred.';

  React.useEffect(() => {
    document.title = `${title} - JetSetters`;
  }, [title]);

  return (
    <>
      <Navbar forceScrolled={true} />
      
      <div className="min-h-screen flex flex-col items-center justify-center">
        <div className="p-8 bg-white shadow-lg rounded-lg max-w-lg w-full text-center">
          <h1 className="text-6xl font-bold text-red-500 mb-4">{status || '?'}</h1>
          <h2 className="text-2xl font-semibold mb-4">{title}</h2>
          <p className="text-gray-600 mb-6">{description}</p>
          <a
            href="/"
            className="inline-block px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
          >
            Back to Home
          </a>
        </div>
      </div>
      
      <Footer />
    </>
  );
};

export default withPageElements(Error);
