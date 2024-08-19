const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");

const db = require("./db"); // Import db from app.js


// Controller Function to create a new task
const CreateTask = async (req, res) => {
  const { username, password, acronym, taskname, description } = req.body;

  // URL Validation
  if (req.originalUrl !== "/CreateTask") {
    return res.status(400).json({ code: "VU1" });
  }

  // Payload Structure Validation
  if (!username || !acronym || !password || !taskname) {
    return res.status(400).json({ code: "SP2" });
  }

  let connection;
  try {

    // User Authentication
    connection = await db.getConnection();
    const [userResult] = await connection.query("SELECT * FROM user WHERE username = ?", [username]);
    if (userResult.length === 0) {
      return res.status(401).json({ code: "AU1" });
    }

    const user = userResult[0];

    // to check if user password is valid 
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ code: "AU2" });
    }

    // to check if the user is disabled
    if (user.disabled === 1) {
      return res.status(403).json({ code: "AU3" });
    }

    // Retrieve the application object with acronym
    const [appResult] = await connection.query("SELECT * FROM application WHERE app_acronym = ?", [acronym]);
    if (appResult.length === 0) {
      return res.status(401).json({ code: "TE2" });
    }

    const app = appResult[0]

    // declare the group that have app permit create permissions
    const groupPermitCreate = app.app_permit_create;

    // Check user access rights
    const [groupResult] = await connection.query(
      "SELECT 1 FROM usergroup WHERE username = ? AND group_name = ?",
      [username, groupPermitCreate]
    );

    console.log(groupResult)
    if (groupResult.length === 0) {
      return res.status(403).json({ code: "AR1" });
    }

    // Begin Transaction
    await connection.beginTransaction();

    const rNumber = app.app_rnumber;

    const newRNumber = rNumber + 1;

    await connection.query(
      "UPDATE application SET app_rnumber = ? WHERE app_acronym = ?",
      [newRNumber, acronym]
    );

    // Create task_id
    const taskId = `${acronym}_${newRNumber}`;

    // Get the current date and time in local format
    const currentDate = new Date();
    const formattedDate = currentDate.getFullYear() + '-' +
      ('0' + (currentDate.getMonth() + 1)).slice(-2) + '-' +
      ('0' + currentDate.getDate()).slice(-2) + ' ' +
      ('0' + currentDate.getHours()).slice(-2) + ':' +
      ('0' + currentDate.getMinutes()).slice(-2) + ':' +
      ('0' + currentDate.getSeconds()).slice(-2);

    const taskPlan = null;

    // Insert new task
    await connection.query(
      "INSERT INTO task (task_id, task_name, task_description, task_plan, task_app_acronym, task_state, task_creator, task_owner, task_createDate) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [taskId, taskname, description, null, acronym, 'open', username, username, formattedDate]
    );

    // Create initial audit trail entry
    const initialNote = `User ${username} has created the task.`;
    const messageInitiator = "system";
    const auditTrail = JSON.stringify([{ user: username, state: 'open', date: formattedDate, message: initialNote, type: messageInitiator }]);
    await connection.query(
      "INSERT INTO tasknote (task_id, tasknote_created, notes) VALUES (?, ?, ?)",
      [taskId, formattedDate, auditTrail]
    );

    // Commit Transaction
    await connection.commit();
    res.status(201).json({ message: "Task created successfully" });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error("Transaction Error:", error.message);
    res.status(500).json({ code: "TE1" });
  } finally {
    if (connection) connection.release();
  }
};

// Route Declaration
router.post("/CreateTask", CreateTask);

module.exports = router;