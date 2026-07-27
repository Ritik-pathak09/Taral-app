const express = require('express');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || 'taral_secret_admin_2026';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend assets from 'public' folder
app.use(express.static(path.join(__dirname, 'public')));

// In-Memory Analytics Database
const analyticsDB = {
    visits: [],
    inquiries: [],
    sampleRequests: [],
    quotationsGenerated: []
};

// HELPER: Extract Client IP safely for Cloud Hosts like Render
function getClientIP(req) {
    const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    return rawIp.split(',')[0].trim();
}

// ==========================================
// API ENDPOINTS FOR FRONTEND TRACKING
// ==========================================

// 1. Log Website Visit
app.post('/api/track/visit', (req, res) => {
    const { sessionId, userAgent, referrer, screenResolution } = req.body;
    const ip = getClientIP(req);
    
    const visitEntry = {
        sessionId: sessionId || 'anon_' + Date.now(),
        ip: ip,
        userAgent: userAgent || req.headers['user-agent'],
        referrer: referrer || 'Direct',
        screenResolution: screenResolution || 'Unknown',
        timestamp: new Date().toISOString(),
        lastActive: new Date().toISOString(),
        durationSeconds: 0
    };

    analyticsDB.visits.push(visitEntry);
    console.log(`[VISIT LOGGED] Session: ${visitEntry.sessionId} | IP: ${ip}`);
    
    res.json({ status: 'success', sessionId: visitEntry.sessionId });
});

// 2. Active Ping / Heartbeat (Tracks how long user stayed active)
app.post('/api/track/ping', (req, res) => {
    const { sessionId } = req.body;
    const visit = analyticsDB.visits.find(v => v.sessionId === sessionId);

    if (visit) {
        visit.lastActive = new Date().toISOString();
        const start = new Date(visit.timestamp);
        const end = new Date(visit.lastActive);
        visit.durationSeconds = Math.round((end - start) / 1000);
        return res.json({ status: 'active', durationSeconds: visit.durationSeconds });
    }

    res.json({ status: 'session_not_found' });
});

// 3. Log Sample Request
app.post('/api/track/sample-request', (req, res) => {
    const { sessionId, source } = req.body;
    const entry = {
        sessionId,
        source: source || 'Free Sample Button',
        ip: getClientIP(req),
        timestamp: new Date().toISOString()
    };
    analyticsDB.sampleRequests.push(entry);
    console.log(`[SAMPLE REQUEST] Session: ${sessionId}`);
    res.json({ status: 'success' });
});

// 4. Log Proforma Quotation Generated
app.post('/api/track/quotation', (req, res) => {
    const { sessionId, role, size, cases, totalValue, margin } = req.body;
    const quoteEntry = {
        sessionId,
        role,
        size,
        cases,
        totalValue,
        margin,
        ip: getClientIP(req),
        timestamp: new Date().toISOString()
    };
    analyticsDB.quotationsGenerated.push(quoteEntry);
    console.log(`[QUOTATION] ${cases} cases calculated by ${role}`);
    res.json({ status: 'success' });
});

// 5. Log Form Inquiries
app.post('/api/track/inquiry', (req, res) => {
    const { sessionId, name, phone, type, location, bottleSize, quantity, message } = req.body;
    const inquiryData = {
        sessionId,
        name,
        phone,
        type,
        location,
        bottleSize,
        quantity,
        message,
        ip: getClientIP(req),
        timestamp: new Date().toISOString()
    };
    analyticsDB.inquiries.push(inquiryData);
    console.log(`[NEW B2B INQUIRY] From: ${name} (${phone}) - ${type}`);
    res.json({ status: 'success' });
});

