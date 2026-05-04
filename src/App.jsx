import React, { useState, useEffect } from 'react';
import { UserPlus, RotateCcw, Eye, Play, Plus, Minus, MessageSquare } from 'lucide-react';
import wordData from './words.json';

const CARD_COLORS = ['bg-yellow-400', 'bg-blue-400', 'bg-red-400', 'bg-green-400', 'bg-purple-400', 'bg-pink-400'];

export default function App() {
    // --- PERSISTENCE ---
    const [screen, setScreen] = useState(() => localStorage.getItem('game_screen') || 'setup');
    const [players, setPlayers] = useState(() => JSON.parse(localStorage.getItem('players')) || []);

    // Hidden Logic State (Fairness Engine)
    const [lastSpecialRoles, setLastSpecialRoles] = useState(() => JSON.parse(localStorage.getItem('last_specials')) || []);
    const [pityCounters, setPityCounters] = useState(() => JSON.parse(localStorage.getItem('pity_counters')) || {});
    const [lockoutCounters, setLockoutCounters] = useState(() => JSON.parse(localStorage.getItem('lockout_counters')) || {});
    const [consecutiveSpecials, setConsecutiveSpecials] = useState(() => JSON.parse(localStorage.getItem('consecutive_specials')) || {});

    const [newPlayer, setNewPlayer] = useState('');
    const [selectedCategories, setSelectedCategories] = useState(['Foods & Drinks']);
    const [imposterCount, setImposterCount] = useState(1);
    const [toggles, setToggles] = useState({ jester: false, troll: false, doppel: false, hints: true });
    const [showFinalRoles, setShowFinalRoles] = useState(false);

    const [gameState, setGameState] = useState(() => {
        const saved = localStorage.getItem('game_state');
        return saved ? JSON.parse(saved) : {
            currentPlayerIndex: 0, playerRoles: [], roundMode: 'Normal',
            isHolding: false, hasSeenCurrent: false, secretWord: '', starterPlayer: ''
        };
    });

    useEffect(() => {
        localStorage.setItem('players', JSON.stringify(players));
        localStorage.setItem('last_specials', JSON.stringify(lastSpecialRoles));
        localStorage.setItem('pity_counters', JSON.stringify(pityCounters));
        localStorage.setItem('lockout_counters', JSON.stringify(lockoutCounters));
        localStorage.setItem('consecutive_specials', JSON.stringify(consecutiveSpecials));
        localStorage.setItem('game_screen', screen);
        localStorage.setItem('game_state', JSON.stringify(gameState));
    }, [players, lastSpecialRoles, pityCounters, lockoutCounters, consecutiveSpecials, screen, gameState]);

    const shuffleArray = (array) => {
        let currentIndex = array.length;
        while (currentIndex !== 0) {
            let randomIndex = Math.floor(Math.random() * currentIndex);
            currentIndex--;
            [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
        }
        return array;
    };

    const startGame = () => {
        if (players.length < 3) return alert("Add at least 3 players!");
        if (selectedCategories.length === 0) return alert("Select at least one category!");

        // 1. Determine Mode
        let pickedMode = 'Normal';
        const modeDice = Math.random();
        if (toggles.troll && toggles.doppel) {
            if (modeDice < 0.15) pickedMode = 'Troll';
            else if (modeDice < 0.30) pickedMode = 'Doppelganger';
        } else if (toggles.troll && modeDice < 0.25) pickedMode = 'Troll';
        else if (toggles.doppel && modeDice < 0.25) pickedMode = 'Doppelganger';

        // 2. Word Pick from Selected Categories
        const allWords = wordData.categories
            .filter(c => selectedCategories.includes(c.name))
            .flatMap(c => c.words);

        if (allWords.length < 2) return alert("Not enough words in selected categories!");

        const secret = allWords[Math.floor(Math.random() * allWords.length)];
        const secretAlt = allWords.find(w => w.word !== secret.word) || secret;

        // 3. Fairness Pool Logic
        const eligiblePlayers = players.filter(p => (lockoutCounters[p] || 0) === 0);
        const lockedPlayers = players.filter(p => (lockoutCounters[p] || 0) > 0);

        let specialPool = shuffleArray([...eligiblePlayers]);

        const stalePlayers = eligiblePlayers.filter(p => (pityCounters[p] || 0) >= 8);
        if (stalePlayers.length > 0) {
            specialPool = [...shuffleArray(stalePlayers), ...specialPool.filter(p => !stalePlayers.includes(p))];
        }

        const starter = players[Math.floor(Math.random() * players.length)];
        let roles = players.map(name => ({ name, role: 'Citizen', word: secret.word, hint: null }));
        let currentRoundSpecials = [];

        // Assign Imposters
        for (let i = 0; i < imposterCount; i++) {
            const name = specialPool[i] || lockedPlayers[i];
            currentRoundSpecials.push(name);
            const idx = roles.findIndex(r => r.name === name);
            const rHint = secret.hints[Math.floor(Math.random() * secret.hints.length)];
            roles[idx].role = 'Imposter';
            roles[idx].word = '???';
            roles[idx].hint = toggles.hints ? rHint : null;
        }

        // Assign Jester
        if (toggles.jester) {
            const name = specialPool[imposterCount] || lockedPlayers[imposterCount];
            currentRoundSpecials.push(name);
            const idx = roles.findIndex(r => r.name === name);
            roles[idx].role = 'Jester';
            roles[idx].word = '???';
            roles[idx].hint = "Try to get voted out!";
        }

        // Update Trackers
        const newPity = { ...pityCounters };
        const newLockout = { ...lockoutCounters };
        const newConsecutive = { ...consecutiveSpecials };

        players.forEach(p => {
            const isSpecial = currentRoundSpecials.includes(p);
            const wasSpecialLast = lastSpecialRoles.includes(p);
            if (isSpecial) {
                newPity[p] = 0;
                if (wasSpecialLast) { newLockout[p] = 3; newConsecutive[p] = 0; }
                else { newConsecutive[p] = 1; }
            } else {
                newPity[p] = (newPity[p] || 0) + 1;
                newConsecutive[p] = 0;
                if (newLockout[p] > 0) newLockout[p] -= 1;
            }
        });

        setPityCounters(newPity);
        setLockoutCounters(newLockout);
        setConsecutiveSpecials(newConsecutive);
        setLastSpecialRoles(currentRoundSpecials);

        // Apply Modes
        if (pickedMode === 'Troll') {
            roles = roles.map(r => {
                const trollWord = allWords[Math.floor(Math.random() * allWords.length)];
                return { ...r, role: 'Imposter', word: '???', hint: trollWord.hints[0] };
            });
        } else if (pickedMode === 'Doppelganger') {
            const citizens = roles.filter(r => r.role === 'Citizen');
            citizens.forEach((c, i) => { if (i >= Math.ceil(citizens.length / 2)) c.word = secretAlt.word; });
        }

        setGameState({
            currentPlayerIndex: 0, playerRoles: roles, roundMode: pickedMode,
            isHolding: false, hasSeenCurrent: false, secretWord: secret.word, starterPlayer: starter
        });
        setShowFinalRoles(false);
        setScreen('pass');
    };

    return (
        <div className="min-h-screen relative overflow-x-hidden bg-[#fdfdfd]"
             style={{
                 backgroundImage: `
                    linear-gradient(90deg, transparent 79px, #abced4 79px, #abced4 81px, transparent 81px),
                    linear-gradient(#eee 0.1em, transparent 0.1em)
                 `,
                 backgroundSize: '100% 1.2em'
             }}>

            {screen === 'setup' && (
                <div className="p-6 max-w-md mx-auto space-y-6 pb-28 select-none relative z-10">
                    <h1 className="text-4xl font-black text-center text-lime-600 italic uppercase drop-shadow-md">Imposter Who?</h1>

                    {/* Players Section */}
                    <div className="bg-white/80 backdrop-blur-sm p-4 rounded-2xl shadow-sm border-2 border-gray-100 space-y-3">
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Players ({players.length})</label>
                        <div className="flex gap-2">
                            <input className="flex-1 border-b-2 border-gray-200 p-2 outline-none bg-transparent" placeholder="Name..." value={newPlayer} onChange={e => setNewPlayer(e.target.value)} />
                            <button onClick={() => { if(newPlayer) { setPlayers([...players, newPlayer]); setNewPlayer(''); } }} className="bg-lime-400 p-2 rounded-xl active:scale-90"><UserPlus size={20}/></button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {players.map((p, i) => (
                                <span key={i} className="bg-white border-2 border-dashed border-gray-300 px-3 py-1 rounded-lg text-sm font-bold flex items-center gap-2 shadow-sm">
                                    {p} <button onClick={() => setPlayers(players.filter((_, idx) => idx !== i))} className="text-red-500 font-black">×</button>
                                </span>
                            ))}
                        </div>
                    </div>

                    {/* Categories Section */}
                    <div className="bg-white/80 backdrop-blur-sm p-4 rounded-2xl shadow-sm border-2 border-gray-100">
                        <label className="text-xs font-bold text-gray-400 uppercase mb-2 block tracking-widest">Categories</label>
                        <div className="flex flex-wrap gap-2">
                            {wordData.categories.map(c => (
                                <button key={c.name}
                                        onClick={() => setSelectedCategories(prev => prev.includes(c.name) ? prev.filter(x => x !== c.name) : [...prev, c.name])}
                                        className={`px-4 py-2 rounded-xl border-2 transition-all text-xs font-black uppercase ${selectedCategories.includes(c.name) ? 'border-lime-400 bg-lime-50 text-lime-700' : 'border-gray-100 text-gray-400'}`}>
                                    {c.name}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Imposters Section */}
                    <div className="bg-white/80 backdrop-blur-sm p-4 rounded-2xl shadow-sm border-2 border-gray-100 flex justify-between items-center">
                        <span className="font-bold">Imposters</span>
                        <div className="flex items-center gap-4">
                            <button onClick={() => setImposterCount(Math.max(1, imposterCount - 1))} className="p-1 bg-gray-100 rounded-lg"><Minus /></button>
                            <span className="text-xl font-black">{imposterCount}</span>
                            <button onClick={() => setImposterCount(Math.min(3, imposterCount + 1))} className="p-1 bg-gray-100 rounded-lg"><Plus /></button>
                        </div>
                    </div>

                    <div className="bg-white/80 backdrop-blur-sm p-4 rounded-2xl shadow-sm border-2 border-gray-100 space-y-2">
                        <ToggleItem title="Hints (Imposter Only)" desc="Imposters get different clues" val={toggles.hints} onChange={() => setToggles({...toggles, hints: !toggles.hints})} />
                        <ToggleItem title="Jester Mode" desc="Jester wins if voted out" val={toggles.jester} onChange={() => setToggles({...toggles, jester: !toggles.jester})} />
                        <ToggleItem title="Troll Mode" desc="Everyone is Imposter" val={toggles.troll} onChange={() => setToggles({...toggles, troll: !toggles.troll})} />
                        <ToggleItem title="Doppelganger" desc="Split group words" val={toggles.doppel} onChange={() => setToggles({...toggles, doppel: !toggles.doppel})} />
                    </div>

                    <button onClick={startGame} className="fixed bottom-6 left-6 right-6 bg-lime-400 font-black py-4 rounded-2xl shadow-xl border-b-4 border-lime-600 flex items-center justify-center gap-3 uppercase text-lg active:scale-95 transition-transform z-20">
                        <Play fill="black" /> Start Game
                    </button>
                </div>
            )}

            {/* ... rest of the pass/discussion screens remain exactly as they were ... */}
            {screen === 'pass' && (
                <div className="h-screen flex flex-col items-center justify-center p-6 text-center space-y-8 select-none touch-none relative z-10">
                    <div className="space-y-2">
                        <p className="text-lg font-bold text-gray-400 uppercase">Pass the phone to</p>
                        <h2 className="text-6xl font-black tracking-tighter text-gray-800">{gameState.playerRoles[gameState.currentPlayerIndex].name}</h2>
                    </div>

                    <div
                        onPointerDown={(e) => { e.preventDefault(); setGameState({...gameState, isHolding: true, hasSeenCurrent: true}); if(navigator.vibrate) navigator.vibrate(40); }}
                        onPointerUp={() => setGameState({...gameState, isHolding: false})}
                        onPointerLeave={() => setGameState({...gameState, isHolding: false})}
                        onPointerCancel={() => setGameState({...gameState, isHolding: false})}
                        onContextMenu={(e) => e.preventDefault()}
                        className={`w-72 h-80 rounded-[2.5rem] shadow-2xl flex flex-col items-center justify-center transition-all duration-75 border-4 border-black/10 ${gameState.isHolding ? 'scale-95' : 'scale-100'} ${CARD_COLORS[gameState.currentPlayerIndex % CARD_COLORS.length]}`}
                    >
                        {gameState.isHolding ? (
                            <div className="p-8 space-y-4 text-white animate-in zoom-in duration-100">
                                {gameState.playerRoles[gameState.currentPlayerIndex].role === 'Imposter' ? (
                                    <h3 className="text-2xl font-black text-red-950 uppercase italic underline decoration-red-400">IMPOSTER!</h3>
                                ) : (
                                    <span className="bg-white/30 px-4 py-1 rounded-full text-xs font-black uppercase tracking-widest">{gameState.playerRoles[gameState.currentPlayerIndex].role}</span>
                                )}
                                <h3 className="text-4xl font-black drop-shadow-lg underline decoration-white/30">{gameState.playerRoles[gameState.currentPlayerIndex].word}</h3>
                                {gameState.playerRoles[gameState.currentPlayerIndex].hint && (
                                    <div className="bg-white/90 p-3 rounded-xl border-2 border-black/5 mt-4">
                                        <p className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Secret Clue</p>
                                        <p className="text-sm font-black text-black italic">"{gameState.playerRoles[gameState.currentPlayerIndex].hint}"</p>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center gap-4 text-white/50">
                                <Eye size={80} strokeWidth={3} />
                                <p className="font-black uppercase tracking-widest animate-pulse">Hold to Reveal</p>
                            </div>
                        )}
                    </div>

                    {gameState.hasSeenCurrent && !gameState.isHolding && (
                        <button onClick={() => {
                            if (gameState.currentPlayerIndex < players.length - 1) {
                                setGameState({...gameState, currentPlayerIndex: gameState.currentPlayerIndex + 1, hasSeenCurrent: false});
                            } else { setScreen('discussion'); }
                        }} className="bg-black text-white px-10 py-4 rounded-2xl font-black text-lg shadow-lg active:scale-90 transition-transform">NEXT PLAYER →</button>
                    )}
                </div>
            )}

            {screen === 'discussion' && (
                <div className="min-h-screen p-6 flex flex-col items-center justify-center space-y-6 select-none relative z-10">
                    <div className="space-y-1 text-center">
                        <h2 className="text-4xl font-black italic uppercase text-gray-800">Discussion!</h2>
                        <p className="text-gray-400 text-xs font-bold uppercase tracking-widest">Game Mode: {gameState.roundMode}</p>
                    </div>

                    <div className="w-full max-w-sm bg-white/90 backdrop-blur-sm p-6 rounded-3xl border-2 border-gray-200 shadow-sm space-y-4">
                        <div className="text-center">
                            <p className="text-[10px] font-black text-gray-400 uppercase mb-1 tracking-widest">Starting Player</p>
                            <div className="flex items-center justify-center gap-2">
                                <MessageSquare className="text-lime-600" size={24} />
                                <p className="text-2xl font-black text-black uppercase underline decoration-lime-400 decoration-4">{gameState.starterPlayer}</p>
                            </div>
                        </div>

                        {showFinalRoles && (
                            <div className="pt-4 border-t-2 border-gray-100 text-center animate-in fade-in slide-in-from-top-2">
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">The Secret Word</p>
                                <div className="border-[6px] border-dashed border-red-600 rounded-3xl py-4 px-6 inline-block bg-red-50">
                                    <p className="text-4xl font-black text-red-700 uppercase tracking-tighter">{gameState.secretWord}</p>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="w-full max-w-sm space-y-2">
                        {gameState.playerRoles.map((r, i) => (
                            <div key={i} className="bg-white border-2 border-gray-100 p-4 rounded-xl flex justify-between items-center font-bold shadow-sm">
                                <span className="uppercase text-sm tracking-tight text-gray-700">{r.name}</span>
                                {showFinalRoles && (
                                    <span className={`uppercase text-[10px] px-3 py-1 rounded-full font-black ${
                                        r.role === 'Citizen' ? 'bg-gray-100 text-gray-400' : 'bg-red-600 text-white animate-pulse'
                                    }`}>{r.role}</span>
                                )}
                            </div>
                        ))}
                    </div>

                    <div className="flex flex-col gap-4 w-full max-w-sm mt-4">
                        <button onClick={() => setShowFinalRoles(!showFinalRoles)} className="bg-black text-white py-4 rounded-2xl font-black shadow-lg active:scale-95 transition-all text-lg uppercase tracking-widest">
                            {showFinalRoles ? "Hide Result" : "Reveal Roles"}
                        </button>
                        <button onClick={() => {
                            localStorage.removeItem('game_screen');
                            localStorage.removeItem('game_state');
                            setScreen('setup');
                            window.scrollTo(0, 0);
                        }} className="text-gray-400 font-black uppercase tracking-widest text-[10px] py-2 flex items-center justify-center gap-2 active:text-black">
                            <RotateCcw size={14} /> New Game (Keep Players)
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

function ToggleItem({ title, desc, val, onChange }) {
    return (
        <div className="flex justify-between items-center bg-white/50 p-4 rounded-2xl border-2 border-gray-100 shadow-sm active:bg-lime-50" onClick={onChange}>
            <div className="flex-1 pr-4">
                <p className="font-bold leading-tight text-gray-800">{title}</p>
                <p className="text-[10px] text-gray-400 leading-none mt-1 uppercase font-black">{desc}</p>
            </div>
            <div className={`w-12 h-7 rounded-full transition-all flex items-center p-1 border-2 ${val ? 'bg-lime-400 border-lime-600 justify-end' : 'bg-gray-200 border-gray-300 justify-start'}`}>
                <div className="w-4 h-4 bg-white rounded-full shadow-md" />
            </div>
        </div>
    );
}