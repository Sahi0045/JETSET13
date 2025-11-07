# Supabase Components Guide

## Overview
Complete Supabase authentication components have been created to provide a comprehensive authentication solution. These components mirror the Firebase components that were removed and provide enhanced functionality.

---

## 📁 Component Structure

### 1. **Context & Configuration**

#### `/resources/js/contexts/SupabaseAuthContext.jsx`
**Purpose:** Central authentication context provider

**Features:**
- User state management
- Session management
- Authentication methods (signup, signin, signout)
- OAuth integration
- Profile updates
- Password management
- Real-time auth state synchronization
- LocalStorage integration

**Usage:**
```jsx
import { useSupabaseAuth } from '../contexts/SupabaseAuthContext';

function MyComponent() {
  const { user, loading, isAuthenticated, signIn, signOut } = useSupabaseAuth();
  
  // Use authentication state and methods
}
```

**Available Methods:**
- `signUp(email, password, metadata)` - Create new account
- `signIn(email, password)` - Email/password login
- `signInWithOAuth(provider, options)` - OAuth login (Google, GitHub, etc.)
- `signOut()` - Logout user
- `updateProfile(updates)` - Update user metadata
- `resetPassword(email)` - Send password reset email
- `updatePassword(newPassword)` - Change password

**Available State:**
- `user` - Current user object
- `session` - Current session object
- `loading` - Loading state
- `error` - Error message
- `isAuthenticated` - Boolean authentication status

---

### 2. **Authentication Pages**

#### `/resources/js/Pages/Common/login/SupabaseLogin.jsx`
**Purpose:** Dedicated Supabase login page

**Features:**
- Email/password authentication
- Google OAuth integration
- Password visibility toggle
- Form validation
- Error handling
- Remember me functionality
- Auto-redirect on success

**Route:** `/supabase-login`

**Form Fields:**
- Email (with validation)
- Password (with show/hide)
- Remember me checkbox

---

#### `/resources/js/Pages/Common/login/SupabaseSignup.jsx`
**Purpose:** Dedicated Supabase signup page

**Features:**
- Email/password registration
- Google OAuth signup
- Password confirmation
- Terms & conditions agreement
- Form validation
- Success messaging
- Email verification notice

**Route:** `/supabase-signup`

**Form Fields:**
- First Name
- Last Name
- Email
- Password (with strength requirements)
- Confirm Password
- Terms agreement

---

#### `/resources/js/Pages/Common/login/SupabaseProfileDashboard.jsx`
**Purpose:** User profile management dashboard

**Features:**
- View/edit profile information
- Update user metadata
- Change password
- Email verification status
- Member since date
- Logout functionality
- Real-time updates

**Route:** `/supabase-profile`

**Editable Fields:**
- First Name
- Last Name
- Phone Number

**Security Features:**
- Password change with confirmation
- Session management
- Protected route (requires authentication)

---

### 3. **Debugging & Status Components**

#### `/resources/js/Pages/SupabaseAuthDebug.jsx`
**Purpose:** Comprehensive authentication debugging tool

**Features:**
- Authentication status display
- User object inspection
- Session details
- LocalStorage data view
- Supabase configuration check
- Copy-to-clipboard functionality
- Quick navigation links

**Route:** `/supabase-auth-debug`

**Displays:**
- Current user data (JSON)
- Session information (JSON)
- LocalStorage contents
- Configuration status
- Authentication state

---

#### `/resources/js/Components/SupabaseAuthStatus.jsx`
**Purpose:** Visual authentication status component

**Features:**
- User information display
- Session details
- Email verification status
- User metadata viewer
- Quick action buttons
- Styled status indicators

**Route:** `/supabase-auth-status`

---

#### `/resources/js/Components/SupabaseAuthStatusFallback.jsx`
**Purpose:** Loading state component

**Features:**
- Animated spinner
- Customizable message
- Consistent styling

---

## 🧪 Test Files

### 1. **test-supabase-auth.js**
**Purpose:** Authentication functionality tests

**Tests:**
- Environment variables
- Client creation
- Database connection
- Auth configuration
- Sign up flow
- OAuth configuration

**Run:**
```bash
node test-supabase-auth.js
```

---

### 2. **test-supabase-config.js**
**Purpose:** Configuration validation

**Tests:**
- .env file existence
- Required variables
- URL format validation
- JWT token structure
- Frontend config files
- Backend config files
- Dependencies check

**Run:**
```bash
node test-supabase-config.js
```

---

### 3. **test-supabase-integration.js**
**Purpose:** Comprehensive integration tests

**Tests:**
- Database tables access
- Authentication methods
- OAuth providers
- Database operations
- Real-time subscriptions
- Storage buckets
- RPC functions
- Row Level Security (RLS)

**Run:**
```bash
node test-supabase-integration.js
```

---

## 🚀 Quick Start

