import express from "express";
import cors from "cors";
import { MongoClient } from "mongodb";
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

app.get("/", (req, res) => {
  res.send("Hireloop project running");
});

app.listen(port, () => {
  console.log(`Hireloop app listening on port ${port}`);
});
