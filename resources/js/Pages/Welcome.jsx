import React from 'react';
// Removed Inertia.js imports
import FlightLanding from './Common/flights/flightlanding';
import withPageElements from './Common/PageWrapper';

const Welcome = () => {
    React.useEffect(() => {
        document.title = 'Welcome - JetSetters';
    }, []);

    const handleImageError = () => {
        document
            .getElementById('screenshot-container')
            ?.classList.add('!hidden');
        document.getElementById('docs-card')?.classList.add('!row-span-1');
        document
            .getElementById('docs-card-content')
            ?.classList.add('!flex-row');
        document.getElementById('background')?.classList.add('!hidden');
    };

    return (
        <>
            <FlightLanding/>
{/*         
            <h1>Hello I'm Manindar Reddy Lakkireddy </h1>
            <p>I have  3 years of exp</p> */}
        </>
    );
};

export default withPageElements(Welcome);
