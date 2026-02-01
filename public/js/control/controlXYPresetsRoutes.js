/*!
 * controlXYPresetsRoutes.js — Server routes for controlXY preset persistence
 * Add these routes to your server.js
 * © 2025 Rob Canning — GPLv3
 */

const fs = require('fs');
const path = require('path');

/**
 * Add these routes to your Express app in server.js:
 * 
 *   const controlXYRoutes = require('./controlXYPresetsRoutes');
 *   controlXYRoutes.setup(app, scoresBasePath);
 * 
 * Or copy the route handlers directly into server.js
 */

function setup(app, scoresBasePath = './public/scores') {
  
  /**
   * GET /api/controlxy-presets?projectId=xxx
   * Load presets for a project
   */
  app.get('/api/controlxy-presets', (req, res) => {
    const { projectId } = req.query;
    
    if (!projectId) {
      return res.status(400).json({ error: 'projectId required' });
    }
    
    // Sanitize projectId to prevent path traversal
    const safeProjectId = projectId.replace(/[^a-zA-Z0-9_-]/g, '');
    const presetsPath = path.join(scoresBasePath, safeProjectId, 'controlxy-presets.json');
    
    try {
      if (!fs.existsSync(presetsPath)) {
        return res.status(404).json({ error: 'No presets file found' });
      }
      
      const data = fs.readFileSync(presetsPath, 'utf-8');
      const presets = JSON.parse(data);
      
      console.log(`[controlXY] Loaded presets for "${safeProjectId}"`);
      res.json(presets);
      
    } catch (err) {
      console.error(`[controlXY] Error loading presets:`, err);
      res.status(500).json({ error: 'Failed to load presets' });
    }
  });
  
  /**
   * POST /api/controlxy-presets
   * Save presets for a project
   * Body: { projectId, presets, sequences }
   */
  app.post('/api/controlxy-presets', (req, res) => {
    const { projectId, presets, sequences } = req.body;
    
    if (!projectId) {
      return res.status(400).json({ error: 'projectId required' });
    }
    
    // Sanitize projectId
    const safeProjectId = projectId.replace(/[^a-zA-Z0-9_-]/g, '');
    const projectDir = path.join(scoresBasePath, safeProjectId);
    const presetsPath = path.join(projectDir, 'controlxy-presets.json');
    
    try {
      // Ensure project directory exists
      if (!fs.existsSync(projectDir)) {
        return res.status(404).json({ error: 'Project not found' });
      }
      
      const data = {
        presets: presets || {},
        sequences: sequences || {},
        updatedAt: Date.now(),
        projectId: safeProjectId
      };
      
      fs.writeFileSync(presetsPath, JSON.stringify(data, null, 2));
      
      console.log(`[controlXY] Saved presets for "${safeProjectId}": ${Object.keys(presets || {}).length} presets, ${Object.keys(sequences || {}).length} sequences`);
      res.json({ success: true, path: presetsPath });
      
    } catch (err) {
      console.error(`[controlXY] Error saving presets:`, err);
      res.status(500).json({ error: 'Failed to save presets' });
    }
  });
  
  /**
   * DELETE /api/controlxy-presets?projectId=xxx&preset=name
   * Delete a specific preset (optional - can also use POST with updated presets)
   */
  app.delete('/api/controlxy-presets', (req, res) => {
    const { projectId, preset } = req.query;
    
    if (!projectId || !preset) {
      return res.status(400).json({ error: 'projectId and preset required' });
    }
    
    const safeProjectId = projectId.replace(/[^a-zA-Z0-9_-]/g, '');
    const presetsPath = path.join(scoresBasePath, safeProjectId, 'controlxy-presets.json');
    
    try {
      if (!fs.existsSync(presetsPath)) {
        return res.status(404).json({ error: 'No presets file found' });
      }
      
      const data = JSON.parse(fs.readFileSync(presetsPath, 'utf-8'));
      
      if (!data.presets?.[preset]) {
        return res.status(404).json({ error: `Preset "${preset}" not found` });
      }
      
      delete data.presets[preset];
      data.updatedAt = Date.now();
      
      fs.writeFileSync(presetsPath, JSON.stringify(data, null, 2));
      
      console.log(`[controlXY] Deleted preset "${preset}" from "${safeProjectId}"`);
      res.json({ success: true, deleted: preset });
      
    } catch (err) {
      console.error(`[controlXY] Error deleting preset:`, err);
      res.status(500).json({ error: 'Failed to delete preset' });
    }
  });
  
  /**
   * GET /api/controlxy-presets/list?projectId=xxx
   * List all preset names for a project
   */
  app.get('/api/controlxy-presets/list', (req, res) => {
    const { projectId } = req.query;
    
    if (!projectId) {
      return res.status(400).json({ error: 'projectId required' });
    }
    
    const safeProjectId = projectId.replace(/[^a-zA-Z0-9_-]/g, '');
    const presetsPath = path.join(scoresBasePath, safeProjectId, 'controlxy-presets.json');
    
    try {
      if (!fs.existsSync(presetsPath)) {
        return res.json({ presets: [], sequences: [] });
      }
      
      const data = JSON.parse(fs.readFileSync(presetsPath, 'utf-8'));
      
      res.json({
        presets: Object.keys(data.presets || {}),
        sequences: Object.keys(data.sequences || {})
      });
      
    } catch (err) {
      console.error(`[controlXY] Error listing presets:`, err);
      res.status(500).json({ error: 'Failed to list presets' });
    }
  });
  
  console.log("[controlXY] Preset routes registered");
}

module.exports = { setup };


// ============================================================================
// ALTERNATIVE: Inline route handlers for direct copy into server.js
// ============================================================================

/*
// Add this near your other route handlers in server.js:

const SCORES_PATH = './public/scores';  // Adjust to your scores path

// GET presets
app.get('/api/controlxy-presets', (req, res) => {
  const { projectId } = req.query;
  if (!projectId) return res.status(400).json({ error: 'projectId required' });
  
  const safeProjectId = projectId.replace(/[^a-zA-Z0-9_-]/g, '');
  const presetsPath = path.join(SCORES_PATH, safeProjectId, 'controlxy-presets.json');
  
  try {
    if (!fs.existsSync(presetsPath)) {
      return res.status(404).json({ error: 'No presets file' });
    }
    res.json(JSON.parse(fs.readFileSync(presetsPath, 'utf-8')));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST presets
app.post('/api/controlxy-presets', (req, res) => {
  const { projectId, presets, sequences } = req.body;
  if (!projectId) return res.status(400).json({ error: 'projectId required' });
  
  const safeProjectId = projectId.replace(/[^a-zA-Z0-9_-]/g, '');
  const projectDir = path.join(SCORES_PATH, safeProjectId);
  
  if (!fs.existsSync(projectDir)) {
    return res.status(404).json({ error: 'Project not found' });
  }
  
  const presetsPath = path.join(projectDir, 'controlxy-presets.json');
  const data = { presets, sequences, updatedAt: Date.now(), projectId: safeProjectId };
  
  try {
    fs.writeFileSync(presetsPath, JSON.stringify(data, null, 2));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

*/
