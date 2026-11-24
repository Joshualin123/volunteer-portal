const express = require('express');
const router = express.Router();

const db = require('./queries');
const pool = require('./db');

/* ======================================== */
/* === Reset Demo Data ==================== */
/* ======================================== */
router.post('/reset-demo-data', async (req, res) => {
  try {
    await db.resetDemoData();
    res.status(200).json({message: 'demo data has been reset'});
  } catch(err) {
    console.log(err)
    res.status(500).json({error: err.message})
  }
});

/* ======================================== */
/* === Users ============================== */
/* ======================================== */
// POST /api/users
// Create a user
router.post('/users', async (req, res) => {
  try {
    const user = await db.createUser(req.body);
    res.status(201).json(user);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message });
  }
});

// Get single users information
router.get('/users/:uid', async (req, res) => {
  try {
    const user = await db.getUser(req.params.uid);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to retrieve user' });
  }
});

// Get all user information, mainly for testing to see full table
router.get('/users', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT uid, uname, email, role, created_at FROM users'
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to retrieve users' });
  }
});

// Check login credentials
router.post('/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;

    const user = await db.checkUser(identifier, password);

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed' });
  }
});


/* ======================================== */
/* === Organizations ====================== */
/* ======================================== */

// POST /api/organizations
router.post('/organizations', async (req, res) => {
  try {
    const org = await db.addOrg(req.body);
    res.status(201).json(org);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message });
  }
});

router.delete('/organizations/:oid', async (req, res) => {
  try {
    const result = await db.delOrg(req.params.oid);
    res.status(200).json(result);
  } catch (err) {
    console.log(err);
    res.status(400).json({error: err.message})
  }
});

// GET /api/organizations/:oid
router.get('/organizations/:oid', async (req, res) => {
  try {
    const org = await db.getOrg(req.params.oid);

    if (!org) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    res.json(org);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to retrieve organization' });
  }
});

// GET /api/organizations
router.get('/organizations', async (req, res) => {
  try {
    const org = await pool.query(`SELECT * FROM organization`);

    res.json(org.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to retrieve organization' });
  }
});

// PATCH /api/organizations/:oid/status
router.patch('/organizations/:oid/status', async (req, res) => {
  try {
    const org = await db.updateOrgStatus(
      req.params.oid,
      req.body.status
    );

    if (!org) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    res.json(org);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message });
  }
});


// PATCH /api/organizations/:oid/notifications
router.patch('/organizations/:oid/notifications', async (req, res) => {
  try {
    const { enabled } = req.body;

    const org = enabled
      ? await db.enableOrgNotifs(req.params.oid)
      : await db.disableOrgNotifs(req.params.oid);

    if (!org) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    res.json(org);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update notifications' });
  }
});


/* ======================================== */
/* === Positions ========================== */
/* ======================================== */

// POST /api/positions
router.post('/positions/', async (req, res) => {
  try {
    const position = await db.createPos(req.body);
    res.status(201).json(position);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message });
  }
});

// DELETE positions
router.delete('/positions/:pid', async (req, res) => {
  try {
    const position = await db.delPos(req.params.pid);
    res.status(201).json(position);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message });
  }
});

// GET /api/positions
// Get all active positions
router.get('/active-positions', async (req, res) => {
  try {
    const positions = await db.getActivePositions();
    res.json(positions);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to retrieve positions' });
  }
});


// GET /api/organizations/:oid/positions
router.get('/organizations/:oid/positions', async (req, res) => {
  try {
    const positions = await db.getOrgPositions(req.params.oid);
    res.json(positions);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to retrieve org positions' });
  }
});


// GET all positions (for admin view)
router.get('/all-positions', async (req, res) => {
  try {
    const positions = await db.getAllPositions()
    res.json(positions);
  } catch (err) {
    console.log(err);
    res.status(500).json({error: 'Failed to retrieve all positions'});
  }
});


