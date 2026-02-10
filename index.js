const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const multer = require("multer");

// Firebase Admin
const admin = require("./firebaseAdmin");

const port = process.env.PORT || 3000;

//  Middleware ----------------
app.use(cors());
app.use(express.json());

// Multer Setup ----------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});
const upload = multer({ storage });

// Serve uploaded photos
app.use("/uploads", express.static("uploads"));

// MongoDB -----------------------------
const uri = `mongodb+srv://${process.env.DB_USERS}:${process.env.DB_PASSWORD}@cluster0.lvsd8ww.mongodb.net/?appName=Cluster0`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();
    const db = client.db("urbanfix_db");
    const issueCollection = db.collection("issues");
    const userCollection = db.collection("users");
    const paymentCollection = db.collection("payments");

    console.log("✅ MongoDB Connected");

    // ISSUES ---------------------------------
    app.get("/issues", async (req, res) => {
      try {
        const {
          page,
          limit,
          search,
          status,
          priority,
          category,
          email,
          assignedStaff,
        } = req.query;
        const query = {};
        if (email) query.email = email;
        if (assignedStaff) query.assignedStaff = assignedStaff;
        if (search) {
          query.$or = [
            { title: { $regex: search, $options: "i" } },
            { category: { $regex: search, $options: "i" } },
            { location: { $regex: search, $options: "i" } },
          ];
        }
        if (status) query.status = status;
        if (priority) query.priority = priority;
        if (category) query.category = category;

        let cursor = issueCollection
          .find(query)
          .sort({ isBoosted: -1, createdAt: -1 });

        if (page && limit) {
          const skip = (Number(page) - 1) * Number(limit);
          cursor = cursor.skip(skip).limit(Number(limit));
          const issues = await cursor.toArray();
          const total = await issueCollection.countDocuments(query);
          return res.send({
            total,
            page: Number(page),
            totalPages: Math.ceil(total / Number(limit)),
            issues,
          });
        }

        const issues = await cursor.toArray();
        res.send(issues);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Failed to fetch issues" });
      }
    });

    app.get("/issues/:id", async (req, res) => {
      try {
        const issue = await issueCollection.findOne({
          _id: new ObjectId(req.params.id),
        });
        if (!issue) return res.status(404).send({ message: "Issue not found" });
        res.send(issue);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Failed to fetch issue" });
      }
    });

    app.post("/issues", async (req, res) => {
      try {
        const issue = req.body;
        const user = await userCollection.findOne({ email: issue.email });
        if (!user) return res.status(404).send({ message: "User not found" });
        if (user.isBlocked)
          return res.status(403).send({ message: "User is blocked" });

        const count = await issueCollection.countDocuments({
          email: issue.email,
        });
        if (!user.isPremium && count >= 3)
          return res
            .status(403)
            .send({ message: "Free user issue limit exceeded" });

        const newIssue = {
          ...issue,
          status: "pending",
          isBoosted: false,
          upvotes: [],
          upvoteCount: 0,
          createdAt: new Date(),
          timeline: [{ action: "Issue created", date: new Date() }],
        };

        await issueCollection.insertOne(newIssue);
        res.send(newIssue);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Issue creation failed" });
      }
    });

    app.patch("/issues/:id", async (req, res) => {
      try {
        const {
          title,
          description,
          category,
          location,
          status,
          photo,
          timelineEntry,
        } = req.body;
        const updateFields = {};
        if (title) updateFields.title = title;
        if (description) updateFields.description = description;
        if (category) updateFields.category = category;
        if (location) updateFields.location = location;
        if (status) updateFields.status = status;
        if (photo) updateFields.photo = photo;

        const update = { $set: updateFields };
        if (timelineEntry) update.$push = { timeline: timelineEntry };

        const result = await issueCollection.updateOne(
          { _id: new ObjectId(req.params.id) },
          update,
        );
        res.send(result);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Failed to update issue" });
      }
    });

    app.delete("/issues/:id", async (req, res) => {
      try {
        const result = await issueCollection.deleteOne({
          _id: new ObjectId(req.params.id),
        });
        if (result.deletedCount === 0)
          return res.status(404).send({ message: "Issue not found" });
        res.send({ success: true });
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Failed to delete issue" });
      }
    });

    app.patch("/issues/assign/:id", async (req, res) => {
      const { staffEmail } = req.body;
      await issueCollection.updateOne(
        { _id: new ObjectId(req.params.id) },
        {
          $set: { assignedStaff: staffEmail },
          $push: {
            timeline: { action: `Assigned to ${staffEmail}`, date: new Date() },
          },
        },
      );
      res.send({ success: true });
    });

    app.patch("/issues/reject/:id", async (req, res) => {
      await issueCollection.updateOne(
        { _id: new ObjectId(req.params.id) },
        {
          $set: { status: "rejected" },
          $push: {
            timeline: { action: "Rejected by admin", date: new Date() },
          },
        },
      );
      res.send({ success: true });
    });

    app.patch("/issues/upvote/:id", async (req, res) => {
      const { email } = req.body;
      if (!email) return res.status(401).send({ message: "Login required" });

      const issue = await issueCollection.findOne({
        _id: new ObjectId(req.params.id),
      });
      if (!issue) return res.status(404).send({ message: "Issue not found" });
      if (issue.email === email)
        return res.status(403).send({ message: "Cannot upvote own issue" });
      if (issue.upvotes.includes(email))
        return res.status(400).send({ message: "Already upvoted" });

      await issueCollection.updateOne(
        { _id: new ObjectId(req.params.id) },
        { $push: { upvotes: email }, $inc: { upvoteCount: 1 } },
      );
      res.send({ success: true });
    });

    // USERS ------------------------------------
    app.get("/users", async (req, res) => {
      const { role } = req.query;
      const query = role ? { role } : {};
      const users = await userCollection.find(query).toArray();
      res.send(users);
    });

    app.get("/users/:email", async (req, res) => {
      const user = await userCollection.findOne({ email: req.params.email });
      if (!user) return res.status(404).send({ message: "User not found" });
      res.send(user);
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      const exists = await userCollection.findOne({ email: user.email });
      if (exists) return res.send(exists);

      const newUser = {
        ...user,
        role: "citizen",
        isPremium: false,
        isBlocked: false,
        createdAt: new Date(),
      };
      await userCollection.insertOne(newUser);
      res.send(newUser);
    });

    app.patch("/users/subscribe/:email", async (req, res) => {
      const result = await userCollection.updateOne(
        { email: req.params.email },
        { $set: { isPremium: true } },
      );
      res.send(result);
    });

    app.patch("/users/block/:email", async (req, res) => {
      const result = await userCollection.updateOne(
        { email: req.params.email },
        { $set: { isBlocked: true } },
      );
      res.send(result);
    });

    app.patch("/users/unblock/:email", async (req, res) => {
      const result = await userCollection.updateOne(
        { email: req.params.email },
        { $set: { isBlocked: false } },
      );
      res.send(result);
    });

    // STAFF -------------------------------
    app.get("/staff", async (req, res) => {
      const staff = await userCollection.find({ role: "staff" }).toArray();
      res.send(staff);
    });

    app.post("/staff", async (req, res) => {
      const { name, email, phone, photo, password } = req.body;

      if (!password) {
        return res
          .status(400)
          .send({ message: "Password is required for staff login" });
      }

      try {
        //  Firebase Create -----------------
        const firebaseUser = await admin.auth().createUser({
          email,
          password,
          displayName: name,
          photoURL: photo,
        });

        //  MongoDB Insert -----------------
        const result = await userCollection.insertOne({
          name,
          email,
          phone,
          photo,
          role: "staff",
          createdAt: new Date(),
          firebaseUid: firebaseUser.uid, // future use
        });

        res.send({ success: true, data: result });
      } catch (err) {
        console.error("Staff creation failed:", err);
        res.status(500).send({ message: err.message });
      }
    });

    //  PAYMENTS --------------------------
    app.get("/payments", async (req, res) => {
      const payments = await paymentCollection
        .find({})
        .sort({ date: -1 })
        .toArray();
      res.send(payments);
    });

    app.post("/payments", async (req, res) => {
      const payment = { ...req.body, date: new Date() };
      await paymentCollection.insertOne(payment);
      res.send(payment);
    });

    // PROFILE UPDATE --------------------

    app.patch("/users/update", upload.single("photo"), async (req, res) => {
      try {
        const { name, email, password } = req.body;
        console.log("Updating user:", {
          name,
          email,
          password,
          file: req.file,
        });

        if (!email)
          return res.status(400).send({ message: "Email is required" });

        const updateFields = {};
        if (name) updateFields.name = name;
        if (req.file) {
          updateFields.photo = `uploads/${req.file.filename}`;
          updateFields.photoURL = `${process.env.SITE_DOMAIN}/${updateFields.photo}`;
        }

        // Firebase Update -----------------
        try {
          const firebaseUser = await admin.auth().getUserByEmail(email);
          const firebaseUpdate = {};
          if (name) firebaseUpdate.displayName = name;
          if (updateFields.photoURL)
            firebaseUpdate.photoURL = updateFields.photoURL;
          if (password) firebaseUpdate.password = password;

          if (Object.keys(firebaseUpdate).length > 0) {
            await admin.auth().updateUser(firebaseUser.uid, firebaseUpdate);
          }
        } catch (err) {
          console.error("Firebase update failed:", err.message);
          return res
            .status(500)
            .send({ message: "Firebase update failed", error: err.message });
        }

        //  MongoDB Update ---------------
        const result = await userCollection.updateOne(
          { email },
          { $set: updateFields },
        );

        res.send({ success: true, data: result });
      } catch (err) {
        console.error("General update error:", err);
        res.status(500).send({ message: "Update failed", error: err.message });
      }
    });

    app.patch(
      "/users/updateadmin",
      upload.single("photo"),
      async (req, res) => {
        try {
          const { name, email, password } = req.body;
          const updateFields = { name, email };
          if (req.file) updateFields.photo = `uploads/${req.file.filename}`;
          if (password) {
            const user = await admin.auth().getUserByEmail(email);
            await admin.auth().updateUser(user.uid, { password });
          }
          const result = await userCollection.updateOne(
            { email },
            { $set: updateFields },
          );
          res.send({ success: true, data: result });
        } catch (err) {
          console.error(err);
          res.status(500).send({ message: err.message });
        }
      },
    );

    //  STRIPE CHECKOUT SESSION
    app.post("/create-checkout-session", async (req, res) => {
      const { email } = req.body;
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "bdt",
              product_data: { name: "Premium Subscription" },
              unit_amount: 1000 * 100,
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        metadata: { email },
        success_url: `${process.env.SITE_DOMAIN}/dashboard/paymentsuccess`,
        cancel_url: `${process.env.SITE_DOMAIN}/dashboard/paymentcancel`,
      });
      res.send({ url: session.url });
    });
  } finally {
  }
}

run().catch(console.dir);

app.get("/", (req, res) => res.send("UrbanFix Server Running 🚀"));
// app.listen(port, () => console.log(`Server running on port ${port}`));
module.exports = app;
