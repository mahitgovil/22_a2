DROP MATERIALIZED VIEW IF EXISTS freelancer_lifetime_summary;

CREATE MATERIALIZED VIEW freelancer_lifetime_summary AS
SELECT
    f.id AS freelancer_id,
    f.name,
    COUNT(c.id) FILTER (WHERE c.status = 'COMPLETED') AS completed_contracts,
    COALESCE(
        SUM(c.budget) FILTER (WHERE c.status = 'COMPLETED'),
        0.00
    )::NUMERIC(14,2) AS total_earnings
FROM freelancers f
LEFT JOIN contracts c
       ON c.freelancer_id = f.id
GROUP BY f.id, f.name;

-- Required for REFRESH MATERIALIZED VIEW CONCURRENTLY.
CREATE UNIQUE INDEX IF NOT EXISTS ux_freelancer_lifetime_summary
ON freelancer_lifetime_summary (freelancer_id);

-- [Assignment 2 change] PostgreSQL does not record when a materialized view
-- was last refreshed, but the Analytics screen must show a "last refreshed"
-- time. This one-row-per-view log is written by the refresh function below.
CREATE TABLE IF NOT EXISTS mv_refresh_log (
    view_name     TEXT PRIMARY KEY,
    refreshed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    duration_ms   NUMERIC(12,2)
);

INSERT INTO mv_refresh_log (view_name, refreshed_at, duration_ms)
VALUES ('freelancer_lifetime_summary', NOW(), NULL)
ON CONFLICT (view_name) DO UPDATE SET refreshed_at = EXCLUDED.refreshed_at;

-- [Assignment 2 change] The function now also records the refresh time and
-- duration. The original signature (RETURNS VOID) is kept so Part A calls
-- still work.
CREATE OR REPLACE FUNCTION refresh_freelancer_lifetime_summary()
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    v_start TIMESTAMPTZ := clock_timestamp();
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY freelancer_lifetime_summary;

    INSERT INTO mv_refresh_log (view_name, refreshed_at, duration_ms)
    VALUES (
        'freelancer_lifetime_summary',
        clock_timestamp(),
        EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000
    )
    ON CONFLICT (view_name) DO UPDATE
       SET refreshed_at = EXCLUDED.refreshed_at,
           duration_ms  = EXCLUDED.duration_ms;
END;
$$;

-- Refresh:
-- SELECT refresh_freelancer_lifetime_summary();
