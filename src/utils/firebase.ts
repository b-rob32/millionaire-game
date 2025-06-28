import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Firebase initialization variables
let firebaseAppInstance: any = null;
let dbInstance: any = null;
let authInstance: any = null;
let currentUserId: string | null = null; // Exported for use in components

const initFirebase = async () => {
  if (firebaseAppInstance) return; // Already initialized

  try {
    const firebaseConfig = typeof (window as any).__firebase_config !== 'undefined' ? JSON.parse((window as any).__firebase_config) : {};
    firebaseAppInstance = initializeApp(firebaseConfig);
    dbInstance = getFirestore(firebaseAppInstance);
    authInstance = getAuth(firebaseAppInstance);

    if (typeof (window as any).__initial_auth_token !== 'undefined') {
      await signInWithCustomToken(authInstance, (window as any).__initial_auth_token);
    } else {
      await signInAnonymously(authInstance);
    }

    currentUserId = authInstance.currentUser?.uid || crypto.randomUUID();
    console.log("Firebase initialized. Current User ID:", currentUserId);

  } catch (e) {
    console.error("Error initializing Firebase:", e);
    // In a real app, you might display this error to the user
  }
};

export { initFirebase, dbInstance, authInstance, currentUserId };
