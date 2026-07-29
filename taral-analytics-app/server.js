const express = require('express');
const path = require('path');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || 'Ritik@123';
const MONGO_URI = process.env.MONGO_URI;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend assets from 'public' folder
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// MONGODB SCHEMAS & MODELS (Permanent Storage)
// ==========================================
const visitSchema = new mongoose.Schema({
    sessionId: String,
    ip: String,
    userAgent: String,
    referrer: String,
    screenResolution: String,
    timestamp: { type: Date, default: Date.now },
    dateStr: String,
    monthStr: String,
    yearStr: String,
    lastActive: { type: Date, default: Date.now },
    durationSeconds: { type: Number, default: 0 }
});

const inquirySchema = new mongoose.Schema({
    sessionId: String,
    name: String,
    phone: String,
    type: String,
    location: String,
    bottleSize: String,
    quantity: String,
    message: String,
    ip: String,
    timestamp: { type: Date, default: Date.now }
});

const sampleRequestSchema = new mongoose.Schema({
    sessionId: String,
    source: String,
    ip: String,
    timestamp: { type: Date, default: Date.now }
});

const quotationSchema = new mongoose.Schema({
    sessionId: String,
    role: String,
    size: String,
    cases: Number,
    totalValue: Number,
    margin: String,
    ip: String,
    timestamp: { type: Date, default: Date.now }
});

const Visit = mongoose.model('Visit', visitSchema);
const Inquiry = mongoose.model('Inquiry', inquirySchema);
const SampleRequest = mongoose.model('SampleRequest', sampleRequestSchema);
const Quotation = mongoose.model('Quotation', quotationSchema);

let isDbConnected = false;
if (MONGO_URI) {
    mongoose.connect(MONGO_URI)
        .then(() => {
            console.log('✅ MongoDB Connected Successfully!');
            isDbConnected = true;
        })
        .catch(err => console.log('⚠️ MongoDB Connection Error:', err.message));
}

// HELPER: Extract Client IP safely for Cloud Hosts like Render
function getClientIP(req) {
    const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    return rawIp.split(',')[0].trim();
}

// HELPER: Get IST date strings to handle midnight updates correctly regardless of server timezone
function getISTDateComponents(date = new Date()) {
    const istDateStr = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(date); // Format: YYYY-MM-DD

    return {
        dateStr: istDateStr,
        monthStr: istDateStr.slice(0, 7), // YYYY-MM
        yearStr: istDateStr.slice(0, 4)   // YYYY
    };
}

// ==========================================
// API ENDPOINTS FOR FRONTEND TRACKING
// ==========================================

// 1. Log Website Visit
app.post('/api/track/visit', async (req, res) => {
    try {
        const { sessionId, userAgent, referrer, screenResolution } = req.body;
        const ip = getClientIP(req);
        const now = new Date();
        const istComponents = getISTDateComponents(now);
        
        const visitEntry = {
            sessionId: sessionId || 'anon_' + Date.now(),
            ip: ip,
            userAgent: userAgent || req.headers['user-agent'],
            referrer: referrer || 'Direct',
            screenResolution: screenResolution || 'Unknown',
            timestamp: now,
            dateStr: istComponents.dateStr,
            monthStr: istComponents.monthStr,
            yearStr: istComponents.yearStr,
            lastActive: now,
            durationSeconds: 0
        };

        if (isDbConnected) {
            await Visit.create(visitEntry);
        }

        console.log(`[VISIT LOGGED] Date: ${visitEntry.dateStr} | Session: ${visitEntry.sessionId} | IP: ${ip}`);
        res.json({ status: 'success', sessionId: visitEntry.sessionId });
    } catch (err) {
        console.error('Visit log error:', err);
        res.status(500).json({ status: 'error' });
    }
});

// 2. Active Ping / Heartbeat (Tracks how long user stayed active)
app.post('/api/track/ping', async (req, res) => {
    try {
        const { sessionId } = req.body;
        if (!isDbConnected) return res.json({ status: 'db_not_connected' });

        const visit = await Visit.findOne({ sessionId }).sort({ timestamp: -1 });
        if (visit) {
            visit.lastActive = new Date();
            const start = new Date(visit.timestamp);
            const end = new Date(visit.lastActive);
            visit.durationSeconds = Math.round((end - start) / 1000);
            await visit.save();
            return res.json({ status: 'active', durationSeconds: visit.durationSeconds });
        }

        res.json({ status: 'session_not_found' });
    } catch (err) {
        res.status(500).json({ status: 'error' });
    }
});

// 3. Log Sample Request
app.post('/api/track/sample-request', async (req, res) => {
    try {
        const { sessionId, source } = req.body;
        if (isDbConnected) {
            await SampleRequest.create({
                sessionId,
                source: source || 'Free Sample Button',
                ip: getClientIP(req),
                timestamp: new Date()
            });
        }
        console.log(`[SAMPLE REQUEST] Session: ${sessionId}`);
        res.json({ status: 'success' });
    } catch (err) {
        res.status(500).json({ status: 'error' });
    }
});

