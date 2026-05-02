import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";

type FirebaseClient = {
  app: FirebaseApp;
  db: Firestore;
};

function readFirebaseConfig() {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  const messagingSenderId = process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID;
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;

  if (!apiKey || !authDomain || !projectId || !storageBucket || !messagingSenderId || !appId) {
    return null;
  }

  return {
    apiKey,
    authDomain,
    projectId,
    storageBucket,
    messagingSenderId,
    appId,
  };
}

export function getFirebaseClient(): FirebaseClient | null {
  const config = readFirebaseConfig();
  if (!config) {
    return null;
  }

  const app = getApps().length > 0 ? getApp() : initializeApp(config);
  return {
    app,
    db: getFirestore(app),
  };
}

export function getFirebaseWorkspaceId() {
  return process.env.NEXT_PUBLIC_FIREBASE_WORKSPACE_ID || "default";
}
