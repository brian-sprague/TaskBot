// index.js

/*  EXPRESS */

const { App } = require('@slack/bolt');
const express = require('express');
const app = express();
const bodyparser = require('body-parser');
const session = require('express-session');
const {google} = require('googleapis');
const { GoogleAuth } = require('google-auth-library');
const tasks = google.tasks('v1');
const homeUrl = (process.env._ && process.env._.indexOf("heroku") !== -1) ? "https://slack-task-bot-server.herokuapp.com" : "http://localhost:3000";
let http = require('http');
let fs = require('fs');
const axios = require('axios');
const dotenv = require('dotenv');
app.set('view engine', 'ejs');

dotenv.config();

app.use(session({
  resave: false,
  saveUninitialized: true,
  secret: 'SECRET' 
}));

app.get('/', function(req, res) {
  res.render('pages/auth');
});

const port = process.env.PORT || 3000;
app.listen(port , () => console.log('App listening on port ' + port));

// index.js

/*  PASSPORT SETUP  */

const passport = require('passport');
var userProfile;
var accessT;

app.use(bodyparser.json());
app.use(bodyparser.urlencoded({ extended: true }));

app.use(passport.initialize());
app.use(passport.session());

app.set('view engine', 'ejs');

app.get('/success', (req, res) => res.send("You're auth'd! Feel free to close this tab" + "   " + accessT));
app.get('/error', (req, res) => res.send("error logging in"));

passport.serializeUser(function(user, cb) {
  cb(null, user);
});

passport.deserializeUser(function(obj, cb) {
  cb(null, obj);
});

// index.js

/*  Google AUTH  */
 
const GoogleStrategy = require('passport-google-oauth').OAuth2Strategy;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
passport.use(new GoogleStrategy({
    clientID: GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
    callbackURL: homeUrl + "/auth/google/callback"
  },
  function(accessToken, refreshToken, profile, done) {
      userProfile=profile;
      accessT=accessToken;
      return done(null, userProfile);
  }
));

app.post('/auth', (req,res) => {
  let data = {
    response_type: 'in_channel',
    text: homeUrl
  };
  res.json(data);
});

function acknowledgeRequest(response, message) {
  let body = {
    response_type: 'in_channel',
    text: message !== undefined ? message : "Request received!"
  };
  response.json(body);
  response.send();
}

app.post('/create_task', async (req,res, next) => {
  let reqText = req.body.text;
  let hyphen = reqText.indexOf("-");
  let datesplit = reqText.indexOf("due");
  let title = reqText.substring(0, hyphen);
  let note = reqText.substring(hyphen+1, datesplit-1);
  let message = undefined;

  let date = reqText.substring(datesplit+4);
  let dateArray = date.split("-");
  if (dateArray[0] == date) {
    dateArray = date.split("/")
    if (dateArray[0] == date) {
      message = "Invalid date format detected. Use MM/DD/YYYY or MM-DD-YYYY."
    }
  }
  acknowledgeRequest(res, message);
  if (message != undefined) {
    return;
  }

  let dateObject = new Date(dateArray[2], dateArray[0] - 1, dateArray[1]);

  let requestBody= {
    "due": dateObject.toISOString(),
    "notes": note,
    "title": title
  }

  let defaultTaskListId = undefined;
  
  try{
    const gettasklists = {
      method: 'get',
      url: 'https://tasks.googleapis.com/tasks/v1/users/@me/lists',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + accessT
      }
    }
    let lists = await axios(gettasklists);
    let tasklists = lists.data.items;
    tasklists.forEach(function(taskList) {
    if(taskList.title == "My Tasks") {
        defaultTaskListId = taskList.id
      }
  });
    
    const config = {
      method: 'post',
      url: 'https://tasks.googleapis.com/tasks/v1/lists/' + defaultTaskListId + '/tasks',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + accessT
      },
      data:requestBody

    }
  let newTask = await axios(config)

  } catch(err) {
    next(err);
  }
});

