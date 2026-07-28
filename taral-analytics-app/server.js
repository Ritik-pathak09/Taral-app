const express = require('express');
const path = require('path');
const cors = require('cors');
const mongoose = require('mongoose');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || 'taral_secret_admin_2026';
const MONGO_URI = process.env.MONGO_URI;

// Local Permanent Storage File Path
const DATA_FILE = path.join(__dirname, 'analytics_store.json');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend assets from 'public' folder
app.use(express.static(path.join(__dirname, 'public')));

// Optional MongoDB Connection for Permanent Data
let isDbConnected = false;
if (MONGO_URI) {
    mongoose.connect(MONGO_URI)
        .then(() => {
            console.log('✅ MongoDB Connected Successfully!');
            isDbConnected = true;
        })
        .catch(err => console.log('⚠️ MongoDB Connection Error:', err.message));
}

// HELPER: Load persistent analytics data from JSON file
function loadAnalyticsData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const raw = fs.readFileSync(DATA_FILE, 'utf8');
            const data = JSON.parse(raw);
            return {
                visits: data.visits || [],
                inquiries: data.inquiries || [],
                sampleRequests: data.sampleRequests || [],
                quotationsGenerated: data.quotationsGenerated || []
            };
        }
    } catch (err) {
        console.error('⚠️ Error loading analytics file:', err.message);
    }
    return { visits: [], inquiries: [], sampleRequests: [], quotationsGenerated: [] };
}

// HELPER: Save analytics data to JSON file
function saveAnalyticsData() {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(analyticsDB, null, 2), 'utf8');
    } catch (err) {
        console.error('⚠️ Error writing analytics file:', err.message);
    }
}

