/** Alerte sonore/vibration quand un minuteur se termine, en plus de la notification système — utile même
 * quand l'app est au premier plan et qu'on ne regarde pas l'écran (mains dans la pâte). */
export function alertTimerDone(): void {
  if ("vibrate" in navigator) navigator.vibrate([200, 100, 200, 100, 200]);
  playBeep();
}

function playBeep(): void {
  try {
    const AudioContextClass =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;
    // Trois petits bips distincts plutôt qu'un bip plat, pour bien se différencier des autres sons du téléphone.
    [0, 0.25, 0.5].forEach((offset) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = 880;
      gain.gain.setValueAtTime(0.001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.3, now + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.18);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(now + offset);
      oscillator.stop(now + offset + 0.2);
    });
    setTimeout(() => void ctx.close(), 900);
  } catch {
    // Pas grave si l'audio échoue (autoplay bloqué, contexte non supporté...) : la notification système et
    // la vibration restent le principal signal.
  }
}
