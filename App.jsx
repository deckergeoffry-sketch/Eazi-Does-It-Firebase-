import { useState, useEffect, useCallback, useRef } from "react";
import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, get, onValue, update } from "firebase/database";

// ── Firebase config ──────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyDlmaD-tlLZmaEpnXbn1hbYFytuq-LALYU",
  authDomain: "eazi-does-it.firebaseapp.com",
  databaseURL: "https://eazi-does-it-default-rtdb.firebaseio.com",
  projectId: "eazi-does-it",
  storageBucket: "eazi-does-it.firebasestorage.app",
  messagingSenderId: "114958368582",
  appId: "1:114958368582:web:078306d98ba4bd893e6f47",
};
const firebaseApp = initializeApp(firebaseConfig);
const db = getDatabase(firebaseApp);

const ANTHROPIC_MODEL = "claude-sonnet-4-20250514";

const RUBRIC = [
  { score: 1, label: "Poor", desc: "Vague, hypothetical — no clear example" },
  { score: 2, label: "Weak", desc: "Example lacks detail, minimal results" },
  { score: 3, label: "Competent", desc: "All elements present, acceptable" },
  { score: 4, label: "Strong", desc: "Detailed, thoughtful, strong results" },
  { score: 5, label: "Excellent", desc: "High-impact, proactive, mastery shown" },
];

const RECOMMENDATION = (pct) => {
  if (pct >= 0.8) return { label: "Strong Hire", color: "#22c55e", icon: "⭐" };
  if (pct >= 0.6) return { label: "Hire", color: "#86efac", icon: "✅" };
  if (pct >= 0.4) return { label: "Borderline", color: "#fbbf24", icon: "⚠️" };
  return { label: "Do Not Hire", color: "#ef4444", icon: "❌" };
};

