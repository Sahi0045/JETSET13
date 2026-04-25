
import React, { createContext, useState, useEffect, useContext } from 'react';
import GeoService from '../Services/GeoService';
import currencyService from '../Services/CurrencyService';

const LocationContext = createContext();

export const useLocationContext = () => {
    const context = useContext(LocationContext);
    if (!context) {
        // Return safe defaults instead of throwing during HMR
        return {
            country: '', countryCode: '', city: '', currency: '',
            callingCode: '', region: '', loaded: false, loading: true
        };
    }
    return context;
};

export const LocationProvider = ({ children }) => {
    const [location, setLocation] = useState({
        country: '',
        countryCode: '',
        city: '',
        currency: '',
        callingCode: '',
        region: '',
        loaded: false,
        loading: true
    });

    useEffect(() => {
        const fetchLocation = async () => {
            // Check for saved location in sessionStorage to avoid repeated API calls
            const savedLocation = sessionStorage.getItem('userLocation');
            if (savedLocation) {
                try {
                    const parsed = JSON.parse(savedLocation);
                    updateLocation(parsed);
                    return;
                } catch (e) {
                    console.error("Failed to parse saved location", e);
                }
            }

            const locData = await GeoService.getUserLocation();
            updateLocation(locData);
            sessionStorage.setItem('userLocation', JSON.stringify(locData));
        };

        fetchLocation();
    }, []);

    const updateLocation = (newLocation) => {
        setLocation(prev => ({ ...prev, ...newLocation, loaded: true, loading: false }));

        // Only auto-set currency from geo if user hasn't manually chosen one
        if (newLocation.currency && !currencyService.isManuallySet()) {
            currencyService.setCurrency(newLocation.currency);
        }
    };

    return (
        <LocationContext.Provider value={location}>
            {children}
        </LocationContext.Provider>
    );
};
