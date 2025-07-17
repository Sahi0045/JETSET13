# 🔥 Firebase Authentication Setup Guide

## Step 1: Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Create a project" or "Add project"
3. Enter project name: `jetset-travel-app`
4. Enable Google Analytics (recommended)
5. Choose or create a Google Analytics account
6. Click "Create project"

## Step 2: Enable Authentication

1. In your Firebase project, go to **Authentication**
2. Click "Get started"
3. Go to **Sign-in method** tab
4. Enable the following providers:

### Email/Password
- Click "Email/Password"
- Enable both "Email/Password" and "Email link (passwordless sign-in)"
- Save

### Google
- Click "Google"
- Enable the provider
- Choose your project support email
- Download the config (we'll use the web config)
- Save

### Facebook (Optional)
- Click "Facebook"
- Enter your Facebook App ID and App Secret
- Add OAuth redirect URI to your Facebook app settings
- Save

## Step 3: Get Firebase Configuration

1. Go to **Project Settings** (gear icon)
2. Scroll down to "Your apps" section
3. Click "Web" icon (`</>`)
4. Register your app name: `JetSet Travel Web App`
5. Copy the Firebase config object:

```javascript
const firebaseConfig = {
  apiKey: "your-api-key",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef123456",
  measurementId: "G-XXXXXXXXXX"
};
```

## Step 4: Configure Authorized Domains

1. In Firebase Console, go to **Authentication** > **Settings** > **Authorized domains**
2. Add your domains:
   - `localhost` (for development)
   - `127.0.0.1` (for development)
   - `your-production-domain.com`
   - `jet-set-go-psi.vercel.app` (current production domain)

## Step 5: Install Firebase SDK

```bash
npm install firebase
```

## Step 6: Environment Variables

Add to your `.env` file:

```env
# Firebase Configuration
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abcdef123456
VITE_FIREBASE_MEASUREMENT_ID=G-XXXXXXXXXX

# Google OAuth (for server-side verification if needed)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
```

## Step 7: Security Rules (Firestore - if using)

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can read and write their own user document
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Users can read their own bookings
    match /bookings/{bookingId} {
      allow read, write: if request.auth != null && 
        resource.data.userId == request.auth.uid;
    }
  }
}
```

## Step 8: Additional Configuration

### Custom Claims (for admin roles)
```javascript
// Server-side function to set custom claims
admin.auth().setCustomUserClaims(uid, { admin: true });
```

### Email Templates
1. Go to **Authentication** > **Templates**
2. Customize email templates for:
   - Email verification
   - Password reset
   - Email address change

## Next Steps

After completing this setup:
1. Implement Firebase Auth service
2. Create authentication context
3. Update login/register components
4. Migrate existing users (if needed)
5. Update backend to verify Firebase tokens 