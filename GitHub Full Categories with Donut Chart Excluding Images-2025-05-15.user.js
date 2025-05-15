// ==UserScript==
// @name         GitHub Full Categories with Donut Chart Excluding Images
// @namespace    https://github.com/
// @version      2025-05-15
// @description  Full Categorical Info with Thinner Donut Chart (Excluding Images) in Languages Section on GitHub
// @author       Grok
// @match        https://github.com/PaulGamerBoy101/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=github.com
// @grant        GM_xmlhttpRequest
// @connect      api.github.com
// ==/UserScript==

(function() {
    'use strict';

    // Optional: Hardcode your GitHub personal access token here
    const GITHUB_TOKEN = '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'; // Replace or remove for public repos
    const headers = GITHUB_TOKEN ? { 'Authorization': `token ${GITHUB_TOKEN}` } : {};

    // Define image file extensions to exclude from chart
    const imageExtensions = new Set(['png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg', 'ico', 'webp']);

    // Extract repository path and branch
    let repoPath, branch, basePath;
    const pathMatch = window.location.pathname.match(/\/([^\/]+\/[^\/]+)(\/tree\/[^\/]+)?\/?(.*)/);
    if (pathMatch) {
        repoPath = pathMatch[1];
        branch = pathMatch[2] ? pathMatch[2].replace('/tree/', '') : 'main';
        basePath = pathMatch[3] || '';
    } else {
        console.error('Could not extract repository path');
        return;
    }

    // DOM element for the Languages section
    const langSection = document.querySelector('.repository-content .BorderGrid-cell');
    if (!langSection) {
        console.error('Languages section not found');
        return;
    }

    // Create and append a loading div
    const customDiv = document.createElement('div');
    customDiv.style.marginTop = '20px';
    customDiv.style.padding = '10px';
    customDiv.style.border = '1px solid #e1e4e8';
    customDiv.style.borderRadius = '6px';
    customDiv.innerHTML = `
        <h4 style="margin: 0 0 10px 0;">All File Types</h4>
        <p>Loading...</p>
    `;
    langSection.appendChild(customDiv);

    // Fetch repository contents with retry logic
    function fetchRepoFiles(path = '', retries = 2) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: `https://api.github.com/repos/${repoPath}/contents/${path}?ref=${branch}`,
                headers: headers,
                onload: function(response) {
                    if (response.status === 200) {
                        resolve(JSON.parse(response.responseText));
                    } else if (response.status === 403 && retries > 0) {
                        setTimeout(() => fetchRepoFiles(path, retries - 1).then(resolve).catch(reject), 1000);
                    } else if (response.status === 403) {
                        reject(new Error('API rate limit exceeded. Add a GitHub token.'));
                    } else if (response.status === 404) {
                        reject(new Error(`Repository or branch not found: ${repoPath}/${branch}`));
                    } else {
                        reject(new Error(`API request failed: ${response.status}`));
                    }
                },
                onerror: function() {
                    reject(new Error('Network error'));
                }
            });
        });
    }

    // Calculate file type statistics
    async function getFileTypeStats() {
        const fileStats = {};
        let totalSize = 0;
        let nonImageTotalSize = 0;

        async function processPath(path = basePath) {
            try {
                const contents = await fetchRepoFiles(path);
                if (!Array.isArray(contents)) {
                    console.warn(`Non-array response at path: ${path}`);
                    return;
                }
                for (const item of contents) {
                    if (item.type === 'file') {
                        const ext = item.name.includes('.') ? item.name.split('.').pop().toLowerCase() : 'noext';
                        if (!fileStats[ext]) {
                            fileStats[ext] = { count: 0, size: 0 };
                        }
                        fileStats[ext].count += 1;
                        fileStats[ext].size += item.size;
                        totalSize += item.size;
                        if (!imageExtensions.has(ext)) {
                            nonImageTotalSize += item.size;
                        }
                    } else if (item.type === 'dir') {
                        await processPath(item.path);
                    }
                }
            } catch (error) {
                console.error('Error processing path:', path, error);
            }
        }

        try {
            await processPath();
        } catch (error) {
            if (error.message.includes('not found') && branch === 'main') {
                console.log('Main branch not found, trying master...');
                branch = 'master';
                await processPath();
            } else {
                throw error;
            }
        }

        const stats = Object.entries(fileStats).map(([ext, { count, size }]) => ({
            ext,
            count,
            size,
            percentage: nonImageTotalSize > 0 && !imageExtensions.has(ext) ? (size / nonImageTotalSize) * 100 : 0
        }));

        stats.sort((a, b) => b.size - a.size);
        console.log('Stats:', stats);
        console.log('Total Size:', totalSize, 'Non-Image Total Size:', nonImageTotalSize);
        return { stats, totalSize, nonImageTotalSize };
    }

    // Function to draw donut chart
    function drawDonutChart(canvasId, data, colors) {
        console.log('Drawing donut chart with data:', data);
        const canvas = document.getElementById(canvasId);
        if (!canvas) {
            console.error('Canvas element not found:', canvasId);
            return;
        }
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            console.error('Failed to get canvas context');
            return;
        }

        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const outerRadius = Math.min(canvas.width, canvas.height) / 2 - 10;
        const innerRadius = outerRadius * 0.8; // 80% of outer radius for a thinner ring (half as thick)
        let startAngle = 0;

        // Draw each slice
        data.forEach(({ percentage }, index) => {
            const sliceAngle = (percentage / 100) * 2 * Math.PI;
            ctx.beginPath();
            ctx.arc(centerX, centerY, outerRadius, startAngle, startAngle + sliceAngle);
            ctx.arc(centerX, centerY, innerRadius, startAngle + sliceAngle, startAngle, true);
            ctx.closePath();
            ctx.fillStyle = colors[index % colors.length];
            ctx.fill();
            startAngle += sliceAngle;
        });

        // Draw inner circle to ensure transparency
        ctx.beginPath();
        ctx.arc(centerX, centerY, innerRadius, 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(255, 255, 255, 0)'; // Transparent
        ctx.fill();

        console.log('Donut chart drawn successfully');
    }

    // Update the DOM with statistics and donut chart
    getFileTypeStats().then(({ stats, totalSize, nonImageTotalSize }) => {
        if (stats.length === 0) {
            customDiv.innerHTML = `
                <h4 style="margin: 0 0 10px 0;">All File Types</h4>
                <p>No file types found. Check if the repository is empty, the branch exists, or add a GitHub token for private repos or rate limits.</p>
            `;
            return;
        }

        // List of all file types, counts, and sizes
        const list = stats.map(({ ext, count, size }) => `
            <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                <span>.${ext}</span>
                <span>${count} file${count !== 1 ? 's' : ''}, ${size} bytes</span>
            </div>
        `).join('');

        // Color palette for donut chart slices
        const colors = ['#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f', '#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#bab0ac'];

        // Filter non-image stats for donut chart
        const nonImageStats = stats.filter(({ ext }) => !imageExtensions.has(ext));
        console.log('Non-Image Stats for Donut Chart:', nonImageStats);

        // Generate donut chart and legend
        const canvasId = 'fileTypeDonutChart';
        const donutChartHtml = nonImageStats.length > 0 ? `
            <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 20px;">
                <canvas id="${canvasId}" width="200" height="200" style="max-width: 200px;"></canvas>
                <div style="flex: 1;">
                    ${nonImageStats.map(({ ext, percentage }, index) => `
                        <div style="display: flex; align-items: center; margin-bottom: 5px;">
                            <span style="display: inline-block; width: 12px; height: 12px; background-color: ${colors[index % colors.length]}; margin-right: 8px;"></span>
                            <span>.${ext}: ${percentage.toFixed(2)}%</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        ` : '<p>No non-image file types to display in donut chart. All files may be images or the repository may be empty.</p>';

        customDiv.innerHTML = `
            <h4 style="margin: 0 0 10px 0;">All File Types</h4>
            <div style="margin-bottom: 20px;">${list}</div>
            <h4 style="margin: 0 0 10px 0;">Percentage Graph</h4>
            <div>${donutChartHtml}</div>
        `;

        // Draw donut chart after DOM update
        if (nonImageStats.length > 0) {
            try {
                drawDonutChart(canvasId, nonImageStats, colors);
            } catch (error) {
                console.error('Error drawing donut chart:', error);
                customDiv.innerHTML += `<p>Error rendering donut chart: ${error.message}</p>`;
            }
        }
    }).catch(error => {
        console.error('Error fetching file types:', error);
        customDiv.innerHTML = `
            <h4 style="margin: 0 0 10px 0;">All File Types</h4>
            <p>Error: ${error.message}. Try adding a GitHub token or check the repository/branch.</p>
        `;
    });
})();