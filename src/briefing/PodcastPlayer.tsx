import { useEffect, useId, useRef } from "react";
import "./podcast-player.css";

export interface PodcastPlayerProps {
  title: string;
  publisher?: string;
  turns: readonly { id: string; speaker: "host" | "analyst"; text: string }[];
  status: string;
  turnIndex: number;
  currentTime: number;
  duration: number;
  durationEstimated: boolean;
  seekableDuration: number;
  playbackRate: number;
  getAudioLevel: () => number;
  onToggle: () => void;
  onSeek: (seconds: number) => void;
  onRate: (rate: number) => void;
}

const seconds = (value: number) => Number.isFinite(value) ? Math.max(0, value) : 0;
const timestamp = (value: number) => {
  const whole = Math.floor(seconds(value));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
};

/** An acoustic identity, not a fabricated portrait or generated episode image. */
function AcousticCover() {
  const gradientId = useId();
  return <svg className="gsp-cover" viewBox="0 0 160 160" aria-hidden="true">
    <defs><linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#223e31" /><stop offset="1" stopColor="#071b14" /></linearGradient></defs>
    <rect width="160" height="160" rx="12" fill={`url(#${gradientId})`} />
    <g fill="none" stroke="#b5d6a3" strokeWidth="1.15">
      {Array.from({ length: 17 }, (_, index) => {
        const x = 29 + index * 6.4;
        const height = 16 + 79 * Math.sin(Math.PI * index / 16);
        return <path key={index} d={`M ${x} ${80 - height / 2} C ${x - 13} ${80 - height / 4}, ${x + 13} ${80 + height / 4}, ${x} ${80 + height / 2}`} opacity={.35 + .5 * Math.sin(Math.PI * index / 16)} />;
      })}
    </g>
    <path d="M20 137H38" stroke="#b5d6a3" strokeWidth="2" />
    <text x="140" y="140" textAnchor="end" fill="#b5d6a3" fontFamily="-apple-system, sans-serif" fontSize="7" letterSpacing="1.3">BRIEFINGS</text>
  </svg>;
}

/** Only measured audio creates amplitude. There is no decorative oscillation. */
function AudioWaveform({ playing, getAudioLevel }: { playing: boolean; getAudioLevel: () => number }) {
  const bars = useRef<(SVGRectElement | null)[]>([]);
  const waveform = useRef<SVGSVGElement | null>(null);
  const sample = useRef(getAudioLevel);
  useEffect(() => { sample.current = getAudioLevel; }, [getAudioLevel]);
  useEffect(() => {
    const history = Array<number>(48).fill(0);
    const draw = () => bars.current.forEach((bar, index) => {
      const height = 2 + history[index] * 30;
      bar?.setAttribute("height", String(height));
      bar?.setAttribute("y", String((36 - height) / 2));
    });
    draw();
    waveform.current?.setAttribute("data-level", "0");
    if (!playing) return;
    let frame = 0, previous = -Infinity;
    const tick = (time: number) => {
      if (time - previous >= 50) {
        const level = sample.current();
        history.shift();
        const amplitude = Number.isFinite(level) ? Math.min(1, Math.max(0, level)) : 0;
        // Compress the meter scale for visible speech dynamics; silence remains zero.
        history.push(Math.min(1, Math.sqrt(amplitude) * 2));
        waveform.current?.setAttribute("data-level", String(amplitude));
        draw();
        previous = time;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); history.fill(0); draw(); waveform.current?.setAttribute("data-level", "0"); };
  }, [playing]);
  return <svg ref={waveform} className="gsp-wave po-podcast-waveform" data-level="0" viewBox="0 0 288 36" preserveAspectRatio="none" role="img" aria-label={playing ? "Live audio waveform" : "Audio waveform, inactive"}>
    {Array.from({ length: 48 }, (_, index) => <rect key={index} ref={element => { bars.current[index] = element; }} x={index * 6 + 1} y="17" width="2" height="2" rx="1" />)}
  </svg>;
}

function SkipIcon({ forward }: { forward?: boolean }) {
  return <svg viewBox="0 0 28 28" width="28" height="28" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <g transform={forward ? "translate(28 0) scale(-1 1)" : undefined}><path d="M8 7.2A9 9 0 1 1 5.2 16" /><path d="M8 2.8v5.4h5.4" /></g>
    <text x="14" y="18" textAnchor="middle" fill="currentColor" stroke="none" fontSize="9" fontWeight="550">10</text>
  </svg>;
}

