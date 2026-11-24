const pool = require('./db.js');
const init_db = require('./init-db.js');
const bcrypt = require('bcrypt');

/* ======================================== */
/* === RESET DEMO DATA (TEMP) ============= */
/* ======================================== */

async function resetDemoData() {
  try {
    await init_db.initDb();
    console.log('Demo data reset successfully!');
  } catch (err) {
    console.error('Failed to reset demo data:', err);
    throw err;
  }
}

/* ======================================== */
/* =========== Users ====================== */
/* ======================================== */

// Check login credentials.
// identifier can be either username or email.
async function checkUser(identifier, password) {
  const result = await pool.query(
    `SELECT * FROM users
     WHERE email = $1 OR uname = $1`,
    [identifier]
  );

  if (result.rows.length === 0) return null;

  const user = result.rows[0];

  const validPassword = await bcrypt.compare(
    password,
    user.password_hash
  );

  if (!validPassword) return null;

  // Never return the password hash.
  const { password_hash, ...safeUser } = user;
  return safeUser;
}


// Create a new user.
async function createUser({ uname, email, password, role = 'volunteer' }) {
  const allowedRoles = ['volunteer', 'organization', 'admin'];

  if (!allowedRoles.includes(role)) {
    throw new Error('Invalid user role');
  }

  const password_hash = await bcrypt.hash(password, 10);

  const result = await pool.query(
    `INSERT INTO users (uname, email, password_hash, role)
     VALUES ($1, $2, $3, $4)
     RETURNING uid, uname, email, created_at, role`,
    [uname, email, password_hash, role]
  );

  return result.rows[0];
}


// Get user by UUID.
async function getUser(uid) {
  const result = await pool.query(
    `SELECT uid, uname, email, created_at, role
     FROM users
     WHERE uid = $1`,
    [uid]
  );

  return result.rows[0] || null;
}

/* ======================================== */
/* === Organizations ====================== */
/* ======================================== */

