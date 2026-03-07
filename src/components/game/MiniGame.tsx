import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Trophy, RotateCcw } from 'lucide-react';

interface MiniGameProps {
    leagueColor?: string;
    leagueName?: string;
}

interface Bat {
    id: number;
    x: number;
    gapY: number;
    passed: boolean;
}

const MiniGame: React.FC<MiniGameProps> = ({ 
    leagueColor = '#f59e0b',
    leagueName = 'LIDOM'
}) => {
    const { t } = useTranslation();
    const [gameState, setGameState] = useState<'idle' | 'playing' | 'gameover'>('idle');
    const [score, setScore] = useState(0);
    const [highScore, setHighScore] = useState(0);
    const [ballY, setBallY] = useState(45);
    const [velocity, setVelocity] = useState(0);
    const [rotation, setRotation] = useState(0);
    const [bats, setBats] = useState<Bat[]>([]);
    
    const canvasHeight = 280;
    const ballX = 60; // Fixed X position in pixels
    const ballSize = 30;
    const batWidth = 50;
    const gapSize = 100; // Gap between top and bottom bat
    
    const gameLoopRef = useRef<number | null>(null);
    const lastTimeRef = useRef<number>(0);
    const lastBatRef = useRef<number>(0);

    // Load high score
    useEffect(() => {
        const saved = localStorage.getItem(`flappyball-highscore-${leagueName}`);
        if (saved) setHighScore(parseInt(saved, 10));
    }, [leagueName]);

    // Save high score
    useEffect(() => {
        if (score > highScore) {
            setHighScore(score);
            localStorage.setItem(`flappyball-highscore-${leagueName}`, score.toString());
        }
    }, [score, highScore, leagueName]);

    const startGame = useCallback(() => {
        setGameState('playing');
        setScore(0);
        setBallY(canvasHeight / 2 - ballSize / 2);
        setVelocity(0);
        setRotation(0);
        setBats([]);
        lastBatRef.current = 0;
        lastTimeRef.current = performance.now();
    }, [canvasHeight]);

    const jump = useCallback(() => {
        if (gameState === 'idle') {
            startGame();
        } else if (gameState === 'playing') {
            setVelocity(-6);
        } else if (gameState === 'gameover') {
            startGame();
        }
    }, [gameState, startGame]);

    // Game loop
    useEffect(() => {
        if (gameState !== 'playing') return;

        const gameLoop = (timestamp: number) => {
            const deltaTime = Math.min((timestamp - lastTimeRef.current) / 16, 2);
            lastTimeRef.current = timestamp;

            // Gravity and movement
            setVelocity(v => v + 0.35 * deltaTime);
            setBallY(y => {
                const newY = y + velocity * deltaTime;
                // Check floor/ceiling
                if (newY <= 0 || newY >= canvasHeight - ballSize - 20) {
                    setGameState('gameover');
                    return y;
                }
                return newY;
            });
            setRotation(r => r + velocity * 3);

            // Spawn bats
            if (timestamp - lastBatRef.current > 2000) {
                const gapY = 60 + Math.random() * (canvasHeight - 160);
                setBats(prev => [...prev, {
                    id: timestamp,
                    x: 400,
                    gapY,
                    passed: false
                }]);
                lastBatRef.current = timestamp;
            }

            // Move bats and check collisions
            setBats(prev => {
                let collision = false;
                const updated = prev.map(bat => {
                    const newX = bat.x - 3 * deltaTime;
                    
                    // Collision detection
                    const ballLeft = ballX;
                    const ballRight = ballX + ballSize;
                    const batLeft = newX;
                    const batRight = newX + batWidth;
                    
                    if (ballRight > batLeft && ballLeft < batRight) {
                        const ballTop = ballY;
                        const ballBottom = ballY + ballSize;
                        const gapTop = bat.gapY - gapSize / 2;
                        const gapBottom = bat.gapY + gapSize / 2;
                        
                        if (ballTop < gapTop || ballBottom > gapBottom) {
                            collision = true;
                        }
                    }

                    // Score
                    if (!bat.passed && newX + batWidth < ballX) {
                        bat.passed = true;
                        setScore(s => s + 1);
                    }

                    return { ...bat, x: newX };
                }).filter(bat => bat.x > -batWidth);

                if (collision) {
                    setGameState('gameover');
                }

                return updated;
            });

            if (gameState === 'playing') {
                gameLoopRef.current = requestAnimationFrame(gameLoop);
            }
        };

        lastTimeRef.current = performance.now();
        gameLoopRef.current = requestAnimationFrame(gameLoop);

        return () => {
            if (gameLoopRef.current) {
                cancelAnimationFrame(gameLoopRef.current);
            }
        };
    }, [gameState, velocity, ballY, canvasHeight]);

    // Keyboard controls
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.code === 'Space' || e.key === 'ArrowUp') {
                e.preventDefault();
                jump();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [jump]);

    return (
        <div className="col-span-full">
            <div 
                className="relative overflow-hidden rounded-xl border border-white/10"
                style={{ borderColor: `${leagueColor}30` }}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-3 bg-zinc-900/80 border-b border-white/5">
                    <div className="flex items-center gap-2">
                        <span className="text-2xl">⚾</span>
                        <div>
                            <h3 className="font-bold text-white text-sm">{t('minigame.title')}</h3>
                            <p className="text-[10px] text-zinc-500">{t('minigame.avoidBats')}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="text-right">
                            <p className="text-[10px] text-zinc-500">{t('minigame.record')}</p>
                            <p className="font-mono font-bold text-amber-400 flex items-center gap-1">
                                <Trophy className="w-3 h-3" />
                                {highScore}
                            </p>
                        </div>
                        {gameState !== 'idle' && (
                            <button 
                                onClick={startGame}
                                className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700"
                            >
                                <RotateCcw className="w-3 h-3 text-zinc-400" />
                            </button>
                        )}
                    </div>
                </div>

                {/* Game Area */}
                <div 
                    className="relative select-none cursor-pointer"
                    style={{ 
                        height: canvasHeight,
                        background: 'linear-gradient(180deg, #1e3a5f 0%, #3b82f6 30%, #22c55e 85%, #166534 100%)'
                    }}
                    onClick={jump}
                    onTouchStart={(e) => { e.preventDefault(); jump(); }}
                >
                    {/* Clouds */}
                    <div className="absolute top-4 left-[10%] text-3xl opacity-60">☁️</div>
                    <div className="absolute top-8 left-[50%] text-2xl opacity-40">☁️</div>
                    <div className="absolute top-2 left-[75%] text-3xl opacity-50">☁️</div>

                    {/* Score */}
                    {gameState === 'playing' && (
                        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20">
                            <span 
                                className="text-5xl font-black text-white"
                                style={{ 
                                    textShadow: '3px 3px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000'
                                }}
                            >
                                {score}
                            </span>
                        </div>
                    )}

                    {/* Bats */}
                    {bats.map(bat => (
                        <React.Fragment key={bat.id}>
                            {/* Top Bat */}
                            <div
                                className="absolute"
                                style={{
                                    left: bat.x,
                                    top: 0,
                                    width: batWidth,
                                    height: bat.gapY - gapSize / 2,
                                }}
                            >
                                {/* Bat handle (pointing down) */}
                                <div 
                                    className="absolute bottom-0 left-1/2 -translate-x-1/2 rounded-b-md"
                                    style={{
                                        width: 16,
                                        height: '100%',
                                        background: 'linear-gradient(90deg, #8B4513 0%, #D2691E 50%, #8B4513 100%)',
                                        boxShadow: 'inset -2px 0 4px rgba(0,0,0,0.3)'
                                    }}
                                />
                                {/* Bat barrel */}
                                <div 
                                    className="absolute bottom-0 left-1/2 -translate-x-1/2 rounded-lg"
                                    style={{
                                        width: batWidth - 10,
                                        height: 35,
                                        background: 'linear-gradient(90deg, #A0522D 0%, #DEB887 30%, #D2691E 70%, #8B4513 100%)',
                                        boxShadow: '0 4px 8px rgba(0,0,0,0.4), inset 0 -2px 4px rgba(0,0,0,0.2)'
                                    }}
                                />
                            </div>

                            {/* Bottom Bat */}
                            <div
                                className="absolute"
                                style={{
                                    left: bat.x,
                                    top: bat.gapY + gapSize / 2,
                                    width: batWidth,
                                    height: canvasHeight - (bat.gapY + gapSize / 2) - 20,
                                }}
                            >
                                {/* Bat barrel */}
                                <div 
                                    className="absolute top-0 left-1/2 -translate-x-1/2 rounded-lg"
                                    style={{
                                        width: batWidth - 10,
                                        height: 35,
                                        background: 'linear-gradient(90deg, #A0522D 0%, #DEB887 30%, #D2691E 70%, #8B4513 100%)',
                                        boxShadow: '0 -4px 8px rgba(0,0,0,0.4), inset 0 2px 4px rgba(0,0,0,0.2)'
                                    }}
                                />
                                {/* Bat handle (pointing up) */}
                                <div 
                                    className="absolute top-0 left-1/2 -translate-x-1/2 rounded-t-md"
                                    style={{
                                        width: 16,
                                        height: '100%',
                                        background: 'linear-gradient(90deg, #8B4513 0%, #D2691E 50%, #8B4513 100%)',
                                        boxShadow: 'inset -2px 0 4px rgba(0,0,0,0.3)'
                                    }}
                                />
                            </div>
                        </React.Fragment>
                    ))}

                    {/* Ball */}
                    <div
                        className="absolute z-10"
                        style={{
                            left: ballX,
                            top: ballY,
                            width: ballSize,
                            height: ballSize,
                            transform: `rotate(${rotation}deg)`,
                            transition: 'none'
                        }}
                    >
                        <div 
                            className="w-full h-full rounded-full flex items-center justify-center text-2xl"
                            style={{
                                background: 'radial-gradient(circle at 30% 30%, #ffffff, #e8e8e8, #cccccc)',
                                boxShadow: '2px 4px 8px rgba(0,0,0,0.4), inset -2px -2px 4px rgba(0,0,0,0.1)'
                            }}
                        >
                            ⚾
                        </div>
                    </div>

                    {/* Ground */}
                    <div 
                        className="absolute bottom-0 left-0 right-0 h-5"
                        style={{ 
                            background: 'repeating-linear-gradient(90deg, #8B4513 0px, #8B4513 20px, #A0522D 20px, #A0522D 40px)',
                            borderTop: '3px solid #654321'
                        }}
                    />

                    {/* Idle Screen */}
                    {gameState === 'idle' && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-30">
                            <div className="text-center">
                                <div className="text-6xl mb-4 animate-bounce">⚾</div>
                                <h2 className="text-white font-black text-2xl mb-2">{t('minigame.title').toUpperCase()}</h2>
                                <p className="text-white/80 text-sm mb-6">
                                    {t('minigame.tapToFly')}
                                </p>
                                <button 
                                    className="px-8 py-3 rounded-full font-bold text-white text-lg shadow-lg transform hover:scale-105 active:scale-95 transition-transform"
                                    style={{ backgroundColor: leagueColor }}
                                    onClick={(e) => { e.stopPropagation(); startGame(); }}
                                >
                                    {t('minigame.play')}
                                </button>
                                <p className="text-white/50 text-xs mt-4">
                                    {t('minigame.tapOrSpace')}
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Game Over */}
                    {gameState === 'gameover' && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-30">
                            <div className="text-center bg-zinc-900/90 p-6 rounded-2xl border border-white/10">
                                <p className="text-5xl mb-3">💥</p>
                                <h2 className="text-red-500 font-black text-2xl mb-4">{t('minigame.gameOver')}</h2>
                                
                                <div className="mb-4">
                                    <p className="text-zinc-400 text-sm">{t('minigame.score')}</p>
                                    <p className="text-4xl font-black" style={{ color: leagueColor }}>
                                        {score}
                                    </p>
                                </div>

                                {score > 0 && score >= highScore && (
                                    <div className="flex items-center justify-center gap-2 text-amber-400 mb-4">
                                        <Trophy className="w-5 h-5" />
                                        <span className="font-bold">{t('minigame.newRecord')}</span>
                                    </div>
                                )}

                                <button 
                                    className="px-8 py-3 rounded-full font-bold text-white text-lg shadow-lg transform hover:scale-105 active:scale-95 transition-transform"
                                    style={{ backgroundColor: leagueColor }}
                                    onClick={(e) => { e.stopPropagation(); startGame(); }}
                                >
                                    {t('minigame.retry')}
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Instructions */}
                <div className="p-2 bg-zinc-900/80 border-t border-white/5">
                    <p className="text-center text-[10px] text-zinc-500">
                        {t('minigame.instructions')}
                    </p>
                </div>
            </div>
        </div>
    );
};

export default MiniGame;
