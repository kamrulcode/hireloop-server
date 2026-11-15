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

app.get("/jobs", async (req, res) => {
  const query = {};
  console.log("query", req.query);
  if (req.query) {
    if (req.query.type) {
      query.type = { $regex: new RegExp(`^${req.query.type}$`, "i") };
    }
    if (req.query.remote) {
      query.remote = req.query.remote === "true";
    }
    if (req.query.search) {
      query.$or = [
        {
          title: { $regex: req.query.search, $options: "i" },
        },
        { responsibilities: { $regex: req.query.search, $options: "i" } },
        { requirements: { $regex: req.query.search, $options: "i" } },
      ];
    }
  }

  const cursor = jobs.find(query);
  const result = await cursor.toArray();
  res.send(result);
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
