// Flappy Ball (el mismo de la web, components/game/MiniGame.tsx): para jugar en un día sin juegos. La bola cae con la
// gravedad, cada toque la hace saltar y hay que pasar entre los bates; el récord se guarda por liga en el teléfono.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, View } from 'react-native';
import Svg, { Circle, Defs, Pattern, RadialGradient, Rect, Stop } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { RotateCcw, Trophy } from 'lucide-react-native';
import { getItem, setItem } from '../../lib/storage';
import { alpha } from '../../theme/tokens';
import { Txt, useReduceMotion } from '../ui';

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

const CANVAS_H = 280;
const BALL_X = 60; // la bola no se mueve de lado
const BALL_SIZE = 30;
const BAT_W = 50;
const GAP = 100; // hueco entre el bate de arriba y el de abajo
const GROUND = 20;

const HANDLE = ['#8B4513', '#D2691E', '#8B4513'] as const;
const BARREL = ['#A0522D', '#DEB887', '#D2691E', '#8B4513'] as const;
const BARREL_AT = [0, 0.3, 0.7, 1] as const;
const ZINC = { panel: 'rgba(24,24,27,0.8)', box: 'rgba(24,24,27,0.9)', button: '#27272a', text: '#71717a', soft: '#a1a1aa', amber: '#fbbf24', red: '#ef4444' };
const native = Platform.OS !== 'web';

const recordKey = (league: string) => `el-play-flappyball-highscore-${league}`;

/** Un bate: el mango hacia el hueco del medio y la cabeza (el barril) pegada al hueco */
const BatPiece: React.FC<{ top: number; height: number; up: boolean }> = ({ top, height, up }) => (
    <View style={{ position: 'absolute', left: 0, top, width: BAT_W, height: Math.max(0, height) }}>
        <LinearGradient
            colors={HANDLE}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ position: 'absolute', left: (BAT_W - 16) / 2, width: 16, top: 0, bottom: 0, borderRadius: 6, ...(up ? { borderTopLeftRadius: 0, borderTopRightRadius: 0 } : { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }) }}
        />
        <LinearGradient
            colors={BARREL}
            locations={BARREL_AT}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[
                { position: 'absolute', left: 5, width: BAT_W - 10, height: 35, borderRadius: 8 },
                up ? { top: 0 } : { bottom: 0 },
                Platform.select({ web: { boxShadow: `0 ${up ? -4 : 4}px 8px rgba(0,0,0,0.4)` }, default: { shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: up ? -4 : 4 }, elevation: 4 } }) as object
            ]}
        />
    </View>
);

