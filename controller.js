const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");

const db = require("./db"); // Import db from app.js


// Controller Function to create a new task
const CreateTask = async (req, res) => {
  const { username, password, acronym, taskname, description } = req.body;

  const validParams = ["username", "password", "acronym", "taskname", "description"]



  // URL Validation
  if (req.originalUrl !== "/CreateTask") {
    return res.status(400).json({ code: "VU_1" });
  }

  // Payload Structure Validation
  if (!username || !acronym || !password || !taskname) {
    return res.status(400).json({ code: "SP_2" });
  }

  const usernameLower = username.toLowerCase();
  const acronymLower = acronym.toLowerCase();
  const tasknameLower = taskname.toLowerCase();

  let connection;
  try {

    // User Authentication
    connection = await db.getConnection();
    const [userResult] = await connection.query("SELECT * FROM user WHERE username = ?", [usernameLower]);
    if (userResult.length === 0) {
      return res.status(401).json({ code: "AU_1" });
    }

    const user = userResult[0];

    // to check if user password is valid 
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ code: "AU_2" });
    }

    // to check if the user is disabled
    if (user.disabled === 1) {
      return res.status(403).json({ code: "AU_3" });
    }

    // Retrieve the application object with acronym
    const [appResult] = await connection.query("SELECT * FROM application WHERE app_acronym = ?", [acronymLower]);
    if (appResult.length === 0) {
      return res.status(404).json({ code: "TE_2" });
    }

    const app = appResult[0]

    // declare the group that have app permit create permissions
    const groupPermitCreate = app.app_permit_create;

    // Check user access rights
    const [groupResult] = await connection.query(
      "SELECT 1 FROM usergroup WHERE username = ? AND group_name = ?",
      [usernameLower, groupPermitCreate]
    );

    if (groupResult.length === 0) {
      return res.status(403).json({ code: "AR_1" });
    }

    // Begin Transaction
    await connection.beginTransaction();

    const rNumber = app.app_rnumber;

    const newRNumber = rNumber + 1;

    await connection.query(
      "UPDATE application SET app_rnumber = ? WHERE app_acronym = ?",
      [newRNumber, acronymLower]
    );

    // Create task_id
    const taskId = `${acronymLower}_${newRNumber}`;

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
      [taskId, tasknameLower, description, null, acronymLower, 'open', usernameLower, usernameLower, formattedDate]
    );

    // Create initial audit trail entry
    const initialNote = `User ${usernameLower} has created the task.`;
    const messageInitiator = "system";
    const auditTrail = JSON.stringify([{ user: usernameLower, state: 'open', date: formattedDate, message: initialNote, type: messageInitiator }]);
    await connection.query(
      "INSERT INTO tasknote (task_id, tasknote_created, notes) VALUES (?, ?, ?)",
      [taskId, formattedDate, auditTrail]
    );

    // Commit Transaction
    await connection.commit();
    res.status(201).json({ message: "Task created successfully" }); // remove message
  } catch (error) {
    if (connection) await connection.rollback();
    console.error("Transaction Error:", error.message);
    res.status(500).json({ code: "TE_1" });
  } finally {
    if (connection) connection.release();
  }
};


const GetTaskbyState = async (req, res) => {
  const { username, password, state } = req.body;

  // Define valid states
  const validStates = ["open", "todo", "doing", "done", "closed"];

  // Payload Structure Validation
  if (!username || !password) {
    return res.status(400).json({ code: "SP_2" });
  }

  const usernameLower = username.toLowerCase();

  // Validate state
  if (!validStates.includes(state)) {
    return res.status(400).json({ code: "VS_1" }); // Use appropriate error code
  }

  let connection;
  try {
    // Get a database connection
    connection = await db.getConnection();

    const [userResult] = await connection.query("SELECT * FROM user WHERE username = ?", [usernameLower]);
    if (userResult.length === 0) {
      return res.status(401).json({ code: "AU_1" });
    }

    const user = userResult[0];

    // to check if user password is valid 
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ code: "AU_2" });
    }

    // to check if the user is disabled
    if (user.disabled === 1) {
      return res.status(403).json({ code: "AU_3" });
    }

    // Query to get tasks by state
    const [taskResult] = await connection.query("SELECT * FROM task WHERE task_state = ?", [state]);

    // Send the result
    res.status(200).json(taskResult);

  } catch (error) {
    console.error("Error fetching tasks by state:", error.message);
    res.status(500).json({ code: "TE_1" }); // Use appropriate error code
  } finally {
    if (connection) connection.release();
  }
};


const PromoteTask2Done = async (req, res) => {
  const { username, password, taskid, newState } = req.body;

  // Payload Structure Validation
  if (!username || !password || !taskid || !newState) {
    return res.status(400).json({ code: "SP_2" });
  }

  const usernameLower = username.toLowerCase();

  let connection;
  try {
    // Get a database connection
    connection = await db.getConnection();

    // Check if the user exists
    const [userResult] = await connection.query("SELECT * FROM user WHERE username = ?", [usernameLower]);
    if (userResult.length === 0) {
      return res.status(401).json({ code: "AU_1" });
    }

    const user = userResult[0];

    // Check if the user password is valid
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ code: "AU_2" });
    }

    // Check if the user is disabled
    if (user.disabled === 1) {
      return res.status(403).json({ code: "AU_3" });
    }

    // Check if the task exists
    const [taskResult] = await connection.query("SELECT * FROM task WHERE task_id = ?", [taskid]);
    if (taskResult.length === 0) {
      return res.status(404).json({ code: "TE_2" }); // Changed to 404 as task not found
    }

    const task = taskResult[0];
    const currentTaskState = task.task_state;

    // Validate if the state transition is allowed
    if (currentTaskState !== "doing" || newState !== "done") {
      return res.status(400).json({ code: "TE_3" });
    }

    // Update the task state
    const [updateResult] = await connection.query("UPDATE task SET task_state = ? WHERE task_id = ?", [newState, taskid]);

    if (updateResult.affectedRows > 0) {
      return res.status(200).json({ message: "Task updated successfully" });
    } else {
      return res.status(500).json({ code: "TE_4" }); // Custom code for unexpected error
    }

  } catch (error) {
    console.error("Error updating task state:", error.message);
    res.status(500).json({ code: "TE_1" }); // General transaction error code
  } finally {
    if (connection) connection.release();
  }
}



// Route Declaration
router.post("/CreateTask", CreateTask);
router.post("/GetTaskbyState", GetTaskbyState);
router.put("/PromoteTask2Done", PromoteTask2Done);

module.exports = router;