// 4. Log Proforma Quotation Generated
app.post('/api/track/quotation', async (req, res) => {
    try {
        const { sessionId, role, size, cases, totalValue, margin } = req.body;
        if (isDbConnected) {
            await Quotation.create({
                sessionId,
                role,
                size,
                cases,
                totalValue,
                margin,
                ip: getClientIP(req),
                timestamp: new Date()
            });
        }
        console.log(`[QUOTATION] ${cases} cases calculated by ${role}`);
        res.json({ status: 'success' });
    } catch (err) {
        res.status(500).json({ status: 'error' });
    }
});

// 5. Log Form Inquiries
app.post('/api/track/inquiry', async (req, res) => {
    try {
        const { sessionId, name, phone, type, location, bottleSize, quantity, message } = req.body;
        if (isDbConnected) {
            await Inquiry.create({
                sessionId,
                name,
                phone,
                type,
                location,
                bottleSize,
                quantity,
                message,
                ip: getClientIP(req),
                timestamp: new Date()
            });
        }
        console.log(`[NEW B2B INQUIRY] From: ${name} (${phone}) - ${type}`);
        res.json({ status: 'success' });
    } catch (err) {
        res.status(500).json({ status: 'error' });
    }
});

// ==========================================
// ADMIN DASHBOARD & EXPORT ENDPOINTS
// ==========================================

// EXCEL / CSV EXPORT ENDPOINT FOR LEADS
app.get('/admin/export-inquiries', async (req, res) => {
    const key = req.query.key;
    if (key !== ADMIN_KEY) {
        return res.status(403).send('Access Denied');
    }

    try {
        const inquiries = isDbConnected ? await Inquiry.find({}).sort({ timestamp: -1 }) : [];
        
        let csv = 'Name,Phone,Role,Location,Bottle Size,Cases,Message,Timestamp\n';
        inquiries.forEach(i => {
            const name = `"${(i.name || '').replace(/"/g, '""')}"`;
            const phone = `"${(i.phone || '').replace(/"/g, '""')}"`;
            const type = `"${(i.type || '').replace(/"/g, '""')}"`;
            const location = `"${(i.location || '').replace(/"/g, '""')}"`;
            const bottleSize = `"${(i.bottleSize || '').replace(/"/g, '""')}"`;
            const quantity = `"${(i.quantity || '').replace(/"/g, '""')}"`;
            const message = `"${(i.message || '').replace(/"/g, '""')}"`;
            const timestamp = `"${new Date(i.timestamp).toLocaleString()}"`;

            csv += `${name},${phone},${type},${location},${bottleSize},${quantity},${message},${timestamp}\n`;
        });

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=taral_b2b_inquiries.csv');
        res.status(200).send(csv);
    } catch (err) {
        res.status(500).send('Error exporting data');
    }
});

