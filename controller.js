const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const nodemailer = require('nodemailer')

const db = require("./db"); // Import db from app.js

const errorCodes = {
  'E_SP1': 400, // Duplicate parameters in payload structure
  'E_SP2': 400, // Key issues in payload structure
  'E_AU1': 401, // Invalid/valid user authentication error
  'E_AU2': 401, // User credentials incorrect
  'E_AU3': 403, // User disabled/enabled check failure
  'E_AR1': 403, // Invalid permission in access rights
  'E_TE1': 500, // Cannot connect to the database (transaction error)
  'E_TE2': 400, // Wrong SQL fields (transaction error)
  'E_TE3': 400, // Invalid Task State
  'E_TE4': 500  // All other database error
};


const validateKeys = (obj, expectedKeys) => {
  const keys = Object.keys(obj);
  const extraKeys = keys.filter(key => !expectedKeys.includes(key));
  if (extraKeys.length > 0) {
    throw new Error("E_SP2"); // E_SP2: Duplicate parameters or key issues
  }
};

// Helper function to fetch users in a specific group
const fetchUsersInGroup = async (groupName) => {
  try {
    const [results] = await db.query(
      "SELECT username FROM usergroup WHERE group_name = ?",
      [groupName]
    );
    return results.map((row) => row.username);
  } catch (err) {
    console.error("Error fetching users in group:", err);
    throw new Error("Server error");
  }
};

const getUserEmail = async (username) => {
  try {
    const [results] = await db.query(
      "SELECT email FROM user WHERE username = ?",
      [username]
    );
    return results.length > 0 ? results[0].email : null;
  } catch (err) {
    console.error("Error fetching user details:", err);
    throw new Error("Server error");
  }
};