// Create an organization associated with an existing user.
// oid is the same UUID as the user's uid.
async function addOrg({
  oid,
  oname,
  email,
  description,
  logoUrl,
  website,
  charitableRegistrationNumber,
  missionStatement
}) {
  const result = await pool.query(
    `INSERT INTO organization (
       oid, oname, email, description, logo_url, website,
       charitable_registration_number, mission_statement
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      oid,
      oname,
      email,
      description,
      logoUrl ?? null,
      website ?? null,
      charitableRegistrationNumber ?? null,
      missionStatement ?? null
    ]
  );

  return result.rows[0];
}

// delete organization, 
async function delOrg(oid) {
  const result = await pool.query(
    `
    DELETE FROM organization
    WHERE organization.oid = $1
    RETURNING *
    `,
    [oid]
  );

  return result.rows[0];
}

// Approve, reject, or return an organization to pending.
async function updateOrgStatus(oid, status) {
  const allowedStatuses = ['Approved', 'Pending', 'Rejected'];

  if (!allowedStatuses.includes(status)) {
    throw new Error('Invalid organization status');
  }

  const result = await pool.query(
    `UPDATE organization
     SET status = $1
     WHERE oid = $2
     RETURNING *`,
    [status, oid]
  );

  return result.rows[0] || null;
}


// Enable organization notifications.
async function enableOrgNotifs(oid) {
  const result = await pool.query(
    `UPDATE organization
     SET notify = TRUE
     WHERE oid = $1
     RETURNING *`,
    [oid]
  );

  return result.rows[0] || null;
}


// Disable organization notifications.
async function disableOrgNotifs(oid) {
  const result = await pool.query(
    `UPDATE organization
     SET notify = FALSE
     WHERE oid = $1
     RETURNING *`,
    [oid]
  );

  return result.rows[0] || null;
}


// Get organization details.
async function getOrg(oid) {
  const result = await pool.query(
    `SELECT * FROM organization
     WHERE oid = $1`,
    [oid]
  );

  return result.rows[0] || null;
}


/* ======================================== */
/* === Positions ========================== */
/* ======================================== */

// Create a volunteer position.
async function createPos({
  title,
  oid,
  location,
  distance,
  date,
  time_range,
  commitment = 'Flexible',
  spots,
  description,
  responsibilities = [],
  requirements = [],
  contact_email,
  contact_phone
}) {
  const result = await pool.query(
    `INSERT INTO position (
      title, oid, location, distance, date, time_range,
      commitment, spots, description, responsibilities,
      requirements, contact_email, contact_phone
    )
    VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
    )
    RETURNING *`,
    [
      title, oid, location, distance, date, time_range,
      commitment, spots, description, responsibilities,
      requirements, contact_email, contact_phone
    ]
  );

  return result.rows[0];
}

//delete position
async function delPos(pid) {
  const result = await pool.query(
    `
    DELETE FROM position
    WHERE position.pid = $1
    RETURNING *
    `,
    [pid]
  )

  return result.rows[0] || null;
}

// Get all active positions.
async function getActivePositions() {
  const result = await pool.query(
    `SELECT p.*, o.oname
     FROM position p
     JOIN organization o ON p.oid = o.oid
     WHERE p.status = 'Active'
       AND o.status = 'Approved'
     ORDER BY p.date ASC`
  );

  return result.rows;
}

// Get all positions.
async function getAllPositions() {
  const result = await pool.query(
    `SELECT * FROM position
     ORDER BY date ASC`
  );

  return result.rows;
}


// Get positions belonging to an organization.
async function getOrgPositions(oid) {
  const result = await pool.query(
    `SELECT * FROM position
     WHERE oid = $1
     ORDER BY date ASC`,
    [oid]
  );

  return result.rows;
}


// Pause or reactivate a position.
async function updatePosStatus(pid, status) {
  const allowedStatuses = ['Active', 'Paused'];

  if (!allowedStatuses.includes(status)) {
    throw new Error('Invalid position status');
  }

  const result = await pool.query(
    `UPDATE position
     SET status = $1
     WHERE pid = $2
     RETURNING *`,
    [status, pid]
  );

  return result.rows[0] || null;
}

const ALLOWED_UPDATE_FIELDS = new Set([
  'title',
  'location',
  'distance',
  'date',
  'time_range',
  'commitment',
  'spots',
  'description',
  'responsibilities',
  'requirements',
  'status',
  'notify',
  'contact_email',
  'contact_phone',
]);

async function updatePos(pool, pid, updates) {
  const entries = Object.entries(updates).filter(
    ([key, val]) => ALLOWED_UPDATE_FIELDS.has(key) && val !== undefined
  );

  if (entries.length === 0) {
    return null;
  }

  const setClauses = entries.map(([col], idx) => `${col} = $${idx + 2}`);
  const values = entries.map(([, val]) => val);

  const sql = `
    UPDATE position
    SET ${setClauses.join(', ')}
    WHERE pid = $1
    RETURNING *;
  `;

  const { rows } = await pool.query(sql, [pid, ...values]);
  return rows[0] ?? null;
}


/* ======================================== */
/* === Applications ======================= */
/* ======================================== */

// Create a volunteer application.
async function createApplication({
  pid,
  volunteer_id,
  name,
  email,
  message,
  phone = '',
  skills = '',
  availability = '',
  resumeName = '',
  resumeDataUrl = '',
  resumeText = '',
  date = new Date().toISOString().slice(0, 10)
}) {
  const result = await pool.query(
    `INSERT INTO application (
      pid, 
      volunteer_id, 
      name, 
      email, 
      message, 
      date, 
      phone,
      skills,
      availability,
      resume_name,
      resume_data_url,
      resume_text
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    RETURNING *`,
    [pid,
      volunteer_id,
      name,
      email,
      message,
      date,
      phone,
      skills,
      availability,
      resumeName,
      resumeDataUrl,
      resumeText
    ]
  );

  return result.rows[0];
}

// get all applications (for admin view)
async function getAllApplications() {
  const result = await pool.query(
    `
    SELECT * FROM application
    ORDER BY date ASC;
    `
  )

  return result.rows;
}

// Update an application's status.
async function updateApplication(aid, status) {
  const allowedStatuses = [
    'New',
    'Under Review',
    'Contacted',
    'Accepted',
    'Rejected'
  ];

  if (!allowedStatuses.includes(status)) {
    throw new Error('Invalid application status');
  }

  const result = await pool.query(
    `UPDATE application
     SET status = $1
     WHERE aid = $2
     RETURNING *`,
    [status, aid]
  );

  return result.rows[0] || null;
}

// Get all applications for an organization's positions.
async function getOrgApplications(oid) {
  const result = await pool.query(
    `SELECT a.*, p.title AS position_title
     FROM application a
     JOIN position p ON a.pid = p.pid
     WHERE p.oid = $1
     ORDER BY a.date DESC`,
    [oid]
  );

  return result.rows;
}


// Get applications submitted by a volunteer.
async function getUserApplications(volunteer_id) {
  const result = await pool.query(
    `SELECT a.*, p.title AS position_title, o.oname
     FROM application a
     JOIN position p ON a.pid = p.pid
     JOIN organization o ON p.oid = o.oid
     WHERE a.volunteer_id = $1
     ORDER BY a.date DESC`,
    [volunteer_id]
  );

  return result.rows;
}


/* ======================================== */
/* === Notifications ====================== */
/* ======================================== */

// Create a notification for an organization.
async function createNotif({
  oid,
  text,
  date = new Date().toISOString().slice(0, 10)
}) {
  const result = await pool.query(
    `INSERT INTO notification (oid, text, date)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [oid, text, date]
  );

  return result.rows[0];
}


