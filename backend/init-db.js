require('dotenv').config();
const pool = require('./db');

async function initDb() {
  const client = await pool.connect();
  try {

    //begin statement for this sql session
    await client.query(`BEGIN`);

    // Drop existing tables
    await client.query(`
      DROP TABLE IF EXISTS
        user_applied_positions,
        user_saved_positions,
        notification,
        application,
        position,
        organization,
        users
      CASCADE;
    `);
    console.log("Dropped all tables");

    // import pgcrypto for password encryption
    await client.query(`
      CREATE EXTENSION IF NOT EXISTS pgcrypto;
    `);

    console.log("imported pgcrypto");

    // create tables
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        uid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        uname TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        role TEXT NOT NULL DEFAULT 'volunteer'
          CHECK (role IN ('volunteer', 'organization', 'admin'))
      );

      CREATE TABLE IF NOT EXISTS organization (
        oid UUID PRIMARY KEY DEFAULT gen_random_uuid() REFERENCES users(uid) ON DELETE CASCADE,
        oname TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        description TEXT NOT NULL,
        website TEXT,
        charitable_registration_number TEXT,
        mission_statement TEXT,
        status TEXT NOT NULL DEFAULT 'Pending'
          CHECK (status IN ('Approved', 'Pending', 'Rejected')),
        notify BOOLEAN NOT NULL DEFAULT FALSE,
        logo_url TEXT
      );

      CREATE TABLE IF NOT EXISTS position (
        pid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title TEXT NOT NULL,
        oid UUID NOT NULL REFERENCES organization(oid) ON DELETE CASCADE,
        location TEXT NOT NULL,
        distance NUMERIC(5, 1) NOT NULL,
        date DATE NOT NULL,
        time_range TEXT NOT NULL
          CHECK (time_range ~ '^(1[0-2]|[1-9]):[0-5][0-9] (AM|PM) [–-] (1[0-2]|[1-9]):[0-5][0-9] (AM|PM)$'),
        commitment TEXT NOT NULL DEFAULT 'Flexible'
          CHECK (commitment IN ('Weekly', 'Flexible', 'One-time')),
        spots INT NOT NULL,
        description TEXT NOT NULL,
        responsibilities TEXT[] NOT NULL DEFAULT '{}',
        requirements TEXT[] NOT NULL DEFAULT '{}',
        status TEXT NOT NULL DEFAULT 'Active'
          CHECK (status IN ('Active', 'Paused')),
        notify BOOLEAN NOT NULL DEFAULT FALSE,
        contact_email TEXT NOT NULL,
        contact_phone TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS application (
        aid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        pid UUID NOT NULL REFERENCES position(pid) ON DELETE CASCADE,
        volunteer_id UUID NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT NOT NULL DEFAULT '',
        skills TEXT NOT NULL DEFAULT '',
        availability TEXT NOT NULL DEFAULT '',
        resume_name TEXT NOT NULL DEFAULT '',
        resume_data_url TEXT NOT NULL DEFAULT '',
        resume_text TEXT NOT NULL DEFAULT '',
        message TEXT NOT NULL,
        date DATE NOT NULL,
        status TEXT NOT NULL DEFAULT 'Under Review'
          CHECK (status IN ('New', 'Under Review', 'Contacted', 'Accepted', 'Rejected'))
      );

      CREATE TABLE IF NOT EXISTS notification (
        nid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        oid UUID NOT NULL REFERENCES organization(oid) ON DELETE CASCADE,
        text TEXT NOT NULL,
        date DATE NOT NULL,
        is_read BOOLEAN NOT NULL DEFAULT FALSE
      );

      CREATE TABLE IF NOT EXISTS user_saved_positions (
        uid UUID NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
        pid UUID NOT NULL REFERENCES position(pid) ON DELETE CASCADE,
        PRIMARY KEY (uid, pid)
      );

      CREATE TABLE IF NOT EXISTS user_applied_positions (
        uid UUID NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
        pid UUID NOT NULL REFERENCES position(pid) ON DELETE CASCADE,
        PRIMARY KEY (uid, pid)
      );
    `);

    console.log("Created tables");

    // Insert demo users
    await client.query(`
      INSERT INTO users (uid, uname, email, password_hash, role)
      VALUES
      ('00000000-0000-0000-0000-000000000001', 'Jamie Morgan',
      'volunteer@demo.com', crypt('demo123', gen_salt('bf')), 'volunteer'),

      ('00000000-0000-0000-0000-000000000002', 'Morgan Lee',
      'organization@demo.com', crypt('demo123', gen_salt('bf')), 'organization'),

      ('00000000-0000-0000-0000-000000000003', 'Taylor Admin',
      'admin@demo.com', crypt('demo123', gen_salt('bf')), 'admin'),

      -- Additional organization accounts required by the foreign key
      ('00000000-0000-0000-0000-000000000004', 'Helping Hands',
      'hello@helpinghands.ca', crypt('demo123', gen_salt('bf')), 'organization'),

      ('00000000-0000-0000-0000-000000000005', 'Community Care',
      'team@communitycare.ca', crypt('demo123', gen_salt('bf')), 'organization'),

      ('00000000-0000-0000-0000-000000000006', 'Bright Futures',
      'connect@brightfutures.ca', crypt('demo123', gen_salt('bf')), 'organization'),

      ('00000000-0000-0000-0000-000000000007', 'Riverside Shelter',
      'volunteer@riversideshelter.ca', crypt('demo123', gen_salt('bf')), 'organization'),

      ('00000000-0000-0000-0000-000000000008', 'Green Earth Initiative',
      'hello@greenearthinitiative.ca', crypt('demo123', gen_salt('bf')), 'organization'),

      -- Sample applicants required by application.volunteer_id
      ('00000000-0000-0000-0000-000000000009', 'Alex Chen',
      'alex.chen@example.com', crypt('demo123', gen_salt('bf')), 'volunteer'),

      ('00000000-0000-0000-0000-000000000010', 'Maria Lopez',
      'maria.lopez@example.com', crypt('demo123', gen_salt('bf')), 'volunteer'),

      ('00000000-0000-0000-0000-000000000011', 'James Wilson',
      'james.w@example.com', crypt('demo123', gen_salt('bf')), 'volunteer'),

      ('00000000-0000-0000-0000-000000000012', 'Priya Patel',
      'priya.p@example.com', crypt('demo123', gen_salt('bf')), 'volunteer');
    `);

    // Insert organizations
    await client.query(`
      INSERT INTO organization (oid, oname, email, description, status, notify)
      VALUES
      (
      '00000000-0000-0000-0000-000000000002',
      'Green Earth Organization',
      'organization@demo.com',
      'Building greener, more resilient neighbourhoods through hands-on action.',
      'Approved', FALSE
      ),
      (
      '00000000-0000-0000-0000-000000000004',
      'Helping Hands Community Center',
      'hello@helpinghands.ca',
      'Connecting neighbours with food, care, and essential community resources.',
      'Pending', FALSE
      ),
      (
      '00000000-0000-0000-0000-000000000005',
      'Community Care Network',
      'team@communitycare.ca',
      'Supporting older adults and families through compassionate volunteer programs.',
      'Approved', FALSE
      ),
      (
      '00000000-0000-0000-0000-000000000006',
      'Bright Futures Foundation',
      'connect@brightfutures.ca',
      'Helping young people thrive through accessible education and mentorship.',
      'Approved', FALSE
      ),
      (
      '00000000-0000-0000-0000-000000000007',
      'Riverside Animal Shelter',
      'volunteer@riversideshelter.ca',
      'Providing safe, loving care for animals while they wait for their forever homes.',
      'Pending', FALSE
      ),
      (
      '00000000-0000-0000-0000-000000000008',
      'Green Earth Initiative',
      'hello@greenearthinitiative.ca',
      'Creating practical local solutions for a healthier planet.',
      'Pending', FALSE
      );
    `);

    //Insert positions
    await client.query(
      `
      INSERT INTO position (
      pid, title, oid, location, distance, date, time_range,
      commitment, spots, description, responsibilities,
      requirements, status, notify, contact_email, contact_phone
      )
      VALUES
      (
      '00000000-0000-0000-0000-000000000101',
      'Community Garden Volunteer',
      '00000000-0000-0000-0000-000000000002',
      'Riverside Community Garden', 2.4, '2026-06-14',
      '9:00 AM – 12:00 PM', 'Weekly', 8,
      'Help maintain our community garden and support local food initiatives. This is a great opportunity to get outdoors, meet new people, and make a positive impact in the community.',
      ARRAY[
        'Assist with planting, weeding, and general garden maintenance.',
        'Help with watering and harvesting.',
        'Support special events and garden clean-up days.'
      ],
      ARRAY[
        'No previous experience required.',
        'Must be 16 years or older.',
        'Comfortable working outdoors.',
        'Bring a water bottle and appropriate clothing.'
      ],
      'Active', TRUE, 'organization@demo.com', ''
      ),
      (
      '00000000-0000-0000-0000-000000000102',
      'Park Clean-Up Volunteer',
      '00000000-0000-0000-0000-000000000002',
      'Silvercreek Park', 4.8, '2026-06-21',
      '10:00 AM – 1:00 PM', 'One-time', 15,
      'Join neighbours for a morning clean-up that helps keep our shared green spaces welcoming and beautiful.',
      ARRAY[
        'Collect litter along marked trails.',
        'Sort recyclables and waste.',
        'Help restore trail markers.'
      ],
      ARRAY[
        'All supplies are provided.',
        'Comfortable walking outdoors.'
      ],
      'Active', FALSE, 'organization@demo.com', ''
      ),
      (
      '00000000-0000-0000-0000-000000000103',
      'Food Bank Helper',
      '00000000-0000-0000-0000-000000000004',
      'Downtown Resource Hub', 7.2, '2026-06-18',
      '1:00 PM – 4:00 PM', 'Weekly', 6,
      'Sort donations and prepare grocery hampers for neighbours in our community.',
      ARRAY[
        'Sort incoming donations.',
        'Pack balanced food hampers.',
        'Welcome community members.'
      ],
      ARRAY[
        'Able to lift up to 10 kg.',
        'A friendly, respectful attitude.'
      ],
      'Active', TRUE, 'hello@helpinghands.ca', ''
      ),
      (
      '00000000-0000-0000-0000-000000000104',
      'Tutoring Program Volunteer',
      '00000000-0000-0000-0000-000000000006',
      'West End Learning Centre', 9.6, '2026-06-20',
      '4:00 PM – 6:00 PM', 'Weekly', 5,
      'Support local students with homework, reading, and confidence-building activities.',
      ARRAY[
        'Support homework completion.',
        'Practice literacy and numeracy skills.'
      ],
      ARRAY[
        'Patient and encouraging.',
        'Background check required.'
      ],
      'Active', FALSE, 'connect@brightfutures.ca', ''
      ),
      (
      '00000000-0000-0000-0000-000000000105',
      'Animal Shelter Assistant',
      '00000000-0000-0000-0000-000000000007',
      'Riverside Animal Shelter', 13.4, '2026-06-22',
      '11:00 AM – 3:00 PM', 'Flexible', 7,
      'Help our animal care team keep pets comfortable, active, and ready for adoption.',
      ARRAY[
        'Prepare enrichment activities.',
        'Help tidy animal care spaces.'
      ],
      ARRAY[
        'Must be 18 years or older.',
        'Animal handling orientation provided.'
      ],
      'Active', FALSE, 'volunteer@riversideshelter.ca', ''
      ),
      (
      '00000000-0000-0000-0000-000000000106',
      'Community Event Support',
      '00000000-0000-0000-0000-000000000005',
      'Exhibition Hall', 18.7, '2026-07-05',
      '8:00 AM – 2:00 PM', 'One-time', 20,
      'Help welcome guests and keep our annual community celebration running smoothly.',
      ARRAY[
        'Welcome and direct guests.',
        'Support activity stations.'
      ],
      ARRAY[
        'Friendly and reliable.',
        'Orientation provided onsite.'
      ],
      'Active', TRUE, 'team@communitycare.ca', ''
      ),
      (
      '00000000-0000-0000-0000-000000000107',
      'Senior Community Companion',
      '00000000-0000-0000-0000-000000000005',
      'Northside Community Centre', 23.5, '2026-06-25',
      '2:00 PM – 4:00 PM', 'Weekly', 4,
      'Share conversation and activities with older adults in a warm community setting.',
      ARRAY[
        'Join social activities.',
        'Offer friendly conversation.'
      ],
      ARRAY[
        'Patient and dependable.',
        'Background check required.'
      ],
      'Active', TRUE, 'team@communitycare.ca', ''
      ),
      (
      '00000000-0000-0000-0000-000000000108',
      'Environmental Awareness Volunteer',
      '00000000-0000-0000-0000-000000000002',
      'Conservation Education Centre', 31.2, '2026-07-12',
      '10:00 AM – 3:00 PM', 'Flexible', 10,
      'Help visitors discover practical ways to protect local ecosystems.',
      ARRAY[
        'Greet visitors.',
        'Share prepared educational materials.'
      ],
      ARRAY[
        'Interest in environmental education.'
      ],
      'Paused', FALSE, 'organization@demo.com', ''
      );
      `
    )

    // insert applications
    await client.query(
      `
      INSERT INTO application (
        aid, pid, volunteer_id, name, email,
        message, date, status, phone, skills, availability,
        resume_name, resume_data_url, resume_text
      )
      VALUES
      (
      '00000000-0000-0000-0000-000000000201',
      '00000000-0000-0000-0000-000000000104',
      '00000000-0000-0000-0000-000000000001',
      'Jamie Morgan', 'volunteer@demo.com',
      'I enjoy helping students build confidence and can volunteer weekly.',
      '2026-05-22', 'New', '(519) 555-0100', 'Tutoring, Communication',
      'Tuesday and Thursday evenings', 'Jamie_Morgan_Resume.pdf', '',
      'Jamie Morgan - Community Volunteer'
      ),
      (
      '00000000-0000-0000-0000-000000000202',
      '00000000-0000-0000-0000-000000000101',
      '00000000-0000-0000-0000-000000000009',
      'Alex Chen', 'alex.chen@example.com',
      'I garden at home and would love to help the community.',
      '2026-05-21', 'New', '(519) 555-0101', 'Gardening, Teamwork',
      'Saturday mornings', 'Alex_Chen_Resume.pdf', '',
      'Alex Chen - Community Volunteer'
      ),
      (
      '00000000-0000-0000-0000-000000000203',
      '00000000-0000-0000-0000-000000000101',
      '00000000-0000-0000-0000-000000000010',
      'Maria Lopez', 'maria.lopez@example.com',
      'I am available every Saturday morning.',
      '2026-05-20', 'Under Review', '(519) 555-0102', 'Food service',
      'Saturday mornings', 'Maria_Lopez_Resume.pdf', '',
      'Maria Lopez - Community Volunteer'
      ),
      (
      '00000000-0000-0000-0000-000000000204',
      '00000000-0000-0000-0000-000000000102',
      '00000000-0000-0000-0000-000000000011',
      'James Wilson', 'james.w@example.com',
      'Happy to bring friends and help clean up.',
      '2026-05-18', 'Contacted', '(519) 555-0103', 'Event support',
      'Weekends', 'James_Wilson_Resume.pdf', '',
      'James Wilson - Community Volunteer'
      ),
      (
      '00000000-0000-0000-0000-000000000205',
      '00000000-0000-0000-0000-000000000101',
      '00000000-0000-0000-0000-000000000012',
      'Priya Patel', 'priya.p@example.com',
      'I am studying environmental science and would be glad to pitch in.',
      '2026-05-17', 'Accepted', '(519) 555-0104', 'Environmental science',
      'Friday afternoons and weekends', 'Priya_Patel_Resume.pdf', '',
      'Priya Patel - Community Volunteer'
      );
      `
    )

    //insert saved positions
    await client.query(
      `
      INSERT INTO user_saved_positions (uid, pid)
      VALUES (
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000101'
      );
      `
    )

    //insert user applied positions
    await client.query(
      `
      INSERT INTO user_applied_positions (uid, pid)
      SELECT volunteer_id, pid
      FROM application
      ON CONFLICT (uid, pid) DO NOTHING;
      `
    )

    //insert notifications
    await client.query(
      `
      INSERT INTO notification (nid, oid, text, date, is_read)
      VALUES (
      '00000000-0000-0000-0000-000000000301',
      '00000000-0000-0000-0000-000000000002',
      'Alex Chen applied to Community Garden Volunteer.',
      '2026-05-23',
      FALSE
      );
      `
    )
    console.log("inserted initial data")

    //verify insertion
    await client.query(
      `
      SELECT * FROM users;

      SELECT * FROM organization;

      SELECT * FROM position;

      SELECT * FROM application;

      SELECT * FROM user_saved_positions;

      SELECT * FROM user_applied_positions;

      SELECT * FROM notification;
      `
    )
    console.log("verified insertion")

    //commit all changes
    await client.query(`COMMIT`);
    console.log("committed changes")

    console.log('Database initialized successfully!');
  } catch (err) {
    //undo all changes if something fails
    try {
      await client.query(`ROLLBACK`);
    } catch (rollbackError) {
      console.error('Database rollback failed:', rollbackError);
    }
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { initDb };

if (require.main === module) {
  initDb()
    .catch((err) => {
      console.error('Database initialization failed:', err);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}