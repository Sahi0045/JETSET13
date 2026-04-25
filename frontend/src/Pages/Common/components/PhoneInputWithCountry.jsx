import React, { useState, useEffect, useRef } from 'react';

// Country data with dial codes and flags
const COUNTRIES = [
    { code: 'IN', name: 'India', dialCode: '+91', flag: '🇮🇳' },
    { code: 'US', name: 'United States', dialCode: '+1', flag: '🇺🇸' },
    { code: 'GB', name: 'United Kingdom', dialCode: '+44', flag: '🇬🇧' },
    { code: 'CA', name: 'Canada', dialCode: '+1', flag: '🇨🇦' },
    { code: 'AU', name: 'Australia', dialCode: '+61', flag: '🇦🇺' },
    { code: 'DE', name: 'Germany', dialCode: '+49', flag: '🇩🇪' },
    { code: 'FR', name: 'France', dialCode: '+33', flag: '🇫🇷' },
    { code: 'IT', name: 'Italy', dialCode: '+39', flag: '🇮🇹' },
    { code: 'ES', name: 'Spain', dialCode: '+34', flag: '🇪🇸' },
    { code: 'JP', name: 'Japan', dialCode: '+81', flag: '🇯🇵' },
    { code: 'CN', name: 'China', dialCode: '+86', flag: '🇨🇳' },
    { code: 'BR', name: 'Brazil', dialCode: '+55', flag: '🇧🇷' },
    { code: 'MX', name: 'Mexico', dialCode: '+52', flag: '🇲🇽' },
    { code: 'RU', name: 'Russia', dialCode: '+7', flag: '🇷🇺' },
    { code: 'AE', name: 'UAE', dialCode: '+971', flag: '🇦🇪' },
    { code: 'SG', name: 'Singapore', dialCode: '+65', flag: '🇸🇬' },
    { code: 'NZ', name: 'New Zealand', dialCode: '+64', flag: '🇳🇿' },
    { code: 'ZA', name: 'South Africa', dialCode: '+27', flag: '🇿🇦' },
    { code: 'NL', name: 'Netherlands', dialCode: '+31', flag: '🇳🇱' },
    { code: 'SE', name: 'Sweden', dialCode: '+46', flag: '🇸🇪' },
    { code: 'CH', name: 'Switzerland', dialCode: '+41', flag: '🇨🇭' },
    { code: 'NO', name: 'Norway', dialCode: '+47', flag: '🇳🇴' },
    { code: 'DK', name: 'Denmark', dialCode: '+45', flag: '🇩🇰' },
    { code: 'PL', name: 'Poland', dialCode: '+48', flag: '🇵🇱' },
    { code: 'TH', name: 'Thailand', dialCode: '+66', flag: '🇹🇭' },
    { code: 'MY', name: 'Malaysia', dialCode: '+60', flag: '🇲🇾' },
    { code: 'PH', name: 'Philippines', dialCode: '+63', flag: '🇵🇭' },
    { code: 'ID', name: 'Indonesia', dialCode: '+62', flag: '🇮🇩' },
    { code: 'VN', name: 'Vietnam', dialCode: '+84', flag: '🇻🇳' },
    { code: 'KR', name: 'South Korea', dialCode: '+82', flag: '🇰🇷' },
];

/**
 * Phone input component with automatic country detection
 * Uses ipapi.co to detect user's country on first load
 */
