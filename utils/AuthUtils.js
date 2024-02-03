const validator = require("validator");

const cleanupAndValidate = ({ name, email, username, password }) => {
    return new Promise((resolve, reject) => {
        if(!name || !email || !username || !password){
            reject("Missing credentials");
        }

        if(typeof name !== "string") reject("Datatype of name is wrong");
        if(typeof email !== "string") reject("Datatype of email is wrong");
        if(typeof username !== "string") reject("Datatype of username is wrong");
        if(typeof password !== "string") reject("Datatype of password is wrong");
   
       if(username.length <=2 || username.length > 20) 
           reject("username length should be 3-20")
   
        if(password.length <= 2 || password.length > 20 )
           reject("password length should be 3-20")
           
        if(!validator.isEmail(email)) {
            reject("Email format is wrong");
        }

        resolve();
    });
};

module.exports = { cleanupAndValidate };