export function PodcastPlayer(props: PodcastPlayerProps) {
  const { title, publisher = "Product updates", turns, status, turnIndex, durationEstimated, playbackRate, getAudioLevel, onToggle, onSeek, onRate } = props;
  const enabled = ["ready", "playing", "paused", "ended"].includes(status);
  const playing = status === "playing";
  const preparing = status === "preparing" || status === "writing";
  const currentTime = seconds(props.currentTime);
  const seekable = seconds(props.seekableDuration);
  const duration = Math.max(seconds(props.duration), seekable, currentTime);
  const available = duration ? Math.min(100, seekable / duration * 100) : 0;
  const progress = duration ? Math.min(100, currentTime / duration * 100) : 0;
  const seek = (time: number) => onSeek(Math.min(seekable, Math.max(0, time)));
  const speaker = turns[turnIndex]?.speaker;
  const playLabel = playing ? "Pause" : status === "ended" ? "Replay podcast" : status === "paused" ? "Resume" : "Play podcast";
  const headingId = useId();
  return <section className="gsp-player" aria-labelledby={headingId} aria-busy={preparing}>
    <div className="gsp-heading">
      <AcousticCover />
      <div className="gsp-episode">
        <p className="gsp-kicker">A conversation to go</p>
        <h2 id={headingId}>{title || "Your briefing"}</h2>
        <p className="gsp-identity">{publisher} <span aria-hidden="true">·</span> AI voices</p>
      </div>
    </div>
    <div className="gsp-signal">
      <AudioWaveform playing={playing} getAudioLevel={getAudioLevel} />
      <div className="gsp-speakers" aria-label="Podcast speakers">
        {(["host", "analyst"] as const).map(value => <span key={value} data-speaking={playing && speaker === value}><i aria-hidden="true" />{value === "host" ? "Host" : "Analyst"}</span>)}
      </div>
    </div>
    <div className="gsp-timeline">
      <div className="gsp-rail">
        <span className="gsp-available" style={{ width: `${available}%` }} />
        <span className="gsp-progress" style={{ width: `${progress}%` }} />
        <input aria-label="Seek podcast" aria-valuetext={`${timestamp(currentTime)}; audio available through ${timestamp(seekable)}`} type="range" min="0" max={seekable || 1} step="0.1" value={Math.min(currentTime, seekable)} disabled={!enabled || seekable === 0} onChange={event => seek(Number(event.target.value))} style={{ width: `${available}%` }} />
      </div>
      <div className="gsp-times"><span>{timestamp(currentTime)}</span><span aria-label={`${durationEstimated ? "Estimated duration " : "Duration "}${timestamp(duration)}`}>{durationEstimated ? "~ " : ""}{timestamp(duration)}</span></div>
    </div>
    <div className="gsp-controls">
      <div className="gsp-control-spacer" aria-hidden="true" />
      <div className="gsp-transport">
        <button type="button" className="gsp-skip" aria-label="Back 10 seconds" disabled={!enabled || currentTime <= 0 || seekable === 0} onClick={() => seek(currentTime - 10)}><SkipIcon /></button>
        <button type="button" className="gsp-toggle" aria-label={playLabel} disabled={!enabled} onClick={onToggle}>
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="currentColor">{playing ? <><rect x="5" y="4" width="5" height="16" rx="1" /><rect x="14" y="4" width="5" height="16" rx="1" /></> : <path d="M7 3.7c0-.8.9-1.2 1.5-.8l13 8.3a1 1 0 0 1 0 1.6l-13 8.3c-.6.4-1.5 0-1.5-.8Z" />}</svg>
        </button>
        <button type="button" className="gsp-skip" aria-label="Forward 10 seconds" disabled={!enabled || currentTime >= seekable || seekable === 0} onClick={() => seek(currentTime + 10)}><SkipIcon forward /></button>
      </div>
      <label className="gsp-rate"><span className="gsp-sr-only">Playback speed</span><select value={playbackRate} disabled={!enabled} onChange={event => onRate(Number(event.target.value))} aria-label="Playback speed">{[.75, 1, 1.25, 1.5, 2].map(rate => <option key={rate} value={rate}>{rate}×</option>)}</select></label>
    </div>
    <p className="gsp-status" role="status">{preparing ? "Preparing your conversation…" : playing ? `${speaker === "analyst" ? "Analyst" : "Host"} speaking` : status === "ended" ? "Conversation complete" : status === "paused" ? "Paused" : status === "ready" ? "Ready when you are" : "Audio is not ready"}</p>
    <details className="gsp-transcript"><summary>Read conversation <span aria-hidden="true">⌄</span></summary><div className="po-transcript gsp-transcript-content"><ol>{turns.map((turn, index) => <li key={turn.id} data-current={index === turnIndex && playing}><strong>{turn.speaker === "host" ? "Host" : "Analyst"}</strong><p>{turn.text}</p></li>)}</ol></div></details>
  </section>;
}
