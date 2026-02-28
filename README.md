<p align="center">
  <img src="./img.png" alt="SafeRoute Banner" width="100%">
</p>

# SafeRoute 🚨

## Basic Details

### Team Name: Codex

### Team Members
- Member 1: Aslin Yeasudas - AISAT
- Member 2: Sandra Pushpakaran - AISAT

### Hosted Project Link
https://saferouter.netlify.app

---

### Project Description
SafeRoute is a zero-friction emergency SOS web app that broadcasts your live GPS location to family members in real-time — no app download, no login, works on any phone browser. One 2-second hold of a button sends your location every 5 seconds for 60 seconds, automatically notifies your saved contacts via email and WhatsApp, and gives them a live map tracker link.

---

### The Problem Statement
In an emergency, every second matters — but existing safety apps require downloads, accounts, and multiple steps before help can be reached. When someone is in danger, they don't have time for that. There is also no easy way for family members to passively track a person's movement during an emergency without both parties having the same app installed.

### The Solution
SafeRoute removes all friction. Open the website, hold one button for 2 seconds, select why you're sending the alert (danger, medical help, sharing location, etc.), and the app immediately:
- Broadcasts your GPS location to a live database every 5 seconds
- Automatically emails all your saved emergency contacts with a live tracker link
- Opens WhatsApp with a pre-filled message for each contact
- Gives family members a real-time map showing exactly where you are and your movement trail

No app. No login. Works on any device with a browser.

---

## Technical Details

### Technologies / Components Used

**For Software:**
- **Languages:** HTML5, CSS3, Vanilla JavaScript
- **APIs:** Geolocation API (GPS), Web Share API, Web Vibration API
- **Database:** Supabase (PostgreSQL) — real-time location storage
- **Email Service:** EmailJS — automatic email notifications, zero backend
- **Maps:** Leaflet.js with OpenStreetMap tiles
- **Hosting:** Netlify (continuous deployment from GitHub)
- **Tools:** Git, GitHub, VS Code, Supabase Dashboard

---

## Features

- **Hold-to-Activate SOS** — 2-second hold prevents accidental triggers; animated progress ring shows activation
- **Reason Picker** — Choose from 6 preset reasons (Serious Danger, Need Help, Medical, Safe, etc.) or type a custom message before activating
- **Live GPS Breadcrumb Trail** — Sends location to Supabase every 5 seconds for 60 seconds, building a movement trail
- **Auto Email Notifications** — All saved contacts receive an automatic email with tracker link the moment SOS is triggered
- **WhatsApp Notifications** — Pre-filled WhatsApp message opens automatically for each contact with phone number
- **Family Live Tracker** — Shareable link opens a real-time map (auto-refreshes every 4 seconds) showing live position + dotted movement trail
- **Emergency Contacts** — Save contacts with name, phone, and email; stored locally on device
- **Offline Queue** — If signal is lost mid-emergency, breadcrumbs queue locally and sync when reconnected
- **Session History** — View past SOS sessions with crumb count, duration, and timestamp
- **Zero Dependency Frontend** — Pure HTML/CSS/JS, no framework, works on any phone browser instantly

---

## Implementation

### For Software:

#### Installation
No installation required — this is a static web app.

To run locally:
```bash
git clone https://github.com/aslinyesudas/Codex-tinkherhack.git
cd Codex-tinkherhack
# Open index.html in any browser
# Or use a local server:
npx serve .
```

#### Run
```bash
# Local development
npx serve .

# Or simply open index.html directly in Chrome/Firefox/Safari
```

#### Environment Setup (Supabase)
Create a `sos_alerts` table in your Supabase project:
```sql
CREATE TABLE sos_alerts (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  latitude   double precision NOT NULL,
  longitude  double precision NOT NULL,
  session_id text NOT NULL,
  is_initial boolean DEFAULT false,
  accuracy   double precision,
  user_agent text
);
ALTER TABLE sos_alerts DISABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON sos_alerts TO anon;
```

---

## Project Documentation

### For Software:

#### Screenshots (Add at least 3)

![Screenshot1](screenshots/sos-screen.png)
*Main SOS screen — hold the red button for 2 seconds to activate emergency broadcast*

![Screenshot2](screenshots/reason-picker.png)
*Reason picker popup — select why you're sending the alert or type a custom message*

![Screenshot3](screenshots/live-tracker.png)
*Family tracker map — live GPS position with breadcrumb trail, auto-refreshes every 4 seconds*

