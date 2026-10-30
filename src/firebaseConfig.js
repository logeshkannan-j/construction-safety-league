// Firebase project configuration + safe Analytics bootstrap.
import { getApp, getApps, initializeApp } from "firebase/app";
import { getAnalytics, isSupported as analyticsIsSupported } from "firebase/analytics";

// Your web app's Firebase configuration.
// Note: a Firebase web apiKey is not a secret — it identifies the project
// and is expected to ship in client code. What protects the data is the
// Realtime Database rules in rules.json, so keep those tight.
export const firebaseConfig = {
  apiKey: "AIzaSyA1q41hB7QL8gatydAgNyhhDdLilC9mzA0",
  authDomain: "safety-league.firebaseapp.com",
  databaseURL: "https://safety-league-c3c84-default-rtdb.firebaseio.com",
  projectId: "safety-league",
  storageBucket: "safety-league.firebasestorage.app",
  messagingSenderId: "509689180005",
  appId: "1:509689180005:web:c1b7837bf687f3ed99bb8c",
  measurementId: "G-RVXBVPYRNV"
};

// Initialise once. getApps() guards against a second initialisation when
// another module (storage.js, the Arena's arenaDb.js) has already done it.
export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Analytics is OPTIONAL and must never be allowed to break the app.
// getAnalytics() throws synchronously in any environment it does not
// support — cookies disabled, private browsing on some platforms, certain
// in-app webviews, or a server-side/test context with no `window`. This
// module is imported by storage.js, which is imported by App.jsx, so an
// unguarded call takes the entire quiz down with it. isSupported() asks
// first, and the catch covers everything else.
export let firebaseAnalytics = null;
analyticsIsSupported()
  .then((supported) => {
    if (!supported) return;
    try {
      firebaseAnalytics = getAnalytics(firebaseApp);
    } catch (e) {
      console.warn("[firebase] Analytics unavailable, continuing without it", e);
    }
  })
  .catch(() => { /* Analytics is nice to have, never required. */ });
