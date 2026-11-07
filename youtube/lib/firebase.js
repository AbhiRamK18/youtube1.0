// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import {getAuth,GoogleAuthProvider} from "firebase/auth"
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyByze4_1X94KeRLghAQ4zu6IW1Kxvy53Ps",
  authDomain: "fir-7d375.firebaseapp.com",
  projectId: "fir-7d375",
  storageBucket: "fir-7d375.firebasestorage.app",
  messagingSenderId: "1072683830430",
  appId: "1:1072683830430:web:ae0329966a1883883e7f8f"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth=getAuth(app);
const provider=new GoogleAuthProvider();
export {auth,provider};
