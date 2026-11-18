import express from "express";
import cors from "cors";
import { MongoClient, ObjectId } from "mongodb";
import "dotenv/config";

const app = express();
const port = process.env.PORT || 5000;

app.use(express.json());
app.use(cors());

const client = new MongoClient(process.env.MONGODB_URL);

export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("You successfully connected to MongoDB!");
    return client;
  } catch (err) {
    console.dir(err);
  }
}

const connectClient = await connectToMongoDB();
const database = connectClient.db("hireloop");
const users = database.collection("user");
const jobs = database.collection("job");
const applications = database.collection("application");
const savedJobs = database.collection("savedJobs");

await savedJobs.createIndex({ email: 1, jobId: 1 }, { unique: true });

app.get("/users", async (req, res) => {
  const result = await users.find().toArray();

  res.send(result);
});

// job-created api ***********

app.post("/jobs", async (req, res) => {
  const job = req.body;
  const result = await jobs.insertOne(job);
  res.send(result);
});

// get job from api ******

// User input goes into a RegExp, so strip regex syntax first.
const escapeRegex = (value) =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

app.get("/jobs", async (req, res) => {
  const { type, remote, category, search } = req.query;
  const query = {};

  if (type) {
    query.type = { $regex: new RegExp(`^${escapeRegex(type)}$`, "i") };
  }

  if (remote === "true" || remote === "false") {
    query.remote = remote === "true";
  }

  if (category) {
    query.category = { $regex: new RegExp(`^${escapeRegex(category)}$`, "i") };
  }

  if (search) {
    const regex = new RegExp(escapeRegex(search), "i");
    query.$or = [
      { title: regex },
      { company: regex },
      { location: regex },
      { category: regex },
      { responsibilities: regex },
      { qualifications: regex },
    ];
  }

  try {
    const result = await jobs.find(query).toArray();
    res.send(result);
  } catch (error) {
    res.status(500).send({
      message: "Failed to load jobs",
      error: String(error),
    });
  }
});

// get one job by id ****
app.get("/jobs/:id", async (req, res) => {
  const { id } = req.params;

  // A malformed id would make `new ObjectId()` throw.
  if (!ObjectId.isValid(id)) {
    return res.status(400).send({ message: "Invalid job id" });
  }

  try {
    const job = await jobs.findOne({ _id: new ObjectId(id) });

    if (!job) {
      return res.status(404).send({ message: "Job not found" });
    }

    res.send(job);
  } catch (error) {
    res.status(500).send({
      message: "Failed to load job",
      error: String(error),
    });
  }
});

app.post("/saved-jobs", async (req, res) => {
  const { jobId, email } = req.body ?? {};

  if (typeof jobId !== "string" || typeof email !== "string" || !email.trim()) {
    return res.status(400).send({ message: "Job ID and email are required" });
  }

  if (!ObjectId.isValid(jobId)) {
    return res.status(400).send({ message: "Invalid job ID" });
  }

  try {
    const job = await jobs.findOne({ _id: new ObjectId(jobId) });
    if (!job) {
      return res.status(404).send({ message: "Job not found" });
    }

    await savedJobs.updateOne(
      { email: email.trim(), jobId },
      { $setOnInsert: { email: email.trim(), jobId, savedAt: new Date() } },
      { upsert: true },
    );

    res.status(200).send({ message: "Job saved" });
  } catch (error) {
    res.status(500).send({
      message: "Failed to save job",
      error: String(error),
    });
  }
});

app.get("/saved-jobs", async (req, res) => {
  const email = typeof req.query.email === "string" ? req.query.email.trim() : "";

  if (!email) {
    return res.status(400).send({ message: "Email is required" });
  }

  try {
    const saved = await savedJobs
      .find({ email })
      .sort({ savedAt: -1 })
      .toArray();
    const jobIds = saved
      .filter((item) => ObjectId.isValid(item.jobId))
      .map((item) => new ObjectId(item.jobId));
    const jobList = await jobs.find({ _id: { $in: jobIds } }).toArray();
    const jobMap = new Map(jobList.map((job) => [job._id.toString(), job]));

    res.send(
      saved.flatMap((item) => {
        const job = jobMap.get(item.jobId);
        return job ? [{ job, savedAt: item.savedAt }] : [];
      }),
    );
  } catch (error) {
    res.status(500).send({
      message: "Failed to load saved jobs",
      error: String(error),
    });
  }
});

