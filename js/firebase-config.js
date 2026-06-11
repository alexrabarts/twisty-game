/**
 * Firebase Configuration
 *
 * This file initializes Firebase for the Twisty Game leaderboard.
 * You need to replace the firebaseConfig object with your actual
 * Firebase project configuration.
 *
 * To get your config:
 * 1. Go to Firebase Console: https://console.firebase.google.com/
 * 2. Select your project: twisty-game-leaderboard
 * 3. Go to Project Settings > General
 * 4. Scroll to "Your apps" and select the web app (or create one)
 * 5. Copy the firebaseConfig object
 */

// Firebase configuration for twisty-game-leaderboard
const firebaseConfig = {
    apiKey: "AIzaSyBsBlLYhDQ_O3EXYyGbRUToY3u6FpxrETk",
    authDomain: "twisty-game-leaderboard.firebaseapp.com",
    databaseURL: "https://twisty-game-leaderboard-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "twisty-game-leaderboard",
    storageBucket: "twisty-game-leaderboard.firebasestorage.app",
    messagingSenderId: "801148152309",
    appId: "1:801148152309:web:64d7f99fa6b4e323a218bc"
};

// Initialize Firebase
let firebaseApp = null;
let firebaseFunctions = null;

try {
    // Check if Firebase SDK is loaded
    if (typeof firebase === 'undefined') {
        console.warn('Firebase SDK not loaded. Leaderboard features will be disabled.');
        console.warn('Include Firebase SDK scripts in index.html to enable leaderboards.');
    } else {
        // Initialize Firebase
        firebaseApp = firebase.initializeApp(firebaseConfig);
        firebaseFunctions = firebase.functions();

        // Use the Firebase emulator only when explicitly requested
        // (?emulator in the URL). Defaulting to it on localhost meant the
        // leaderboard always failed in local play unless an emulator was up -
        // the production backend works fine from localhost.
        if (window.location.search.includes('emulator')) {
            console.log('Using Firebase emulator for local development');
            firebaseFunctions.useEmulator('localhost', 5001);
        }

        console.log('Firebase initialized successfully');
    }
} catch (error) {
    console.error('Firebase initialization error:', error);
}

// Export functions instance for use in LeaderboardService
window.firebaseFunctions = firebaseFunctions;