// ==========================================
// ADMIN DASHBOARD ENDPOINT
// ==========================================
app.get('/admin/analytics', (req, res) => {
    const key = req.query.key;
    if (key !== ADMIN_KEY) {
        return res.status(403).send(`
            <h2 style="color:red; font-family:sans-serif; text-align:center; margin-top:50px;">
                403 Access Denied: Invalid Security Key
            </h2>
        `);
    }

    const totalVisits = analyticsDB.visits.length;
    const totalInquiries = analyticsDB.inquiries.length;
    const totalSamples = analyticsDB.sampleRequests.length;
    const totalQuotes = analyticsDB.quotationsGenerated.length;

    // Active users in last 2 minutes
    const now = new Date();
    const activeNow = analyticsDB.visits.filter(v => {
        const diff = (now - new Date(v.lastActive)) / 1000;
        return diff <= 120; // active in last 120 seconds
    }).length;

    res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <title>TARAL - Admin Live Analytics Dashboard</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
        <meta http-equiv="refresh" content="15">
    </head>
    <body class="bg-slate-900 text-slate-100 font-sans p-6">
        <div class="max-w-7xl mx-auto space-y-6">
            <div class="flex justify-between items-center border-b border-slate-800 pb-4">
                <div>
                    <h1 class="text-3xl font-black text-sky-400">TARAL Water - Live Admin Analytics</h1>
                    <p class="text-xs text-slate-400">Auto-refreshing every 15 seconds</p>
                </div>
                <div class="bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2">
                    <span class="w-2.5 h-2.5 bg-emerald-400 rounded-full animate-ping"></span>
                    Live Active Users: ${activeNow}
                </div>
            </div>

            <!-- STATS CARDS -->
            <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div class="bg-slate-800 p-5 rounded-2xl border border-slate-700">
                    <p class="text-xs text-slate-400 uppercase font-bold">Total Page Visits</p>
                    <h2 class="text-3xl font-black text-white mt-1">${totalVisits}</h2>
                </div>
                <div class="bg-slate-800 p-5 rounded-2xl border border-slate-700">
                    <p class="text-xs text-slate-400 uppercase font-bold">Inquiries Submitted</p>
                    <h2 class="text-3xl font-black text-sky-400 mt-1">${totalInquiries}</h2>
                </div>
                <div class="bg-slate-800 p-5 rounded-2xl border border-slate-700">
                    <p class="text-xs text-slate-400 uppercase font-bold">Free Sample Clicks</p>
                    <h2 class="text-3xl font-black text-amber-400 mt-1">${totalSamples}</h2>
                </div>
                <div class="bg-slate-800 p-5 rounded-2xl border border-slate-700">
                    <p class="text-xs text-slate-400 uppercase font-bold">Quotes Calculated</p>
                    <h2 class="text-3xl font-black text-purple-400 mt-1">${totalQuotes}</h2>
                </div>
            </div>

            <!-- VISITOR LOG TABLE -->
            <div class="bg-slate-800 rounded-2xl p-6 border border-slate-700 space-y-4">
                <h3 class="text-lg font-bold text-white"><i class="fa-solid fa-users text-sky-400 mr-2"></i> Recent Visitors Activity Log</h3>
                <div class="overflow-x-auto">
                    <table class="w-full text-left text-xs border-collapse">
                        <thead>
                            <tr class="bg-slate-900/80 text-slate-400 border-b border-slate-700">
                                <th class="p-3">Session ID</th>
                                <th class="p-3">IP Address</th>
                                <th class="p-3">Time Spent</th>
                                <th class="p-3">Referrer</th>
                                <th class="p-3">First Visit</th>
                                <th class="p-3">Last Active</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-700/50">
                            ${analyticsDB.visits.slice(-15).reverse().map(v => `
                                <tr class="hover:bg-slate-700/30">
                                    <td class="p-3 font-mono text-sky-300">${v.sessionId.substring(0, 18)}...</td>
                                    <td class="p-3">${v.ip}</td>
                                    <td class="p-3 font-bold text-emerald-400">${v.durationSeconds}s</td>
                                    <td class="p-3 text-slate-400">${v.referrer}</td>
                                    <td class="p-3 text-slate-400">${new Date(v.timestamp).toLocaleTimeString()}</td>
                                    <td class="p-3 text-slate-400">${new Date(v.lastActive).toLocaleTimeString()}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- INQUIRIES LOG TABLE -->
            <div class="bg-slate-800 rounded-2xl p-6 border border-slate-700 space-y-4">
                <h3 class="text-lg font-bold text-white"><i class="fa-solid fa-paper-plane text-emerald-400 mr-2"></i> Received B2B Inquiries</h3>
                <div class="overflow-x-auto">
                    <table class="w-full text-left text-xs border-collapse">
                        <thead>
                            <tr class="bg-slate-900/80 text-slate-400 border-b border-slate-700">
                                <th class="p-3">Name</th>
                                <th class="p-3">Phone</th>
                                <th class="p-3">Role</th>
                                <th class="p-3">Location</th>
                                <th class="p-3">Bottle / Cases</th>
                                <th class="p-3">Time</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-700/50">
                            ${analyticsDB.inquiries.slice(-10).reverse().map(i => `
                                <tr class="hover:bg-slate-700/30">
                                    <td class="p-3 font-bold text-white">${i.name}</td>
                                    <td class="p-3 text-sky-400">${i.phone}</td>
                                    <td class="p-3">${i.type}</td>
                                    <td class="p-3">${i.location}</td>
                                    <td class="p-3">${i.bottleSize} (${i.quantity} Cases)</td>
                                    <td class="p-3 text-slate-400">${new Date(i.timestamp).toLocaleString()}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </body>
    </html>
    `);
});

// Fallback Route to serve index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Express Server
app.listen(PORT, () => {
    console.log(`\n==================================================`);
    console.log(`🚀 TARAL Server running on port: ${PORT}`);
    console.log(`🌐 Website URL: http://localhost:${PORT}`);
    console.log(`📊 Admin Analytics URL: http://localhost:${PORT}/admin/analytics?key=${ADMIN_KEY}`);
    console.log(`==================================================\n`);
});