const transporter = nodemailer.createTransport({
  service: 'Gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

const sendTaskNotification = async (taskId, taskName, groupName) => {
  try {
    const usersInGroup = await fetchUsersInGroup(groupName);

    // Fetch emails for each user
    const emailPromises = usersInGroup.map(async (user) => {
      if (user === '-') {
        // Skip if the username is "-"
        return null;
      }

      const email = await getUserEmail(user);
      if (email) {
        const mailOptions = {
          from: process.env.EMAIL_USER,
          to: email,
          subject: 'Task Completed Notification',
          html: `Dear ${user}, 
          <br><br> 
          The task "<strong>${taskName}</strong>" has been marked as done. Please review the task.
          <br><br>
          Click <a href="http://localhost:${process.env.LOCALHOST_PORT}/">here</a> to login.
          <br><br>
          Best regards,
          <br>
          Digital Academy`

        };
        return transporter.sendMail(mailOptions);
      }
    });

    // Filter out null values before sending all emails
    const validEmailPromises = (await Promise.all(emailPromises)).filter(Boolean);

    await Promise.all(validEmailPromises);
    console.log('Notifications sent successfully');
  } catch (error) {
    console.error('Error sending notifications:', error);
  }
};


// Controller Function to create a new task
const CreateTask = async (req, res) => {
  let connection;
  let description = ""
  try {

    const { username, password, app_acronym, task_name, task_description } = req.body;

    // Check for missing or case sensitive parameters
    if (!username || !app_acronym || !password || !task_name) {
      throw new Error("E_SP1");
    }

    if (task_name.trim().length <= 0) {
      throw new Error("E_TE2");
    }

    if (!task_description) {
      description = ""
    }

    // Expected keys validation || checking for additional parameters in the payload
    validateKeys(req.body, ["username", "password", "app_acronym", "task_name", "task_description"]);

    const usernameLower = username.toString().toLowerCase();
    const acronymLower = app_acronym.toString().toLowerCase();
    const tasknameLower = task_name.toString().toLowerCase();

    // User Authentication
    const connection = await db.getConnection();
    const [userResult] = await connection.query("SELECT * FROM user WHERE username = ?", [usernameLower]);
    if (userResult.length === 0) {
      throw new Error("E_AU1");
    }

    const user = userResult[0];

    // Check if the user password is valid
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new Error("E_AU2");
    }

    // Check if the user is disabled
    if (user.disabled === 1) {
      throw new Error("E_AU3");
    }

    // Retrieve the application object with acronym
    const [appResult] = await connection.query("SELECT * FROM application WHERE app_acronym = ?", [acronymLower]);
    if (appResult.length === 0) {
      throw new Error("E_TE2");
    }

    const app = appResult[0];
    const groupPermitCreate = app.app_permit_create;

    // Check user access rights
    const [groupResult] = await connection.query(
      "SELECT 1 FROM usergroup WHERE username = ? AND group_name = ?",
      [usernameLower, groupPermitCreate]
    );
    if (groupResult.length === 0) {
      throw new Error("E_AR1");
    }

    // Begin Transaction
    await connection.beginTransaction();

    const newRNumber = app.app_rnumber + 1;
    await connection.query(
      "UPDATE application SET app_rnumber = ? WHERE app_acronym = ?",
      [newRNumber, acronymLower]
    );

    const task_id = `${acronymLower}_${newRNumber}`;
    const currentDate = new Date();
    currentDate.setSeconds(currentDate.getSeconds() + 1);
    const formattedDate = currentDate.getFullYear() + '-' +
      ('0' + (currentDate.getMonth() + 1)).slice(-2) + '-' +
      ('0' + currentDate.getDate()).slice(-2) + ' ' +
      ('0' + currentDate.getHours()).slice(-2) + ':' +
      ('0' + currentDate.getMinutes()).slice(-2) + ':' +
      ('0' + currentDate.getSeconds()).slice(-2);

    await connection.query(
      "INSERT INTO task (task_id, task_name, task_description, task_plan, task_app_acronym, task_state, task_creator, task_owner, task_createDate) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [task_id, tasknameLower, description, null, acronymLower, 'open', usernameLower, usernameLower, formattedDate]
    );

    const initialNote = `User ${usernameLower} has created the task.`;
    const auditTrail = JSON.stringify([{ user: usernameLower, state: 'open', date: formattedDate, message: initialNote, type: "system" }]);

    await connection.query(
      "INSERT INTO tasknote (task_id, tasknote_created, notes) VALUES (?, ?, ?)",
      [task_id, formattedDate, auditTrail]
    );

    await connection.commit();
    res.status(201).json({ code: "S_001", task_id: task_id });
  } catch (error) {
    console.log(error);
    if (connection) await connection.rollback();

    // Check if the error message corresponds to a defined error code
    const statusCode = errorCodes[error.message] || 500;
    const errorCode = error.message in errorCodes ? error.message : 'E_TE4';

    // Handle specific MySQL error codes with custom logic
    if (error.code === 'ER_BAD_DB_ERROR' ||
      error.code === 'ER_ACCESS_DENIED_ERROR' ||
      error.code === 'ECONNREFUSED' ||
      error.code === 'ER_NO_DB_ERROR') {
      res.status(500).json({ code: "E_TE1" });
    } else if (error.code === "ER_DATA_TOO_LONG") {
      res.status(400).json({ code: "E_TE2" });
    } else {
      // Use the statusCode and errorCode derived from the errorCodes dictionary
      res.status(statusCode).json({ code: errorCode });
    }
  } finally {
    if (connection) connection.release();
  }
};

const GetTaskbyState = async (req, res) => {
  let connection;
  try {

    const { username, password, task_state } = req.body;
    const validStates = ["open", "todo", "doing", "done", "closed"];

    if (!username || !password || !task_state) {
      throw new Error("E_SP1");
    }

    // Expected keys validation
    validateKeys(req.body, ["username", "password", "task_state"]);

    const usernameLower = username.toLowerCase();
    const stateLower = task_state.toLowerCase();

    if (stateLower.trim().length <= 0 || !validStates.includes(stateLower)) {
      throw new Error("E_TE2");
    }

    const connection = await db.getConnection();
    const [userResult] = await connection.query("SELECT * FROM user WHERE username = ?", [usernameLower]);
    if (userResult.length === 0) {
      throw new Error("E_AU1");
    }

    const user = userResult[0];

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new Error("E_AU2");
    }

    if (user.disabled === 1) {
      throw new Error("E_AU3");
    }

    const [taskResult] = await connection.query("SELECT * FROM task WHERE task_state = ?", [stateLower]);

    if (taskResult) {
      res.status(200).json({ tasks: taskResult, code: "S_001" });
    } else {
      throw new Error("E_TE4")
    }

  } catch (error) {
    console.log(error);
    if (connection) await connection.rollback();

    // Check if the error message corresponds to a defined error code
    const statusCode = errorCodes[error.message] || 500;
    const errorCode = error.message in errorCodes ? error.message : 'E_TE4';

    // Handle specific MySQL error codes with custom logic
    if (error.code === 'ER_BAD_DB_ERROR' ||
      error.code === 'ER_ACCESS_DENIED_ERROR' ||
      error.code === 'ECONNREFUSED' ||
      error.code === 'ER_NO_DB_ERROR') {
      res.status(500).json({ code: "E_TE1" });
    } else if (error.code === "ER_DATA_TOO_LONG") {
      res.status(400).json({ code: "E_TE2" });
    } else {
      // Use the statusCode and errorCode derived from the errorCodes dictionary
      res.status(statusCode).json({ code: errorCode });
    }
  } finally {
    if (connection) connection.release();
  }
};