// PATCH /api/positions/:pid
// Update any allowed position fields
router.patch('/positions/:pid', async (req, res) => {
  try {
    const position = await db.updatePos(
      pool,
      req.params.pid,
      req.body
    );

    if (!position) {
      return res.status(404).json({ error: 'Position not found or no valid updates provided' });
    }

    res.json(position);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message });
  }
});


/* ======================================== */
/* === Applications ======================= */
/* ======================================== */

// POST /api/applications
router.post('/applications', async (req, res) => {
  try {
    const application = await db.createApplication(req.body);
    res.status(201).json(application);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message });
  }
});


// GET /api/organizations/:oid/applications
router.get('/organizations/:oid/applications', async (req, res) => {
  try {
    const applications = await db.getOrgApplications(req.params.oid);
    res.json(applications);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to retrieve applications' });
  }
});


// GET /api/users/:uid/applications
router.get('/users/:uid/applications', async (req, res) => {
  try {
    const applications = await db.getUserApplications(req.params.uid);
    res.json(applications);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to retrieve applications' });
  }
});


// GET all applications (for admin view)
router.get('/all-applications', async (req, res) => {
  try {
    const applications = await db.getAllApplications()
    res.json(applications);
  } catch (err) {
    console.log(err);
    res.status(500).json({error: 'Failed to retrieve all applications'});
  }
});


// PATCH /api/applications/:aid
router.patch('/applications/:aid', async (req, res) => {
  try {
    const application = await db.updateApplication(
      req.params.aid,
      req.body.status
    );

    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    res.json(application);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message });
  }
});


/* ======================================== */
/* === Notifications ====================== */
/* ======================================== */

// POST /api/notifications
router.post('/notifications', async (req, res) => {
  try {
    const notif = await db.createNotif(req.body);
    res.status(201).json(notif);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message });
  }
});


// GET /api/organizations/:oid/notifications
router.get('/organizations/:oid/notifications', async (req, res) => {
  try {
    const notifs = await db.getNotifs(req.params.oid);
    res.json(notifs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to retrieve notifications' });
  }
});


// PATCH /api/notifications/:nid
router.patch('/notifications/:nid', async (req, res) => {
  try {
    const notif = await db.updateNotif(
      req.params.nid,
      req.body.is_read
    );

    if (!notif) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    res.json(notif);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message });
  }
});

/* ======================================== */
/* === Saving ============================= */
/* ======================================== */

// POST: Save relationship between user saving a position
router.post('/users/:uid/save-saved-positions/:pid', async (req, res) => {
  try {
    const result = await db.userSavePos(req.params.uid, req.params.pid);
    res.status(201).json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save position' });
  }
});

router.delete('/users/:uid/unsave-saved-position/:pid', async (req, res) => {
  try {
    const result = await db.userUnsavePos(req.params.uid, req.params.pid);
    res.status(200).json(result);
  } catch (err) {
    console.log(err);
    res.status(500).json({error: 'Failed to delete save relationship'})
  }
});

// GET: retreive user -> positions relationships
router.get('/get-saved-positions/:uid/', async (req, res) => {
  try {
    const result = await db.getUserSavedPos(req.params.uid);
    res.status(200).json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to retrieve saved positions for this user' });
  }
});

// Get all saved positions url, for testing
router.get('/user-saved-positions', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM user_saved_positions'
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to retrieve user_saved_positions' });
  }
});

// POST: Save user -> position applied relationship
router.post('/users/:uid/save-applied-positions/:pid', async (req, res) => {
  try {
    const result = await db.userAppliedPos(req.params.uid, req.params.pid);
    res.status(201).json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save the fact that user applied for this position' });
  }
});

// GET: get user -> position applied relationshi[s]
router.get('/get-applied-positions/:uid/', async (req, res) => {
  try {
    const result = await db.getUserAppliedPos(req.params.uid);
    res.status(200).json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to retrieve users applied positions' });
  }
});

module.exports = router;
