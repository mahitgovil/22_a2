import os
import random
from decimal import Decimal
from datetime import timezone
from faker import Faker
import psycopg

fake = Faker()
random.seed(14)

DB_DSN = os.getenv(
    "POSTGRES_DSN",
    "postgresql://postgres:postgres@localhost:5432/gigtask"
)

CLIENTS = 5_000
FREELANCERS = 10_000
CONTRACTS = 50_000

def main():
    with psycopg.connect(DB_DSN) as conn:
        with conn.cursor() as cur:
            # Seed base entities.
            cur.execute("DELETE FROM wallet_audit_logs")
            cur.execute("DELETE FROM contracts")
            cur.execute("DELETE FROM freelancers")
            cur.execute("DELETE FROM clients")


            # Reset BIGSERIAL sequences after DELETE.
            cur.execute("SELECT setval('clients_id_seq', 1, false)")
            cur.execute("SELECT setval('freelancers_id_seq', 1, false)")
            cur.execute("SELECT setval('contracts_id_seq', 1, false)")
            cur.execute("SELECT setval('wallet_audit_logs_id_seq', 1, false)")
            
            client_rows = [
                (fake.name(), Decimal(random.randint(5_000, 50_000)))
                for _ in range(CLIENTS)
            ]
            cur.executemany(
                "INSERT INTO clients(name, escrow_balance) VALUES (%s, %s)",
                client_rows
            )

            freelancer_rows = [
                (
                    fake.name(),
                    random.uniform(12.85, 13.15),
                    random.uniform(77.45, 77.75),
                    random.random() < 0.65,
                )
                for _ in range(FREELANCERS)
            ]
            cur.executemany(
                """INSERT INTO freelancers(name, latitude, longitude, is_available)
                   VALUES (%s, %s, %s, %s)""",
                freelancer_rows
            )

            # Generate completed/funded contracts. We avoid creating multiple
            # IN PROGRESS contracts for the same freelancer so the partial
            # unique index remains valid.
            contracts = []
            used_active = set()

            for i in range(CONTRACTS):
                client_id = random.randint(1, CLIENTS)
                freelancer_id = random.randint(1, FREELANCERS)
                budget = Decimal(random.randint(100, 5000))

                r = random.random()
                if r < 0.08 and freelancer_id not in used_active:
                    status = "IN PROGRESS"
                    used_active.add(freelancer_id)
                elif r < 0.16:
                    status = "FUNDED"
                else:
                    status = "COMPLETED"

                created_at = fake.date_time_between(
                    start_date="-365d",
                    end_date="now",
                    tzinfo=timezone.utc
                )
                contracts.append(
                    (client_id, freelancer_id, budget, status, created_at)
                )

                if len(contracts) >= 5000:
                    cur.executemany(
                        """INSERT INTO contracts
                           (client_id, freelancer_id, budget, status, created_at)
                           VALUES (%s, %s, %s, %s, %s)""",
                        contracts
                    )
                    contracts.clear()

            if contracts:
                cur.executemany(
                    """INSERT INTO contracts
                       (client_id, freelancer_id, budget, status, created_at)
                       VALUES (%s, %s, %s, %s, %s)""",
                    contracts
                )

            # Create 100k+ audit entries through the actual UPDATE trigger.
            # Each update changes the balance by +/- a small amount while
            # maintaining the non-negative CHECK constraint.
            for _ in range(100_000):
                client_id = random.randint(1, CLIENTS)
                amount = Decimal(random.randint(1, 100))
                if random.random() < 0.5:
                    cur.execute(
                        """UPDATE clients
                           SET escrow_balance = escrow_balance + %s
                           WHERE id = %s""",
                        (amount, client_id)
                    )
                else:
                    cur.execute(
                        """UPDATE clients
                           SET escrow_balance = GREATEST(0, escrow_balance - %s)
                           WHERE id = %s""",
                        (amount, client_id)
                    )

                if _ % 5000 == 0:
                    conn.commit()

            conn.commit()

            # [Assignment 2 addition] The materialized view was created while the
            # tables were empty, so refresh it now; otherwise the Analytics
            # summary shows zeros until someone presses "Refresh data".
            cur.execute("SELECT refresh_freelancer_lifetime_summary()")
            conn.commit()

            cur.execute("SELECT COUNT(*) FROM contracts")
            print("contracts:", cur.fetchone()[0])
            cur.execute("SELECT COUNT(*) FROM wallet_audit_logs")
            print("audit rows:", cur.fetchone()[0])

if __name__ == "__main__":
    main()