const MiniGame: React.FC<MiniGameProps> = ({ leagueColor = '#f59e0b', leagueName = 'LIDOM' }) => {
    const { t } = useTranslation();
    const reduce = useReduceMotion();
    const [gameState, setGameState] = useState<'idle' | 'playing' | 'gameover'>('idle');
    const [score, setScore] = useState(0);
    const [highScore, setHighScore] = useState(0);
    const [ballY, setBallY] = useState(45);
    const [rotation, setRotation] = useState(0);
    const [bats, setBats] = useState<Bat[]>([]);

    const loopRef = useRef<number | null>(null);
    const lastTimeRef = useRef(0);
    const lastBatRef = useRef(0);
    const velocityRef = useRef(0);
    const ballYRef = useRef(45);
    const batsRef = useRef<Bat[]>([]);
    const [bounce] = useState(() => new Animated.Value(0));

    // El récord guardado de esta liga
    useEffect(() => {
        const saved = getItem(recordKey(leagueName));
        setHighScore(saved ? parseInt(saved, 10) || 0 : 0);
    }, [leagueName]);

    // …y se guarda al superarlo
    useEffect(() => {
        if (score > highScore) {
            setHighScore(score);
            setItem(recordKey(leagueName), String(score));
        }
    }, [score, highScore, leagueName]);

    // La bola de la pantalla de inicio rebota (animate-bounce); con «Reducir movimiento», quieta
    useEffect(() => {
        if (gameState !== 'idle' || reduce) return;
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(bounce, { toValue: 1, duration: 500, easing: Easing.bezier(0, 0, 0.2, 1), useNativeDriver: native }),
                Animated.timing(bounce, { toValue: 0, duration: 500, easing: Easing.bezier(0.8, 0, 1, 1), useNativeDriver: native })
            ])
        );
        loop.start();
        return () => loop.stop();
    }, [gameState, reduce, bounce]);

    const startGame = useCallback(() => {
        setGameState('playing');
        setScore(0);
        const start = CANVAS_H / 2 - BALL_SIZE / 2;
        setBallY(start);
        ballYRef.current = start;
        velocityRef.current = 0;
        setRotation(0);
        batsRef.current = [];
        setBats([]);
        lastBatRef.current = 0;
        lastTimeRef.current = performance.now();
    }, []);

    const jump = useCallback(() => {
        if (gameState === 'playing') velocityRef.current = -6;
        else startGame();
    }, [gameState, startGame]);

    // El bucle del juego: gravedad, bates nuevos cada 2 s, choques y puntos
    useEffect(() => {
        if (gameState !== 'playing') return;
        const frame = () => {
            const now = performance.now();
            const delta = Math.min((now - lastTimeRef.current) / 16, 2);
            lastTimeRef.current = now;

            const velocity = velocityRef.current + 0.35 * delta;
            velocityRef.current = velocity;
            const y = ballYRef.current + velocity * delta;
            if (y <= 0 || y >= CANVAS_H - BALL_SIZE - GROUND) {
                setGameState('gameover');
                return;
            }
            ballYRef.current = y;
            setBallY(y);
            setRotation((value) => value + velocity * 3);

            let list = batsRef.current;
            if (now - lastBatRef.current > 2000) {
                list = [...list, { id: now, x: 400, gapY: 60 + Math.random() * (CANVAS_H - 160), passed: false }];
                lastBatRef.current = now;
            }
            let collision = false;
            let passed = 0;
            list = list
                .map((bat) => {
                    const x = bat.x - 3 * delta;
                    if (BALL_X + BALL_SIZE > x && BALL_X < x + BAT_W && (y < bat.gapY - GAP / 2 || y + BALL_SIZE > bat.gapY + GAP / 2)) collision = true;
                    const done = !bat.passed && x + BAT_W < BALL_X;
                    if (done) passed += 1;
                    return { ...bat, x, passed: bat.passed || done };
                })
                .filter((bat) => bat.x > -BAT_W);
            batsRef.current = list;
            setBats(list);
            if (passed) setScore((value) => value + passed);
            if (collision) {
                setGameState('gameover');
                return;
            }
            loopRef.current = requestAnimationFrame(frame);
        };
        lastTimeRef.current = performance.now();
        loopRef.current = requestAnimationFrame(frame);
        return () => {
            if (loopRef.current !== null) cancelAnimationFrame(loopRef.current);
        };
    }, [gameState]);

    const playButton = (label: string) => (
        <Pressable
            onPress={startGame}
            accessibilityRole="button"
            style={({ pressed }) => [
                { paddingHorizontal: 32, paddingVertical: 10, borderRadius: 999, backgroundColor: leagueColor, transform: [{ scale: pressed ? 0.95 : 1 }] },
                Platform.select({ web: { boxShadow: '0 10px 15px rgba(0,0,0,0.25)' }, default: { shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 15, shadowOffset: { width: 0, height: 10 }, elevation: 6 } }) as object
            ]}
        >
            <Txt size={18} weight="bold" tone="white" center>
                {label}
            </Txt>
        </Pressable>
    );

    return (
        <View style={{ borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: alpha(leagueColor, 0.19) }}>
            {/* Cabecera: nombre, récord y volver a empezar */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, backgroundColor: ZINC.panel, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Txt size={24}>⚾</Txt>
                    <View>
                        <Txt size={14} weight="bold" tone="white">
                            {t('minigame.title')}
                        </Txt>
                        <Txt size={10} color={ZINC.text}>
                            {t('minigame.avoidBats')}
                        </Txt>
                    </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={{ alignItems: 'flex-end' }}>
                        <Txt size={10} color={ZINC.text}>
                            {t('minigame.record')}
                        </Txt>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <Trophy size={12} color={ZINC.amber} />
                            <Txt size={15} weight="bold" color={ZINC.amber} tabular>
                                {highScore}
                            </Txt>
                        </View>
                    </View>
                    {gameState !== 'idle' && (
                        <Pressable onPress={startGame} accessibilityRole="button" accessibilityLabel={t('minigame.retry')} hitSlop={8} style={{ padding: 6, borderRadius: 8, backgroundColor: ZINC.button }}>
                            <RotateCcw size={12} color={ZINC.soft} />
                        </Pressable>
                    )}
                </View>
            </View>

            {/* El campo: un toque en cualquier parte salta (o empieza) */}
            <Pressable onPressIn={jump} accessibilityRole="button" accessibilityLabel={t('minigame.tapToFly')} style={{ height: CANVAS_H, overflow: 'hidden' }}>
                <LinearGradient colors={['#1e3a5f', '#3b82f6', '#22c55e', '#166534']} locations={[0, 0.3, 0.85, 1]} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} />

                {/* Nubes */}
                <Txt size={30} style={{ position: 'absolute', top: 16, left: '10%', opacity: 0.6 }}>
                    ☁️
                </Txt>
                <Txt size={24} style={{ position: 'absolute', top: 32, left: '50%', opacity: 0.4 }}>
                    ☁️
                </Txt>
                <Txt size={30} style={{ position: 'absolute', top: 8, left: '75%', opacity: 0.5 }}>
                    ☁️
                </Txt>

                {/* Bates */}
                {bats.map((bat) => (
                    <View key={bat.id} pointerEvents="none" style={{ position: 'absolute', left: bat.x, top: 0, width: BAT_W, height: CANVAS_H }}>
                        <BatPiece top={0} height={bat.gapY - GAP / 2} up={false} />
                        <BatPiece top={bat.gapY + GAP / 2} height={CANVAS_H - (bat.gapY + GAP / 2) - GROUND} up />
                    </View>
                ))}

                {/* La bola */}
                <View pointerEvents="none" style={{ position: 'absolute', left: BALL_X, top: ballY, width: BALL_SIZE, height: BALL_SIZE, zIndex: 10, transform: [{ rotate: `${rotation}deg` }] }}>
                    <Svg width={BALL_SIZE} height={BALL_SIZE} style={{ position: 'absolute' }}>
                        <Defs>
                            <RadialGradient id="mg-ball" cx="30%" cy="30%" r="75%">
                                <Stop offset="0" stopColor="#ffffff" />
                                <Stop offset="0.5" stopColor="#e8e8e8" />
                                <Stop offset="1" stopColor="#cccccc" />
                            </RadialGradient>
                        </Defs>
                        <Circle cx={BALL_SIZE / 2} cy={BALL_SIZE / 2} r={BALL_SIZE / 2} fill="url(#mg-ball)" />
                    </Svg>
                    <Txt size={22} center style={{ lineHeight: BALL_SIZE }}>
                        ⚾
                    </Txt>
                </View>

                {/* Puntos */}
                {gameState === 'playing' && (
                    <View pointerEvents="none" style={{ position: 'absolute', top: 16, left: 0, right: 0, alignItems: 'center', zIndex: 20 }}>
                        <Txt size={48} weight="black" tone="white" style={{ textShadowColor: '#000', textShadowOffset: { width: 3, height: 3 }, textShadowRadius: 1 }}>
                            {score}
                        </Txt>
                    </View>
                )}

                {/* El suelo, a rayas */}
                <Svg width="100%" height={GROUND} style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }} pointerEvents="none">
                    <Defs>
                        <Pattern id="mg-ground" patternUnits="userSpaceOnUse" width={40} height={GROUND}>
                            <Rect x={0} y={0} width={20} height={GROUND} fill="#8B4513" />
                            <Rect x={20} y={0} width={20} height={GROUND} fill="#A0522D" />
                        </Pattern>
                    </Defs>
                    <Rect x={0} y={0} width="100%" height={GROUND} fill="url(#mg-ground)" />
                    <Rect x={0} y={0} width="100%" height={3} fill="#654321" />
                </Svg>

                {/* Pantalla de inicio */}
                {gameState === 'idle' && (
                    <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 30, paddingHorizontal: 16 }}>
                        <Animated.Text style={{ fontSize: 48, marginBottom: 8, transform: [{ translateY: bounce.interpolate({ inputRange: [0, 1], outputRange: [0, -15] }) }] }}>⚾</Animated.Text>
                        <Txt size={24} weight="black" tone="white" center style={{ marginBottom: 8 }}>
                            {t('minigame.title').toUpperCase()}
                        </Txt>
                        <Txt size={14} center color="rgba(255,255,255,0.8)" style={{ marginBottom: 16 }}>
                            {t('minigame.tapToFly')}
                        </Txt>
                        {playButton(t('minigame.play'))}
                        <Txt size={12} center color="rgba(255,255,255,0.5)" style={{ marginTop: 12 }}>
                            {t('minigame.tapOrSpace')}
                        </Txt>
                    </View>
                )}

                {/* Fin del juego */}
                {gameState === 'gameover' && (
                    <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 30 }}>
                        {/* Cabe en el campo de 280 (en la web se sale un poco) */}
                        <View style={{ alignItems: 'center', backgroundColor: ZINC.box, paddingHorizontal: 24, paddingVertical: 16, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }}>
                            <Txt size={32} style={{ marginBottom: 4 }}>
                                💥
                            </Txt>
                            <Txt size={22} weight="black" color={ZINC.red} style={{ marginBottom: 8 }}>
                                {t('minigame.gameOver')}
                            </Txt>
                            <Txt size={14} color={ZINC.soft}>
                                {t('minigame.score')}
                            </Txt>
                            <Txt size={32} weight="black" color={leagueColor} tabular style={{ marginBottom: 8 }}>
                                {score}
                            </Txt>
                            {score > 0 && score >= highScore && (
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                    <Trophy size={20} color={ZINC.amber} />
                                    <Txt weight="bold" color={ZINC.amber}>
                                        {t('minigame.newRecord')}
                                    </Txt>
                                </View>
                            )}
                            {playButton(t('minigame.retry'))}
                        </View>
                    </View>
                )}
            </Pressable>

            {/* Instrucciones */}
            <View style={{ padding: 8, backgroundColor: ZINC.panel, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' }}>
                <Txt size={10} color={ZINC.text} center>
                    {t('minigame.instructions')}
                </Txt>
            </View>
        </View>
    );
};

export default MiniGame;
