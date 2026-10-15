// [Assignment 2 fix] `use` is an interactive shell helper and is not portable
// in load()ed scripts (it fails in the legacy shell); getSiblingDB always works.
db = db.getSiblingDB("gigtask");

// Flexible review documents.
db.createCollection("GigReviews", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["freelancer_id", "rating", "skill_tags", "created_at"],
      properties: {
        freelancer_id: { bsonType: "int" },
        rating: { bsonType: "int", minimum: 1, maximum: 5 },
        skill_tags: {
          bsonType: "array",
          items: { bsonType: "string" }
        },
        created_at: { bsonType: "date" }
      }
    }
  },
  validationLevel: "moderate"
});

// Real-time worker locations.
db.createCollection("WorkerLocations");

db.GigReviews.createIndex({ freelancer_id: 1, created_at: -1 });
db.GigReviews.createIndex({ rating: 1 });

db.WorkerLocations.createIndex({ location: "2dsphere" });
db.WorkerLocations.createIndex(
  { created_at: 1 },
  { expireAfterSeconds: 7200 }
);

// [Assignment 2 addition] Flexible freelancer portfolios (the GigTask
// "flexible catalog"). Documents deliberately do not share one shape:
// some have projects, some certifications, some per-skill rates, etc.
// Only freelancer_id is required.
db.createCollection("Portfolios", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["freelancer_id"],
      properties: { freelancer_id: { bsonType: ["int", "long"] } }
    }
  },
  validationLevel: "moderate"
});
db.Portfolios.createIndex({ freelancer_id: 1 }, { unique: true });

// [Assignment 2 addition] Lets the Map screen fetch only the latest pings.
db.WorkerLocations.createIndex({ freelancer_id: 1, created_at: -1 });

print("GigReviews indexes:");
printjson(db.GigReviews.getIndexes());

print("WorkerLocations indexes:");
printjson(db.WorkerLocations.getIndexes());

print("Portfolios indexes:");
printjson(db.Portfolios.getIndexes());
