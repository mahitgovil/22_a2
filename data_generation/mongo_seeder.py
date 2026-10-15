import os
import random
from datetime import datetime, timedelta, timezone
from pymongo import MongoClient
from faker import Faker

fake = Faker()
random.seed(14)

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
DB_NAME = os.getenv("MONGO_DB", "gigtask")

PINGS = 500_000
REVIEWS = 100_000
BATCH = 10_000

SKILLS = [
    "python", "sql", "javascript", "react", "java",
    "cpp", "design", "testing", "devops", "data-analysis",
    "writing", "marketing"
]

def seed_worker_locations(db):
    col = db.WorkerLocations
    col.delete_many({})

    now = datetime.now(timezone.utc)
    batch = []

    for i in range(PINGS):
        # Bengaluru-area synthetic points.
        lon = random.uniform(77.45, 77.75)
        lat = random.uniform(12.85, 13.15)

        batch.append({
            "freelancer_id": random.randint(1, 10_000),
            "is_available": random.random() < 0.65,
            "location": {
                "type": "Point",
                "coordinates": [lon, lat]
            },
            "created_at": now - timedelta(seconds=random.randint(0, 300))
        })

        if len(batch) >= BATCH:
            col.insert_many(batch)
            batch.clear()

    if batch:
        col.insert_many(batch)

def seed_reviews(db):
    col = db.GigReviews
    col.delete_many({})

    batch = []
    for i in range(REVIEWS):
        tags = random.sample(SKILLS, k=random.randint(1, 4))
        batch.append({
            "freelancer_id": random.randint(1, 10_000),
            "rating": random.randint(1, 5),
            "skill_tags": tags,
            "created_at": fake.date_time_between(
                start_date="-365d",
                end_date="now",
                tzinfo=timezone.utc
            ),
            "comment": fake.sentence()
        })

        if len(batch) >= BATCH:
            col.insert_many(batch)
            batch.clear()

    if batch:
        col.insert_many(batch)

PORTFOLIOS = 10_000

def seed_portfolios(db):
    """[Assignment 2 addition] One flexible portfolio per freelancer.

    Documents intentionally vary in shape: every document has
    freelancer_id/headline/skills, but projects, certifications, per-skill
    rates, languages and links appear only on some of them.
    """
    col = db.Portfolios
    col.delete_many({})

    batch = []
    for fid in range(1, PORTFOLIOS + 1):
        skills = random.sample(SKILLS, k=random.randint(2, 5))
        doc = {
            "freelancer_id": fid,
            "headline": f"{skills[0].title()} specialist | {fake.job()}",
            "skills": skills,
            "years_experience": random.randint(0, 15),
        }
        if random.random() < 0.5:
            doc["hourly_rate"] = {"currency": "INR",
                                  "amount": random.randint(300, 3000)}
        else:
            doc["rates_by_skill"] = {s: random.randint(300, 3000)
                                     for s in skills}
        if random.random() < 0.8:
            doc["projects"] = [
                {
                    "title": fake.catch_phrase(),
                    "client": fake.company(),
                    "year": random.randint(2018, 2026),
                    "tech": random.sample(skills, k=random.randint(1, len(skills))),
                    **({"link": fake.url()} if random.random() < 0.5 else {}),
                }
                for _ in range(random.randint(1, 4))
            ]
        if random.random() < 0.4:
            doc["certifications"] = [
                {"name": f"Certified {random.choice(skills).title()} Professional",
                 "issuer": fake.company(),
                 "year": random.randint(2015, 2026)}
                for _ in range(random.randint(1, 2))
            ]
        if random.random() < 0.5:
            doc["languages"] = random.sample(
                ["English", "Hindi", "Kannada", "Tamil", "Telugu", "Marathi"],
                k=random.randint(1, 3))
        if random.random() < 0.6:
            doc["links"] = {k: fake.url() for k in
                            random.sample(["github", "website", "linkedin"],
                                          k=random.randint(1, 3))}
        batch.append(doc)
        if len(batch) >= BATCH:
            col.insert_many(batch)
            batch.clear()
    if batch:
        col.insert_many(batch)

def main():
    client = MongoClient(MONGO_URI)
    db = client[DB_NAME]

    seed_worker_locations(db)
    seed_reviews(db)
    seed_portfolios(db)

    print("WorkerLocations:", db.WorkerLocations.count_documents({}))
    print("GigReviews:", db.GigReviews.count_documents({}))
    print("Portfolios:", db.Portfolios.count_documents({}))
    print("NOTE: WorkerLocations has a 7200 s TTL, so these pings disappear "
          "after ~2 hours. Run the API with SIMULATE_PINGS=1 (or "
          "`npm run pings` in api/) to keep live pings flowing.")

if __name__ == "__main__":
    main()