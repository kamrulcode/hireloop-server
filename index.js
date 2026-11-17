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

app.get("/", (req, res) => {
  res.send("Hireloop project running");
});

app.listen(port, () => {
  console.log(`Hireloop app listening on port ${port}`);
});
