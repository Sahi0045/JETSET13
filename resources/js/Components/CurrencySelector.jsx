import React, { useState, useEffect } from 'react';
import currencyService from '../Services/CurrencyService';

const CurrencySelector = () => {
  const [selectedCurrency, setSelectedCurrency] = useState(currencyService.getCurrency());
  const [isOpen, setIsOpen] = useState(false);

  // Currency options
  const currencies = [
    { code: 'USD', symbol: '$', name: 'US Dollar' },
    { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
    { code: 'EUR', symbol: '€', name: 'Euro' },
    { code: 'GBP', symbol: '£', name: 'British Pound' },
  ];

  useEffect(() => {
    // Listen for currency changes from other parts of the app
    const handleCurrencyChange = (e) => {
      setSelectedCurrency(e.detail.currency);
    };

    window.addEventListener('currencyChanged', handleCurrencyChange);

    return () => {
      window.removeEventListener('currencyChanged', handleCurrencyChange);
    };
  }, []);

  const handleCurrencyChange = (currencyCode) => {
    currencyService.setCurrency(currencyCode);
    setSelectedCurrency(currencyCode);
    setIsOpen(false);

    // Reload the page to reflect the new currency
    window.location.reload();
  };

  const toggleDropdown = () => {
    setIsOpen(!isOpen);
  };

  // Get the selected currency details
  const currentCurrency = currencies.find(c => c.code === selectedCurrency) || currencies[0];

  return (
    <div className="relative">
      <button
        onClick={toggleDropdown}
        className="flex items-center space-x-1 text-sm text-gray-700 hover:text-[#055B75] py-1.5 px-3 rounded-md hover:bg-gray-100 transition-colors border border-gray-200"
      >
        <span className="font-medium">{currentCurrency.symbol}</span>
        <span>{currentCurrency.code}</span>
        <svg
          className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'transform rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg z-50 py-1 ring-1 ring-black ring-opacity-5">
          {currencies.map((currency) => (
            <button
              key={currency.code}
              onClick={() => handleCurrencyChange(currency.code)}
              className={`block w-full text-left px-4 py-2 text-sm ${selectedCurrency === currency.code
                ? 'bg-gray-100 text-gray-900'
                : 'text-gray-700 hover:bg-gray-50'
                }`}
            >
              <div className="flex items-center justify-between">
                <span>{currency.name}</span>
                <span className="font-medium">{currency.symbol}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default CurrencySelector; 