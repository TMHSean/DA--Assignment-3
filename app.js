const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors"); // Ensure cors is required
require("dotenv").config();

const db = require("./db")

const taskController = require("./controller");

const app = express();
const PORT = process.env.PORT || 3000;

const corsOptions = {
  origin: `http://localhost:${process.env.LOCALHOST_PORT}`, // Replace with your SvelteKit frontend URL
  methods: "GET,POST,PUT,DELETE",
  allowedHeaders: "Content-Type,Authorization",
};

app.use(cors(corsOptions)); // Use the cors middleware
app.use(bodyParser.json());

app.use("/", taskController); // Prefix your routes with /api

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// Check the initial connection
(async () => {
  try {
    // Perform a simple query to check the connection
    const [rows] = await db.query("SELECT 1");
    console.log("Database connection is working.");
  } catch (err) {
    console.error("Error connecting to the database:", err);
    process.exit(1);
  }
})();

// Export db for use in other files
module.exports = { db };