import React from "react";

export default function InternshipCard({ intern, onSave, onCompareToggle, isCompared, isSaved }) {
  return (
    <div className="intern-card">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12}}>
        <div>
          <div className="intern-title">{intern.title}</div>
          <div className="meta">{intern.company} • {intern.location} • {intern.duration || "—"}</div>
        </div>
        <div style={{textAlign:"right"}}>
          <div className="score">{Math.round((intern.score||0)*100)}%</div>
        </div>
      </div>

      <div style={{marginTop:10}}>{intern.description || intern.summary || ""}</div>

      <div className="skill-tags">
        {(intern.skills || []).slice(0,8).map(s => <div key={s} className="tag">{s}</div>)}
      </div>

      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:12}}>
        <div className="meta">Stipend: <strong>{intern.stipend || "—"}</strong></div>
        <div style={{display:"flex",gap:8}}>
          <button className="btn small" onClick={() => onSave(intern)}>{isSaved ? "Saved" : "Save"}</button>
          <button className="btn secondary small" onClick={() => onCompareToggle(intern)}>{isCompared ? "Remove" : "Compare"}</button>
        </div>
      </div>

      <details className="breakdown">
        <summary style={{cursor:"pointer"}}>Ranking breakdown</summary>
        <div style={{marginTop:8}}>
          <div>Skills: {Math.round((intern.breakdown?.skillsScore || 0)*100)}%</div>
          <div>Location: {Math.round((intern.breakdown?.locScore || 0)*100)}%</div>
          <div>Education: {Math.round((intern.breakdown?.eduScore || 0)*100)}%</div>
          <div>Sector: {Math.round((intern.breakdown?.sectorScore || 0)*100)}%</div>
        </div>
      </details>
    </div>
  );
}