// Mark a notification as read or unread.
async function updateNotif(nid, is_read) {
  const result = await pool.query(
    `UPDATE notification
     SET is_read = $1
     WHERE nid = $2
     RETURNING *`,
    [is_read, nid]
  );

  return result.rows[0] || null;
}


// Get all notifications for an organization.
async function getNotifs(oid) {
  const result = await pool.query(
    `SELECT * FROM notification
     WHERE oid = $1
     ORDER BY date DESC`,
    [oid]
  );

  return result.rows;
}


// Delete a notification.
async function deleteNotif(nid) {
  const result = await pool.query(
    `DELETE FROM notification
     WHERE nid = $1
     RETURNING *`,
    [nid]
  );

  return result.rows[0] || null;
}

//save relationship of user saving an application

async function userSavePos(uid, pid) {
  const result = await pool.query(
    `INSERT INTO user_saved_positions (uid, pid)
    VALUES($1, $2)
    ON CONFLICT (uid, pid) DO NOTHING
    RETURNING *
    `,
    [uid, pid]
  )

  return result.rows;
};

//unsave pos
async function userUnsavePos(uid, pid) {
  const result = await pool.query(
    `DELETE FROM user_saved_positions AS u
    WHERE u.uid = $1 AND u.pid = $2
    RETURNING *
    `,
    [uid, pid]
  )

  return result.rows;
};

async function getUserSavedPos(uid) {
  const result = await pool.query(
    `SELECT * FROM user_saved_positions
    WHERE uid = $1
    `,
    [uid]
  )

  return result.rows;
};

async function userAppliedPos(uid, pid) {
  const result = await pool.query(
    `INSERT INTO user_applied_positions (uid, pid)
    VALUES($1, $2)
    ON CONFLICT (uid, pid) DO NOTHING
    RETURNING *
    `,
    [uid, pid]
  )

  return result.rows;
};

async function getUserAppliedPos(uid, pid) {
  const result = await pool.query(
    `SELECT * FROM user_applied_positions
    WHERE uid = $1
    `,
    [uid]
  )

  return result.rows;
};

/* ======================================== */
/* === Exports ======eeeeee================ */
/* ======================================== */

module.exports = {
  resetDemoData,
  checkUser,
  createUser,
  getUser,

  addOrg,
  delOrg,
  updateOrgStatus,
  enableOrgNotifs,
  disableOrgNotifs,
  getOrg,

  createPos,
  delPos,
  getAllPositions,
  getActivePositions,
  getOrgPositions,
  updatePosStatus,
  updatePos,

  createApplication,
  getAllApplications,
  updateApplication,
  getOrgApplications,
  getUserApplications,

  createNotif,
  updateNotif,
  getNotifs,
  deleteNotif,

  userSavePos,
  userUnsavePos,
  getUserSavedPos,
  userAppliedPos,
  getUserAppliedPos
};
