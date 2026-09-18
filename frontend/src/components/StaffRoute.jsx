import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { isBookingStaff } from '../../../shared/staffRoles';

/**
 * The gate on the support desk.
 *
 * Like ProtectedRoute, this is only a UX gate: the credential is an httpOnly
 * cookie this cannot read, and every call the page makes is checked again by
 * the server (`bookingStaff` in auth.middleware.js). Its job is to send a
 * signed-out person to the support sign-in rather than to an empty queue.
 *
 * Separate from ProtectedRoute because that one sends people to /admin/login,
 * which a support account cannot pass.
 */
const StaffRoute = ({ children }) => {
  const location = useLocation();
  let role = null;
  try {
    role = JSON.parse(localStorage.getItem('adminUser') || '{}')?.role ?? null;
  } catch {
    // Private browsing and blocked site data both throw on access.
    role = null;
  }

  if (!isBookingStaff(role)) {
    return <Navigate to="/desk/login" state={{ from: location }} replace />;
  }
  return children;
};

export default StaffRoute;
