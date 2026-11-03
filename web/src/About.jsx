// The About section: a bolder, playful layout of its own. Oversized wide capitals, portraits in irregular outlines
// with dashed edges, and name tags that point at them like a design tool's cursors.
import { Icon } from "./icons.jsx";
import { TEAM } from "./team.js";

export default function About() {
  return (
    <section id="about" className="story" aria-labelledby="about-title">
      <h2 id="about-title" className="story-title">
        {TEAM.length === 1 ? `I'm ${TEAM[0].name}` : `We're ${TEAM.map((p) => p.name).join(" & ")}`}
      </h2>

      <ul className="portraits">
        {TEAM.map((p, i) => (
          <li key={p.name} style={{ "--tag": p.color }} className={i % 2 ? "tag-right" : "tag-left"}>
            <Portrait person={p} />
            <span className="cursor-tag">
              <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l17 7-7 2.5L10.5 20z" /></svg>
              <span>{p.name}</span>
            </span>
          </li>
        ))}
      </ul>

      <p className="story-sub">And I built this at Luh Labs</p>

      <div className="story-head">
        <h3>Why it exists</h3>
      </div>

      <p className="story-lede">Fine-tuning should take a sentence, not a weekend.</p>
      <p className="story-body">
        Most of a fine-tune isn't the training. It's writing the examples, picking the settings and finding out
        whether it worked. The agents do that part, and the judge says plainly when it didn't.
      </p>
      <p className="story-body">Want to see the code?</p>
      <a className="dashed-button" href="https://github.com/Luh-Labs-LLC/muse-finetune-agents">
        Source code <Icon name="arrow" size={20} />
      </a>

      <ul className="team-cards">
        {TEAM.map((p) => (
          <li key={p.name} className="team-card" style={{ "--tag": p.color }}>
            <h4>{p.name}</h4>
            <p className="team-role">{p.role}</p>
            <p>{p.built}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Portrait({ person }) {
  const clip = `clip-${person.name.toLowerCase()}`;
  return (
    <svg className="portrait" viewBox="0 0 180 210" aria-hidden="true">
      <defs><clipPath id={clip}><path d={person.shape} /></clipPath></defs>
      <path d={person.shape} fill={person.color} />
      {person.photo ? (
        <image href={person.photo} x="0" y="0" width="180" height="210" preserveAspectRatio="xMidYMid slice" clipPath={`url(#${clip})`} />
      ) : (
        <text x="90" y="128" textAnchor="middle" className="portrait-initial">{person.name[0]}</text>
      )}
      <path d={person.shape} fill="none" className="portrait-edge" />
    </svg>
  );
}
