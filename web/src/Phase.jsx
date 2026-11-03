// Moving pictures of the step a request is on, so a run looks alive between progress reports.
//   Writing: the Job Architect writing training chats, bubble by bubble.
//   Lora: what training does. The base model's weight matrix W stays frozen (grey); data runs through it as a wave of
//   light. Beside it the two thin LoRA matrices, B and A, are the only weights that learn: their cells flicker as the
//   optimizer updates them and glow brighter epoch by epoch. Under it, the epochs as a bar that fills.
// Both are decoration next to text that says the same; screen readers get one sentence.

const N = 8;  // W is N × N in the picture; B is N × 2 and A is 2 × N (rank 2 stands in for the real rank)

// A fixed jumble of delays, so the flicker looks random but doesn't change on every render.
const jitter = (i) => ((i * 7919) % 23) / 10;

function Cells({ rows, cols, kind }) {
  return (
    <span className={`lora-grid ${kind}`} style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
      {Array.from({ length: rows * cols }, (_, i) => (
        <i key={i} style={{ "--col": i % cols, "--d": `${jitter(i + rows)}s` }} />
      ))}
    </span>
  );
}

export function Lora({ done, total, rank }) {
  const glow = total ? Math.min(1, done / total) : 0;
  return (
    <div className="phase lora" style={{ "--glow": glow }}>
      <p className="sr-only">Training the LoRA adapter{total ? `: ${done} of ${total} epochs done` : ""}.</p>
      <div className="lora-pic" aria-hidden="true">
        <span className="lora-stream"><i /><i /><i /><i /></span>
        <figure className="lora-part">
          <Cells rows={N} cols={N} kind="w" />
          <figcaption>W · frozen</figcaption>
        </figure>
        <span className="lora-op">+</span>
        <figure className="lora-part">
          <span className="lora-ba">
            <Cells rows={N} cols={2} kind="b" />
            <b>×</b>
            <Cells rows={2} cols={N} kind="a" />
          </span>
          <figcaption>B·A · learning{rank ? ` (rank ${rank})` : ""}</figcaption>
        </figure>
      </div>
      {total > 0 && (
        <div className="lora-epochs" aria-hidden="true">
          {Array.from({ length: total }, (_, i) => (
            <span key={i} className={i < done ? "done" : i === done ? "now" : ""} />
          ))}
        </div>
      )}
    </div>
  );
}

export function Writing() {
  return (
    <div className="phase writing" aria-hidden="true">
      {["user", "bot", "user", "bot"].map((who, i) => (
        <span key={i} className={`writing-line ${who}`} style={{ "--i": i }} />
      ))}
    </div>
  );
}
