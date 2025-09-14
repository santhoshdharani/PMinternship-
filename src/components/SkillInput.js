import React, { useState, useMemo } from "react";

/**
 * props:
 *  - skills (array)
 *  - setSkills(fn)
 *  - suggestions (array) optional
 */
export default function SkillInput({ skills, setSkills, suggestions = [] }) {
  const [text, setText] = useState("");

  // suggestions dynamic: filter suggestions that startWith typed text
  const filtered = useMemo(() => {
    const t = text.trim().toLowerCase();
    if (!t) return suggestions.slice(0, 8);
    return suggestions.filter(s => s.toLowerCase().includes(t)).slice(0, 8);
  }, [text, suggestions]);

  const addSkill = (skill) => {
    if (!skill) return;
    if (skills.includes(skill)) return setText("");
    setSkills([...skills, skill]);
    setText("");
  };

  const removeSkill = (s) => setSkills(skills.filter(x => x !== s));

  const onKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const tok = text.trim();
      if (tok) addSkill(tok);
    } else if (e.key === "," ) {
      e.preventDefault();
      const tok = text.replace(",", "").trim();
      if (tok) addSkill(tok);
    }
  };

  return (
    <div>
      <label>Skills</label>
      <input
        className="input"
        placeholder="Type a skill, press Enter or choose suggestion"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <div className="chips" style={{marginTop:8}}>
        {filtered.map(s => (
          <button key={s} className="chip small" onClick={() => addSkill(s)}>{s}</button>
        ))}
      </div>
      <div className="chips" style={{marginTop:10}}>
        {skills.map(s => (
          <div key={s} className="chip">
            {s} <button style={{marginLeft:8, background:"transparent", border:"none", cursor:"pointer"}} onClick={() => removeSkill(s)}>✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}
