import { useContext } from "react";
import { TimerContext, type TimerContextValue } from "./timerTypes";

export function useTimers(): TimerContextValue {
  const ctx = useContext(TimerContext);
  if (!ctx) throw new Error("useTimers doit être utilisé à l'intérieur d'un TimerProvider");
  return ctx;
}
