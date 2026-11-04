// The About section: who built it and why, in the same voice as the rest of the site.
import { TEAM } from "./team.js";

export default function About() {
  return (
    <section id="about" className="story band light" aria-labelledby="about-title">
      <h2 id="about-title">
        {TEAM.length === 1 ? `Built by ${TEAM[0].name}, at Luh Labs` : `Built by ${TEAM.map((p) => p.name).join(" and ")}`}
      </h2>
      <ul className="portraits">
        {TEAM.map((p) => (
          <li key={p.name}><Portrait person={p} /></li>
        ))}
      </ul>
      <div className="story-text">
        <p className="story-lede">Fine-tuning should take a sentence, not a weekend.</p>
        <p className="story-body">
          Most of a fine-tune isn’t the training. It’s writing the examples, picking the settings and finding out
          whether it worked. The agents do that part, and the judge says plainly when it didn’t.
        </p>
        {TEAM.map((p) => <p key={p.name} className="story-role">{p.name}, {p.role}: {p.built}</p>)}
        <a className="button" href="https://github.com/Luh-Labs-LLC/muse-finetune-agents">Read the source code</a>
      </div>
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
