// Simple test script for phone authentication
import { initializeApp } from 'firebase/app';
import { getAuth, RecaptchaVerifier, PhoneAuthProvider } from 'firebase/auth';

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDQRZgBAkv6rfSqtJUQk6jLY56ftz0eEMg",
  authDomain: "jets-1b5fa.firebaseapp.com",
  projectId: "jets-1b5fa",
  storageBucket: "jets-1b5fa.firebasestorage.app",
  messagingSenderId: "84512959275",
  appId: "1:84512959275:web:ea8a029a10024492dab36e",
  measurementId: "G-7W4P45Y75Z"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Test function
async function testPhoneAuth() {
  try {
    console.log('Testing phone authentication setup...');
    
    // Check if phone auth is enabled
    console.log('Firebase auth initialized:', !!auth);
    console.log('Project ID:', firebaseConfig.projectId);
    
    // Try to create a RecaptchaVerifier
    const recaptchaVerifier = new RecaptchaVerifier(auth, 'test-recaptcha', {
      size: 'invisible',
      callback: (response) => {
        console.log('reCAPTCHA verified successfully');
      }
    });
    
    console.log('RecaptchaVerifier created successfully');
    
    // Try to create PhoneAuthProvider
    const phoneProvider = new PhoneAuthProvider(auth);
    console.log('PhoneAuthProvider created successfully');
    
    console.log('✅ Phone authentication setup appears to be correct');
    
  } catch (error) {
    console.error('❌ Phone authentication setup error:', error);
    console.error('Error code:', error.code);
    console.error('Error message:', error.message);
  }
}

// Run test when DOM is loaded
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    // Create a test div for reCAPTCHA
    const testDiv = document.createElement('div');
    testDiv.id = 'test-recaptcha';
    testDiv.style.display = 'none';
    document.body.appendChild(testDiv);
    
    testPhoneAuth();
  });
} else {
  testPhoneAuth();
} 