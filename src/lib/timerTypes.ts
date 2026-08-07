import { createContext } from "react";

export interface TimerEntry {
  id: string;
  label: string;
  totalSeconds: number;
  remainingSeconds: number;
  running: boolean;
  done: boolean;
}

export interface TimerContextValue {
  timers: TimerEntry[];
  getTimer: (id: string) => TimerEntry | undefined;
  startTimer: (id: string, label: string, seconds: number) => void;
  toggleRunning: (id: string) => void;
  resetTimer: (id: string) => void;
}

export const TimerContext = createContext<TimerContextValue | null>(null);