// ── Global styles ─────────────────────────────────────────────────────────────
const GlobalStyle = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500;600&display=swap');
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #0f0f11; color: #e8e4de; font-family: 'DM Sans', sans-serif; }
    ::-webkit-scrollbar { width: 6px; }
    ::-webkit-scrollbar-track { background: #1a1a1f; }
    ::-webkit-scrollbar-thumb { background: #3a3a45; border-radius: 3px; }
    input, textarea, select { font-family: inherit; }
    button { cursor: pointer; font-family: inherit; }
    .fade-in { animation: fadeIn 0.4s ease forwards; }
    @keyframes fadeIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
    .pulse { animation: pulse 2s infinite; }
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
  `}</style>
);

function ScorePill({ value, onChange, disabled }) {
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {[1,2,3,4,5].map(n => (
        <button key={n} onClick={() => !disabled && onChange(n)} style={{
          width: 36, height: 36, borderRadius: "50%", border: "2px solid",
          borderColor: value === n ? "#c9a96e" : "#2e2e38",
          background: value === n ? "#c9a96e" : "transparent",
          color: value === n ? "#0f0f11" : "#888",
          fontWeight: 600, fontSize: 14, transition: "all 0.15s",
          cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.6 : 1,
        }}>{n}</button>
      ))}
    </div>
  );
}

function Bar({ pct, color = "#c9a96e", height = 6 }) {
  return (
    <div style={{ background: "#2e2e38", borderRadius: 99, height, overflow: "hidden" }}>
      <div style={{ width: `${Math.min(pct*100,100)}%`, height: "100%", background: color, borderRadius: 99, transition: "width 0.5s ease" }} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// LANDING
// ═══════════════════════════════════════════════════════════════════════════════
function LandingView({ onSetup, onJoin }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ textAlign: "center", maxWidth: 560 }} className="fade-in">
        <div style={{ fontSize: 13, letterSpacing: 4, color: "#c9a96e", textTransform: "uppercase", marginBottom: 16 }}>Eazi Does It · Interview Intelligence</div>
        <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: "clamp(2.5rem,6vw,4rem)", lineHeight: 1.1, marginBottom: 20 }}>
          Live Panel<br /><em style={{ color: "#c9a96e" }}>Scoresheet</em>
        </h1>
        <p style={{ color: "#888", lineHeight: 1.7, marginBottom: 48, fontSize: 16 }}>
          Upload a job description, let AI generate your interview scoresheet, then share a live link so all panelists can score in real time.
        </p>
        <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
          <button onClick={onSetup} style={{
            background: "#c9a96e", color: "#0f0f11", border: "none", borderRadius: 8,
            padding: "14px 32px", fontWeight: 600, fontSize: 15, letterSpacing: 0.5,
          }}>+ New Interview Session</button>
          <button onClick={onJoin} style={{
            background: "transparent", color: "#e8e4de", border: "2px solid #2e2e38",
            borderRadius: 8, padding: "14px 32px", fontWeight: 500, fontSize: 15,
          }}>Join as Panelist</button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SETUP — upload JD, generate scoresheet
// ═══════════════════════════════════════════════════════════════════════════════
function SetupView({ onComplete }) {
  const [jdText, setJdText] = useState("");
  const [candidateName, setCandidateName] = useState("");
  const [numPanelists, setNumPanelists] = useState(5);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const fileRef = useRef();

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setStatusMsg("Reading file…");
    const base64 = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result.split(",")[1]);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
    setStatusMsg("Extracting JD content with AI…");
    try {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: ANTHROPIC_MODEL, max_tokens: 2000,
          messages: [{ role: "user", content: [
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
            { type: "text", text: "Extract and return the full text of this job description. Return plain text only, no markdown." }
          ]}]
        })
      });
      const data = await resp.json();
      const text = data.content?.map(c => c.text || "").join("\n") || "";
      setJdText(text);
      setStatusMsg("JD loaded ✓");
    } catch { setStatusMsg("Could not parse file — paste JD text below."); }
  };

  const generate = async () => {
    if (!jdText.trim()) return;
    setLoading(true);
    setStatusMsg("Generating tailored scoresheet with AI…");
    try {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: ANTHROPIC_MODEL, max_tokens: 4000,
          messages: [{ role: "user", content: `You are an expert HR consultant. Based on the job description below, generate a structured interview scoresheet in JSON format.

JOB DESCRIPTION:
${jdText}

Return ONLY valid JSON (no markdown, no backticks) in this exact format:
{
  "role": "Job title here",
  "sections": [
    {
      "id": "s1",
      "title": "Section title",
      "maxScore": 30,
      "questions": [
        { "id": "q1", "text": "Interview question text here?" }
      ]
    }
  ]
}

Rules:
- Create 3-5 sections based on the JD (e.g. Key Responsibilities, Competencies, KPIs, Culture/Values, Role-Play if relevant)
- Each section should have 4-6 questions scored 1-5
- Questions must be behavioural STAR-based: "Tell me about a time...", "Describe a situation..."
- maxScore = number_of_questions × 5
- Make questions specific to the actual role and industry in the JD
- Section ids: s1, s2, s3... Question ids: q1, q2, q3...` }]
        })
      });
      const data = await resp.json();
      const raw = data.content?.map(c => c.text || "").join("") || "";
      const clean = raw.replace(/```json|```/g, "").trim();
      const scoresheet = JSON.parse(clean);
      scoresheet.totalMax = scoresheet.sections.reduce((a, s) => a + s.maxScore, 0);
      onComplete({ scoresheet, candidateName, numPanelists });
    } catch (e) {
      setStatusMsg("Error generating scoresheet. Please try again.");
      console.error(e);
    }
    setLoading(false);
  };

  return (
    <div style={{ minHeight: "100vh", maxWidth: 700, margin: "0 auto", padding: "40px 24px" }} className="fade-in">
      <div style={{ fontSize: 12, letterSpacing: 3, color: "#c9a96e", textTransform: "uppercase", marginBottom: 32 }}>New Session Setup</div>
      <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 32, marginBottom: 32 }}>Configure Interview</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div>
          <label style={{ fontSize: 13, color: "#888", letterSpacing: 1, textTransform: "uppercase", display: "block", marginBottom: 8 }}>Candidate Name</label>
          <input value={candidateName} onChange={e => setCandidateName(e.target.value)} placeholder="e.g. Jane Smith"
            style={{ width: "100%", background: "#1a1a1f", border: "1.5px solid #2e2e38", borderRadius: 8, padding: "12px 16px", color: "#e8e4de", fontSize: 15, outline: "none" }} />
        </div>
        <div>
          <label style={{ fontSize: 13, color: "#888", letterSpacing: 1, textTransform: "uppercase", display: "block", marginBottom: 8 }}>Number of Panelists</label>
          <select value={numPanelists} onChange={e => setNumPanelists(Number(e.target.value))}
            style={{ background: "#1a1a1f", border: "1.5px solid #2e2e38", borderRadius: 8, padding: "12px 16px", color: "#e8e4de", fontSize: 15, outline: "none" }}>
            {[2,3,4,5,6,7,8].map(n => <option key={n} value={n}>{n} Panelists</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 13, color: "#888", letterSpacing: 1, textTransform: "uppercase", display: "block", marginBottom: 8 }}>Job Description</label>
          <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
            <button onClick={() => fileRef.current.click()} style={{
              background: "#1a1a1f", border: "1.5px solid #2e2e38", borderRadius: 8,
              padding: "10px 20px", color: "#c9a96e", fontSize: 14, fontWeight: 500,
            }}>📄 Upload PDF / Word</button>
            <input ref={fileRef} type="file" accept=".pdf,.doc,.docx" onChange={handleFile} style={{ display: "none" }} />
          </div>
          <textarea value={jdText} onChange={e => setJdText(e.target.value)} placeholder="Or paste the job description text here…" rows={10}
            style={{ width: "100%", background: "#1a1a1f", border: "1.5px solid #2e2e38", borderRadius: 8, padding: "12px 16px", color: "#e8e4de", fontSize: 14, outline: "none", resize: "vertical", lineHeight: 1.6 }} />
        </div>
        {statusMsg && <div style={{ fontSize: 13, color: "#c9a96e" }}>{statusMsg}</div>}
        <button onClick={generate} disabled={loading || !jdText.trim()} style={{
          background: loading || !jdText.trim() ? "#2e2e38" : "#c9a96e",
          color: loading || !jdText.trim() ? "#555" : "#0f0f11",
          border: "none", borderRadius: 8, padding: "16px 32px", fontWeight: 600, fontSize: 16,
          display: "flex", alignItems: "center", gap: 10, justifyContent: "center",
        }}>
          {loading ? <><span className="pulse">●</span> Generating with AI…</> : "✨ Generate Scoresheet"}
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SESSION READY — share panelist IDs
// ═══════════════════════════════════════════════════════════════════════════════
function SessionReadyView({ session, onGoToDashboard, onGoToScoresheet }) {
  const [copied, setCopied] = useState(null);
  const appUrl = window.location.href.split("?")[0];

  const copy = (text, key) => {
    navigator.clipboard.writeText(text).then(() => { setCopied(key); setTimeout(() => setCopied(null), 2000); });
  };

  return (
    <div style={{ minHeight: "100vh", maxWidth: 680, margin: "0 auto", padding: "40px 24px" }} className="fade-in">
      <div style={{ background: "#1a1a1f", border: "1px solid #2e2e38", borderRadius: 16, padding: 40, textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
        <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 28, marginBottom: 8 }}>Session Created!</h2>
        <p style={{ color: "#888", marginBottom: 12 }}>Share each panelist their unique link below.</p>
        <div style={{ background: "#0f0f11", borderRadius: 8, padding: "10px 16px", marginBottom: 32, fontSize: 13, color: "#666" }}>
          Session ID: <strong style={{ color: "#c9a96e", fontFamily: "monospace" }}>{session.id}</strong>
        </div>

        <div style={{ textAlign: "left", display: "flex", flexDirection: "column", gap: 12, marginBottom: 32 }}>
          {session.panelists.map((p, i) => {
            const link = `${appUrl}?session=${session.id}&panelist=${p.id}`;
            return (
              <div key={i} style={{ background: "#0f0f11", border: "1px solid #2e2e38", borderRadius: 10, padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 12, color: "#666", marginBottom: 3 }}>Panelist {i+1}</div>
                  <div style={{ fontFamily: "monospace", fontSize: 12, color: "#c9a96e", wordBreak: "break-all" }}>{link}</div>
                </div>
                <button onClick={() => copy(link, p.id)} style={{
                  background: copied === p.id ? "#22c55e" : "#2e2e38", border: "none",
                  borderRadius: 6, padding: "8px 14px", color: "#e8e4de", fontSize: 12, flexShrink: 0,
                }}>{copied === p.id ? "✓ Copied" : "Copy"}</button>
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
          <button onClick={onGoToDashboard} style={{
            background: "#c9a96e", color: "#0f0f11", border: "none", borderRadius: 8,
            padding: "14px 28px", fontWeight: 600, fontSize: 15,
          }}>📊 Open Panel Dashboard</button>
          <button onClick={() => onGoToScoresheet(session.panelists[0].id)} style={{
            background: "transparent", border: "1.5px solid #2e2e38", borderRadius: 8,
            padding: "14px 28px", color: "#e8e4de", fontSize: 15,
          }}>Preview Scoresheet</button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PANELIST SCORESHEET
// ═══════════════════════════════════════════════════════════════════════════════
function ScoresheetView({ panelistId, sessionId, session, scoresheet }) {
  const [localData, setLocalData] = useState({});
  const [panName, setPanName] = useState("");
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const saveTimer = useRef(null);
  const dbRef = ref(db, `sessions/${sessionId}/responses/${panelistId}`);

  // Load existing data from Firebase
  useEffect(() => {
    get(dbRef).then(snap => {
      if (snap.exists()) {
        const d = snap.val();
        setLocalData(d);
        setPanName(d.name || "");
      }
    });
  }, [panelistId, sessionId]);

  const scheduleAutoSave = (data) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => doSave(data), 1500);
  };

  const doSave = async (data) => {
    setSaving(true);
    try {
      await set(dbRef, { ...data, updatedAt: Date.now() });
      setLastSaved(new Date().toLocaleTimeString());
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const setScore = (sectionId, questionId, val) => {
    const updated = { ...localData, name: panName, scores: { ...localData.scores, [`${sectionId}_${questionId}`]: val } };
    setLocalData(updated);
    scheduleAutoSave(updated);
  };

  const setNote = (sectionId, questionId, val) => {
    const updated = { ...localData, name: panName, notes: { ...localData.notes, [`${sectionId}_${questionId}`]: val } };
    setLocalData(updated);
    scheduleAutoSave(updated);
  };

  const setSectionComment = (sectionId, val) => {
    const updated = { ...localData, name: panName, sectionComments: { ...localData.sectionComments, [sectionId]: val } };
    setLocalData(updated);
    scheduleAutoSave(updated);
  };

  const handleField = (field, val) => {
    const updated = { ...localData, name: panName, [field]: val };
    setLocalData(updated);
    scheduleAutoSave(updated);
  };

  const handleNameBlur = () => doSave({ ...localData, name: panName });

  if (!scoresheet || !session) return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ color: "#888" }}>Loading session…</div>
    </div>
  );

  const sectionScores = scoresheet.sections.map(sec => ({
    ...sec,
    total: sec.questions.reduce((a, q) => a + (localData.scores?.[`${sec.id}_${q.id}`] || 0), 0),
  }));
  const totalScore = sectionScores.reduce((a, s) => a + s.total, 0);
  const totalMax = scoresheet.totalMax;
  const pct = totalMax ? totalScore / totalMax : 0;
  const rec = RECOMMENDATION(pct);

  return (
    <div style={{ minHeight: "100vh", maxWidth: 780, margin: "0 auto", padding: "32px 20px 80px" }} className="fade-in">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 12, letterSpacing: 3, color: "#c9a96e", textTransform: "uppercase", marginBottom: 6 }}>Interview Scoresheet</div>
          <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 26 }}>{scoresheet.role}</h1>
          {session.candidateName && <div style={{ color: "#888", marginTop: 4 }}>Candidate: <strong style={{ color: "#e8e4de" }}>{session.candidateName}</strong></div>}
        </div>
        <div style={{ fontSize: 13, color: saving ? "#c9a96e" : "#555" }}>
          {saving ? <><span className="pulse">●</span> Saving…</> : lastSaved ? `✓ Saved ${lastSaved}` : "Changes auto-save"}
        </div>
      </div>

      <div style={{ background: "#1a1a1f", border: "1px solid #2e2e38", borderRadius: 12, padding: "20px 24px", marginBottom: 32 }}>
        <label style={{ fontSize: 12, color: "#888", letterSpacing: 2, textTransform: "uppercase", display: "block", marginBottom: 8 }}>Your Name</label>
        <input value={panName} onChange={e => setPanName(e.target.value)} onBlur={handleNameBlur} placeholder="Enter your name…"
          style={{ width: "100%", background: "#0f0f11", border: "1.5px solid #2e2e38", borderRadius: 8, padding: "10px 14px", color: "#e8e4de", fontSize: 15, outline: "none" }} />
      </div>

      <details style={{ marginBottom: 32, background: "#1a1a1f", border: "1px solid #2e2e38", borderRadius: 10, padding: "14px 20px" }}>
        <summary style={{ cursor: "pointer", fontSize: 13, color: "#888", letterSpacing: 1 }}>SCORING RUBRIC</summary>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 16 }}>
          {RUBRIC.map(r => (
            <div key={r.score} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#c9a96e", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13, color: "#0f0f11" }}>{r.score}</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{r.label}</div>
                <div style={{ fontSize: 12, color: "#666" }}>{r.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </details>

      {sectionScores.map((sec, si) => (
        <div key={sec.id} style={{ marginBottom: 40 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 20 }}>{si+1}. {sec.title}</h2>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontWeight: 700, fontSize: 18 }}>{sec.total}<span style={{ color: "#555", fontSize: 14 }}>/{sec.maxScore}</span></div>
              <Bar pct={sec.maxScore ? sec.total/sec.maxScore : 0} />
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {sec.questions.map((q, qi) => {
              const key = `${sec.id}_${q.id}`;
              const score = localData.scores?.[key] || 0;
              return (
                <div key={q.id} style={{ background: "#1a1a1f", border: "1px solid #2e2e38", borderRadius: 12, padding: "20px 22px" }}>
                  <div style={{ fontSize: 13, color: "#c9a96e", marginBottom: 4, fontWeight: 500 }}>Q{qi+1}</div>
                  <div style={{ fontSize: 15, lineHeight: 1.6, marginBottom: 14 }}>{q.text}</div>
                  <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
                    <ScorePill value={score} onChange={v => setScore(sec.id, q.id, v)} />
                    {score > 0 && <div style={{ fontSize: 13, color: "#888" }}>{RUBRIC[score-1]?.label}</div>}
                  </div>
                  <textarea value={localData.notes?.[key] || ""} onChange={e => setNote(sec.id, q.id, e.target.value)}
                    placeholder="Notes / Evidence…" rows={2}
                    style={{ width: "100%", background: "#0f0f11", border: "1px solid #2a2a34", borderRadius: 8, padding: "10px 14px", color: "#e8e4de", fontSize: 13, outline: "none", resize: "vertical" }} />
                </div>
              );
            })}
            <div>
              <label style={{ fontSize: 12, color: "#666", letterSpacing: 1, textTransform: "uppercase" }}>Section comment</label>
              <textarea value={localData.sectionComments?.[sec.id] || ""} onChange={e => setSectionComment(sec.id, e.target.value)}
                placeholder="Overall section observations…" rows={2}
                style={{ width: "100%", marginTop: 8, background: "#1a1a1f", border: "1px solid #2e2e38", borderRadius: 8, padding: "10px 14px", color: "#e8e4de", fontSize: 13, outline: "none", resize: "vertical" }} />
            </div>
          </div>
        </div>
      ))}

      <div style={{ background: "#1a1a1f", border: "1px solid #2e2e38", borderRadius: 16, padding: "28px", marginBottom: 24 }}>
        <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22, marginBottom: 20 }}>Final Summary</h2>
        <div style={{ display: "flex", gap: 20, alignItems: "center", padding: "16px 0", borderBottom: "1px solid #2e2e38", marginBottom: 20 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, color: "#888" }}>Total Score</div>
            <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 36 }}>{totalScore}<span style={{ color: "#555", fontSize: 18 }}>/{totalMax}</span></div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 26, fontWeight: 700 }}>{(pct*100).toFixed(0)}%</div>
            <div style={{ fontSize: 14, color: rec.color, fontWeight: 600 }}>{rec.icon} {rec.label}</div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, color: "#888", letterSpacing: 1, textTransform: "uppercase", display: "block", marginBottom: 6 }}>Key Strengths</label>
            <textarea value={localData.strengths || ""} onChange={e => handleField("strengths", e.target.value)} placeholder="What stood out positively…" rows={3}
              style={{ width: "100%", background: "#0f0f11", border: "1px solid #2a2a34", borderRadius: 8, padding: "10px 14px", color: "#e8e4de", fontSize: 14, outline: "none", resize: "vertical" }} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: "#888", letterSpacing: 1, textTransform: "uppercase", display: "block", marginBottom: 6 }}>Areas of Concern</label>
            <textarea value={localData.concerns || ""} onChange={e => handleField("concerns", e.target.value)} placeholder="Any gaps or red flags…" rows={3}
              style={{ width: "100%", background: "#0f0f11", border: "1px solid #2a2a34", borderRadius: 8, padding: "10px 14px", color: "#e8e4de", fontSize: 14, outline: "none", resize: "vertical" }} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: "#888", letterSpacing: 1, textTransform: "uppercase", display: "block", marginBottom: 8 }}>Your Recommendation</label>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {["Strong Hire", "Hire", "Borderline", "Do Not Hire"].map(r => (
                <button key={r} onClick={() => handleField("recommendation", r)} style={{
                  padding: "10px 18px", borderRadius: 8, fontSize: 14, fontWeight: 500, border: "2px solid",
                  borderColor: localData.recommendation === r ? "#c9a96e" : "#2e2e38",
                  background: localData.recommendation === r ? "#c9a96e22" : "transparent",
                  color: localData.recommendation === r ? "#c9a96e" : "#888",
                }}>{r}</button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <button onClick={() => doSave({ ...localData, name: panName })} style={{
        width: "100%", background: "#c9a96e", color: "#0f0f11", border: "none",
        borderRadius: 10, padding: "16px", fontWeight: 700, fontSize: 16,
      }}>{saving ? "Saving…" : "💾 Save Scoresheet"}</button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PANEL DASHBOARD — live rollup
// ═══════════════════════════════════════════════════════════════════════════════
function DashboardView({ sessionId, session, scoresheet }) {
  const [responses, setResponses] = useState({});
  const [tab, setTab] = useState("overview");

  useEffect(() => {
    if (!sessionId) return;
    const responsesRef = ref(db, `sessions/${sessionId}/responses`);
    const unsub = onValue(responsesRef, (snap) => {
      setResponses(snap.exists() ? snap.val() : {});
    });
    return () => unsub();
  }, [sessionId]);

  if (!scoresheet || !session) return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ color: "#888" }}>Loading…</div>
    </div>
  );

  const totalMax = scoresheet.totalMax;
  const panelists = session.panelists.map((p, i) => {
    const r = responses[p.id] || {};
    const sectionScores = scoresheet.sections.map(sec => ({
      ...sec,
      total: sec.questions.reduce((a, q) => a + (r.scores?.[`${sec.id}_${q.id}`] || 0), 0),
    }));
    const totalScore = sectionScores.reduce((a, s) => a + s.total, 0);
    const pct = totalMax ? totalScore / totalMax : 0;
    return { ...p, data: r, name: r.name || p.name || `Panelist ${i+1}`, sectionScores, totalScore, pct, hasData: totalScore > 0 };
  });

  const active = panelists.filter(p => p.hasData);
  const avgPct = active.length ? active.reduce((a, p) => a + p.pct, 0) / active.length : 0;
  const panelRec = RECOMMENDATION(avgPct);

  const sectionAvgs = scoresheet.sections.map(sec => ({
    ...sec,
    avg: active.length ? active.reduce((a, p) => a + (p.sectionScores.find(s => s.id === sec.id)?.total || 0), 0) / active.length : 0,
  }));

  return (
    <div style={{ minHeight: "100vh", padding: "32px 20px 80px", maxWidth: 1000, margin: "0 auto" }} className="fade-in">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16, marginBottom: 40 }}>
        <div>
          <div style={{ fontSize: 12, letterSpacing: 3, color: "#c9a96e", textTransform: "uppercase", marginBottom: 8 }}>Panel Dashboard</div>
          <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 28, marginBottom: 4 }}>{scoresheet.role}</h1>
          {session.candidateName && <div style={{ color: "#888" }}>Candidate: <strong style={{ color: "#e8e4de" }}>{session.candidateName}</strong></div>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#1a1a1f", border: "1px solid #2e2e38", borderRadius: 10, padding: "10px 16px", fontSize: 13, color: "#888" }}>
          <span className="pulse" style={{ color: "#22c55e" }}>●</span> Live · {active.length}/{panelists.length} submitted
        </div>
      </div>

      {active.length > 0 && (
        <div style={{ background: "#1a1a1f", border: `2px solid ${panelRec.color}33`, borderRadius: 16, padding: "24px 32px", marginBottom: 32, display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: "#888", letterSpacing: 2, textTransform: "uppercase", marginBottom: 6 }}>Panel Recommendation</div>
            <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 28, color: panelRec.color }}>{panelRec.icon} {panelRec.label}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 13, color: "#888", marginBottom: 4 }}>Panel Average</div>
            <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 48, lineHeight: 1 }}>{(avgPct*100).toFixed(0)}<span style={{ fontSize: 20, color: "#555" }}>%</span></div>
            <div style={{ fontSize: 14, color: "#888" }}>{active.length} panelist{active.length !== 1 ? "s" : ""} scored</div>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 4, marginBottom: 32, background: "#1a1a1f", borderRadius: 10, padding: 4, width: "fit-content" }}>
        {["overview","comparison","comments"].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: "8px 20px", borderRadius: 7, border: "none", fontSize: 14, fontWeight: 500,
            background: tab === t ? "#c9a96e" : "transparent",
            color: tab === t ? "#0f0f11" : "#888", textTransform: "capitalize",
          }}>{t}</button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="fade-in">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 14, marginBottom: 32 }}>
            {sectionAvgs.map(s => (
              <div key={s.id} style={{ background: "#1a1a1f", border: "1px solid #2e2e38", borderRadius: 12, padding: "18px 18px" }}>
                <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>{s.title}</div>
                <div style={{ fontWeight: 700, fontSize: 22, marginBottom: 8 }}>{s.avg.toFixed(1)}<span style={{ color: "#555", fontSize: 13 }}>/{s.maxScore}</span></div>
                <Bar pct={s.maxScore ? s.avg/s.maxScore : 0} />
              </div>
            ))}
          </div>
          <h3 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 18, marginBottom: 14 }}>Panelist Scores</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {panelists.map((p, i) => {
              const r = RECOMMENDATION(p.pct);
              return (
                <div key={p.id} style={{ background: "#1a1a1f", border: "1px solid #2e2e38", borderRadius: 12, padding: "16px 22px", display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ width: 38, height: 38, borderRadius: "50%", background: "#2e2e38", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: "#c9a96e", flexShrink: 0 }}>{i+1}</div>
                  <div style={{ flex: 1, minWidth: 100 }}>
                    <div style={{ fontWeight: 600, marginBottom: 2 }}>{p.name}</div>
                    {p.data.recommendation && <div style={{ fontSize: 12, color: "#666" }}>Rec: {p.data.recommendation}</div>}
                  </div>
                  {p.hasData ? (
                    <>
                      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                        {p.sectionScores.map(s => (
                          <div key={s.id} style={{ textAlign: "center" }}>
                            <div style={{ fontSize: 11, color: "#555", marginBottom: 2 }}>{s.title.split(" ")[0]}</div>
                            <div style={{ fontWeight: 600 }}>{s.total}<span style={{ color: "#555", fontSize: 11 }}>/{s.maxScore}</span></div>
                          </div>
                        ))}
                      </div>
                      <div style={{ textAlign: "right", minWidth: 80 }}>
                        <div style={{ fontWeight: 700, fontSize: 20 }}>{p.totalScore}<span style={{ color: "#555", fontSize: 12 }}>/{totalMax}</span></div>
                        <div style={{ fontSize: 13, color: r.color }}>{r.icon} {r.label}</div>
                      </div>
                    </>
                  ) : <div style={{ fontSize: 13, color: "#444" }}>Not yet submitted</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === "comparison" && (
        <div className="fade-in">
          {active.length === 0 ? <div style={{ color: "#555", padding: "40px 0", textAlign: "center" }}>No scores submitted yet.</div> : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: "0 6px", fontSize: 14 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: "8px 14px", color: "#555", fontWeight: 500, fontSize: 12 }}>Question</th>
                    {active.map(p => <th key={p.id} style={{ padding: "8px 14px", color: "#c9a96e", fontWeight: 500, fontSize: 12, textAlign: "center", minWidth: 90 }}>{p.name}</th>)}
                    <th style={{ padding: "8px 14px", color: "#666", fontWeight: 500, fontSize: 12, textAlign: "center" }}>Avg</th>
                  </tr>
                </thead>
                <tbody>
                  {scoresheet.sections.map(sec => (
                    <>
                      <tr key={`sec-${sec.id}`}>
                        <td colSpan={active.length + 2} style={{ padding: "14px 14px 4px", color: "#c9a96e", fontSize: 12, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>{sec.title}</td>
                      </tr>
                      {sec.questions.map((q, qi) => {
                        const scores = active.map(p => p.data.scores?.[`${sec.id}_${q.id}`] || 0);
                        const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
                        return (
                          <tr key={q.id} style={{ background: "#1a1a1f" }}>
                            <td style={{ padding: "10px 14px", borderRadius: "8px 0 0 8px", maxWidth: 280, fontSize: 12, color: "#888" }}>Q{qi+1}: {q.text.substring(0,55)}{q.text.length > 55 ? "…" : ""}</td>
                            {active.map(p => {
                              const s = p.data.scores?.[`${sec.id}_${q.id}`] || 0;
                              return (
                                <td key={p.id} style={{ padding: "10px 14px", textAlign: "center" }}>
                                  <div style={{ width: 30, height: 30, borderRadius: "50%", margin: "0 auto", background: s ? "#c9a96e22" : "#2e2e38", border: `2px solid ${s ? "#c9a96e" : "#2e2e38"}`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: s ? "#c9a96e" : "#444", fontSize: 13 }}>{s || "–"}</div>
                                </td>
                              );
                            })}
                            <td style={{ padding: "10px 14px", textAlign: "center", borderRadius: "0 8px 8px 0", fontWeight: 600, color: avg >= 4 ? "#22c55e" : avg >= 2.5 ? "#c9a96e" : "#ef4444" }}>{avg.toFixed(1)}</td>
                          </tr>
                        );
                      })}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "comments" && (
        <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {active.length === 0 ? <div style={{ color: "#555", padding: "40px 0", textAlign: "center" }}>No comments yet.</div> :
            active.map(p => (
              <div key={p.id} style={{ background: "#1a1a1f", border: "1px solid #2e2e38", borderRadius: 14, padding: "22px" }}>
                <div style={{ fontWeight: 600, marginBottom: 14, fontSize: 16 }}>{p.name}</div>
                {p.data.strengths && <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 11, color: "#22c55e", letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>Key Strengths</div>
                  <div style={{ fontSize: 14, color: "#aaa", lineHeight: 1.6 }}>{p.data.strengths}</div>
                </div>}
                {p.data.concerns && <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 11, color: "#ef4444", letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>Areas of Concern</div>
                  <div style={{ fontSize: 14, color: "#aaa", lineHeight: 1.6 }}>{p.data.concerns}</div>
                </div>}
                {p.data.recommendation && <div style={{ fontSize: 13, color: "#c9a96e" }}>Recommendation: <strong>{p.data.recommendation}</strong></div>}
                {scoresheet.sections.map(sec => sec.questions.filter(q => p.data.notes?.[`${sec.id}_${q.id}`]).map(q => (
                  <div key={q.id} style={{ marginTop: 10, padding: "10px 14px", background: "#0f0f11", borderRadius: 8, borderLeft: "3px solid #2e2e38" }}>
                    <div style={{ fontSize: 11, color: "#555", marginBottom: 4 }}>{sec.title} — {q.text.substring(0,50)}…</div>
                    <div style={{ fontSize: 13, color: "#aaa" }}>{p.data.notes[`${sec.id}_${q.id}`]}</div>
                  </div>
                )))}
              </div>
            ))
          }
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// JOIN VIEW
// ═══════════════════════════════════════════════════════════════════════════════
function JoinView({ onJoin }) {
  const [sessionId, setSessionId] = useState("");
  const [panelistId, setPanelistId] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  const join = async () => {
    if (!sessionId.trim() || !panelistId.trim()) return;
    setChecking(true);
    setError("");
    try {
      const snap = await get(ref(db, `sessions/${sessionId.trim()}`));
      if (!snap.exists()) { setError("Session not found. Check your Session ID."); setChecking(false); return; }
      const session = snap.val();
      const panelist = session.panelists?.find(p => p.id === panelistId.trim());
      if (!panelist) { setError("Panelist ID not found in this session."); setChecking(false); return; }
      onJoin(sessionId.trim(), panelistId.trim());
    } catch { setError("Error connecting. Please try again."); }
    setChecking(false);
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ maxWidth: 420, width: "100%", textAlign: "center" }} className="fade-in">
        <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 28, marginBottom: 8 }}>Join Session</h2>
        <p style={{ color: "#888", marginBottom: 32, lineHeight: 1.6 }}>Enter the Session ID and your Panelist ID shared by the organiser.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 20 }}>
          <input value={sessionId} onChange={e => setSessionId(e.target.value)} placeholder="Session ID"
            style={{ width: "100%", background: "#1a1a1f", border: "1.5px solid #2e2e38", borderRadius: 8, padding: "14px 16px", color: "#e8e4de", fontSize: 15, outline: "none", textAlign: "center", letterSpacing: 1 }} />
          <input value={panelistId} onChange={e => setPanelistId(e.target.value)} placeholder="Panelist ID (e.g. p1_abc123)"
            style={{ width: "100%", background: "#1a1a1f", border: "1.5px solid #2e2e38", borderRadius: 8, padding: "14px 16px", color: "#e8e4de", fontSize: 15, outline: "none", textAlign: "center", letterSpacing: 1 }} />
        </div>
        {error && <div style={{ fontSize: 13, color: "#ef4444", marginBottom: 14 }}>{error}</div>}
        <button onClick={join} disabled={checking || !sessionId.trim() || !panelistId.trim()} style={{
          width: "100%", background: sessionId.trim() && panelistId.trim() ? "#c9a96e" : "#2e2e38",
          color: sessionId.trim() && panelistId.trim() ? "#0f0f11" : "#555",
          border: "none", borderRadius: 8, padding: "14px", fontWeight: 600, fontSize: 16,
        }}>{checking ? "Checking…" : "Open My Scoresheet →"}</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROOT APP
// ═══════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [view, setView] = useState("landing");
  const [sessionId, setSessionId] = useState(null);
  const [panelistId, setPanelistId] = useState(null);
  const [session, setSession] = useState(null);
  const [scoresheet, setScoresheet] = useState(null);

  // Load session from Firebase when sessionId changes
  useEffect(() => {
    if (!sessionId) return;
    const sessionRef = ref(db, `sessions/${sessionId}`);
    const unsub = onValue(sessionRef, (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        setSession(data);
        setScoresheet(data.scoresheet);
      }
    });
    return () => unsub();
  }, [sessionId]);

  // Handle URL params (for direct links)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sid = params.get("session");
    const pid = params.get("panelist");
    if (sid && pid) {
      setSessionId(sid);
      setPanelistId(pid);
      setView("scoresheet");
    } else if (sid) {
      setSessionId(sid);
      setView("dashboard");
    }
  }, []);

  const handleSetupComplete = async ({ scoresheet: ss, candidateName, numPanelists }) => {
    const sid = `sess_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
    const panelists = Array.from({ length: numPanelists }, (_, i) => ({
      id: `p${i+1}_${Math.random().toString(36).slice(2,8)}`,
      name: `Panelist ${i+1}`,
    }));
    const sess = { id: sid, candidateName, panelists, createdAt: Date.now(), scoresheet: ss };
    await set(ref(db, `sessions/${sid}`), sess);
    setSessionId(sid);
    setSession(sess);
    setScoresheet(ss);
    setView("ready");
  };

  const handleJoin = (sid, pid) => {
    setSessionId(sid);
    setPanelistId(pid);
    setView("scoresheet");
  };

  return (
    <>
      <GlobalStyle />
      {view === "landing" && <LandingView onSetup={() => setView("setup")} onJoin={() => setView("join")} />}
      {view === "setup" && <SetupView onComplete={handleSetupComplete} />}
      {view === "ready" && session && (
        <SessionReadyView
          session={session}
          onGoToDashboard={() => setView("dashboard")}
          onGoToScoresheet={(id) => { setPanelistId(id); setView("scoresheet"); }}
        />
      )}
      {view === "scoresheet" && (
        <ScoresheetView
          panelistId={panelistId}
          sessionId={sessionId}
          session={session}
          scoresheet={scoresheet}
        />
      )}
      {view === "dashboard" && (
        <DashboardView
          sessionId={sessionId}
          session={session}
          scoresheet={scoresheet}
        />
      )}
      {view === "join" && <JoinView onJoin={handleJoin} />}

      {!["landing","setup"].includes(view) && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: "#1a1a1f", border: "1px solid #2e2e38", borderRadius: 99, padding: "8px 16px", display: "flex", gap: 4, zIndex: 100, boxShadow: "0 8px 32px rgba(0,0,0,0.6)" }}>
          {[
            { label: "🏠", tip: "Home", action: () => { if (session) setView("ready"); else setView("landing"); } },
            { label: "📊", tip: "Dashboard", action: () => setView("dashboard") },
            { label: "📝", tip: "My Scoresheet", action: () => setView("scoresheet") },
            { label: "👥", tip: "Join", action: () => setView("join") },
          ].map(b => (
            <button key={b.label} onClick={b.action} title={b.tip} style={{
              width: 40, height: 40, borderRadius: "50%", border: "none", background: "transparent", fontSize: 18,
            }} onMouseOver={e => e.currentTarget.style.background="#2e2e38"} onMouseOut={e => e.currentTarget.style.background="transparent"}>
              {b.label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
