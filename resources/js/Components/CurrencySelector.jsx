import React, { useState, useEffect, useRef } from 'react';
import currencyService from '../Services/CurrencyService';

const CurrencySelector = () => {
  const [selectedCurrency, setSelectedCurrency] = useState(currencyService.getCurrency());
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Currency options
  const currencies = [
    { code: 'USD', symbol: '$', name: 'US Dollar', flag: '🇺🇸' },
    { code: 'INR', symbol: '₹', name: 'Indian Rupee', flag: '🇮🇳' },
    { code: 'EUR', symbol: '€', name: 'Euro', flag: '🇪🇺' },
    { code: 'GBP', symbol: '£', name: 'British Pound', flag: '🇬🇧' },
    { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham', flag: '🇦🇪' },
    { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar', flag: '🇸🇬' },
    { code: 'AUD', symbol: 'A$', name: 'Australian Dollar', flag: '🇦🇺' },
    { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar', flag: '🇨🇦' },
    { code: 'JPY', symbol: '¥', name: 'Japanese Yen', flag: '🇯🇵' },
    { code: 'THB', symbol: '฿', name: 'Thai Baht', flag: '🇹🇭' },
  ];

  useEffect(() => {
    const handleCurrencyChange = (e) => {
      setSelectedCurrency(e.detail.currency);
    };
    window.addEventListener('currencyChanged', handleCurrencyChange);
    return () => window.removeEventListener('currencyChanged', handleCurrencyChange);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleCurrencyChange = (currencyCode) => {
    currencyService.setCurrency(currencyCode, true);
    setSelectedCurrency(currencyCode);
    setIsOpen(false);
  };

  const currentCurrency = currencies.find(c => c.code === selectedCurrency) || currencies[0];

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-1 text-sm text-gray-700 hover:text-[#055B75] py-1.5 px-3 rounded-md hover:bg-gray-100 transition-colors border border-gray-200"
      >
        <span className="font-medium">{currentCurrency.symbol}</span>
        <span>{currentCurrency.code}</span>
        <svg
          className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-xl z-50 py-1 ring-1 ring-black ring-opacity-5 max-h-72 overflow-y-auto">
          {currencies.map((currency) => (
            <button
              key={currency.code}
              onClick={() => handleCurrencyChange(currency.code)}
              className={`block w-full text-left px-4 py-2.5 text-sm transition-colors ${
                selectedCurrency === currency.code
                  ? 'bg-[#055B75]/10 text-[#055B75] font-medium'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span>{currency.flag}</span>
                  <span>{currency.name}</span>
                </div>
                <span className="font-medium text-gray-500">{currency.symbol}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default CurrencySelector;