### Step 1: Environment Setup
Ensure your `.env` file has Supabase credentials:
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
```

### Step 2: Run Configuration Test
```bash
node test-supabase-config.js
```

### Step 3: Run Auth Test
```bash
node test-supabase-auth.js
```

### Step 4: Start Development Server
```bash
npm run dev
```

### Step 5: Test in Browser
Navigate to:
- `/supabase-login` - Login page
- `/supabase-signup` - Signup page
- `/supabase-auth-debug` - Debug info
- `/supabase-auth-status` - Status page

---

## 🔗 Available Routes

| Route | Component | Description | Auth Required |
|-------|-----------|-------------|---------------|
| `/supabase-login` | SupabaseLogin | Login page | No |
| `/supabase-signup` | SupabaseSignup | Signup page | No |
| `/supabase-profile` | SupabaseProfileDashboard | User profile | Yes |
| `/supabase-auth-debug` | SupabaseAuthDebug | Debug tool | No |
| `/supabase-auth-status` | SupabaseAuthStatus | Auth status | No |

---

## 🔐 Authentication Flow

### Email/Password Signup:
1. User fills signup form
2. `signUp()` called with email, password, and metadata
3. Supabase creates user account
4. Email verification sent (if configured)
5. User automatically logged in or redirected to verify email
6. User state synced to localStorage

### Email/Password Login:
1. User fills login form
2. `signIn()` called with email and password
3. Supabase validates credentials
4. Session created
5. User redirected to `/my-trips`
6. Auth state synced to localStorage

### Google OAuth:
1. User clicks "Continue with Google"
2. `signInWithOAuth('google')` called
3. Redirected to Google consent screen
4. User authorizes app
5. Redirected back with token
6. Session created automatically
7. User data synced

### Logout:
1. User clicks logout
2. `signOut()` called
3. Supabase session terminated
4. LocalStorage cleared
5. User redirected to home

---

## 💾 LocalStorage Synchronization

The Supabase components automatically sync with localStorage:

**Stored Items:**
```javascript
{
  isAuthenticated: 'true' | null,
  user: {
    id: 'user-uuid',
    email: 'user@example.com',
    firstName: 'John',
    lastName: 'Doe',
    photoURL: 'https://...',
    role: 'user'
  },
  supabase_token: 'eyJ...' // Access token
}
```

This ensures compatibility with existing components that check localStorage for authentication.

---

## 🎨 Styling

All Supabase components use the existing `login.css` stylesheet for consistency.

**CSS Classes Used:**
- `.login-container`
- `.login-card`
- `.login-form`
- `.form-input`
- `.login-button`
- `.error-message`
- `.success-message`
- `.profile-dashboard`

---

## 🔧 Advanced Usage

### Custom OAuth Redirect
```jsx
const { signInWithOAuth } = useSupabaseAuth();

await signInWithOAuth('google', {
  redirectTo: `${window.location.origin}/custom-redirect`,
  queryParams: {
    access_type: 'offline',
    prompt: 'consent'
  }
});
```

### Update User Profile
```jsx
const { updateProfile } = useSupabaseAuth();

await updateProfile({
  first_name: 'John',
  last_name: 'Doe',
  phone: '+1234567890'
});
```

### Password Reset
```jsx
const { resetPassword } = useSupabaseAuth();

await resetPassword('user@example.com');
```

### Listen to Auth Changes
```jsx
useEffect(() => {
  const { data: { subscription } } = supabase.auth.onAuthStateChange(
    (event, session) => {
      console.log('Auth event:', event);
      // SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED, etc.
    }
  );

  return () => subscription.unsubscribe();
}, []);
```

---

## 🐛 Debugging

### Check Auth Status
Visit `/supabase-auth-debug` to see:
- Current user object
- Session details
- LocalStorage data
- Configuration status

### Common Issues

**Issue:** "Missing Supabase configuration"
**Fix:** Check `.env` file has `SUPABASE_URL` and `SUPABASE_ANON_KEY`

**Issue:** "Invalid login credentials"
**Fix:** Ensure user exists and email is verified (if required)

**Issue:** "OAuth redirect not working"
**Fix:** Add authorized redirect URLs in Supabase Dashboard > Authentication > URL Configuration

**Issue:** "Email not sending"
**Fix:** Configure email templates in Supabase Dashboard > Authentication > Email Templates

---

## 📊 Comparison: Firebase vs Supabase Components

| Feature | Firebase | Supabase |
|---------|----------|----------|
| Context Provider | FirebaseAuthContext | SupabaseAuthContext |
| Login Component | FirebaseLogin | SupabaseLogin |
| Signup Component | FirebaseSignup | SupabaseSignup |
| Profile Dashboard | FirebaseProfileDashboard | SupabaseProfileDashboard |
| Auth Debug | AuthDebug | SupabaseAuthDebug |
| Test Files | test-firebase-*.js | test-supabase-*.js |
| OAuth Support | ✅ | ✅ |
| Email/Password | ✅ | ✅ |
| Phone Auth | ✅ | ✅ (requires setup) |
| Real-time Sync | ✅ | ✅ |
| LocalStorage Sync | ✅ | ✅ |

---

## 🔗 Useful Links

- **Supabase Dashboard:** https://supabase.com/dashboard
- **Auth Documentation:** https://supabase.com/docs/guides/auth
- **OAuth Setup:** https://supabase.com/docs/guides/auth/social-login
- **Row Level Security:** https://supabase.com/docs/guides/auth/row-level-security
- **Email Templates:** https://supabase.com/docs/guides/auth/auth-email-templates

---

## ✅ Component Checklist

- [x] SupabaseAuthContext created
- [x] SupabaseLogin component created
- [x] SupabaseSignup component created
- [x] SupabaseProfileDashboard created
- [x] SupabaseAuthDebug created
- [x] SupabaseAuthStatus created
- [x] SupabaseAuthStatusFallback created
- [x] Test files created (auth, config, integration)
- [x] Routes added to app.jsx
- [x] Provider added to main.jsx
- [x] Documentation created

---

**Status:** ✅ Complete  
**Last Updated:** November 7, 2024  
**Maintainer:** Development Team
