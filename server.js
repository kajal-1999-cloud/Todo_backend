const express = require("express");
require("dotenv").config();
const clc = require("cli-color");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const validator = require("validator");
const session = require("express-session");
const mongoDbSession = require("connect-mongodb-session")(session);

const { cleanupAndValidate } = require("./utils/AuthUtils");
const todoModel = require("./models/todoModel");
const userModel = require("./models/userModel");
const isAuth = require("./middleware/isAuth");
const rateLimiting = require("./middleware/ratelimiting");

const app = express();
const PORT = process.env.PORT || 8000;
const store = new mongoDbSession({
  uri: process.env.MONGO_URI,
  collection: "sessions",
});

// middlewares
app.set("view engine", "ejs");
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: process.env.SECRET_KEY,
    resave: false,
    saveUninitialized: false,
    store: store,
  })
);
app.use(express.static("public"));
// DB connection
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log(clc.blue("mongodb connected successfully"));
  })
  .catch((err) => {
    console.log(clc.magneta(err));
  });

app.get("/", (req, res) => {
  console.log(`http://localhost:${PORT}/register`);
  return res.send("server is running");
});

// rendering register file from views folder;
app.get("/register", (req, res) => {
  return res.render("register");
});

// registration api
app.post("/register", async (req, res) => {
  const { name, email, username, password } = req.body;
  // console.log('http://localhost:8000/register')

  try {
    await cleanupAndValidate({ name, email, username, password });
  } catch (error) {
    return res.send({
      status: 400,
      message: "Data error",
      error: error,
    });
  }

  const userEmailsExist = await userModel.findOne({ email: email });

  if (userEmailsExist) {
    return res.send({
      status: 400,
      message: "Email already exist",
    });
  }

  const userUsernameExist = await userModel.findOne({ username });

  if (userUsernameExist) {
    return res.send({
      status: 400,
      message: "Username already exist",
    });
  }
  // hashing the password
  const hashedPassword = await bcrypt.hash(
    password,
    parseInt(process.env.SALT)
  );

  // store data in db
  const userObj = new userModel({
    name: name,
    email: email,
    username: username,
    password: hashedPassword,
  });
  try {
    const userDb = await userObj.save();

    return res.redirect("/login");
  } catch (error) {
    return res.send({
      status: 500,
      message: "Data base error",
      error: error,
    });
  }
});

app.get("/login", (req, res) => {
  return res.render("login");
});

app.post("/login", async (req, res) => {
  const { loginId, password } = req.body;

  try {
    let userDb;
    if (validator.isEmail(loginId)) {
      userDb = await userModel.findOne({ email: loginId });

      if (!userDb) {
        return res.send({
          status: 400,
          message: "Email not found",
        });
      }
    } else {
      userDb = await userModel({ username: loginId });
      if (!userDb) {
        return res.send({
          status: 400,
          message: "username not found",
        });
      }
    }
    // comparing password
    const isMatched = await bcrypt.compare(password, userDb.password);

    if (!isMatched) {
      return res.send({
        status: 400,
        message: "Password incoorect",
      });
    }

    // session base auth
    console.log(req.session);
    req.session.isAuth = true;
    console.log(req.session);
    req.session.user = {
      email: userDb.email,
      username: userDb.username,
      userId: userDb._id,
    };

    return res.redirect("/dashboard");
  } catch (err) {
    console.log(err);
    return res.send({
      status: 500,
      message: "Database error",
      error: err,
    });
  }
});

app.get("/dashboard", isAuth, async (req, res) => {
  return res.render("dashboard");
});

app.post("/logout", isAuth, (req, res) => {
  console.log(req.session.id);
  req.session.destroy((err) => {
    if (err) {
      console.log(err);
      return res.send({
        status: 500,
        message: "logout unseccessful",
        error: err,
      });
    }
    return res.redirect("login");
  });
});

app.post("/logout_from_all_devices", isAuth, async (req, res) => {
  const username = req.session.user.username;

  const sessionSchema = new mongoose.Schema({ _id: String }, { strict: false });
  const sessionModel = mongoose.model("session", sessionSchema);
  try {
    const deleteDb = await sessionModel.deleteMany({
      "session.user.username": username,
    });

    return res.send({
      status: 200,
      message: "logout successfull from all devices",
      data: deleteDb,
    });
  } catch (error) {
    return res.send({
      status: 500,
      message: "Database error",
      error: err,
    });
  }
});

