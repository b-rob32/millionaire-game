import React, { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth'; // Import from firebase/auth
import { initFirebase, authInstance } from './utils/firebase'; // Import firebase setup
import LobbyScreen from './components/LobbyScreen';
import FastestFingerScreen from './components/FastestFingerScreen';
import GameScreen from './components/GameScreen';

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
        const unsubscribe = onAuthStateChanged(authInstance, (user) => {
            if (user) {
                setUserId(user.uid);
            } else {
                setUserId(crypto.randomUUID());
            }
            setIsAuthReady(true);
        });
        return () => unsubscribe();
    });
  }, []);

  // Effect to listen to room status changes (only for multiplayer mode)
  useEffect(() => {
    // Check for window existence to ensure it runs only in browser environment
    if (typeof window !== 'undefined' && gameMode === 'multiplayer' && roomId && authInstance.currentUser) {
      const { getFirestore, doc, onSnapshot } = require('firebase/firestore'); // Dynamically import Firestore
      const dbInstance = getFirestore(); // Get instance after app is initialized
      const appId = typeof (window as any).__app_id !== 'undefined' ? (window as any).__app_id : 'default-app-id';
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
  }, [roomId, gameMode]);


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