app.delete("/saved-jobs", async (req, res) => {
  const { jobId, email } = req.body ?? {};

  if (typeof jobId !== "string" || typeof email !== "string" || !email.trim()) {
    return res.status(400).send({ message: "Job ID and email are required" });
  }

  if (!ObjectId.isValid(jobId)) {
    return res.status(400).send({ message: "Invalid job ID" });
  }

  try {
    await savedJobs.deleteOne({ email: email.trim(), jobId });
    res.send({ message: "Job removed from saved jobs" });
  } catch (error) {
    res.status(500).send({
      message: "Failed to remove saved job",
      error: String(error),
    });
  }
});

// update one job by id ******

app.put("/jobs/:id", async (req, res) => {
  const { id } = req.params;

  if (!ObjectId.isValid(id)) {
    return res.status(400).send({ message: "Invalid job id" });
  }

  // Never let the client change _id; only the submitted fields are updated.
  const { _id, ...updates } = req.body ?? {};

  try {
    const result = await jobs.updateOne(
      { _id: new ObjectId(id) },
      { $set: updates },
    );

    if (result.matchedCount === 0) {
      return res.status(404).send({ message: "Job not found" });
    }

    res.send(result);
  } catch (error) {
    res.status(500).send({
      message: "Failed to update job",
      error: String(error),
    });
  }
});

//delete a job ********

app.delete("/jobs/:id", async (req, res) => {
  const { id } = req.params;

  if (!ObjectId.isValid(id)) {
    return res.status(400).send({ message: "Invalid job id" });
  }

  try {
    const result = await jobs.deleteOne({ _id: new ObjectId(id) });

    // 404 lets the client show "already deleted" instead of a success message.
    if (result.deletedCount === 0) {
      return res.status(404).send({ message: "Job not found" });
    }

    res.send(result);
  } catch (error) {
    res.status(500).send({
      message: "Failed to delete job",
      error: String(error),
    });
  }
});

// post apply job

app.post("/applications", async (req, res) => {
  const { userId, jobId } = req.body;

  if (!userId || !jobId) {
    return res.status(400).send({
      message: "User ID and Job ID are required",
    });
  }

  if (!ObjectId.isValid(jobId)) {
    return res.status(400).send({
      message: "Invalid job ID",
    });
  }

  try {
    // Check whether the job exists
    const job = await jobs.findOne({
      _id: new ObjectId(jobId),
    });

    if (!job) {
      return res.status(404).send({
        message: "Job not found",
      });
    }

    // Prevent duplicate applications
    const existingApplication = await applications.findOne({
      userId,
      jobId,
    });

    if (existingApplication) {
      return res.status(409).send({
        message: "You have already applied for this job",
      });
    }

    // Save only userId and jobId
    const result = await applications.insertOne({
      userId,
      jobId,
    });

    res.status(201).send({
      message: "Application submitted successfully",
      insertedId: result.insertedId,
    });
  } catch (error) {
    res.status(500).send({
      message: "Failed to submit application",
    });
  }
});

//get apply jobs

app.get("/applications", async (req, res) => {
  const { userId } = req.query;

  if (!userId) {
    return res.status(400).send({
      message: "User ID is required",
    });
  }

  try {
    const userApplications = await applications.find({ userId }).toArray();

    const jobIds = userApplications
      .filter((application) => ObjectId.isValid(application.jobId))
      .map((application) => new ObjectId(application.jobId));

    const jobList = await jobs.find({ _id: { $in: jobIds } }).toArray();

    const jobMap = new Map(jobList.map((job) => [job._id.toString(), job]));

    const result = userApplications.map((application) => ({
      applicationId: application._id.toString(),
      applied: application._id.getTimestamp(),
      status: "Applied",
      job: jobMap.get(application.jobId) || null,
    }));

    res.send(result);
  } catch (error) {
    res.status(500).send({
      message: "Failed to load applications",
    });
  }
});

app.get("/", (req, res) => {
  res.send("Hireloop project running");
});

app.listen(port, () => {
  console.log(`Hireloop app listening on port ${port}`);
});
