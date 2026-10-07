/** Smooth music under speech; short gaps between words must not pump the mix. */
export function createSpeechDucker() {
  let gain = 1;
  let previous: number | undefined;
  let lastSpeech = -Infinity;
  return (speaking: boolean, now: number): number => {
    const elapsed = previous === undefined ? 0 : Math.max(0, Math.min(1000, now - previous));
    previous = now;
    if (speaking) lastSpeech = now;
    const target = now - lastSpeech < 300 ? 0.3 : 1;
    const timeConstant = target < gain ? 100 : 650;
    gain += (target - gain) * (1 - Math.exp(-elapsed / timeConstant));
    return Math.max(0.3, Math.min(1, gain));
  };
}
