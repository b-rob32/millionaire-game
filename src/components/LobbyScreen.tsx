import React, { useState, useEffect, useRef } from 'react';
import { doc, setDoc, updateDoc, getDoc, onSnapshot } from 'firebase/firestore';
import { initFirebase, dbInstance, authInstance, currentUserId } from '../utils/firebase';
import MessageBox from './MessageBox';

const LobbyScreen = ({ setRoomId, setPlayerName, setGameMode }: { setRoomId: (id: string | null) => void, setPlayerName: (name: string) => void, setGameMode: (mode: string) => void }) => {
  const [roomCode, setRoomCode] = useState('');
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [message, setMessage] = useState('');
  const [currentRoomPlayers, setCurrentRoomPlayers] = useState<Record<string, any>>({}); // Stores players in the current room
  const [currentRoomStatus, setCurrentRoomStatus] = useState('lobby'); // Stores game status for current room
  const [isHost, setIsHost] = useState(false);
  const [isJoiningRoom, setIsJoiningRoom] = useState(false);

  const roomUnsubscribeRef = useRef<(() => void) | null>(null);
  const currentRoomCodeRef = useRef(''); // To store roomCode from Firestore

  useEffect(() => {
    initFirebase(); // Ensure Firebase is initialized
  }, []);

  const generateRoomCode = () => {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  };

  const handleCreateRoom = async () => {
    if (!name.trim()) {
      setMessage("Please enter your name.");
      return;
    }
    if (!age || parseInt(age) < 5 || parseInt(age) > 100) { // Simple age validation
      setMessage("Please enter a valid age (5-100).");
      return;
    }
    if (!dbInstance) { // Ensure dbInstance is available
        setMessage("Firebase not ready. Please wait a moment and try again.");
        return;
    }

    const newRoomCode = generateRoomCode();
    const newRoomId = `room-${newRoomCode}`;
    const playerUserId = currentUserId; // Use the globally available user ID

    try {
        const appId = typeof (window as any).__app_id !== 'undefined' ? (window as any).__app_id : 'default-app-id';
        const roomRef = doc(dbInstance, `artifacts/${appId}/public/data/rooms`, newRoomId);
        await setDoc(roomRef, {
            gameCode: newRoomCode,
            status: 'lobby', // Initial status is lobby
            hostId: playerUserId,
            players: {
                [playerUserId as string]: {
                    name: name,
                    age: parseInt(age), // Store age
                    score: 0,
                    fiftyFiftyUsed: false,
                    askAudienceUsed: false,
                    phoneFriendUsed: false,
                    isActive: true // Player is active initially
                }
            },
            currentQuestionIndex: 0,
            currentTurnPlayerId: null, // Will be set when game starts
            currentQuestion: null, // AI-generated question for current turn
            isLoadingQuestion: false, // Loading state for AI question
            questionLifelineState: { // Stores results after a lifeline is completed
                disabledOptions: [],
                audienceVote: null,
                friendAnswer: null,
                usedByPlayerId: null
            },
            // New field for active lifeline requests
            activeLifelineRequest: null, // { type: 'audience'|'friend', initiatorId: '', targetPlayerId?: '', questionIndex: number, responses: { playerId: vote/suggestion } }
            playerOrder: [], // To track turn order
            eliminatedPlayers: [], // To track who is out
            contestantHistory: [], // New: Tracks who has completed a turn as contestant
            // Fastest Finger First specific fields
            fffQuestionIndex: 0,
            fffAnswers: {}, // playerId -> { order: [], time: timestamp }
            fffWinnerId: null,
            fffTieParticipants: [], // Array of player IDs if there's a tie
        });
        setRoomId(newRoomId);
        setPlayerName(name);
        setIsHost(true);
        currentRoomCodeRef.current = newRoomCode; // Store the generated room code
        setMessage(`Room created! Share code: ${newRoomCode}`);
        // Listen to updates for the newly created room
        roomUnsubscribeRef.current = onSnapshot(roomRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setCurrentRoomPlayers(data.players || {});
                setCurrentRoomStatus(data.status);
            } else {
                setMessage("Room no longer exists.");
                setRoomId(null); // Clear room ID to go back to lobby creation
                currentRoomCodeRef.current = ''; // Clear stored room code
            }
        });
    } catch (e) {
        console.error("Error creating room:", e);
        setMessage("Failed to create room. Please try again.");
    }
  };

  const handleJoinRoom = async () => {
    if (!name.trim() || !roomCode.trim()) {
      setMessage("Please enter your name and the game code.");
      return;
    }
    if (!age || parseInt(age) < 5 || parseInt(age) > 100) { // Simple age validation
      setMessage("Please enter a valid age (5-100).");
      return;
    }
    if (!dbInstance) { // Ensure dbInstance is available
        setMessage("Firebase not ready. Please wait a moment and try again.");
        return;
    }

    const roomIdToJoin = `room-${roomCode.toUpperCase()}`;
    const playerUserId = currentUserId;

    try {
        setIsJoiningRoom(true);
        const appId = typeof (window as any).__app_id !== 'undefined' ? (window as any).__app_id : 'default-app-id';
        const roomRef = doc(dbInstance, `artifacts/${appId}/public/data/rooms`, roomIdToJoin);
        const docSnap = await getDoc(roomRef);

        if (docSnap.exists()) {
            const roomData = docSnap.data();
            if (roomData.status !== 'lobby') {
                setMessage("Cannot join: Game has already started or finished.");
                setIsJoiningRoom(false);
                return;
            }
            if (Object.keys(roomData.players).length >= 4) { // Max 4 players
                setMessage("Room is full. Maximum 4 players allowed.");
                setIsJoiningRoom(false);
                return;
            }

            // Check if player already exists in the room to avoid duplicate entry
            if (roomData.players && roomData.players[playerUserId as string]) {
                setMessage("You are already in this room.");
                setRoomId(roomIdToJoin);
                setPlayerName(name);
                setIsHost(roomData.hostId === playerUserId); // Re-check host status
                currentRoomCodeRef.current = roomData.gameCode; // Store the room code from Firestore
                // Listen to updates for the room
                roomUnsubscribeRef.current = onSnapshot(roomRef, (docSnap) => {
                    if (docSnap.exists()) {
                        const data = docSnap.data();
                        setCurrentRoomPlayers(data.players || {});
                        setCurrentRoomStatus(data.status);
                        setIsHost(data.hostId === playerUserId);
                    } else {
                        setMessage("Room no longer exists.");
                        setRoomId(null);
                        currentRoomCodeRef.current = ''; // Clear stored room code
                    }
                });
                setIsJoiningRoom(false);
                return;
            }

            // Add player to the room's players map
            await updateDoc(roomRef, {
                [`players.${playerUserId as string}`]: {
                    name: name,
                    age: parseInt(age), // Store age
                    score: 0,
                    fiftyFiftyUsed: false,
                    askAudienceUsed: false,
                    phoneFriendUsed: false,
                    isActive: true
                }
            });

            setRoomId(roomIdToJoin);
            setPlayerName(name);
            setIsHost(roomData.hostId === playerUserId);
            currentRoomCodeRef.current = roomData.gameCode; // Store the room code from Firestore
            setMessage(`Joined room: ${roomCode.toUpperCase()}`);

            // Listen to updates for the joined room
            roomUnsubscribeRef.current = onSnapshot(roomRef, (docSnap) => {
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    setCurrentRoomPlayers(data.players || {});
                    setCurrentRoomStatus(data.status);
                    setIsHost(data.hostId === playerUserId);
                } else {
                    setMessage("Room no longer exists.");
                    setRoomId(null); // Clear room ID to go back to lobby creation
                    currentRoomCodeRef.current = ''; // Clear stored room code
                }
            });
        } else {
            setMessage("Room not found. Please check the code.");
        }
    } catch (e) {
        console.error("Error joining room:", e);
        setMessage("Failed to join room. Please try again.");
    } finally {
        setIsJoiningRoom(false);
    }
  };

  const handleStartGame = async () => {
    if (!isHost) {
      setMessage("Only the host can start the game.");
      return;
    }
    const activePlayersArray = Object.keys(currentRoomPlayers).filter(
      (id) => currentRoomPlayers[id].isActive
    );
    if (activePlayersArray.length < 2) {
      setMessage("Need at least 2 players to start the game.");
      return;
    }

    try {
      const appId = typeof (window as any).__app_id !== 'undefined' ? (window as any).__app_id : 'default-app-id';
      const roomRef = doc(dbInstance, `artifacts/${appId}/public/data/rooms`, `room-${currentRoomCodeRef.current}`);
      await updateDoc(roomRef, {
        status: 'fastest-finger', // Transition to Fastest Finger First round
        fffQuestionIndex: 0,
        fffAnswers: {}, // Reset FFF answers for the new round
        fffWinnerId: null,
        fffTieParticipants: [],
        playerOrder: activePlayersArray, // Initial order for FFF
      });
    } catch (e) {
      console.error("Error starting game:", e);
      setMessage("Failed to start game. Please try again.");
    }
  };

  useEffect(() => {
    return () => {
      // Unsubscribe from Firestore listener when component unmounts
      if (roomUnsubscribeRef.current) {
        roomUnsubscribeRef.current();
      }
    };
  }, []);

  // If already in a room and game has started, navigate to game screen
  if (currentRoomStatus === 'in-game' || currentRoomStatus === 'fastest-finger' || currentRoomStatus === 'final-scores') {
    return null; // The App component will handle rendering GameScreen or FastestFingerScreen
  }

  const numPlayers = Object.keys(currentRoomPlayers).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-800 via-indigo-900 to-black text-white flex flex-col items-center justify-center p-4 font-inter">
      <h1 className="text-4xl md:text-5xl font-extrabold mb-8 text-yellow-500 drop-shadow-lg text-center">
        Who Wants to be a Millionaire?
      </h1>

      <div className="bg-gray-800 p-6 md:p-8 rounded-xl shadow-2xl max-w-lg w-full border-4 border-yellow-500">
        {roomUnsubscribeRef.current ? ( // If listening to a room
          <>
            <h2 className="text-3xl font-bold mb-4 text-center">Lobby: {currentRoomCodeRef.current}</h2>
            <p className="text-lg text-center mb-6">Players: {numPlayers} / 4</p>
            <div className="mb-6">
              <h3 className="text-xl font-semibold mb-3">Joined Players:</h3>
              <ul className="list-disc list-inside space-y-2">
                {Object.entries(currentRoomPlayers).map(([id, player]) => (
                  <li key={id} className="flex justify-between items-center text-lg">
                    <span>{player.name} (Age: {player.age}) {id === currentUserId ? '(You)' : ''} {id === (currentRoomPlayers as any).hostId ? '(Host)' : ''}</span>
                    <span className={`text-sm ${player.isActive ? 'text-green-400' : 'text-red-400'}`}>
                      {player.isActive ? 'Active' : 'Eliminated'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            {isHost && (numPlayers >= 2) && (
              <button
                onClick={handleStartGame}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-full transition duration-300 ease-in-out transform hover:scale-105 shadow-lg"
              >
                Start Game
              </button>
            )}
            {isHost && numPlayers < 2 && (
                <p className="text-center text-red-300 mt-4">Need at least 2 players to start.</p>
            )}
            <button
                onClick={() => setRoomId(null)} // Go back to mode selection by clearing roomId
                className="w-full bg-gray-500 hover:bg-gray-600 text-white font-bold py-3 px-6 rounded-full transition duration-300 ease-in-out transform hover:scale-105 shadow-lg mt-4"
            >
                Back to Mode Selection
            </button>
          </>
        ) : ( // If not in a room yet
          <>
            <h2 className="text-3xl font-bold mb-6 text-center">Create or Join Game</h2>
            <input
              type="text"
              placeholder="Your Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full p-3 mb-4 rounded-lg bg-gray-700 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-500"
            />
            <input
              type="number"
              placeholder="Your Age (5-100)"
              value={age}
              onChange={(e) => setAge(e.target.value)}
              className="w-full p-3 mb-4 rounded-lg bg-gray-700 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-500"
              min="5"
              max="100"
            />
            <button
              onClick={handleCreateRoom}
              className="w-full bg-yellow-500 hover:bg-yellow-600 text-purple-900 font-extrabold py-3 px-6 rounded-full transition duration-300 ease-in-out transform hover:scale-105 shadow-lg mb-4"
            >
              Create New Room
            </button>
            <div className="flex items-center justify-center my-4">
              <span className="text-xl font-bold text-gray-400">OR</span>
            </div>
            <input
              type="text"
              placeholder="Enter Game Code"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              className="w-full p-3 mb-4 rounded-lg bg-gray-700 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-500"
              maxLength={6} // Corrected: Passed as a number
            />
            <button
              onClick={handleJoinRoom}
              disabled={isJoiningRoom}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-full transition duration-300 ease-in-out transform hover:scale-105 shadow-lg"
            >
              {isJoiningRoom ? 'Joining...' : 'Join Room'}
            </button>
            <button
                onClick={() => setGameMode('none')}
                className="w-full bg-gray-500 hover:bg-gray-600 text-white font-bold py-3 px-6 rounded-full transition duration-300 ease-in-out transform hover:scale-105 shadow-lg mt-4"
            >
                Back to Mode Selection
            </button>
          </>
        )}
      </div>
      <MessageBox message={message} onClose={() => setMessage('')} />
    </div>
  );
};

export default LobbyScreen;
