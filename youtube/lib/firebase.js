// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import {getAuth,GoogleAuthProvider} from "firebase/auth"
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyApFSwTGGa_K_5MbU2URZQRLisBQMd4yaQ",
  authDomain: "yourtube-33afe.firebaseapp.com",
  projectId: "yourtube-33afe",
  storageBucket: "yourtube-33afe.firebasestorage.app",
  messagingSenderId: "83259645654",
  appId: "1:83259645654:web:7cfa83f5705fbbd8c5f377"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth=getAuth(app)
const provider=new GoogleAuthProvider()
export {auth,provider}