![Screenshot4](screenshots/broadcasting.png)
*Active broadcasting state — 60-second countdown, breadcrumb count, contact notification status*

#### Diagrams

**System Architecture:**

```
User Phone (Browser)
       │
       ├── Holds SOS Button (2s)
       ├── Selects Reason
       │
       ▼
GPS Geolocation API ──► Supabase (sos_alerts table)
       │                        │
       │                        └── Family opens tracker.html
       │                             └── Polls every 4s ──► Live Map (Leaflet.js)
       │
       ├── EmailJS ──► Auto email to all contacts
       └── WhatsApp ──► Pre-filled message link
```

**Application Workflow:**

```
Open App
   │
   ▼
GPS Lock acquired
   │
   ▼
Hold SOS button 2 seconds
   │
   ▼
Reason Picker popup
   │
   ▼
Tap "ACTIVATE SOS"
   │
   ├──► Insert first crumb to Supabase (is_initial: true)
   ├──► Send emails via EmailJS to all contacts
   ├──► Open WhatsApp for contacts with phone numbers
   └──► Every 5s: insert new GPS crumb for 60 seconds
              │
              ▼
        Family opens tracker link
              │
              ▼
        Leaflet map polls Supabase every 4s
              │
              ▼
        Live dot + breadcrumb trail shown
```

---

## Additional Documentation

### API Documentation

**Base URL:** `https://zyhdkxjvsdtwdrqporxd.supabase.co/rest/v1`

##### Insert SOS Location Crumb

**POST /sos_alerts**
- **Description:** Inserts a GPS breadcrumb for an active SOS session
- **Headers:**
  - `apikey`: Supabase anon key
  - `Authorization`: Bearer token
  - `Content-Type`: application/json
- **Request Body:**
```json
{
  "latitude": 10.0500818,
  "longitude": 76.3305370,
  "session_id": "SR-MM617SW8-7VKJ",
  "is_initial": true,
  "accuracy": 15.5,
  "user_agent": "Mozilla/5.0..."
}
```
- **Response:** `201 Created` (empty body with `Prefer: return=minimal`)

##### Fetch Session Trail

**GET /sos_alerts?session_id=eq.{SESSION_ID}&order=created_at.asc**
- **Description:** Retrieves all breadcrumbs for a session in chronological order
- **Response:**
```json
[
  {
    "id": "836d402d-...",
    "created_at": "2026-02-28T08:01:02Z",
    "latitude": 10.0500818,
    "longitude": 76.3305370,
    "session_id": "SR-MM617SW8-7VKJ",
    "is_initial": true,
    "accuracy": 116
  }
]
```

---

## Project Demo

### Video
[Add your demo video link here]

*Demo shows: GPS lock → SOS activation → reason selection → live breadcrumb trail → family tracker map updating in real-time → automatic email delivery*

### Live Demo
🔗 **https://saferouter.netlify.app**

**To test:**
1. Open on your phone
2. Allow location permission
3. Add an emergency contact with your own email
4. Hold SOS → pick a reason → Activate
5. Open the tracker link that appears on another device

---

## AI Tools Used

**Tool Used:** Claude AI (Anthropic — claude.ai)

**Purpose:** Development assistance throughout the hackathon

- Full-stack architecture design (HTML/CSS/JS structure)
- Supabase REST API integration and SQL schema
- GPS Geolocation API implementation with offline queue
- EmailJS integration for automatic notifications
- Leaflet.js live map tracker implementation
- UI/UX design (tactical dark theme, animations, hold-to-activate interaction)
- Debugging Supabase CORS and RLS issues
- CSS animations (pulse rings, progress arc, breadcrumb trail)

**Percentage of AI-assisted code:** ~70%

**Human Contributions:**
- Project concept and problem definition
- Design direction and aesthetic decisions
- Integration testing across real devices
- Supabase project setup and EmailJS configuration
- Deployment pipeline (GitHub → Netlify)
- Real-world testing and iteration

---

## Team Contributions

- **Aslin Yeasudas**: Project lead, full-stack development, Supabase integration, GPS breadcrumb logic, deployment pipeline, EmailJS setup
- **Sandra Pushpakaran**: UI/UX design direction, frontend testing, contact notification flow, cross-device testing, documentation

---

## License

This project is licensed under the MIT License.

```
MIT License — free to use, modify, and distribute with attribution.
```

---

<p align="center">Made with ❤️ at TinkerHub Hackathon 2026</p>
