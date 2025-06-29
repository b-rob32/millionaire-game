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
    // Prioritize REACT_APP_FIREBASE_CONFIG from Netlify environment variables
    const firebaseConfigString = process.env.REACT_APP_FIREBASE_CONFIG;
    let firebaseConfig: any = {};

    if (firebaseConfigString) {
      try {
        firebaseConfig = JSON.parse(firebaseConfigString);
      } catch (e) {
        console.error("Error parsing REACT_APP_FIREBASE_CONFIG. Please ensure it's valid JSON string:", e);
        // Fallback to empty config if parsing fails, will trigger projectId check below
        firebaseConfig = {};
      }
    } else {
      // Fallback for Canvas preview environment where __firebase_config is globally available
      firebaseConfig = typeof (window as any).__firebase_config !== 'undefined' ? JSON.parse((window as any).__firebase_config) : {};
      if (!firebaseConfig.projectId) {
          console.warn("REACT_APP_FIREBASE_CONFIG environment variable is not set. Using default or empty config.");
      }
    }

    // Basic validation for essential config properties
    if (!firebaseConfig.projectId || !firebaseConfig.apiKey) {
      console.error("FirebaseError: Missing projectId or apiKey in firebase config. Please ensure REACT_APP_FIREBASE_CONFIG is set correctly on Netlify.");
      // Do not proceed with initializeApp if essential config is missing
      return;
    }

    firebaseAppInstance = initializeApp(firebaseConfig);
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
