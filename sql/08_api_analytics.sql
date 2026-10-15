-- [Assignment 2 addition] Parameterised versions of the Part A Workflow 2
-- query (sql/06_window_analytics.sql) for the Analytics screen.
--
-- The Part A query computes every freelancer x every day (~3.6M rows, ~17 s),
-- which is too slow for a web page. These functions use the SAME technique
-- (calendar series filled with zeros, AVG() OVER a 7-row frame, DENSE_RANK()
-- over lifetime revenue) but restrict the work to what the screen shows.

-- 7-day moving average of completed-contract revenue for one freelancer
-- (or for the whole platform when p_freelancer_id IS NULL).
-- Six extra days before the window are included so the first displayed
-- average already covers a full 7 calendar days.
CREATE OR REPLACE FUNCTION fn_freelancer_moving_average(
    p_freelancer_id BIGINT,
    p_days          INT DEFAULT 90
)
RETURNS TABLE (
    day                      DATE,
    revenue                  NUMERIC(14,2),
    revenue_7_day_moving_avg NUMERIC(14,2)
)
LANGUAGE sql
STABLE
AS $$
    WITH bounds AS (
        SELECT
            COALESCE(MAX(created_at::date), CURRENT_DATE)          AS max_day
        FROM contracts
        WHERE status = 'COMPLETED'
    ),
    days AS (
        SELECT gs.day::date AS day
        FROM bounds b
        CROSS JOIN LATERAL generate_series(
            b.max_day - (p_days - 1) - 6,
            b.max_day,
            INTERVAL '1 day'
        ) AS gs(day)
    ),
    daily_revenue AS (
        SELECT created_at::date AS day, SUM(budget)::NUMERIC(14,2) AS revenue
        FROM contracts
        WHERE status = 'COMPLETED'
          AND (p_freelancer_id IS NULL OR freelancer_id = p_freelancer_id)
        GROUP BY created_at::date
    ),
    filled AS (
        SELECT d.day, COALESCE(dr.revenue, 0.00)::NUMERIC(14,2) AS revenue
        FROM days d
        LEFT JOIN daily_revenue dr ON dr.day = d.day
    ),
    ma AS (
        SELECT
            day,
            revenue,
            AVG(revenue) OVER (
                ORDER BY day
                ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
            ) AS mavg
        FROM filled
    )
    SELECT day, revenue, ROUND(mavg, 2)::NUMERIC(14,2)
    FROM ma
    WHERE day > (SELECT max_day FROM bounds) - p_days
    ORDER BY day;
$$;


-- Freelancers ranked by lifetime completed revenue with DENSE_RANK().
-- Ties share a rank and the next rank is not skipped.
CREATE OR REPLACE FUNCTION fn_freelancer_revenue_ranking(
    p_limit  INT DEFAULT 20,
    p_offset INT DEFAULT 0
)
RETURNS TABLE (
    revenue_rank        BIGINT,
    freelancer_id       BIGINT,
    name                VARCHAR(120),
    completed_contracts BIGINT,
    lifetime_revenue    NUMERIC(14,2)
)
LANGUAGE sql
STABLE
AS $$
    WITH lifetime AS (
        SELECT
            f.id   AS freelancer_id,
            f.name,
            COUNT(c.id)                         AS completed_contracts,
            COALESCE(SUM(c.budget), 0.00)::NUMERIC(14,2) AS lifetime_revenue
        FROM freelancers f
        LEFT JOIN contracts c
               ON c.freelancer_id = f.id
              AND c.status = 'COMPLETED'
        GROUP BY f.id, f.name
    )
    SELECT
        DENSE_RANK() OVER (ORDER BY lifetime_revenue DESC) AS revenue_rank,
        freelancer_id, name, completed_contracts, lifetime_revenue
    FROM lifetime
    ORDER BY revenue_rank, freelancer_id
    LIMIT p_limit OFFSET p_offset;
$$;