const PromoteTask2Done = async (req, res) => {
  let connection;
  try {
    const { username, password, task_id, note } = req.body;
    const newState = "done";
    const validStates = ["open", "todo", "doing", "done", "closed"];

    if (!username || !password || !task_id) {
      throw new Error("E_SP1");
    }

    // Expected keys validation
    validateKeys(req.body, ["username", "password", "task_id", "note"]);

    const usernameLower = username.toString().toLowerCase();

    const connection = await db.getConnection();
    // Begin Transaction
    await connection.beginTransaction();

    const [userResult] = await connection.query("SELECT * FROM user WHERE username = ?", [usernameLower]);
    if (userResult.length === 0) {
      throw new Error("E_AU1");
    }

    const user = userResult[0];

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new Error("E_AU2");
    }

    if (user.disabled === 1) {
      throw new Error("E_AU3");
    }

    const [taskResult] = await connection.query("SELECT * FROM task WHERE task_id = ?", [task_id]);
    if (taskResult.length === 0) {
      throw new Error("E_TE2");
    }

    const task = taskResult[0];
    if (!validStates.includes(task.task_state) || task.task_state !== "doing") {
      throw new Error("E_TE3");
    }

    // retrieve app acronym 
    const [appResult] = await connection.query('SELECT task_app_acronym FROM task WHERE task_id = ?', [task_id]);
    const appAcronym = appResult[0].task_app_acronym

    // retrieve permit group for permit done
    const [permitGroupResult] = await connection.query('SELECT app_permit_done FROM application WHERE app_acronym = ?', [appAcronym]);
    const permitGroup = permitGroupResult[0].app_permit_done

    // retrieve user current group(s)
    const [userGroupResult] = await connection.query('SELECT group_name FROM usergroup WHERE username = ?', [user.username])
    const userGroup = userGroupResult[0].group_name

    console.log("GroupName: " + userGroup)

    if (userGroup !== permitGroup) {
      throw new Error("E_AR1")
    }


    const [updateResult] = await connection.query("UPDATE task SET task_state = ? WHERE task_id = ?", [newState, task_id]);
    if (updateResult.affectedRows > 0) {

      // Get the current date and time in local format
      const currentDate = new Date();
      const formattedDate = currentDate.getFullYear() + '-' +
        ('0' + (currentDate.getMonth() + 1)).slice(-2) + '-' +
        ('0' + currentDate.getDate()).slice(-2) + ' ' +
        ('0' + currentDate.getHours()).slice(-2) + ':' +
        ('0' + currentDate.getMinutes()).slice(-2) + ':' +
        ('0' + currentDate.getSeconds()).slice(-2);

      const stateChangeMessage = `Task submitted by ${usernameLower}`

      await connection.query(
        'INSERT INTO tasknote (task_id, tasknote_created, notes) VALUES (?, ?, ?)',
        [task_id, formattedDate, JSON.stringify([{ user: usernameLower, state: "done", date: formattedDate, message: stateChangeMessage, type: "system" }])]
      );

      if (note) {
        currentDate.setSeconds(currentDate.getSeconds() + 1);
        const formattedDate2 = currentDate.getFullYear() + '-' +
          ('0' + (currentDate.getMonth() + 1)).slice(-2) + '-' +
          ('0' + currentDate.getDate()).slice(-2) + ' ' +
          ('0' + currentDate.getHours()).slice(-2) + ':' +
          ('0' + currentDate.getMinutes()).slice(-2) + ':' +
          ('0' + currentDate.getSeconds()).slice(-2);

        await connection.query(
          'INSERT INTO tasknote (task_id, tasknote_created, notes) VALUES (?, ?, ?)',
          [task_id, formattedDate2, JSON.stringify([{ user: usernameLower, state: "done", date: formattedDate2, message: note, type: "user" }])]
        );
      }

      await connection.commit(); // Commit the transaction if successful

      await sendTaskNotification(task_id, task.task_name, permitGroup);

      res.status(200).json({ code: "S_001" });
    }
  } catch (error) {
    console.log(error);
    if (connection) await connection.rollback();

    // Check if the error message corresponds to a defined error code
    const statusCode = errorCodes[error.message] || 500;
    const errorCode = error.message in errorCodes ? error.message : 'E_TE4';

    // Handle specific MySQL error codes with custom logic
    if (error.code === 'ER_BAD_DB_ERROR' ||
      error.code === 'ER_ACCESS_DENIED_ERROR' ||
      error.code === 'ECONNREFUSED' ||
      error.code === 'ER_NO_DB_ERROR') {
      res.status(500).json({ code: "E_TE1" });
    } else if (error.code === "ER_DATA_TOO_LONG") {
      res.status(400).json({ code: "E_TE2" });
    } else {
      // Use the statusCode and errorCode derived from the errorCodes dictionary
      res.status(statusCode).json({ code: errorCode });
    }
  } finally {
    if (connection) connection.release();
  }
};


// Route Declaration
router.post("/CreateTask", CreateTask);
router.post("/GetTaskbyState", GetTaskbyState);
router.patch("/PromoteTask2Done", PromoteTask2Done);

module.exports = router;