// To-do CRUD Operations

app.post("/create-item", isAuth, rateLimiting, async (req, res) => {
  const todoText = req.body.todo;
  const username = req.session.user.username;
  console.log(todoText);
  if (!todoText) {
    return res.send({
      status: 400,
      message: "Missing todo text",
    });
  } else if (typeof todoText !== "string") {
    return res.send({
      status: 400,
      message: "Todo text is not a string",
    });
  } else if (todoText.length < 3 || todoText.length > 100) {
    return res.send({
      status: 400,
      message: "Todo text is not a string",
    });
  }

  //  create a todo in DB
  const todoObj = new todoModel({
    // schema : client
    todo: todoText,
    username: username,
  });

  try {
    todoDb = await todoObj.save();

    return res.send({
      status: 201,
      message: "Todo created successfully",
      data: todoDb,
    });
  } catch (err) {
    return res.send({
      status: 500,
      message: "Database error",
      error: error,
    });
  }
});

app.post("/edit-item", isAuth, rateLimiting, async (req, res) => {
  const { id, newData } = req.body;
  const username = req.session.user.username;

  if (!newData) {
    return res.send({
      status: 400,
      message: "Missing credentials",
    });
  }

  //  check the ownerShip
  // find todo by id

  try {
    const todoDb = await todoModel.findOne({ _id: id });

    if (!todoDb) {
      return res.send({
        status: 400,
        message: "Todo not found",
      });
    }

    // console.log(todoDb);
    if (username !== todoDb.username) {
      return res.send({
        status: 403,
        message: "Not allowed to edit, authorisation failed",
      });
    }

    const todoPrev = await todoModel.findOneAndUpdate(
      { _id: id },
      { todo: newData }
    );
    console.log(todoPrev);
    return res.send({
      status: 200,
      message: "Todo updated successfully",
      data: todoPrev,
    });
  } catch (error) {
    return res.send({
      status: 500,
      message: "Database error",
      error: error,
    });
  }
});

app.post("/delete-item", isAuth, rateLimiting, async (req, res) => {
  const id = req.body.id;
  // console.log(req.session);
  const username = req.session.user.username;

  if (!id) {
    return res.send({
      status: 400,
      message: " Missing credentials",
    });
  }

  //  find the todo with id
  try {
    const todoDb = await todoModel.findOne({ _id: id });

    if (!todoDb) {
      return res.send({
        status: 400,
        message: "Todo not found",
      });
    }

    if(username !== todoDb.username){
      return res.send({
        status: 403,
        message: "Not allowed to delete, authorisation failed",
      });
    }

    const todoPrev = await todoModel.findOneAndDelete({ _id: id });
    console.log(todoPrev);
    return res.send({
      status: 200,
      message: "Todo deleted successfully",
      data: todoPrev,
    });


  } catch (error) {
    return res.send({
      status: 500,
      message: "Database error",
      error: error,
    });
  }
});

app.get("/read-item", isAuth, async (req, res) => {
  const username = req.session.user.username;

  try{
    const todoDbs = await todoModel.find(( username ));

    console.log(todoDbs);
    return res.send({
      status: 200,
      message: "Read success",
      data: todoDbs,
    });

  }catch (error) {
    return res.send({
      status: 500,
      message: "Database error",
      error: error,
    });
  }
});


//  pagination_dashboard

app.get("/pagination_dashboard", isAuth, async (req, res) => {

  const SKIP = req.query.skip || 0;
  const LIMIT = 5;
  const username = req.session.user.username;

  try{
    const todos = await todoModel.aggregate([
      {
        $match: { username: username },

      },
      {
        $facet: {
          data: [
            { $skip: parseInt(SKIP)},
            { $limit: LIMIT }
          ],
        },
      },
    ]);
    console.log(todos[0].data);
    return res.send({
      status: 200,
      message: "Read success",
      data: todos[0].data,
    });
  } catch (error) {
    return res.send({
      status: 500,
      message: "Database error",
      error: error,
    });
  }
});

app.listen(PORT, () => {
  console.log(clc.yellowBright.underline(`http://localhost:${PORT}`));
});
