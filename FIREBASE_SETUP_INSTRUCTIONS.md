# 🔥 Firebase Authentication Setup Instructions

## Problem Summary

The application is showing "Missing Firebase configuration: apiKey, authDomain, projectId" errors because the required Firebase environment variables are not set in your [.env](file:///Users/yashwanthreddy/Desktop/JETSET13/.env) file.

## Solution Overview

To fix this issue, you need to:

1. Create a Firebase project
2. Enable Firebase Authentication
3. Add your Firebase configuration to the [.env](file:///Users/yashwanthreddy/Desktop/JETSET13/.env) file

## Step-by-Step Solution

### Step 1: Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Create a project" or "Add project"
3. Enter project name (e.g., `jetset-travel-app`)
4. Enable Google Analytics (recommended)
5. Click "Create project"

### Step 2: Enable Authentication

1. In your Firebase project, go to **Authentication**
2. Click "Get started"
3. Go to **Sign-in method** tab
4. Enable the following providers:
   - Email/Password
   - Google (recommended)

### Step 3: Get Firebase Configuration

1. Go to **Project Settings** (gear icon)
2. Scroll down to "Your apps" section
3. Click "Web" icon (`</>`)
4. Register your app name (e.g., `JetSet Travel Web App`)
5. Copy the Firebase config object

### Step 4: Update Your .env File

Replace the placeholder values in your [.env](file:///Users/yashwanthreddy/Desktop/JETSET13/.env) file with your actual Firebase configuration:

```env
# Firebase Configuration
VITE_FIREBASE_API_KEY=your_actual_api_key_here
VITE_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_FIREBASE_MEASUREMENT_ID=your_measurement_id
```

### Step 5: Configure Authorized Domains

1. In Firebase Console, go to **Authentication** > **Settings** > **Authorized domains**
2. Add your domains:
   - `localhost` (for development)
   - `127.0.0.1` (for development)
   - Your production domain (if deployed)

### Step 6: Test the Setup

1. Restart your development server
2. Navigate to `/firebase-login` or `/firebase-signup`
3. You should now be able to use Firebase authentication

## Temporary Solution (Development Only)

If you want to continue development without Firebase authentication, the application will now gracefully handle missing configuration and show appropriate warnings instead of crashing.

## Firebase Routes

Once properly configured, you can access these routes:
- `/firebase-login` - Firebase login page
- `/firebase-signup` - Firebase signup page
- `/firebase-profile` - Firebase profile dashboard

## Need Help?

If you need help setting up Firebase:
1. Check the [FIREBASE_MIGRATION_GUIDE.md](file:///Users/yashwanthreddy/Desktop/JETSET13/FIREBASE_MIGRATION_GUIDE.md) file
2. Check the [firebase-setup.md](file:///Users/yashwanthreddy/Desktop/JETSET13/firebase-setup.md) file
3. Run `node test-firebase-auth.js` to verify your setup