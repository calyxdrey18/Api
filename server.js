const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path'); // <-- ADD THIS LINE

const app = express();
const PORT = process.env.PORT || 3000;

// --- Load API Configuration (More Robustly) ---
let apiConfig = {};
try {
    // Use path.join to create a reliable path to the config file
    const configPath = path.join(__dirname, 'api-config.json');
    const rawConfig = fs.readFileSync(configPath, 'utf8');
    apiConfig = JSON.parse(rawConfig);
    console.log("✅ API configuration loaded successfully!");
    console.log("Available API routes:", Object.keys(apiConfig).map(key => `/api/${key}`).join(', '));
} catch (error) {
    console.error("❌ Error loading api-config.json. Please make sure the file exists and is valid JSON.", error);
    process.exit(1);
}

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public'))); // <-- Use path.join here too

// --- The Core API Proxy Route ---
app.all('/api/:apiName*', async (req, res) => {
    const apiName = req.params.apiName;
    const targetBaseUrl = apiConfig[apiName];

    if (!targetBaseUrl) {
        return res.status(404).json({ error: `API route '${apiName}' not found in configuration.` });
    }

    const remainingPath = req.params[0] || '';
    const queryString = new URL(req.originalUrl, `http://${req.headers.host}`).search;
    const targetUrl = `${targetBaseUrl}${remainingPath}${queryString}`;

    console.log(`➡️  Proxying request for '${apiName}' to: ${targetUrl}`);
    
    try {
        const response = await axios({
            method: req.method,
            url: targetUrl,
            headers: { 'Accept-Encoding': 'identity' }, // Header to prevent compression issues
            data: req.body,
        });
        res.status(response.status).json(response.data);
    } catch (error) {
        console.error(`❌ Error from target API '${apiName}':`, error.message);
        if (error.response) {
            res.status(error.response.status).json(error.response.data);
        } else if (error.request) {
            res.status(502).json({ error: "Bad Gateway: No response from upstream server." });
        } else {
            res.status(500).json({ error: "Internal Server Error while proxying." });
        }
    }
});

// Add a catch-all route to serve your index.html for any other request
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start the server
app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
});
