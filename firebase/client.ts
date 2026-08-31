import {initializeApp, getApp, getApps} from "firebase/app";
import {getAuth} from 'firebase/auth';
import {getFirestore} from 'firebase/firestore';

const firebaseConfig = {
    apiKey: "AIzaSyC6UbORG93celqjBtqIv9n3sJZoq3hd8PE",
    authDomain: "prep-wise-7c57b.firebaseapp.com",
    projectId: "prep-wise-7c57b",
    storageBucket: "prep-wise-7c57b.firebasestorage.app",
    messagingSenderId: "1032527472531",
    appId: "1:1032527472531:web:3cd4f85dc8a47b0f3aaa66",
    measurementId: "G-SJPQ0V2LFB"
};

const app = !getApps.length ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);
export const db = getFirestore(app);