app.get('/admin/analytics', async (req, res) => {
    const key = req.query.key;

    if (key !== ADMIN_KEY) {
        return res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>TARAL - Admin Login</title>
            <script src="https://cdn.tailwindcss.com"></script>
        </head>
        <body class="bg-slate-900 text-slate-100 font-sans flex items-center justify-center h-screen">
            <div class="bg-slate-800 p-8 rounded-2xl border border-slate-700 shadow-xl max-w-md w-full space-y-6 text-center">
                <div>
                    <h1 class="text-2xl font-black text-sky-400">TARAL Admin Portal</h1>
                    <p class="text-xs text-slate-400 mt-1">Please enter your security key to access analytics</p>
                </div>
                <form onsubmit="handleLogin(event)" class="space-y-4">
                    <div>
                        <input type="password" id="adminKeyInput" placeholder="Enter Admin Key..." required class="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-sky-500">
                    </div>
                    <button type="submit" class="w-full bg-sky-500 hover:bg-sky-600 text-slate-950 font-bold py-3 rounded-xl transition text-sm">Access Dashboard</button>
                </form>
            </div>
            <script>
                function handleLogin(e) {
                    e.preventDefault();
                    const val = document.getElementById('adminKeyInput').value;
                    window.location.href = '/admin/analytics?key=' + encodeURIComponent(val);
                }
            </script>
        </body>
        </html>
        `);
    }

    try {
        const now = new Date();
        const istComponents = getISTDateComponents(now);
        const todayStr = istComponents.dateStr;
        const thisMonthStr = istComponents.monthStr;
        const thisYearStr = istComponents.yearStr;

        // Filters for Year & Month
        const filterYear = req.query.year || '';
        const filterMonth = req.query.month || '';

        // Fetch all data from MongoDB
        const visits = isDbConnected ? await Visit.find({}).sort({ timestamp: -1 }) : [];
        const inquiries = isDbConnected ? await Inquiry.find({}).sort({ timestamp: -1 }) : [];
        const sampleRequests = isDbConnected ? await SampleRequest.find({}) : [];
        const quotationsGenerated = isDbConnected ? await Quotation.find({}) : [];

        // Time-based Visit Counts
        const todayVisits = visits.filter(v => v.dateStr === todayStr).length;
        const monthVisits = visits.filter(v => v.monthStr === thisMonthStr).length;
        const yearVisits = visits.filter(v => v.yearStr === thisYearStr).length;
        const totalVisits = visits.length;

        // Filter recent visits strictly for TODAY only so it resets fresh every new day
        const todayVisitsLog = visits.filter(v => v.dateStr === todayStr);

        const totalInquiries = inquiries.length;
        const totalSamples = sampleRequests.length;
        const totalQuotes = quotationsGenerated.length;

        // Active users in last 2 minutes
        const activeNow = visits.filter(v => {
            const diff = (now - new Date(v.lastActive)) / 1000;
            return diff <= 120; // active in last 120 seconds
        }).length;

        // Collect Unique Years and Months for Drill-Down Filter Buttons
        const availableYears = [...new Set(visits.map(v => v.yearStr).filter(Boolean))].sort().reverse();
        const availableMonths = [...new Set(visits.map(v => v.monthStr).filter(Boolean))].sort().reverse();

        // Daily Breakdown Calculation (Filtered if year/month clicked)
        const dailyStats = {};
        visits.forEach(v => {
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
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
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
                        <p class="text-xs text-slate-400">Database Status: ${isDbConnected ? '🟢 Connected (MongoDB Permanent Database)' : '🟡 Connecting to DB...'}</p>
                    </div>
                    <div class="flex items-center gap-3">
                        <a href="/admin/export-inquiries?key=${ADMIN_KEY}" class="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition shadow-lg">
                            <i class="fa-solid fa-file-excel"></i> Export Leads to Excel
                        </a>
                        <div class="bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2">
                            <span class="w-2.5 h-2.5 bg-emerald-400 rounded-full animate-ping"></span>
                            Live Active Users: ${activeNow}
                        </div>
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
                    <div class="overflow-x-auto max-h-[350px] overflow-y-auto">
                        <table class="w-full text-left text-xs border-collapse">
                            <thead>
                                <tr class="bg-slate-900/80 text-slate-400 border-b border-slate-700 sticky top-0">
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
                    <h3 class="text-lg font-bold text-white"><i class="fa-solid fa-users text-sky-400 mr-2"></i> Recent Visitors Activity Log (Today: ${todayStr})</h3>
                    <div class="overflow-x-auto max-h-[400px] overflow-y-auto">
                        <table class="w-full text-left text-xs border-collapse">
                            <thead>
                                <tr class="bg-slate-900/80 text-slate-400 border-b border-slate-700 sticky top-0">
                                    <th class="p-3">Session ID</th>
                                    <th class="p-3">IP Address</th>
                                    <th class="p-3">Time Spent</th>
                                    <th class="p-3">Referrer</th>
                                    <th class="p-3">First Visit</th>
                                    <th class="p-3">Last Active</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-700/50">
                                ${todayVisitsLog.length ? todayVisitsLog.map(v => `
                                    <tr class="hover:bg-slate-700/30">
                                        <td class="p-3 font-mono text-sky-300">${(v.sessionId || '').substring(0, 18)}...</td>
                                        <td class="p-3">${v.ip}</td>
                                        <td class="p-3 font-bold text-emerald-400">${v.durationSeconds || 0}s</td>
                                        <td class="p-3 text-slate-400">${v.referrer}</td>
                                        <td class="p-3 text-slate-400">${new Date(v.timestamp).toLocaleTimeString()}</td>
                                        <td class="p-3 text-slate-400">${new Date(v.lastActive).toLocaleTimeString()}</td>
                                    </tr>
                                `).join('') : '<tr><td colspan="6" class="p-4 text-center text-slate-500">No visitor activity recorded for today yet.</td></tr>'}
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- INQUIRIES LOG TABLE -->
                <div class="bg-slate-800 rounded-2xl p-6 border border-slate-700 space-y-4">
                    <h3 class="text-lg font-bold text-white"><i class="fa-solid fa-paper-plane text-emerald-400 mr-2"></i> Received B2B Inquiries</h3>
                    <div class="overflow-x-auto max-h-[350px] overflow-y-auto">
                        <table class="w-full text-left text-xs border-collapse">
                            <thead>
                                <tr class="bg-slate-900/80 text-slate-400 border-b border-slate-700 sticky top-0">
                                    <th class="p-3">Name</th>
                                    <th class="p-3">Phone</th>
                                    <th class="p-3">Role</th>
                                    <th class="p-3">Location</th>
                                    <th class="p-3">Bottle / Cases</th>
                                    <th class="p-3">Time</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-700/50">
                                ${inquiries.map(i => `
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
    } catch (err) {
        console.error('Admin analytics error:', err);
        res.status(500).send('Error loading analytics data');
    }
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
