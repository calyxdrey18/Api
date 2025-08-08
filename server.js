const express = require('express');
const axios = require('axios');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Load API Configuration ---
// This is where we read your api-config.json file
let apiConfig = {};
try {
    const rawConfig = fs.readFileSync('api-config.json');
    apiConfig = JSON.parse(rawConfig);
    console.log("✅ API configuration loaded successfully!");
    console.log("Available API routes:", Object.keys(apiConfig).map(key => `/api/${key}`).join(', '));
} catch (error) {
    console.error("❌ Error loading api-config.json. Please make sure the file exists and is valid JSON.", error);
    process.exit(1); // Exit if config is missing
}

// Serve the static files from the 'public' directory (our website front-end)
app.use(express.static('public'));

// --- The Core API Proxy Route ---
// This single route handles all requests to /api/*
app.all('/api/:apiName*', async (req, res) => {
    const apiName = req.params.apiName;
    
    // 1. Find the target URL from our config
    const targetBaseUrl = apiConfig[apiName];

    if (!targetBaseUrl) {
        return res.status(404).json({ error: `API route '${apiName}' not found in configuration.` });
    }

    // 2. Construct the full target URL, including any extra path and query params
    // e.g., if request is /api/user-list/1, this will append '/1' to the target URL.
    const remainingPath = req.params[0] || '';
    const queryString = new URL(req.originalUrl, `http://${req.headers.host}`).search;
    const targetUrl = `${targetBaseUrl}${remainingPath}${queryString}`;

    console.log(`➡️  Proxying request for '${apiName}' to: ${targetUrl}`);
    
    try {
        // 3. Make the request to the target API using axios
        const response = await axios({
            method: req.method,
            url: targetUrl,
            headers: {
                // You can add custom headers here if needed, e.g., an API key
                // 'Authorization': `Bearer ${process.env.SOME_API_KEY}`
            },
            data: req.body, // Pass along the request body for POST/PUT requests
        });

        // 4. Send the response from the target API back to the original client
        res.status(response.status).json(response.data);

    } catch (error) {
        // Handle errors from the target API
        console.error(`❌ Error from target API '${apiName}':`, error.message);
        
        if (error.response) {
            // The request was made and the server responded with a status code
            // that falls out of the range of 2xx
            res.status(error.response.status).json(error.response.data);
        } else if (error.request) {
            // The request was made but no response was received
            res.status(502).json({ error: "Bad Gateway: No response from upstream server." });
        } else {
            // Something happened in setting up the request that triggered an Error
            res.status(500).json({ error: "Internal Server Error while proxying." });
        }
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
});