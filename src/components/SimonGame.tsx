"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type TileId = 0 | 1 | 2 | 3;

const tiles: {
  id: TileId;
  label: string;
  baseColor: string;
  activeColor: string;
  shadow: string;
  glowColor: string;
}[] = [
  {
    id: 0,
    label: "Emerald",
    baseColor: "bg-emerald-500",
    activeColor: "bg-emerald-400",
    shadow: "shadow-emerald-400/50",
    glowColor: "rgba(52, 211, 153, 0.45)",
  },
  {
    id: 1,
    label: "Amber",
    baseColor: "bg-amber-500",
    activeColor: "bg-amber-400",
    shadow: "shadow-amber-300/60",
    glowColor: "rgba(251, 191, 36, 0.45)",
  },
  {
    id: 2,
    label: "Rose",
    baseColor: "bg-rose-500",
    activeColor: "bg-rose-400",
    shadow: "shadow-rose-400/50",
    glowColor: "rgba(244, 114, 182, 0.55)",
  },
  {
    id: 3,
    label: "Sky",
    baseColor: "bg-sky-500",
    activeColor: "bg-sky-400",
    shadow: "shadow-sky-400/50",
    glowColor: "rgba(56, 189, 248, 0.45)",
  },
];

const frequencies: Record<TileId, number> = {
  0: 415.3,
  1: 310.0,
  2: 252.0,
  3: 209.0,
};

const randomTile = (): TileId => Math.floor(Math.random() * 4) as TileId;