export default function PhoneInputWithCountry({
    value,
    onChange,
    placeholder = 'Enter phone number',
    className = '',
    error = null,
    disabled = false
}) {
    const [selectedCountry, setSelectedCountry] = useState(COUNTRIES[0]); // Default to India
    const [phoneNumber, setPhoneNumber] = useState('');
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [isDetecting, setIsDetecting] = useState(true);
    const dropdownRef = useRef(null);

    // Parse initial value if provided
    useEffect(() => {
        if (value) {
            // Try to extract country code and number from value
            const match = value.match(/^(\+\d{1,4})(.*)$/);
            if (match) {
                const dialCode = match[1];
                const number = match[2].trim();
                const country = COUNTRIES.find(c => c.dialCode === dialCode);
                if (country) {
                    setSelectedCountry(country);
                    setPhoneNumber(number);
                    return;
                }
            }
            // If no match, just set the raw number
            setPhoneNumber(value.replace(/^\+\d{1,4}\s*/, ''));
        }
    }, []);

    // Auto-detect country on mount
    useEffect(() => {
        const detectCountry = async () => {
            try {
                // Check localStorage for saved preference
                const savedCountry = localStorage.getItem('userPhoneCountry');
                if (savedCountry) {
                    const country = COUNTRIES.find(c => c.code === savedCountry);
                    if (country) {
                        setSelectedCountry(country);
                        setIsDetecting(false);
                        return;
                    }
                }

                // Try to detect from ipapi.co
                const response = await fetch('https://ipapi.co/json/', {
                    signal: AbortSignal.timeout(5000) // 5 second timeout
                });

                if (response.ok) {
                    const data = await response.json();
                    if (data && data.country_code) {
                        const country = COUNTRIES.find(c => c.code === data.country_code);
                        if (country) {
                            setSelectedCountry(country);
                            localStorage.setItem('userPhoneCountry', country.code);
                        }
                    }
                }
            } catch (error) {
                console.log('Country detection skipped:', error.message);
                // Fallback - try browser locale
                try {
                    const locale = navigator.language || navigator.userLanguage;
                    if (locale) {
                        const countryCode = locale.split('-')[1]?.toUpperCase();
                        if (countryCode) {
                            const country = COUNTRIES.find(c => c.code === countryCode);
                            if (country) {
                                setSelectedCountry(country);
                                localStorage.setItem('userPhoneCountry', country.code);
                            }
                        }
                    }
                } catch (e) {
                    // Use default (India)
                }
            } finally {
                setIsDetecting(false);
            }
        };

        detectCountry();
    }, []);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsDropdownOpen(false);
                setSearchQuery('');
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Handle phone number change
    const handlePhoneChange = (e) => {
        const newNumber = e.target.value.replace(/[^\d]/g, ''); // Only allow digits
        setPhoneNumber(newNumber);

        // Notify parent with full number including country code
        const fullNumber = newNumber ? `${selectedCountry.dialCode}${newNumber}` : '';
        onChange && onChange(fullNumber);
    };

    // Handle country selection
    const handleCountrySelect = (country) => {
        setSelectedCountry(country);
        setIsDropdownOpen(false);
        setSearchQuery('');
        localStorage.setItem('userPhoneCountry', country.code);

        // Update parent with new country code
        const fullNumber = phoneNumber ? `${country.dialCode}${phoneNumber}` : '';
        onChange && onChange(fullNumber);
    };

    // Filter countries by search
    const filteredCountries = COUNTRIES.filter(country =>
        country.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        country.dialCode.includes(searchQuery) ||
        country.code.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="phone-input-container" style={{ position: 'relative' }}>
            <div
                className={`phone-input-wrapper ${className}`}
                style={{
                    display: 'flex',
                    border: '1px solid #e5e7eb',
                    borderRadius: '0.5rem',
                    backgroundColor: disabled ? '#f9fafb' : '#f9fafb',
                    overflow: 'hidden',
                    transition: 'all 0.2s',
                }}
            >
                {/* Country selector */}
                <button
                    type="button"
                    disabled={disabled}
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        padding: '0.75rem',
                        backgroundColor: 'transparent',
                        border: 'none',
                        borderRight: '1px solid #e5e7eb',
                        cursor: disabled ? 'not-allowed' : 'pointer',
                        minWidth: '90px',
                        justifyContent: 'center',
                    }}
                >
                    {isDetecting ? (
                        <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>...</span>
                    ) : (
                        <>
                            <span style={{ fontSize: '1.25rem' }}>{selectedCountry.flag}</span>
                            <span style={{ fontSize: '0.875rem', color: '#374151' }}>{selectedCountry.dialCode}</span>
                            <svg
                                width="12"
                                height="12"
                                viewBox="0 0 12 12"
                                fill="none"
                                style={{ marginLeft: '2px' }}
                            >
                                <path
                                    d="M3 4.5L6 7.5L9 4.5"
                                    stroke="#6B7280"
                                    strokeWidth="1.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                />
                            </svg>
                        </>
                    )}
                </button>

                {/* Phone number input */}
                <input
                    type="tel"
                    value={phoneNumber}
                    onChange={handlePhoneChange}
                    placeholder={placeholder}
                    disabled={disabled}
                    style={{
                        flex: 1,
                        padding: '0.75rem',
                        border: 'none',
                        outline: 'none',
                        backgroundColor: 'transparent',
                        fontSize: '1rem',
                        color: '#111827',
                    }}
                />
            </div>

            {/* Country dropdown */}
            {isDropdownOpen && (
                <div
                    ref={dropdownRef}
                    style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        marginTop: '0.25rem',
                        backgroundColor: 'white',
                        border: '1px solid #e5e7eb',
                        borderRadius: '0.5rem',
                        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                        zIndex: 50,
                        maxHeight: '240px',
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                    }}
                >
                    {/* Search input */}
                    <div style={{ padding: '0.5rem', borderBottom: '1px solid #e5e7eb' }}>
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search country..."
                            autoFocus
                            style={{
                                width: '100%',
                                padding: '0.5rem',
                                border: '1px solid #e5e7eb',
                                borderRadius: '0.25rem',
                                fontSize: '0.875rem',
                                outline: 'none',
                            }}
                        />
                    </div>

                    {/* Country list */}
                    <div style={{ overflowY: 'auto', flex: 1 }}>
                        {filteredCountries.map((country) => (
                            <button
                                key={country.code}
                                type="button"
                                onClick={() => handleCountrySelect(country)}
                                style={{
                                    width: '100%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.75rem',
                                    padding: '0.625rem 0.75rem',
                                    border: 'none',
                                    backgroundColor: selectedCountry.code === country.code ? '#f0f9ff' : 'transparent',
                                    cursor: 'pointer',
                                    textAlign: 'left',
                                    transition: 'background-color 0.15s',
                                }}
                                onMouseEnter={(e) => e.target.style.backgroundColor = '#f9fafb'}
                                onMouseLeave={(e) => e.target.style.backgroundColor = selectedCountry.code === country.code ? '#f0f9ff' : 'transparent'}
                            >
                                <span style={{ fontSize: '1.25rem' }}>{country.flag}</span>
                                <span style={{ flex: 1, fontSize: '0.875rem', color: '#374151' }}>{country.name}</span>
                                <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>{country.dialCode}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Error message */}
            {error && (
                <p style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.25rem' }}>{error}</p>
            )}
        </div>
    );
}
