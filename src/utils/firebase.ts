import { initializeApp, FirebaseApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';

// Firebase initialization variables
let firebaseAppInstance: FirebaseApp | null = null;
let dbInstance: Firestore | null = null;
let authInstance: Auth | null = null;
let currentUserId: string | null = null; // Exported for use in components

const initFirebase = async () => {
  if (firebaseAppInstance) return; // Already initialized

  try {
    // Construct firebaseConfig from individual environment variables
    const firebaseConfig = {
      apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
      authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
      storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.REACT_APP_FIREBASE_APP_ID
    };

    // Fallback for Canvas preview environment where __firebase_config is globally available
    // This part is less critical if you're primarily deploying to Netlify with env vars
    // but keeps Canvas preview compatibility if __firebase_config provides the full object.
    if (!firebaseConfig.projectId && typeof (window as any).__firebase_config !== 'undefined') {
        const canvasConfig = JSON.parse((window as any).__firebase_config);
        firebaseConfig.apiKey = firebaseConfig.apiKey || canvasConfig.apiKey;
        firebaseConfig.authDomain = firebaseConfig.authDomain || canvasConfig.authDomain;
        firebaseConfig.projectId = firebaseConfig.projectId || canvasConfig.projectId;
        firebaseConfig.storageBucket = firebaseConfig.storageBucket || canvasConfig.storageBucket;
        firebaseConfig.messagingSenderId = firebaseConfig.messagingSenderId || canvasConfig.messagingSenderId;
        firebaseConfig.appId = firebaseConfig.appId || canvasConfig.appId;
    }


    // Basic validation for essential config properties
    if (!firebaseConfig.projectId || !firebaseConfig.apiKey) {
      console.error("FirebaseError: Missing projectId or apiKey in firebase config. Please ensure REACT_APP_FIREBASE_PROJECT_ID and REACT_APP_FIREBASE_API_KEY are set.");
      return; // Stop initialization if essential config is missing
    }

    firebaseAppInstance = initializeApp(firebaseConfig as Record<string, string>); // Cast to handle potential undefined
    dbInstance = getFirestore(firebaseAppInstance);
    authInstance = getAuth(firebaseAppInstance);

    // Initial auth token is usually only present in Canvas environment for preview
    if (authInstance) { // Ensure authInstance is available before signing in
        if (typeof (window as any).__initial_auth_token !== 'undefined') {
            await signInWithCustomToken(authInstance, (window as any).__initial_auth_token);
        } else {
            await signInAnonymously(authInstance); // Fallback to anonymous sign-in for deployed app
        }
        currentUserId = authInstance.currentUser?.uid || crypto.randomUUID();
    } else {
        console.error("Firebase Auth instance is null after initialization.");
        currentUserId = crypto.randomUUID(); // Fallback in case auth instance is unexpectedly null
    }

    console.log("Firebase initialized. Current User ID:", currentUserId);

  } catch (e) {
    console.error("Error initializing Firebase:", e);
  }
};

export { initFirebase, dbInstance, authInstance, currentUserId };