app.post('/complete_task', async (req,res,next) => {
  
  let reqText = req.body.text;
  let defaultTaskListId = undefined;
  let message = undefined;
  const date = new Date();

  //RFC 3339 format
  const formattedDate = date.toISOString();
  
  try{
    const getLists = {
      method: 'get',
      url: 'https://tasks.googleapis.com/tasks/v1/users/@me/lists',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + accessT
        }
      }
    let lists = await axios(getLists);
    let tasklists = lists.data.items;
    tasklists.forEach(function(taskList) {
      if(taskList.title == "My Tasks") {
        defaultTaskListId = taskList.id
      }
    });

      const config = {
        method: 'get',
        url: 'https://tasks.googleapis.com/tasks/v1/lists/' + defaultTaskListId + '/tasks',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + accessT
        }
      };

      let taskToComplete = undefined;
      let query = await axios(config);
      let tasks = query.data.items;
      tasks.forEach(function(task) {
        if(task.title == reqText) {
          taskToComplete = task.id;
        }
      });
      let requestBody= {
        "id": taskToComplete,
        "deleted": true,
        "completed": formattedDate
      }
      console.log(defaultTaskListId);
      console.log(taskToComplete);
      const completeTask = {
        method: 'put',
        url: 'https://tasks.googleapis.com/tasks/v1/lists/' + defaultTaskListId + '/tasks/' + taskToComplete,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + accessT
        },
        data:requestBody
      }
      let completedTask = await axios(completeTask);
      console.log(completedTask.status);
      if(completedTask.status==200) {
        message = "completed task: " + reqText
      }
      let slackresponse = {
        response_type: 'in_channel',
        text: message
      };
      res.json(slackresponse);
    } catch(err) {
      next(err);
    }
  
});

app.post('/delete_task', async (req,res, next) => {

  let reqText = req.body.text;
  let defaultTaskListId = undefined;
  let message = undefined;
  
  try{
    const getLists = {
      method: 'get',
      url: 'https://tasks.googleapis.com/tasks/v1/users/@me/lists',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + accessT
        }
      }
    let lists = await axios(getLists);
    let tasklists = lists.data.items;
    tasklists.forEach(function(taskList) {
      if(taskList.title == "My Tasks") {
        defaultTaskListId = taskList.id
      }
    });

      const config = {
        method: 'get',
        url: 'https://tasks.googleapis.com/tasks/v1/lists/' + defaultTaskListId + '/tasks',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + accessT
        }
      };

      let taskToDelete = '';
      let query = await axios(config);
      let tasks = query.data.items;
      tasks.forEach(function(task) {
        if(task.title == reqText) {
          taskToDelete = task.id;
        }
      });

      const deleteTask = {
        method: 'delete',
        url: 'https://tasks.googleapis.com/tasks/v1/lists/' + defaultTaskListId + '/tasks/' + taskToDelete,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + accessT
        }
      }
      let deletedTask = await axios(deleteTask);
      console.log(deletedTask.status);
      if(deletedTask.status==204) {
        message = "deleted task: " + reqText
      }
    } catch(err) {
      next(err);
    }
    let data = {
      response_type: 'in_channel',
      text: message
    };
    res.json(data);
  });

app.post('/list_tasks', async (req,res, next) => {
    let reqText = req.body.text;
    let showComplete = reqText.indexOf('showComplete');
    let showHidden = reqText.indexOf('showHidden');
    let showDeleted = reqText.indexOf('showDeleted');
    let options = 'showComplete=' + showComplete === -1 ? 'false' : 'true' +
                  '&showHidden=' + showHidden === -1 ? 'false' : 'true' +
                  '&showDeleted=' + showDeleted === -1 ? 'false' : 'true';
    let plainText = "";
    try {
      let defaultTaskListId = undefined;  
        const getLists = {
          method: 'get',
          url: 'https://tasks.googleapis.com/tasks/v1/users/@me/lists',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + accessT
          }
      }
      let lists = await axios(getLists);
      let tasklists = lists.data.items;
      tasklists.forEach(function(taskList) {
        if(taskList.title == "My Tasks") {
          defaultTaskListId = taskList.id
        }
      });
      const config = {
        method: 'get',
        url: 'https://tasks.googleapis.com/tasks/v1/lists/' + defaultTaskListId + '/tasks?' + options,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + accessT
        }
      };
  
      let query = await axios(config);
      console.log(query.data);
      let tasks = query.data.items;
      if (tasks.length >= 0){
        let i = 1;
        plainText = "These are your tasks:\n\n";
        tasks.forEach(function(task){
          plainText += i + '. ' + task.title + '\n\tDue by: ' + task.due + '\n\n';
          i++;
        });
      }
    } catch(err) {
      plainText = err;
      next(err);
    }
    let data = {
      response_type: 'in_channel',
      text: plainText
    };
    res.json(data);
});
 

app.get('/auth/google', 
  passport.authenticate('google', { scope : ['profile', 'email', 'https://www.googleapis.com/auth/tasks', 'https://www.googleapis.com/auth/tasks.readonly'] }));

 
app.get('/auth/google/callback', 
  passport.authenticate('google', { failureRedirect: '/error' }),
  function(req, res) {
    // Successful authentication, redirect success.
    res.redirect('/success');
  });
