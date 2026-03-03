# Interview Scoresheet — Deployment Guide

## What's in this folder
- `src/App.jsx` — Full React app wired to your Firebase database
- `src/main.jsx` — React entry point
- `index.html` — HTML shell
- `package.json` — Dependencies
- `vite.config.js` — Build config

---

## Deploy to Vercel (5 minutes)

### Step 1 — Push to GitHub
1. Go to github.com → sign in → click **"New repository"**
2. Name it `interview-scoresheet` → click **Create repository**
3. Upload all files from this folder (drag & drop into GitHub)
4. Click **Commit changes**

### Step 2 — Deploy on Vercel
1. Go to vercel.com → sign in with GitHub
2. Click **"Add New Project"**
3. Select your `interview-scoresheet` repository
4. Leave all settings as default → click **Deploy**
5. Wait ~60 seconds → Vercel gives you a live URL like:
   `https://interview-scoresheet-abc.vercel.app`

### Step 3 — Add to Microsoft Teams
1. Open your Teams channel
2. Click **+** on the tab bar at the top
3. Search for **"Website"**
4. Paste your Vercel URL → click **Save**

---

## How to use the app

### As the Organiser:
1. Open the app → click **"New Interview Session"**
2. Enter the candidate name, number of panelists
3. Upload the Job Description PDF or paste the text
4. Click **"Generate Scoresheet"** — AI builds the questions
5. Copy each panelist's unique link and send it to them
6. Click **"Panel Dashboard"** to watch scores come in live

### As a Panelist:
1. Open the link sent to you (or click "Join as Panelist" and enter your IDs)
2. Enter your name
3. Score each question (1–5) and add notes
4. Scores auto-save every 1.5 seconds to Firebase
5. Click "Save Scoresheet" when done

### Panel Dashboard:
- **Overview** — all panelist scores at a glance
- **Comparison** — side-by-side question-by-question grid
- **Comments** — all written feedback in one view
- Updates in real time as panelists submit

---

## Firebase Database Rules
Your database is currently in test mode (open until April 2026).
Before going to production, update rules at:
Firebase Console → Realtime Database → Rules

```json
{
  "rules": {
    "sessions": {
      "$sessionId": {
        ".read": true,
        ".write": true
      }
    }
  }
}
```
