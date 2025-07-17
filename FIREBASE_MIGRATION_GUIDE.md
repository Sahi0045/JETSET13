# 🔥 Firebase Authentication Migration Guide

## Overview

This guide helps you migrate from the current authentication system (Supabase + custom JWT) to Firebase Authentication while maintaining all existing functionality.

## 🚀 Quick Start

### 1. Install Firebase

```bash
npm install firebase
```

### 2. Set up Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project: `jetset-travel-app`
3. Enable Authentication
4. Configure sign-in methods:
   - Email/Password ✅
   - Google ✅
   - Facebook ✅ (optional)

### 3. Add Environment Variables

Create/update your `.env` file:

```env
# Firebase Configuration
VITE_FIREBASE_API_KEY=your_firebase_api_key_here
VITE_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_FIREBASE_MEASUREMENT_ID=your_measurement_id
```

### 4. Test Firebase Routes

- **Login**: `/firebase-login`
- **Signup**: `/firebase-signup`
- **Profile**: `/firebase-profile`

## 📋 Migration Checklist

### ✅ Completed Components

- [x] Firebase Configuration (`resources/js/config/firebase.js`)
- [x] Firebase Auth Context (`resources/js/contexts/FirebaseAuthContext.jsx`)
- [x] Firebase Login Component (`resources/js/Pages/Common/login/FirebaseLogin.jsx`)
- [x] Firebase Signup Component (`resources/js/Pages/Common/login/FirebaseSignup.jsx`)
- [x] Firebase Profile Dashboard (`resources/js/Pages/Common/login/FirebaseProfileDashboard.jsx`)
- [x] Protected Route Component (`resources/js/components/ProtectedRoute.jsx`)
- [x] Enhanced CSS Styles (`resources/js/Pages/Common/login/firebase-login.css`)
- [x] Package.json Dependencies (Firebase v10.13.0)
- [x] App.jsx Routes Integration
- [x] Environment Configuration

### 🔄 Migration Steps

#### Step 1: Update Main Entry Point

The `src/main.jsx` has been updated to wrap the app with `FirebaseAuthProvider`:

```jsx
import { FirebaseAuthProvider } from '../resources/js/contexts/FirebaseAuthContext';

root.render(
  <React.StrictMode>
    <BrowserRouter>
      <HelmetProvider>
        <FirebaseAuthProvider>
          <App />
        </FirebaseAuthProvider>
      </HelmetProvider>
    </BrowserRouter>
  </React.StrictMode>
);
```

#### Step 2: Update Navigation Components

Update your navigation components to use Firebase auth:

```jsx
import { useFirebaseAuth } from '../contexts/FirebaseAuthContext';

function Navbar() {
  const { user, signOut } = useFirebaseAuth();
  
  return (
    <nav>
      {user ? (
        <div>
          <span>Welcome, {user.displayName || user.email}</span>
          <button onClick={signOut}>Sign Out</button>
        </div>
      ) : (
        <div>
          <Link to="/firebase-login">Login</Link>
          <Link to="/firebase-signup">Sign Up</Link>
        </div>
      )}
    </nav>
  );
}
```

#### Step 3: Update Hotel Booking Components

Update hotel booking components to use Firebase auth:

```jsx
import { useFirebaseAuth } from '../../../contexts/FirebaseAuthContext';

function HotelBooking() {
  const { user, isAuthenticated } = useFirebaseAuth();
  
  if (!isAuthenticated) {
    return <Navigate to="/firebase-login" />;
  }
  
  // Use user.uid for booking references
  const bookingData = {
    userId: user.uid,
    userEmail: user.email,
    userName: user.displayName || user.email,
    // ... other booking data
  };
}
```

#### Step 4: Update API Calls

Update your API calls to use Firebase ID tokens:

```jsx
import { useFirebaseAuth } from '../contexts/FirebaseAuthContext';

function useApiCall() {
  const { user } = useFirebaseAuth();
  
  const makeApiCall = async (endpoint, data) => {
    const token = await user.getIdToken();
    
    const response = await fetch(`${API_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(data)
    });
    
    return response.json();
  };
  
  return { makeApiCall };
}
```

## 🔧 Backend Integration

### Update Express.js Middleware

Create Firebase admin middleware for your Express.js backend:

```javascript
const admin = require('firebase-admin');

