const accessModel = require("../models/accessModel");

const rateLimiting = async (req, res, next) => {
  const sessionId = req.session.id;

  // check if this is the req for the first time or not

  try {
    const accessDb = await accessModel.findOne({ sessionId: sessionId });
    console.log(accessDb);
    // first request, create an entry in the db
    if (!accessDb) {
      const accessObj = new accessModel({
        sessionId: sessionId,
        time: Date.now(),
      });

      await accessObj.save();
      next();
      return;
    }

    console.log((Date.now() - accessDb.time) / (1000 * 60));
    const diff = (Date.now() - accessDb.time) / 1000;

    if (diff < 1) {
      return res.send({
        status: 400,
        message: "Too many request, please wait for some time",
      });
    }

    // update the Time
    (await accessModel.findOneAndUpdate) *
      ({ sessionId: sessionId }, { time: Date.now() });
    next();
  } catch (err) {
    return res.send({
      status: 500,
      message: "Database error",
      error: error,
    });
  }
};

module.exports = rateLimiting ;