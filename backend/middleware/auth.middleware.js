import jwt from 'jsonwebtoken';
import User from '../models/user.model.js';

// Protect routes
export const protect = async (req, res, next) => {
  let token;

  // Check if token exists in Authorization header
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      // Get token from header
      token = req.headers.authorization.split(' ')[1];

      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'jetset-app-secret-key');

      // Get user from token
      const user = await User.findById(decoded.id);
      if (!user) {
        return res.status(401).json({ message: 'User not found' });
      }

      // Remove password from user object and ensure role is included
      const { password, ...userWithoutPassword } = user;
      req.user = {
        ...userWithoutPassword,
        role: user.role || 'user'
      };

      next();
    } catch (error) {
      console.error('Auth middleware error:', error);
      res.status(401).json({ message: 'Not authorized, token failed' });
    }
  }

  if (!token) {
    res.status(401).json({ message: 'Not authorized, no token' });
  }
};

// Admin middleware
export const admin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ message: 'Not authorized as an admin' });
  }
};

// Optional protect - extract user if token exists, but don't fail if not
export const optionalProtect = async (req, res, next) => {
  let token;

  // Check if token exists in Authorization header
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      // Get token from header
      token = req.headers.authorization.split(' ')[1];

      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'jetset-app-secret-key');

      // Get user from token
      const user = await User.findById(decoded.id);
      if (user) {
        // Remove password from user object and ensure role is included
        const { password, ...userWithoutPassword } = user;
        req.user = {
          ...userWithoutPassword,
          role: user.role || 'user'
        };
        console.log('Optional auth: User authenticated:', req.user.email);
      }
    } catch (error) {
      console.log('Optional auth: Token verification failed, continuing as guest');
    }
  }

  // Always continue to next middleware, even if no token or invalid token
  next();
};
