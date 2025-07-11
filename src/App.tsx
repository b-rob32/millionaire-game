import React, { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth'; // Import from firebase/auth
import { doc, onSnapshot } from 'firebase/firestore'; // Fixed: Directly import Firestore functions
import { initFirebase, authInstance, dbInstance } from './utils/firebase'; // Import firebase setup, including dbInstance
import LobbyScreen from './components/LobbyScreen';
import FastestFingerScreen from './components/FastestFingerScreen';
import GameScreen from './components/GameScreen';
import SinglePlayerGameScreen from './components/SinglePlayerGameScreen'; // Corrected: Import SinglePlayerGameScreen

export default function App() {
  const [roomId, setRoomId] = useState<string | null>(null);
  const [playerName, setPlayerName] = useState('');
  const [userId, setUserId] = useState<string | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [gameMode, setGameMode] = useState('none'); // 'none', 'singlePlayer', 'multiplayer'
  const [roomStatus, setRoomStatus] = useState('lobby'); // Only relevant for multiplayer

  useEffect(() => {
    // Firebase initialization only needs to happen once at the top level
    initFirebase().then(() => {
        // Ensure authInstance is not null before using it
        if (authInstance) {
            const unsubscribe = onAuthStateChanged(authInstance, (user) => {
                if (user) {
                    setUserId(user.uid);
                } else {
                    setUserId(crypto.randomUUID());
                }
                setIsAuthReady(true);
            });
            return () => unsubscribe();
        } else {
            console.error("Auth instance is null, cannot set up auth state listener. Firebase initialization might have failed.");
            setIsAuthReady(true); // Still set ready to allow UI to proceed if Firebase init failed gracefully
        }
    });
  }, []);

  // Effect to listen to room status changes (only for multiplayer mode)
  useEffect(() => {
    // Check for window existence and ensure dbInstance is available before attempting Firestore operations
    if (typeof window !== 'undefined' && gameMode === 'multiplayer' && roomId && dbInstance) { // dbInstance is already imported and checked for null
      
      // Use process.env.REACT_APP_ID for Netlify deployment
      const appId = process.env.REACT_APP_ID || (window as any).__app_id || 'default-app-id';
      // Fixed: Directly use dbInstance, which is guaranteed non-null by the 'if' condition
      const roomRef = doc(dbInstance, `artifacts/${appId}/public/data/rooms`, roomId); 

      const unsubscribe = onSnapshot(roomRef, (docSnap: any) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setRoomStatus(data.status);
        } else {
          setRoomStatus('lobby'); // Room deleted or non-existent
          setRoomId(null);
          // If room disappears in multiplayer, reset gameMode to 'none'
          if (gameMode === 'multiplayer') setGameMode('none');
        }
      });
      return () => unsubscribe();
    } else if (gameMode === 'multiplayer' && !roomId) {
        setRoomStatus('lobby'); // Reset status if roomId is cleared in multiplayer
    }
  }, [roomId, gameMode, dbInstance]); // dbInstance is a dependency because its value changes after initFirebase completes


  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-800 via-indigo-900 to-black text-white flex items-center justify-center">
        <p className="text-xl">Initializing game data...</p>
      </div>
    );
  }

  // Render components based on gameMode
  if (gameMode === 'singlePlayer') {
    return <SinglePlayerGameScreen setGameMode={setGameMode} />;
  } else if (gameMode === 'multiplayer') {
    // Multiplayer mode rendering based on roomStatus
    if (roomId && roomStatus === 'fastest-finger') {
        return <FastestFingerScreen roomId={roomId} userId={userId as string} setRoomId={setRoomId} />;
    } else if (roomId && (roomStatus === 'in-game' || roomStatus === 'final-scores')) { // 'final-scores' is handled within GameScreen
        return <GameScreen roomId={roomId} playerName={playerName} userId={userId as string} setRoomId={setRoomId} />;
    } else {
        // Default multiplayer lobby
        return <LobbyScreen setRoomId={setRoomId} setPlayerName={setPlayerName} setGameMode={setGameMode} />;
    }
  } else {
    // Initial mode selection screen
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-800 via-indigo-900 to-black text-white flex flex-col items-center justify-center p-4 font-inter">
        <h1 className="text-4xl md:text-5xl font-extrabold mb-8 text-yellow-500 drop-shadow-lg text-center">
          Who Wants to be a Millionaire?
        </h1>
        <div className="bg-gray-800 p-6 md:p-8 rounded-xl shadow-2xl max-w-sm w-full text-center border-4 border-yellow-500">
          <h2 className="text-3xl font-bold mb-6">Choose Game Mode</h2>
          <button
            onClick={() => setGameMode('singlePlayer')}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-full transition duration-300 ease-in-out transform hover:scale-105 shadow-lg mb-4"
          >
            Single Player
          </button>
          <button
            onClick={() => setGameMode('multiplayer')}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-6 rounded-full transition duration-300 ease-in-out transform hover:scale-105 shadow-lg"
          >
            Multiplayer
          </button>
        </div>
      </div>
    );
  }
}
