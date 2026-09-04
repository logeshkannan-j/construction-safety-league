// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyA1q41hB7QL8gatydAgNyhhDdLilC9mzA0",
  authDomain: "safety-league.firebaseapp.com",
  databaseURL: "https://safety-league-default-rtdb.firebaseio.com",
  projectId: "safety-league",
  storageBucket: "safety-league.firebasestorage.app",
  messagingSenderId: "509689180005",
  appId: "1:509689180005:web:c1b7837bf687f3ed99bb8c",
  measurementId: "G-RVXBVPYRNV"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);