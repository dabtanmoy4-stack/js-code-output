const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

app.get("/", (req, res) => {
  res.send("JS CODE OUTPUT Terminal Server is running!");
});

io.on("connection", (socket) => {
  console.log("Terminal client connected");

  socket.emit("terminal:data", {
    type: "output",
    data: "Welcome to JS CODE OUTPUT Terminal\r\n"
  });

  socket.on("terminal:input", (data) => {
    console.log("Terminal input:", data);
  });

  socket.on("disconnect", () => {
    console.log("Terminal client disconnected");
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Terminal server running on port ${PORT}`);
});
