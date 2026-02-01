const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const port = process.env.PORT || 3000;

// middleware
app.use(express.json());
app.use(cors());

const uri = `mongodb+srv://${process.env.DB_USERS}:${process.env.DB_PASSWORD}@cluster0.lvsd8ww.mongodb.net/?appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const db = client.db("urbanfix_db");
    const issueCollection = db.collection("issues");

    // issues api
    app.get("/issues", async (req, res) => {
      const query = {};
      const { email, status, category } = req.query;
      if (email) {
        query.email = email;
      }
      if (status) {
        query.status = status;
      }

      if (category) {
        query.category = category;
      }
      const cursor = issueCollection.find(query);
      const result = await cursor.toArray();
      return res.send(result);
    });
    app.get("/issues/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await issueCollection.findOne(query);
      return res.send(result);
    });

    app.post("/issues", async (req, res) => {
      const issue = req.body;
      issue.createAt = new Date();
      const result = await issueCollection.insertOne(issue);
      res.send(result);
    });

    app.patch("/issues/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const updatedIssue = req.body;

        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ message: "Invalid issue id" });
        }

        if (!updatedIssue || Object.keys(updatedIssue).length === 0) {
          return res
            .status(400)
            .json({ message: "No data provided to update" });
        }

        const query = { _id: new ObjectId(id) };
        const update = { $set: updatedIssue };

        const result = await issueCollection.updateOne(query, update);

        if (result.matchedCount === 0) {
          return res.status(404).json({ message: "Issue not found" });
        }

        res.json({
          success: true,
          modifiedCount: result.modifiedCount,
        });
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to update issue" });
      }
    });

    app.delete("/issues/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await issueCollection.deleteOne(query);
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("UrbanFix!!!!!!!!!!!");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
