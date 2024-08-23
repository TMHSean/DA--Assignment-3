const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
require("dotenv").config();

const db = require("./db");
const taskController = require("./controller");

const app = express();
const PORT = process.env.PORT || 3000;

const corsOptions = {
  origin: `http://localhost:${process.env.LOCALHOST_PORT}`, // Replace with your SvelteKit frontend URL
  methods: "GET,POST,PUT,DELETE",
  allowedHeaders: "Content-Type,Authorization",
};

app.use(cors(corsOptions));
app.use(bodyParser.json());

// Define allowed paths
const allowedPaths = ["/CreateTask", "/GetTaskbyState", "/PromoteTask2Done"];

// Middleware to check if req.path is allowed
app.use((req, res, next) => {
  if (!allowedPaths.includes(req.path)) {
    return res.status(404).json({ code: "E_VU1" });
  }
  next(); // Continue to the next middleware or route handler
});

app.use("/", taskController);

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
