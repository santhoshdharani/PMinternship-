import React, { useEffect, useMemo, useState } from "react";
import SkillInput from "./components/SkillInput";
import InternshipCard from "./components/InternshipCard";

/*
  IMPORTANT:
  Put your large JSON dataset into: public/data/dataset.json
  Each record should have at least:
    - title, company, location, sector, education, skills (array), description/stipend/duration optional
*/

const DATA_URL = "/data/dataset.json"; // fetched from public folder

// utility normalize (keep only letters/numbers and spaces, lowercase)
function normalize(s = "") {
  return String(s).toLowerCase().trim();
}

// tokenize education for prefix matching
function startsWithIgnoreCase(a = "", b = "") {
  return normalize(a).startsWith(normalize(b));
}

// expand skill token (basic prefix/synonym approach)
function expandToken(tok, vocab = []) {
  const n = normalize(tok);
  if (!n) return [];
  const set = new Set();
  vocab.forEach(v => {
    const nv = normalize(v);
    if (nv.includes(n) || nv.startsWith(n) || n.includes(nv)) set.add(v);
  });
  set.add(tok);
  return Array.from(set);
}

export default function App(){
  const [datasetLoaded, setDatasetLoaded] = useState(false);
  const [rawData, setRawData] = useState([]); // array of internship objects
  const [index, setIndex] = useState({}); // inverted index if needed
  const [skillVocab, setSkillVocab] = useState([]);
  const [educationList, setEducationList] = useState([]);
  const [sectorList, setSectorList] = useState([]);
  const [locationList, setLocationList] = useState([]);

  // user inputs
  const [education, setEducation] = useState("");
  const [sector, setSector] = useState("");
  const [location, setLocation] = useState("");
  const [skills, setSkills] = useState([]);

  // results & extras
  const [results, setResults] = useState([]);
  const [favorites, setFavorites] = useState(() => {
    try { return JSON.parse(localStorage.getItem("favorites")||"[]"); } catch(e){ return [];}
  });
  const [compare, setCompare] = useState([]);
  const [loading, setLoading] = useState(false);
  const [themeDark, setThemeDark] = useState(false);
  const [error, setError] = useState("");

  // fetch big dataset & build lists & small index
  useEffect(()=> {
    let mounted = true;
    setLoading(true);
    fetch(DATA_URL)
      .then(res => {
        if (!res.ok) throw new Error("Failed to fetch dataset: " + res.status);
        return res.json();
      })
      .then(data => {
        if (!mounted) return;
        // Data may be array of objects. we'll normalize important fields
        const normalized = data.map((d, i) => {
          // ensure skills is array
          const skillsArr = Array.isArray(d.skills) ? d.skills : (typeof d.skills === "string" ? d.skills.split(/[,;|]/).map(s => s.trim()).filter(Boolean) : []);
          return {
            id: d.id ?? i,
            title: d.title ?? d.job_title ?? "Untitled",
            company: d.company ?? d.org ?? "Unknown",
            location: d.location ?? d.city ?? "Remote",
            sector: d.sector ?? d.domain ?? "",
            education: d.education ?? d.min_education ?? "",
            skills: skillsArr,
            description: d.description ?? d.summary ?? "",
            stipend: d.stipend ?? d.salary ?? "",
            duration: d.duration ?? ""
          };
        });

        setRawData(normalized);

        // build unique lists
        const educSet = new Set();
        const sectorSet = new Set();
        const locSet = new Set();
        const skillSet = new Set();

        normalized.forEach(item => {
          if (item.education) educSet.add(item.education);
          if (item.sector) sectorSet.add(item.sector);
          if (item.location) locSet.add(item.location);
          (item.skills||[]).forEach(s => skillSet.add(s));
        });

        // convert to arrays sorted
        setEducationList(Array.from(educSet).sort((a,b)=>a.localeCompare(b)));
        setSectorList(Array.from(sectorSet).sort((a,b)=>a.localeCompare(b)));
        setLocationList(Array.from(locSet).sort((a,b)=>a.localeCompare(b)));
        setSkillVocab(Array.from(skillSet).sort((a,b)=>a.localeCompare(b)));

        // optional: small inverted index by normalized skill -> list of ids (speeds some queries)
        const inv = {};
        normalized.forEach(item => {
          (item.skills||[]).forEach(s => {
            const key = normalize(s);
            if (!inv[key]) inv[key] = new Set();
            inv[key].add(item.id);
          });
          // index education, location, sector as well
          const ed = normalize(item.education || "");
          if (ed) { inv[ed] = inv[ed] || new Set(); inv[ed].add(item.id); }
          const loc = normalize(item.location || "");
          if (loc) { inv[loc] = inv[loc] || new Set(); inv[loc].add(item.id); }
          const sec = normalize(item.sector || "");
          if (sec) { inv[sec] = inv[sec] || new Set(); inv[sec].add(item.id); }
        });
        // convert sets to arrays for lighter JSONifiable structure
        const invObj = {};
        for (const k in inv) { invObj[k] = Array.from(inv[k]); }
        setIndex(invObj);

        setDatasetLoaded(true);
      })
      .catch(err => {
        console.error(err);
        setError("Dataset load error: " + err.message);
      })
      .finally(()=> setLoading(false));
    return () => { mounted = false; };
  }, []);

  // persist favorites
  useEffect(()=> {
    try { localStorage.setItem("favorites", JSON.stringify(favorites)); } catch(e){}
  }, [favorites]);

  // scoring function — prioritizes exact location and skill overlap
  function scoreProfile(profile) {
    // weights: location exact > skills > education > sector
    const weights = { skills: 0.52, location: 0.2, education: 0.16, sector: 0.12 };

    // prepare normalized tokens
    const userSkills = (profile.skills||[]).map(s => normalize(s)).filter(Boolean);
    const userEdu = normalize(profile.education || "");
    const userSector = normalize(profile.sector || "");
    const userLoc = normalize(profile.location || "");

    // expanded skill set (prefix match against skillVocab)
    const expanded = new Set();
    userSkills.forEach(tok => {
      expandToken(tok, skillVocab).forEach(x => expanded.add(normalize(x)));
    });

    // compute for each doc
    const results = rawData.map(doc => {
      const docSkills = (doc.skills||[]).map(s => normalize(s));
      // skill overlap: count how many docSkills match any expanded tokens (prefix or substring)
      let matchCount = 0;
      docSkills.forEach(ds => {
        for (const us of expanded) {
          if (!us) continue;
          if (ds.includes(us) || us.includes(ds)) { matchCount++; break; }
        }
      });
      const skillsScore = Math.min(1, matchCount / Math.max(1, docSkills.length));

      // location score: exact or 'remote'
      let locScore = 0;
      const dl = normalize(doc.location || "");
      if (dl === "remote" || userLoc === "remote" || userLoc === "") locScore = 1;
      else if (dl === userLoc) locScore = 1;
      else if (dl.includes(userLoc) || userLoc.includes(dl)) locScore = 0.8;
      else locScore = 0;

      // education score: prefix friendly
      const eduScore = userEdu ? (normalize(doc.education || "").startsWith(userEdu) ? 1 : 0) : 0;

      // sector score: partial
      const sectorScore = userSector ? (normalize(doc.sector || "") === userSector ? 1 : (normalize(doc.sector||"").includes(userSector) ? 0.75 : 0)) : 0;

      // small deterministic tie-breaker so results vary for same score
      const seed = (userSkills.join("|") + "::" + doc.id);
      let hash=0; for(let i=0;i<seed.length;i++){ hash = (hash*31 + seed.charCodeAt(i)) % 100000; }
      const tie = (hash % 100) / 10000; // 0..0.0099

      const total = skillsScore*weights.skills + locScore*weights.location + eduScore*weights.education + sectorScore*weights.sector + tie;

      return {
        ...doc,
        score: total,
        breakdown: { skillsScore, locScore, eduScore: eduScore, sectorScore }
      };
    });

    // sort descending
    return results.sort((a,b) => b.score - a.score);
  }

  // when user clicks Find
  function handleFind() {
    setError("");
    if (!datasetLoaded) { setError("Dataset still loading. Wait a moment."); return; }
    if (skills.length === 0 && !education && !sector && !location) {
      setError("Enter at least skills or education or sector or location.");
      return;
    }
    setLoading(true);
    setTimeout(() => { // allow UI to update; scoring on big dataset might take some ms
      const scored = scoreProfile({ skills, education, sector, location });
      setResults(scored.slice(0, 50)); // keep top 50 in view, we will display top 5 to user but allow compare
      setLoading(false);
    }, 50);
  }

  // save favorite
  function handleSave(intern) {
    if (favorites.find(f => f.id === intern.id)) {
      setFavorites(favorites.filter(f => f.id !== intern.id));
    } else {
      setFavorites([intern, ...favorites].slice(0, 100));
    }
  }

  // compare toggle
  function handleCompareToggle(intern) {
    if (compare.find(c => c.id === intern.id)) {
      setCompare(compare.filter(c => c.id !== intern.id));
    } else {
      if (compare.length >= 2) {
        setError("You can compare up to 2 internships only. Remove one first.");
        setTimeout(()=>setError(""),2000);
        return;
      }
      setCompare([...compare, intern]);
    }
  }

  function downloadResults() {
    const toPrint = results.slice(0, 10);
    const blob = new Blob([JSON.stringify(toPrint, null, 2)], {type: "application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "matched_internships.json"; a.click(); URL.revokeObjectURL(url);
  }

  // datalist suggestions for education/sector/location when user types letter
  const educationSuggestions = useMemo(() => {
    if (!education) return educationList.slice(0, 30);
    const q = normalize(education);
    return educationList.filter(e => normalize(e).startsWith(q)).slice(0, 40);
  }, [education, educationList]);

  const sectorSuggestions = useMemo(() => {
    if (!sector) return sectorList.slice(0, 30);
    const q = normalize(sector);
    return sectorList.filter(s => normalize(s).includes(q)).slice(0, 40);
  }, [sector, sectorList]);

  const locationSuggestions = useMemo(() => {
    if (!location) return locationList.slice(0, 30);
    const q = normalize(location);
    return locationList.filter(l => normalize(l).includes(q)).slice(0, 40);
  }, [location, locationList]);

  const skillSuggestions = useMemo(() => {
    if (!skills.length) return skillVocab.slice(0, 30);
    const last = skills[skills.length-1] || "";
    const q = normalize(last);
    if (!q) return skillVocab.slice(0, 30);
    return skillVocab.filter(s => normalize(s).includes(q)).slice(0, 40);
  }, [skills, skillVocab]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", themeDark ? "dark" : "light");
  }, [themeDark]);

  return (
    <div className="app">
      <div className="header">
        <div className="brand">
          <div className="logo">IM</div>
          <div>
            <div className="title">InternshipMatch — Professional</div>
            <div className="subtitle">Upload skills & preferences → we’ll return the best matching internships</div>
          </div>
        </div>

        <div style={{display:"flex",gap:10,alignItems:"center"}}>
          <button className="btn secondary small" onClick={() => setThemeDark(t=>!t)}>{themeDark ? "Light" : "Dark"}</button>
          <button className="btn small" onClick={() => { setSkills([]); setEducation(""); setSector(""); setLocation(""); setResults([]); }}>Clear</button>
          <button className="btn small" onClick={() => downloadResults()} disabled={!results.length}>Download</button>
        </div>
      </div>

      <div className="grid">
        {/* LEFT: input & controls */}
        <div className="card">
          <h3 style={{margin:0}}>Your Profile</h3>
          <p style={{color:"#6b7280",marginTop:6}}>Type partial tokens (e.g. 'B' → B.Tech, BE). Suggestions appear while typing.</p>

          <div className="form-row">
            <label>Education</label>
            <input list="edu-list" className="input" placeholder="e.g. B.Tech" value={education} onChange={e=>setEducation(e.target.value)} />
            <datalist id="edu-list">
              {educationSuggestions.map((e,i) => <option key={i} value={e} />)}
            </datalist>
          </div>

          <div className="form-row">
            <label>Sector</label>
            <input list="sector-list" className="input" placeholder="e.g. IT Services" value={sector} onChange={e=>setSector(e.target.value)} />
            <datalist id="sector-list">
              {sectorSuggestions.map((s,i) => <option key={i} value={s} />)}
            </datalist>
          </div>

          <div className="form-row">
            <label>Location</label>
            <input list="loc-list" className="input" placeholder="e.g. Bangalore / Remote" value={location} onChange={e=>setLocation(e.target.value)} />
            <datalist id="loc-list">
              {locationSuggestions.map((l,i) => <option key={i} value={l} />)}
            </datalist>
          </div>

          <div className="form-row">
            <SkillInput skills={skills} setSkills={setSkills} suggestions={skillVocab.slice(0,500)} />
            <div style={{marginTop:8,color:"#6b7280"}}>Tip: type partial skill tokens like "re" to match "React", "redux".</div>
          </div>

          <div className="form-row" style={{display:"flex",gap:10}}>
            <button className="btn" onClick={handleFind}>{loading ? "Matching..." : "Find Best Internships"}</button>
            <label className="btn secondary small" style={{display:"inline-flex",alignItems:"center",gap:8,cursor:"pointer"}}>
              Upload dataset (JSON)
              <input type="file" accept=".json" style={{display:"none"}} onChange={e=>{
                const f = e.target.files?.[0]; if(!f) return;
                const reader = new FileReader();
                reader.onload = ev => {
                  try {
                    const parsed = JSON.parse(ev.target.result);
                    // replace rawData and rebuild lists
                    setRawData(parsed.map((d,i)=>({
                      id: d.id ?? i,
                      title: d.title ?? d.job_title ?? "Untitled",
                      company: d.company ?? d.org ?? "Unknown",
                      location: d.location ?? d.city ?? "Remote",
                      sector: d.sector ?? d.domain ?? "",
                      education: d.education ?? d.min_education ?? "",
                      skills: Array.isArray(d.skills) ? d.skills : (typeof d.skills === "string" ? d.skills.split(/[,;|]/).map(s=>s.trim()).filter(Boolean) : []),
                      description: d.description ?? d.summary ?? "",
                      stipend: d.stipend ?? d.salary ?? ""
                    })));
                    alert("Dataset uploaded — click Find Best Internships to re-index.");
                  } catch(err) {
                    alert("Invalid JSON file: " + err.message);
                  }
                };
                reader.readAsText(f);
              }} />
            </label>
          </div>

          {error && <div style={{color:"crimson",marginTop:8}}>{error}</div>}
          <div style={{marginTop:12,fontSize:13,color:"#6b7280"}}>
            Extras: Save favorites, compare up to 2 internships, download results.
          </div>
        </div>

        {/* RIGHT: results & controls */}
        <div className="right">
          <div className="card">
            <div className="controls">
              <div><strong>Top Matches</strong> {results.length ? ` — showing ${Math.min(5, results.length)} of ${results.length}` : ""}</div>
              <div className="row">
                <div className="compare-bar">
                  {compare.length > 0 && <div className="compare-box">Comparing: {compare.map(c=>c.title).join(" | ")}</div>}
                </div>
              </div>
            </div>

            {loading ? <div style={{padding:30}}>Loading & scoring... please wait</div> : (
              <>
                <div className="results-grid">
                  {results.slice(0,5).map(r => 
                    <InternshipCard key={r.id} intern={r} onSave={handleSave} onCompareToggle={handleCompareToggle} isCompared={!!compare.find(c=>c.id===r.id)} isSaved={!!favorites.find(f=>f.id===r.id)} />
                  )}
                </div>

                {/* show more */}
                {results.length > 5 && (
                  <div style={{marginTop:12}}>
                    <details>
                      <summary style={{cursor:"pointer"}}>Show more matches ({results.length - 5})</summary>
                      <div style={{marginTop:10}} className="results-grid">
                        {results.slice(5, 20).map(r => 
                          <InternshipCard key={r.id} intern={r} onSave={handleSave} onCompareToggle={handleCompareToggle} isCompared={!!compare.find(c=>c.id===r.id)} isSaved={!!favorites.find(f=>f.id===r.id)} />
                        )}
                      </div>
                    </details>
                  </div>
                )}
              </>
            )}

            <div style={{marginTop:12,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{fontSize:13,color:"#6b7280"}}>Favorites: {favorites.length}</div>
              <div style={{display:"flex",gap:8}}>
                <button className="btn secondary small" onClick={() => { setFavorites([]); }}>Clear Favorites</button>
                <button className="btn small" onClick={() => {
                  const b = new Blob([JSON.stringify(favorites, null, 2)], {type:"application/json"});
                  const u = URL.createObjectURL(b);
                  const a = document.createElement("a"); a.href = u; a.download = "favorites.json"; a.click(); URL.revokeObjectURL(u);
                }} disabled={!favorites.length}>Export Favorites</button>
              </div>
            </div>

            {compare.length === 2 && (
              <div style={{marginTop:14, padding:12, borderRadius:10, background:"rgba(0,0,0,0.03)"}}>
                <h4>Comparison</h4>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr", gap:12}}>
                  {compare.map(c => (
                    <div key={c.id} style={{background:"white", padding:12, borderRadius:8}}>
                      <div style={{fontWeight:800}}>{c.title}</div>
                      <div style={{color:"#6b7280"}}>{c.company} • {c.location}</div>
                      <div style={{marginTop:8}}>Skills: {(c.skills||[]).slice(0,8).join(", ")}</div>
                      <div style={{marginTop:8}}>Stipend: {c.stipend || "—"}</div>
                      <div style={{marginTop:10}}>Score: {Math.round((c.score||0)*100)}%</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>

          <div className="footer">Built for SIH — dataset-driven, precise matching and modern UI. Customize weights in App.js for different ranking strategies.</div>
        </div>
      </div>
    </div>
  );
}
