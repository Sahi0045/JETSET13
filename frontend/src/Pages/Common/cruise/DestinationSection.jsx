import React from 'react';
import { Link } from 'react-router-dom';
import './DestinationSection.css';
import destinationsData from './data/destinations.json';
import { FaStar } from 'react-icons/fa';
import Price from '../../../Components/Price';

const DestinationSection = () => {
  return (
    <section className="destination-section">
      <div className="section-header">
        <h2 className="section-title">EXPLORE BY DESTINATION</h2>
      </div>
      
      <p className="section-subtitle">
        Discover breathtaking destinations and unforgettable experiences
      </p>
      
      <div className="destinations-grid">
        {destinationsData.destinations.slice(0, 6).map((destination) => (
          <div key={destination.id} className="destination-card">
            <div className="destination-rating">
              <FaStar className="star" />
              <span>{destination.rating}</span>
            </div>
            <div className="destination-image">
              <img src={destination.image} alt={destination.name} />
            </div>
            <div className="destination-info">
              <h4>{destination.name}</h4>
              <p>
                Starts from <Price amount={destination.price} />/p.p
              </p>
              <Link 
                to={`/cruises?destination=${encodeURIComponent(destination.name)}&country=${encodeURIComponent(destination.country)}`}
                className="book-now"
              >
                BOOK NOW
              </Link>
            </div>
          </div>
        ))}
      </div>
      
      <Link 
        to="/cruises"
        className="explore-more"
      >
        Explore more
      </Link>
    </section>
  );
};

export default DestinationSection;