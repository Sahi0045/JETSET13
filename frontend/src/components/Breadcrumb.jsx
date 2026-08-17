import { Link } from 'react-router-dom';
import { FaChevronRight } from 'react-icons/fa';

const Breadcrumb = ({ items = [] }) => {
  const allItems = [{ name: 'Home', path: '/' }, ...items];

  return (
    <nav aria-label="Breadcrumb" className="container mx-auto px-4 max-w-7xl py-3">
      <ol className="flex flex-wrap items-center gap-1.5 text-sm text-neutral-500">
        {allItems.map((item, i) => {
          const isLast = i === allItems.length - 1;
          return (
            <li key={item.path || item.name} className="flex items-center gap-1.5">
              {i > 0 && <FaChevronRight className="text-[10px] text-neutral-400" />}
              {isLast ? (
                <span aria-current="page" className="text-neutral-700 font-medium">{item.name}</span>
              ) : (
                <Link to={item.path} className="hover:text-neutral-700 transition-colors">{item.name}</Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
};

export default Breadcrumb;