// Initialize Firebase Admin
const serviceAccount = require('./path/to/serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// Middleware to verify Firebase ID tokens
const verifyFirebaseToken = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Use in your routes
app.post('/api/bookings', verifyFirebaseToken, (req, res) => {
  // Access user data with req.user
  const userId = req.user.uid;
  const userEmail = req.user.email;
  // ... handle booking
});
```

### Database Schema Updates

Update your database to use Firebase UIDs:

```sql
-- Update existing tables
ALTER TABLE users ADD COLUMN firebase_uid VARCHAR(255) UNIQUE;
ALTER TABLE bookings ADD COLUMN firebase_uid VARCHAR(255);
ALTER TABLE hotel_bookings ADD COLUMN firebase_uid VARCHAR(255);

-- Create indexes
CREATE INDEX idx_users_firebase_uid ON users(firebase_uid);
CREATE INDEX idx_bookings_firebase_uid ON bookings(firebase_uid);
CREATE INDEX idx_hotel_bookings_firebase_uid ON hotel_bookings(firebase_uid);
```

## 🎨 UI/UX Features

### Firebase Auth Features

1. **Social Login**: Google, Facebook, Apple
2. **Email/Password**: Traditional login
3. **Password Reset**: Built-in password reset
4. **Email Verification**: Automatic email verification
5. **Profile Management**: Update display name, photo
6. **Real-time Auth State**: Automatic state management
7. **Multi-factor Authentication**: Optional 2FA
8. **Anonymous Authentication**: Guest users

### Enhanced Security

1. **Automatic Token Refresh**: No manual token handling
2. **Security Rules**: Firebase security rules
3. **Rate Limiting**: Built-in rate limiting
4. **Fraud Prevention**: Google's fraud detection
5. **GDPR Compliance**: Built-in privacy controls

## 🧪 Testing

### Test Firebase Components

1. **Test Login**: Navigate to `/firebase-login`
2. **Test Signup**: Navigate to `/firebase-signup`
3. **Test Profile**: Navigate to `/firebase-profile` (requires login)
4. **Test Social Login**: Try Google/Facebook login
5. **Test Password Reset**: Use "Forgot Password" feature
6. **Test Profile Update**: Update display name in profile

### Test Protected Routes

1. **Access Protected Route**: Try accessing `/firebase-profile` without login
2. **Auto Redirect**: Should redirect to login page
3. **Post-Login Redirect**: Should redirect back to intended page
4. **Logout Functionality**: Test sign out from profile

## 🚀 Deployment

### Environment Variables

Set these in your deployment environment:

```env
VITE_FIREBASE_API_KEY=your_production_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_FIREBASE_MEASUREMENT_ID=your_measurement_id
```

### Firebase Hosting (Optional)

```bash
# Install Firebase CLI
npm install -g firebase-tools

# Login to Firebase
firebase login

# Initialize Firebase in your project
firebase init hosting

# Deploy
firebase deploy
```

## 📊 Migration Benefits

### Before (Current System)
- ❌ Custom JWT handling
- ❌ Manual token refresh
- ❌ Limited social providers
- ❌ Manual security implementation
- ❌ Complex auth state management

### After (Firebase Auth)
- ✅ Automatic token management
- ✅ Built-in security
- ✅ Multiple social providers
- ✅ Real-time auth state
- ✅ Google-grade security
- ✅ Better user experience
- ✅ Simplified development

## 🔍 Troubleshooting

### Common Issues

1. **Environment Variables**: Ensure all Firebase config vars are set
2. **CORS Issues**: Configure Firebase Auth domains
3. **Token Expiry**: Firebase handles this automatically
4. **Social Login**: Configure OAuth providers in Firebase Console
5. **Email Verification**: Enable in Firebase Console

### Debug Mode

Enable debug mode in development:

```javascript
// In firebase.js config
if (import.meta.env.DEV) {
  console.log('Firebase Debug Mode Enabled');
  // Add debug logging
}
```

## 📚 Resources

- [Firebase Auth Documentation](https://firebase.google.com/docs/auth)
- [Firebase Console](https://console.firebase.google.com/)
- [Firebase React Documentation](https://firebase.google.com/docs/auth/web/start)
- [Firebase Security Rules](https://firebase.google.com/docs/rules)

## 🎯 Next Steps

1. **Test Firebase Integration**: Use the provided test routes
2. **Update Navigation**: Integrate Firebase auth into navigation
3. **Update Booking Flow**: Use Firebase auth in booking process
4. **Backend Integration**: Implement Firebase Admin SDK
5. **Database Migration**: Update user references to Firebase UIDs
6. **Production Deployment**: Deploy with Firebase configuration

---

**Ready to migrate?** Start with testing the Firebase routes and gradually replace the existing auth system! 