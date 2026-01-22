import React from 'react';
import { Link } from 'react-router-dom';
import './CruiseLineSection.css';
import cruiseLineData from './data/cruiselines.json';
import { FaStar } from 'react-icons/fa';
import Price from '../../../Components/Price';

const CruiseLineSection = () => {
  return (
    <section className="cruise-line-section">
      <div className="cruise-line-header">
        <img src="/images/cruise-icon.svg" alt="Cruise Icon" className="cruise-icon" />
        <h2 className="section-title">EXPLORE BY CRUISE LINE</h2>
      </div>

      <p className="section-subtitle">
        Discover top-rated cruise lines and premium experiences
      </p>

      <div className="cruise-lines-grid">
        {cruiseLineData.cruiseLines.map((cruiseLine) => (
          <div key={cruiseLine.id} className="cruise-line-card">
            <div className="rating">
              <FaStar className="star-icon" />
              <span>5.0</span>
            </div>
            <div className="cruise-line-image">
              <img src={cruiseLine.image} alt={cruiseLine.name} />
            </div>
            <div className="cruise-line-info">
              <h4>{cruiseLine.name}</h4>
              <p className="price">
                Starts from <Price amount={cruiseLine.price.replace(/[^0-9.]/g, '')} />/p.p
              </p>
              <Link
                to={`/cruises?cruiseLine=${encodeURIComponent(cruiseLine.name)}`}
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

export default CruiseLineSection;