export function SimonGame() {
  const [sequence, setSequence] = useState<TileId[]>([]);
  const [level, setLevel] = useState(0);
  const [bestLevel, setBestLevel] = useState(0);
  const [playerIndex, setPlayerIndex] = useState(0);
  const [isPlayingSequence, setIsPlayingSequence] = useState(false);
  const [activeTile, setActiveTile] = useState<TileId | null>(null);
  const [status, setStatus] = useState("Tap play to begin");
  const [strictMode, setStrictMode] = useState(true);
  const [vibrationSupported, setVibrationSupported] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [lastErrorLevel, setLastErrorLevel] = useState<number | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const oscillatorRef = useRef<OscillatorNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const playQueueRef = useRef<{ reject?: () => void }>({});

  useEffect(() => {
    setVibrationSupported(typeof window !== "undefined" && "vibrate" in navigator);
  }, []);

  useEffect(() => {
    return () => {
      if (oscillatorRef.current) {
        oscillatorRef.current.stop();
        oscillatorRef.current.disconnect();
      }
      if (gainRef.current) {
        gainRef.current.disconnect();
      }
      audioCtxRef.current?.close();
    };
  }, []);

  const ensureAudio = useCallback((): AudioContext | null => {
    if (audioCtxRef.current) {
      return audioCtxRef.current;
    }
    const AudioContextCtor =
      typeof window !== "undefined"
        ? window.AudioContext ||
          (window as typeof window & {
            webkitAudioContext?: typeof AudioContext;
          }).webkitAudioContext
        : undefined;
    if (!AudioContextCtor) {
      return null;
    }
    const ctx = new AudioContextCtor();
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(ctx.destination);
    audioCtxRef.current = ctx;
    gainRef.current = gain;
    return ctx;
  }, []);

  const stopTone = useCallback(() => {
    if (!gainRef.current) {
      return;
    }
    const ctx = audioCtxRef.current;
    const now = ctx?.currentTime ?? 0;
    gainRef.current.gain.cancelScheduledValues(now);
    gainRef.current.gain.setValueAtTime(gainRef.current.gain.value, now);
    gainRef.current.gain.linearRampToValueAtTime(0.0001, now + 0.08);
  }, []);

  const playTone = useCallback(
    (tile: TileId) => {
      const ctx = ensureAudio();
      if (!ctx) {
        return;
      }
      if (ctx.state === "suspended") {
        ctx.resume().catch(() => undefined);
      }
      stopTone();
      const oscillator = ctx.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.value = frequencies[tile];
      const gain = gainRef.current ?? ctx.createGain();
      gain.gain.value = 0;
      if (!gainRef.current) {
        gain.connect(ctx.destination);
        gainRef.current = gain;
      }
      oscillator.connect(gain);
      const now = ctx.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.25, now + 0.04);
      oscillator.start(now);
      oscillatorRef.current = oscillator;
    },
    [ensureAudio, stopTone],
  );

  const flashTile = useCallback(
    (tile: TileId, tempo: number) =>
      new Promise<void>((resolve) => {
        setActiveTile(tile);
        playTone(tile);
        if (vibrationSupported) {
          navigator.vibrate?.(tempo * 0.7);
        }
        const release = window.setTimeout(() => {
          setActiveTile(null);
          stopTone();
          window.setTimeout(resolve, Math.max(80, tempo * 0.25));
        }, Math.max(180, tempo));
        playQueueRef.current.reject = () => {
          window.clearTimeout(release);
          resolve();
        };
      }),
    [playTone, stopTone, vibrationSupported],
  );

  const getTempo = useCallback(
    (round: number) => Math.max(680 - round * 40, 260),
    [],
  );

  const resetGameState = useCallback(() => {
    setSequence([]);
    setLevel(0);
    setPlayerIndex(0);
    setIsPlayingSequence(false);
    setActiveTile(null);
    setStatus("Tap play to begin");
    setLastErrorLevel(null);
  }, []);

  const playSequence = useCallback(
    async (steps: TileId[]) => {
      setIsPlayingSequence(true);
      setStatus(
        steps.length === 1 ? "Memorize the pattern" : `Level ${steps.length}: watch`,
      );
      const tempo = getTempo(steps.length);
      try {
        for (const tile of steps) {
          await flashTile(tile, tempo);
        }
        setStatus("Your turn");
        setPlayerIndex(0);
      } finally {
        setIsPlayingSequence(false);
        setActiveTile(null);
        stopTone();
      }
    },
    [flashTile, getTempo, stopTone],
  );

  const extendSequence = useCallback(
    (current: TileId[]) => {
      const next = [...current, randomTile()];
      setSequence(next);
      setLevel(next.length);
      setBestLevel((prev) => Math.max(prev, next.length));
      window.setTimeout(() => {
        void playSequence(next);
      }, 700);
    },
    [playSequence],
  );

  const startGame = useCallback(() => {
    setHasInteracted(true);
    playQueueRef.current.reject?.();
    resetGameState();
    const initial = [randomTile()];
    setSequence(initial);
    setLevel(1);
    setBestLevel((prev) => Math.max(prev, 1));
    setStatus("Memorize the pattern");
    window.setTimeout(() => {
      void playSequence(initial);
    }, 450);
  }, [playSequence, resetGameState]);

  const handlePlayerInput = useCallback(
    (tile: TileId) => {
      if (!sequence.length || isPlayingSequence) {
        return;
      }

      setHasInteracted(true);
      setActiveTile(tile);
      playTone(tile);
      if (vibrationSupported) {
        navigator.vibrate?.(80);
      }

      const release = window.setTimeout(() => {
        setActiveTile(null);
        stopTone();
      }, 200);

      const expected = sequence[playerIndex];
      if (expected === tile) {
        const nextIndex = playerIndex + 1;
        if (nextIndex === sequence.length) {
          window.clearTimeout(release);
          setStatus("Great! Next round");
          extendSequence(sequence);
        } else {
          setPlayerIndex(nextIndex);
          setStatus(`Good! ${sequence.length - nextIndex} to go`);
        }
      } else {
        window.clearTimeout(release);
        setActiveTile(null);
        stopTone();
        setLastErrorLevel(level);
        setStatus(strictMode ? "Missed! Restarting..." : "Missed! Try again");

        if (strictMode) {
          window.setTimeout(() => {
            startGame();
          }, 900);
        } else {
          setPlayerIndex(0);
          window.setTimeout(() => {
            void playSequence(sequence);
          }, 900);
        }
      }
    },
    [
      extendSequence,
      isPlayingSequence,
      level,
      playSequence,
      playTone,
      playerIndex,
      sequence,
      startGame,
      stopTone,
      strictMode,
      vibrationSupported,
    ],
  );

  useEffect(() => {
    if (sequence.length === 0) {
      return;
    }
    setLevel(sequence.length);
  }, [sequence]);

  const accuracy = useMemo(() => {
    if (level <= 1 || lastErrorLevel === null) {
      return null;
    }
    const ratio = ((level - 1) / Math.max(lastErrorLevel, 1)) * 100;
    return Math.min(100, Math.round(ratio));
  }, [lastErrorLevel, level]);

  const canInteract = sequence.length > 0 && !isPlayingSequence;

  return (
    <div className="flex w-full flex-col items-center gap-8">
      <header className="flex w-full flex-col items-center gap-3 text-center">
        <div className="text-sm uppercase tracking-[0.3em] text-zinc-500">
          Pulse Pattern
        </div>
        <h1 className="text-3xl font-semibold text-zinc-900 sm:text-4xl">
          Simon Memory Challenge
        </h1>
        <p className="max-w-xl text-balance text-sm text-zinc-600 sm:text-base">
          Repeat the glowing sequence. Each round adds a new beat—stay focused,
          trust your rhythm, and climb to the highest streak.
        </p>
      </header>

      <section className="grid w-full gap-4 sm:grid-cols-[1fr_auto] sm:items-center">
        <div className="order-2 flex flex-col items-center gap-4 sm:order-1">
          <div className="relative aspect-square w-full max-w-[340px] rounded-[32px] bg-zinc-900 p-4 shadow-xl shadow-zinc-900/30 sm:max-w-[420px]">
            <div className="grid h-full grid-cols-2 gap-4 rounded-[26px] bg-zinc-950 p-4">
              {tiles.map((tile) => {
                const isActive = activeTile === tile.id && hasInteracted;
                return (
                  <button
                    key={tile.id}
                    type="button"
                    disabled={!canInteract}
                    onClick={() => handlePlayerInput(tile.id)}
                    className={`group relative overflow-hidden rounded-[20px] border border-white/5 transition-transform duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/80 disabled:cursor-not-allowed ${
                      isActive ? "scale-[0.98]" : "scale-100"
                    }`}
                    style={{
                      boxShadow: isActive
                        ? `0 0 45px 14px ${tile.glowColor}`
                        : undefined,
                    }}
                  >
                    <div
                      className={`absolute inset-0 transition-colors duration-200 ${
                        isActive ? tile.activeColor : tile.baseColor
                      }`}
                      style={{
                        filter: isActive ? "brightness(1.15)" : "brightness(0.95)",
                      }}
                    />
                    <div
                      className={`absolute inset-0 opacity-0 transition-opacity duration-200 ${
                        isActive ? "opacity-100" : "group-hover:opacity-40"
                      } ${tile.shadow}`}
                    />
                    <span className="relative z-10 flex h-full items-end justify-end p-3 text-xs font-semibold uppercase tracking-widest text-white/60">
                      {tile.label}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute inset-0 rounded-[32px] border border-white/10" />
              <div className="absolute left-1/2 top-1/2 h-1/3 w-1/3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10 bg-zinc-950/80 backdrop-blur" />
              <div className="absolute inset-4 rounded-[26px] bg-gradient-to-br from-white/[0.08] via-transparent to-black/60" />
            </div>
          </div>
          <div className="flex w-full max-w-[320px] flex-col items-center gap-3 rounded-2xl border border-white/10 bg-white/70 p-4 shadow-lg shadow-zinc-900/10 backdrop-blur sm:max-w-none sm:flex-row sm:justify-center sm:bg-white/60">
            <button
              type="button"
              onClick={startGame}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 py-3 text-sm font-semibold text-white shadow-lg shadow-zinc-900/30 transition hover:bg-black sm:w-auto sm:px-8"
            >
              {sequence.length ? "Restart" : "Play"}
            </button>
            <button
              type="button"
              onClick={() => setStrictMode((prev) => !prev)}
              className={`flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-200 py-3 text-sm font-semibold transition sm:w-auto sm:px-8 ${
                strictMode
                  ? "bg-white text-zinc-900 shadow shadow-zinc-900/10"
                  : "bg-zinc-100 text-zinc-600"
              }`}
            >
              Strict Mode
              <span
                className={`inline-flex h-2.5 w-2.5 rounded-full ${
                  strictMode ? "bg-emerald-500 shadow-[0_0_0_4px] shadow-emerald-500/30" : "bg-zinc-400"
                }`}
              />
            </button>
          </div>
        </div>

        <aside className="order-1 flex w-full flex-col gap-4 rounded-3xl border border-white/10 bg-white/70 p-5 text-left shadow-xl shadow-zinc-900/10 backdrop-blur sm:order-2 sm:max-w-[320px] sm:bg-white/60">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-[0.25em] text-zinc-500">
              Level
            </span>
            <span className="text-3xl font-semibold text-zinc-900">
              {level.toString().padStart(2, "0")}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-[0.25em] text-zinc-500">
              Best
            </span>
            <span className="text-xl font-semibold text-zinc-900">
              {bestLevel.toString().padStart(2, "0")}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-[0.25em] text-zinc-500">
              Strict
            </span>
            <span
              className={`text-sm font-semibold ${
                strictMode ? "text-emerald-600" : "text-zinc-400"
              }`}
            >
              {strictMode ? "On" : "Off"}
            </span>
          </div>
          {accuracy !== null && (
            <div className="flex flex-col gap-2">
              <span className="text-xs uppercase tracking-[0.25em] text-zinc-500">
                Recovery
              </span>
              <div className="relative h-2 w-full overflow-hidden rounded-full bg-zinc-200">
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${accuracy}%` }}
                />
              </div>
              <span className="text-xs font-semibold text-zinc-500">
                {accuracy}% speed retention
              </span>
            </div>
          )}
          <p className="rounded-2xl bg-white/80 p-4 text-sm text-zinc-600 shadow-inner shadow-white/60">
            {status}
          </p>
          <ul className="space-y-2 text-xs text-zinc-500">
            <li>• Follow the glow in order</li>
            <li>• Tiles speed up as the level rises</li>
            <li>• Strict mode restarts on mistakes</li>
            <li>• Disable strict to review the pattern</li>
          </ul>
        </aside>
      </section>
    </div>
  );
}