// Permanent Analytics Store Initialization
const analyticsDB = loadAnalyticsData();

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
    const now = new Date();
    
    const visitEntry = {
        sessionId: sessionId || 'anon_' + Date.now(),
        ip: ip,
        userAgent: userAgent || req.headers['user-agent'],
        referrer: referrer || 'Direct',
        screenResolution: screenResolution || 'Unknown',
        timestamp: now.toISOString(),
        dateStr: now.toISOString().split('T')[0], // YYYY-MM-DD
        monthStr: now.toISOString().slice(0, 7),  // YYYY-MM
        yearStr: now.getFullYear().toString(),    // YYYY
        lastActive: now.toISOString(),
        durationSeconds: 0
    };

    analyticsDB.visits.push(visitEntry);
    saveAnalyticsData(); // Instant save to permanent storage

    console.log(`[VISIT LOGGED] Date: ${visitEntry.dateStr} | Session: ${visitEntry.sessionId} | IP: ${ip}`);
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
        saveAnalyticsData(); // Save updated duration
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
    saveAnalyticsData();
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
    saveAnalyticsData();
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
    saveAnalyticsData();
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

    const todayStr = new Date().toISOString().split('T')[0];
    const thisMonthStr = new Date().toISOString().slice(0, 7);
    const thisYearStr = new Date().getFullYear().toString();

    // Filters for Year & Month
    const filterYear = req.query.year || '';
    const filterMonth = req.query.month || '';

    // Time-based Visit Counts
    const todayVisits = analyticsDB.visits.filter(v => v.dateStr === todayStr).length;
    const monthVisits = analyticsDB.visits.filter(v => v.monthStr === thisMonthStr).length;
    const yearVisits = analyticsDB.visits.filter(v => v.yearStr === thisYearStr).length;
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

    // Collect Unique Years and Months for Drill-Down Filter Buttons
    const availableYears = [...new Set(analyticsDB.visits.map(v => v.yearStr).filter(Boolean))].sort().reverse();
    const availableMonths = [...new Set(analyticsDB.visits.map(v => v.monthStr).filter(Boolean))].sort().reverse();

    // Daily Breakdown Calculation (Filtered if year/month clicked)
    const dailyStats = {};
    analyticsDB.visits.forEach(v => {
        if (v.dateStr) {
            if (filterYear && v.yearStr !== filterYear) return;
            if (filterMonth && v.monthStr !== filterMonth) return;
            dailyStats[v.dateStr] = (dailyStats[v.dateStr] || 0) + 1;
        }
    });

    res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <title>TARAL - Admin Live Analytics Dashboard</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
        <meta http-equiv="refresh" content="86400">
    </head>
    <body class="bg-slate-900 text-slate-100 font-sans p-6">
        <div class="max-w-7xl mx-auto space-y-6">
            <div class="flex justify-between items-center border-b border-slate-800 pb-4">
                <div>
                    <h1 class="text-3xl font-black text-sky-400">TARAL Water - Live Admin Analytics</h1>
                    <p class="text-xs text-slate-400">Database Status: ${isDbConnected ? '🟢 Connected (MongoDB)' : '🟢 Permanent File Storage Active'}</p>
                </div>
                <div class="bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2">
                    <span class="w-2.5 h-2.5 bg-emerald-400 rounded-full animate-ping"></span>
                    Live Active Users: ${activeNow}
                </div>
            </div>

            <!-- TIME-BASED VISITOR CARDS -->
            <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div class="bg-gradient-to-br from-sky-900/50 to-slate-800 p-5 rounded-2xl border border-sky-500/30">
                    <p class="text-xs text-sky-300 uppercase font-bold">Today's Visits (${todayStr})</p>
                    <h2 class="text-3xl font-black text-white mt-1">${todayVisits}</h2>
                    <p class="text-[10px] text-slate-400 mt-1">Auto-resets at midnight</p>
                </div>
                <div class="bg-slate-800 p-5 rounded-2xl border border-slate-700">
                    <p class="text-xs text-slate-400 uppercase font-bold">This Month (${thisMonthStr})</p>
                    <h2 class="text-3xl font-black text-emerald-400 mt-1">${monthVisits}</h2>
                </div>
                <div class="bg-slate-800 p-5 rounded-2xl border border-slate-700">
                    <p class="text-xs text-slate-400 uppercase font-bold">This Year (${thisYearStr})</p>
                    <h2 class="text-3xl font-black text-purple-400 mt-1">${yearVisits}</h2>
                </div>
                <div class="bg-slate-800 p-5 rounded-2xl border border-slate-700">
                    <p class="text-xs text-slate-400 uppercase font-bold">All Time Total Visits</p>
                    <h2 class="text-3xl font-black text-amber-400 mt-1">${totalVisits}</h2>
                </div>
            </div>

            <!-- BUSINESS LEADS STATS -->
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div class="bg-slate-800/80 p-4 rounded-xl border border-slate-700/50 flex justify-between items-center">
                    <div>
                        <p class="text-xs text-slate-400 font-bold">Inquiries Submitted</p>
                        <h3 class="text-2xl font-bold text-sky-400 mt-0.5">${totalInquiries}</h3>
                    </div>
                    <i class="fa-solid fa-paper-plane text-2xl text-sky-500/40"></i>
                </div>
                <div class="bg-slate-800/80 p-4 rounded-xl border border-slate-700/50 flex justify-between items-center">
                    <div>
                        <p class="text-xs text-slate-400 font-bold">Free Sample Clicks</p>
                        <h3 class="text-2xl font-bold text-amber-400 mt-0.5">${totalSamples}</h3>
                    </div>
                    <i class="fa-solid fa-vial text-2xl text-amber-500/40"></i>
                </div>
                <div class="bg-slate-800/80 p-4 rounded-xl border border-slate-700/50 flex justify-between items-center">
                    <div>
                        <p class="text-xs text-slate-400 font-bold">Quotes Calculated</p>
                        <h3 class="text-2xl font-bold text-purple-400 mt-0.5">${totalQuotes}</h3>
                    </div>
                    <i class="fa-solid fa-calculator text-2xl text-purple-500/40"></i>
                </div>
            </div>

            <!-- CLICKABLE YEAR & MONTH DRILL-DOWN FILTERS -->
            <div class="bg-slate-800 rounded-2xl p-5 border border-slate-700 space-y-3">
                <div class="flex flex-wrap items-center justify-between gap-3">
                    <h3 class="text-sm font-bold text-slate-300"><i class="fa-solid fa-filter text-sky-400 mr-2"></i> Clickable History Filters:</h3>
                    <a href="/admin/analytics?key=${ADMIN_KEY}" class="text-xs font-bold text-sky-400 hover:underline">Clear Filters (Show All)</a>
                </div>

                <div class="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-700/60">
                    <span class="text-xs text-slate-400 font-bold mr-1">Select Year:</span>
                    ${availableYears.length ? availableYears.map(y => `
                        <a href="/admin/analytics?key=${ADMIN_KEY}&year=${y}" class="px-3 py-1 rounded-lg text-xs font-bold transition ${filterYear === y ? 'bg-purple-600 text-white shadow-md' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}">
                            📅 ${y}
                        </a>
                    `).join('') : '<span class="text-xs text-slate-500">No years recorded yet</span>'}
                </div>

                <div class="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-700/60">
                    <span class="text-xs text-slate-400 font-bold mr-1">Select Month:</span>
                    ${availableMonths.length ? availableMonths.map(m => `
                        <a href="/admin/analytics?key=${ADMIN_KEY}&month=${m}" class="px-3 py-1 rounded-lg text-xs font-bold transition ${filterMonth === m ? 'bg-emerald-600 text-white shadow-md' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}">
                            🗓️ ${m}
                        </a>
                    `).join('') : '<span class="text-xs text-slate-500">No months recorded yet</span>'}
                </div>
            </div>

            <!-- DAILY BREAKDOWN LOG TABLE -->
            <div class="bg-slate-800 rounded-2xl p-6 border border-slate-700 space-y-4">
                <div class="flex justify-between items-center">
                    <h3 class="text-lg font-bold text-white"><i class="fa-solid fa-calendar-days text-sky-400 mr-2"></i> Daily Traffic History (Per Day Count)</h3>
                    ${filterYear || filterMonth ? `<span class="text-xs font-bold bg-sky-500/20 text-sky-300 px-3 py-1 rounded-full border border-sky-400/30">Showing Filter: ${filterYear || filterMonth}</span>` : ''}
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full text-left text-xs border-collapse">
                        <thead>
                            <tr class="bg-slate-900/80 text-slate-400 border-b border-slate-700">
                                <th class="p-3">Date (YYYY-MM-DD)</th>
                                <th class="p-3">Total Visitors</th>
                                <th class="p-3">Status</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-700/50">
                            ${Object.keys(dailyStats).length ? Object.keys(dailyStats).reverse().map(d => `
                                <tr class="hover:bg-slate-700/30">
                                    <td class="p-3 font-mono font-bold text-sky-300">${d}</td>
                                    <td class="p-3 font-bold text-white text-sm">${dailyStats[d]} Visitors</td>
                                    <td class="p-3">
                                        ${d === todayStr ? '<span class="bg-emerald-500/20 text-emerald-400 text-[10px] px-2 py-0.5 rounded-full font-bold">Active Today</span>' : '<span class="text-slate-500 text-[10px]">Archived</span>'}
                                    </td>
                                </tr>
                            `).join('') : '<tr><td colspan="3" class="p-4 text-center text-slate-500">No records found for selected filter.</td></tr>'}
                        </tbody>
                    </table>
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
